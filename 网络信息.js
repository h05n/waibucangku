// 网络信息.js
// 面板显示：本地 / 入口 / 落地 三段 IP 信息
// 架构：配置 → 字典 → 请求 → 解析 → 格式化 → 查询 → 缓存 → 渲染 → 主流程

!(async () => {

  // ══════════════════════════════════════════════════════
  //  CONFIG  配置区
  //  所有可调参数集中在此，方便日后修改
  // ══════════════════════════════════════════════════════
  const CFG = {
    // 字典文件 URL（映射库.json 的 GitHub 地址）
    DICT_URL:  encodeURI('https://github.com/h05n/waibucangku/raw/main/映射库.json'),
    // 直连请求超时（秒）。调高至 7s，弱网下减少两源同时超时的概率
    T_DIRECT:  7,
    // 代理请求超时（秒）。落地查询走代理，适当给长些
    T_PROXY:   10,
    // 每个数据源的最大重试次数（正式请求 + RETRIES 次重试）
    RETRIES:   1,
    // 字典缓存有效期：24 小时
    DICT_TTL:  86400000,
    // 查询结果缓存有效期：5 分钟
    // 配合 update-interval=30 使用：30s 内同一节点直接返回缓存，零网络请求
    CACHE_TTL: 300000,
  };

  // ══════════════════════════════════════════════════════
  //  KEYS  持久化存储键名
  // ══════════════════════════════════════════════════════
  const KEY = {
    DICT:    'NI_DICT_V3',     // 字典 JSON 内容
    DICT_TS: 'NI_DICT_TS_V3',  // 字典上次更新时间戳
    CACHE:   'NI_CACHE_V3',    // 面板查询结果缓存
    ENT:     'NI_ENT_V3',      // 上次检测到的入口 IP（用于判断节点是否切换）
  };

  // ══════════════════════════════════════════════════════
  //  FETCHER  请求层
  //  封装 HTTP 请求、JSON 解析、重试逻辑
  // ══════════════════════════════════════════════════════

  /**
   * 基础 HTTP GET，返回响应体字符串；失败则抛出错误
   */
  const httpGet = opt => new Promise((res, rej) =>
    $httpClient.get(opt, (err, _, body) =>
      err ? rej(new Error(`网络请求失败: ${err}`)) : res(body)
    )
  );

  /**
   * GET + JSON 解析
   * 网络错误或 JSON 解析失败均返回 null（不向上抛错）
   * 这样上层可以用 null 判断"此源不可用"
   *
   * 注意：ip-api.com 免费版仅支持 HTTP，无法改用 HTTPS（服务商限制）
   * 通过第三个本地源（ip.useragentinfo.com）和重试来弥补 HTTP 偶发劫持问题
   */
  const fetchJSON = async (url, opt = {}, timeout = CFG.T_DIRECT) => {
    try {
      return JSON.parse(await httpGet({ url, timeout, ...opt }));
    } catch {
      return null; // 网络错误 / 解析错误 / 内容异常，统一返回 null
    }
  };

  /**
   * 带重试的 JSON 请求
   * 单次失败后等 500ms 再试，最多重试 CFG.RETRIES 次
   * 弱网下单次超时较常见，一次重试可显著提升成功率
   */
  const fetchWithRetry = async (url, opt = {}, timeout = CFG.T_DIRECT) => {
    for (let i = 0; i <= CFG.RETRIES; i++) {
      const result = await fetchJSON(url, opt, timeout);
      if (result !== null) return result;
      if (i < CFG.RETRIES) await new Promise(r => setTimeout(r, 500));
    }
    return null; // 重试耗尽，确认失败
  };

  /**
   * 读取 Surge 本地请求历史记录
   * 用于检测节点变化和提取入口 IP
   */
  const getSurgeReqs = async () => {
    try {
      const { requests = [] } = await new Promise(r => $httpAPI('GET', '/v1/requests/recent', null, r));
      return requests;
    } catch { return []; }
  };

  // ══════════════════════════════════════════════════════
  //  DICT  字典层
  //  从 GitHub 加载 映射库.json，超过 24h 自动拉新
  //  预编译所有正则，对上层提供 t2s / geos / isp 工具
  // ══════════════════════════════════════════════════════

  async function loadDict() {
    let raw = $persistentStore.read(KEY.DICT);
    const ts  = parseInt($persistentStore.read(KEY.DICT_TS) || '0', 10);

    // 无缓存或缓存过期时重新拉取
    if (!raw || Date.now() - ts > CFG.DICT_TTL) {
      try {
        const fresh = await httpGet({ url: CFG.DICT_URL, timeout: CFG.T_DIRECT });
        JSON.parse(fresh); // 先校验 JSON 合法性，防止存入错误页 HTML
        raw = fresh;
        $persistentStore.write(raw, KEY.DICT);
        $persistentStore.write(String(Date.now()), KEY.DICT_TS);
      } catch (e) {
        // 拉取失败时降级用旧缓存；首次运行无缓存则直接报字典异常
        if (!raw) throw new Error(`字典初始化失败（请检查 GitHub 连通性）: ${e.message}`);
      }
    }

    const d = JSON.parse(raw);

    // 繁简转换：将 t2s 字典的键合并成字符集正则，一次扫描完成所有替换，效率最高
    const T2S_RE = new RegExp(`[${Object.keys(d.t2s).join('')}]`, 'g');
    const t2s    = s => s.replace(T2S_RE, c => d.t2s[c]);

    // ISP 键按长度降序排列，保证"最大匹配"优先
    // 例：输入包含 "china unicom" 时，优先匹配 "china unicom"(12字符) 而非 "unicom"(6字符)
    const ispKeys = Object.keys(d.isp).sort((a, b) => b.length - a.length);

    // 企业通名正则：剥除 ISP 名中的无意义词（如 Limited / Corp / Technology 等）
    const CORP_RE = /\b(Technology|Technologies|Telecommunication|Telecommunications|Communication|Communications|Network|Networks|Internet|Service|Services|Telecom|Limited|Ltd|Corp|Corporation|Inc|Incorporated|Group|Global|International|Holdings|Solutions|Systems|Enterprise|Enterprises|Electric|Electron|Information|Data|Cloud|Digital|Media|Connect|Fiber|Co|Company|LLC|Pte|Pty)\b\.?/gi;

    // 行政区后缀正则：按长度降序，优先匹配最长后缀（避免 "回族自治区" 被拆成 "区"）
    const SFXRE = new RegExp(
      `(${[...d.admin_suffixes].sort((a, b) => b.length - a.length).join('|')})$`, 'i'
    );

    return { d, t2s, ispKeys, CORP_RE, SFXRE };
  }

  // 字典初始化（如失败则整个脚本报字典异常）
  const D = await loadDict();

  // ══════════════════════════════════════════════════════
  //  FORMATTER  格式化层
  //  将原始字符串转为干净的中文地名、运营商名、ASN 编号
  // ══════════════════════════════════════════════════════

  /**
   * 地名翻译：先精确查字典，查不到则做繁简转换
   * 例：translateGeo("Tokyo") → "东京"
   *      translateGeo("廣東") → "广东"（繁简转换）
   */
  const geo = str => {
    if (!str) return '';
    return D.d.geos[str.trim().toLowerCase()] || D.t2s(str);
  };

  /**
   * 剥除行政区后缀
   * 例："广东省" → "广东"，"新疆维吾尔自治区" → "新疆"
   * 剥后不足 2 个字则保留原值（防止剥空）
   */
  const stripSfx = str => {
    const m = str.match(D.SFXRE);
    if (m) { const c = str.slice(0, -m[0].length).trim(); if (c.length >= 2) return c; }
    return str;
  };

  /**
   * 清洗地名数组：翻译为中文 + 去重
   * 例：["Tokyo", "Tokyo"] → ["东京"]（翻译 + 去重）
   *      ["东京", "Shinjuku"] → ["东京", "Shinjuku"]（Shinjuku 不在字典则保留英文）
   */
  const cleanParts = parts => {
    const seen = new Set();
    return parts
      .map(p => {
        if (/[\u4e00-\u9fff]/.test(p)) return p;       // 已是中文，直接保留
        const cn = geo(p.trim());                        // 尝试翻译成中文
        return /[\u4e00-\u9fff]/.test(cn) ? cn : p;    // 翻译成功则用中文，否则保留原文
      })
      .filter(p => { if (!p || seen.has(p)) return false; seen.add(p); return true; });
  };

  /**
   * 格式化位置字段
   * - 中国 IP：省 + 市（各自剥除行政区后缀）
   * - 海外 IP：国名 + 城市（有中文译名时优先显示城市；无译名则退而显示省/州）
   *   例：美国旧金山 → "美国 旧金山"（而非"美国 加利福尼亚"）
   *       日本东京   → "日本 东京"（城市 = 都道府县名时显示一个）
   */
  const fmtLoc = (cc, region, city) => {
    const tR = stripSfx(geo(region)); // 省/州
    const tC = stripSfx(geo(city));   // 城市
    const parts = cc === 'CN'
      ? [tR, tC]
      : [D.d.countries[(cc || '').toLowerCase()] || cc || '',
         (/[\u4e00-\u9fff]/.test(tC) ? tC : null) || tR || tC]; // 城市有中文名则优先
    return cleanParts(parts.filter(Boolean)).join(' ');
  };

  // ISP 格式化时过滤的英语停用词（防止 "of" / "the" / "in" 混入运营商名称）
  const STOP = /^(of|for|and|the|in|at|by|to|a|an|no)$/i;

  /**
   * 格式化运营商名称
   * 流程：
   *  1. 去掉开头的 ASN 编号（如 "AS12345 ..."）
   *  2. 在 ISP 字典中查找（最大匹配优先），命中则直接返回中文名
   *  3. 未命中则：剥通名 → 繁简转换 → 去重 → 过滤 ASN/停用词 → 取前 2 词
   */
  const fmtISP = (raw = '') => {
    let s = raw.replace(/^AS\d+\s*/i, '').trim(); // 去掉 "AS12345" 开头
    if (!s) return '';
    // 去括号 / 逗号 / 多余空格
    const cl  = s.replace(/\s*[\(\（][^\)\）]{0,30}[\)\）]\s*/g, ' ')
                  .replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    // ISP 字典查找
    const hit = D.ispKeys.find(k => cl.toLowerCase().includes(k) || s.toLowerCase().includes(k));
    if (hit) return D.t2s(D.d.isp[hit]); // 命中字典，直接返回
    // 未命中：兜底清洗逻辑
    s = D.t2s(cl.replace(D.CORP_RE, ' ').replace(/\s+/g, ' ').replace(/[,\-.\s]+$/, '').trim());
    const words = [], seen = new Set();
    for (const w of s.split(/\s+/).filter(Boolean)) {
      const wl = w.toLowerCase();
      if (!seen.has(wl)) { seen.add(wl); words.push(w); }
    }
    // 过滤 ASN 编号（如 AS5650）和停用词，最多取 2 个词
    return words.filter(w => !/^AS\d+$/i.test(w) && !STOP.test(w)).slice(0, 2).join(' ');
  };

  /**
   * 格式化 ASN：统一输出 "AS12345" 格式
   * 兼容输入为数字（如 45090）或字符串（如 "AS45090"）两种格式
   */
  const fmtASN = raw => {
    if (raw == null || raw === '') return '';
    const s = String(raw).trim();
    const m = s.match(/\b(AS\d+)\b/i);
    if (m) return m[1].toUpperCase();      // "AS45090" 或 "as45090 ..." → "AS45090"
    return /^\d+$/.test(s) ? `AS${s}` : ''; // 纯数字 → 补前缀
  };

  // ══════════════════════════════════════════════════════
  //  PARSER  解析层
  //  将各数据源的原始 JSON 转成统一的 {ip, location, isp, asn}
  //  每个解析函数：成功返回对象，失败（字段缺失/格式不符）返回 null
  // ══════════════════════════════════════════════════════

  /**
   * 解析 myip.ipip.net/json
   * 强项：精确到市级的中文地名，中文运营商名
   * 弱项：不提供 ASN
   */
  const parseIPIP = d => {
    if (d?.ret !== 'ok' || !d.data?.ip) return null;
    const L = d.data.location || [];
    // L[0]=国家, L[1]=省, L[2]=市, L[3]=运营商, L[4]=邮编, L[5]=时区 ...
    return {
      ip:       d.data.ip,
      location: cleanParts([stripSfx(D.t2s(L[1] || '')), stripSfx(D.t2s(L[2] || ''))].filter(Boolean)).join(' '),
      isp:      fmtISP(D.t2s(L[3] || '')),
      asn:      '', // IPIP 不提供 ASN
    };
  };

  /**
   * 解析 ip-api.com/json
   * 强项：提供 ASN，国际覆盖好
   * 弱项：免费版仅 HTTP（无法规避运营商偶发劫持），通过重试和第三源补偿
   */
  const parseIPAPI = d => {
    if (d?.status !== 'success') return null;
    return {
      ip:       d.query || '',
      location: fmtLoc(d.countryCode, d.regionName, d.city),
      isp:      fmtISP(`${d.isp || ''} ${d.as || ''}`),
      asn:      fmtASN((d.as || '').match(/\b(AS\d+)\b/i)?.[1]),
    };
  };

  /**
   * 解析 ip.useragentinfo.com/json
   * 定位：国内备用直连源，HTTPS，直接返回中文，弥补 ip-api 被劫持时的缺口
   * 弱项：不提供 ASN
   * 响应格式：{ ip, country, province, city, district, isp, net }
   */
  const parseUAI = d => {
    if (!d?.ip) return null;
    const province = d.province ? stripSfx(D.t2s(d.province)) : '';
    const city     = d.city     ? stripSfx(D.t2s(d.city))     : '';
    return {
      ip:       d.ip,
      location: cleanParts([province, city].filter(Boolean)).join(' '),
      isp:      fmtISP(D.t2s(d.isp || d.net || '')), // isp 字段比 net 更完整
      asn:      '', // 此源不提供 ASN
    };
  };

  /**
   * 解析 api-ipv4.ip.sb/geoip（或 /geoip/<ip>）
   * 强项：HTTPS，提供 ASN，国际覆盖好
   * 用途：落地 IP 查询（通过代理）、入口 IP 详情（直连）
   */
  const parseIPSB = d => {
    if (!d?.ip) return null;
    return {
      ip:       d.ip,
      location: fmtLoc(d.country_code, d.region, d.city),
      isp:      fmtISP(`${d.isp || ''} ${d.organization || ''}`),
      asn:      fmtASN(d.asn),
    };
  };

  /**
   * 解析 ipinfo.io/json
   * 用途：落地 IP 查询（ip.sb 失败时的降级）
   * 响应格式：{ ip, country, region, city, org("AS12345 ISP名") }
   */
  const parseIPInfo = d => {
    if (!d?.ip) return null;
    return {
      ip:       d.ip,
      location: fmtLoc(d.country, d.region, d.city),
      isp:      fmtISP(d.org || ''),
      asn:      fmtASN((d.org || '').match(/^AS\d+/i)?.[0]),
    };
  };

  // ══════════════════════════════════════════════════════
  //  QUERY  查询层
  //  三个核心查询：本地 IP / 落地 IP / 入口 IP 详情
  // ══════════════════════════════════════════════════════

  /**
   * 查询本地 IP（全部走直连，policy: 'DIRECT'）
   *
   * 使用三个并发来源，解决原来两源同时失败导致本地信息缺失的问题：
   *   源 A — myip.ipip.net  → 精确中文地名 + 中文运营商（无 ASN）
   *   源 B — ip-api.com     → ASN + 国际地名（免费版 HTTP，偶尔被劫持）
   *   源 C — ip.useragentinfo.com → 中文备用源，HTTPS，弥补 B 被劫持的情况（无 ASN）
   *
   * 字段级最优合并策略（不是整体二选一）：
   *   ip       → A > B > C（取第一个非空）
   *   location → A > C > B（中文源优先，精确度：A ≥ C > B）
   *   isp      → A > C > B（中文源优先，已是中文无需字典翻译）
   *   asn      → B（唯一可靠提供 ASN 的源；若 B 被劫持则此项为空）
   *
   * 容错：A B C 只要有 1 个成功，就能保证 ip + location + isp 三项可显示
   *        只有三源全部失败才返回 null（概率极低）
   */
  async function queryLocal() {
    const [r0, r1, r2] = await Promise.all([
      // 源 A：IPIP（中文精确地名）
      fetchWithRetry(
        'https://myip.ipip.net/json',
        { policy: 'DIRECT' }
      ),
      // 源 B：ip-api.com（国际 + ASN，免费版 HTTP）
      fetchWithRetry(
        'http://ip-api.com/json/?lang=zh-CN&fields=status,query,countryCode,regionName,city,isp,as',
        { policy: 'DIRECT' }
      ),
      // 源 C：ip.useragentinfo.com（HTTPS 中文备用，弥补 B 被劫持）
      fetchWithRetry(
        'https://ip.useragentinfo.com/json',
        { policy: 'DIRECT' }
      ),
    ]);

    const a = parseIPIP(r0);
    const b = parseIPAPI(r1);
    const c = parseUAI(r2);

    const ip = a?.ip || b?.ip || c?.ip || '';
    if (!ip) return null; // 三源全部失败

    // 字段级取最优，中文源优先
    return {
      ip,
      location: a?.location || c?.location || b?.location || '',
      isp:      a?.isp      || c?.isp      || b?.isp      || '',
      asn:      b?.asn      || '', // 仅 ip-api 能提供 ASN
    };
  }

  /**
   * 查询落地 IP（通过代理，不指定 policy 则走 Surge 当前代理规则）
   *
   * 此处 ip.sb 走代理路由，与 queryLocal 中各源走直连完全独立，无任何冲突
   * ip.sb → ipinfo.io 降级
   */
  async function queryLanding() {
    const r1 = await fetchWithRetry('https://api-ipv4.ip.sb/geoip', {}, CFG.T_PROXY);
    if (r1) { const p = parseIPSB(r1); if (p) return p; }
    const r2 = await fetchWithRetry('https://ipinfo.io/json', {}, CFG.T_PROXY);
    return parseIPInfo(r2);
  }

  /**
   * 查询入口 IP 的位置/运营商信息（直连，因为入口 IP 是代理服务器的公网 IP）
   * ip-api.com → ip.sb（DIRECT）降级
   */
  async function queryEntranceInfo(ip) {
    const r1 = await fetchWithRetry(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN&fields=status,query,countryCode,regionName,city,isp,as`,
      { policy: 'DIRECT' }
    );
    if (r1) { const p = parseIPAPI(r1); if (p) return p; }
    const r2 = await fetchWithRetry(
      `https://api-ipv4.ip.sb/geoip/${encodeURIComponent(ip)}`,
      { policy: 'DIRECT' }
    );
    return parseIPSB(r2);
  }

  // ══════════════════════════════════════════════════════
  //  ENTRANCE  入口 IP 提取工具
  // ══════════════════════════════════════════════════════

  /**
   * 从 Surge 请求记录的 remoteAddress 字段提取纯 IP 地址
   * 原始格式示例："1.2.3.4:443 (Proxy)" 或 "[2001:db8::1]:443 (Proxy)"
   */
  const extractIP = addr =>
    (addr || '')
      .replace(/\s*\(Proxy\)\s*/gi, '') // 去掉 "(Proxy)" 标记
      .trim()
      .replace(/:\d+$/, '')              // 去掉端口号
      .replace(/^\[(.+)\]$/, '$1');      // 去掉 IPv6 的方括号

  // ══════════════════════════════════════════════════════
  //  CACHE  缓存层
  //  结果缓存 5 分钟，配合 update-interval=30 实现节点变化自动刷新
  //  - 缓存有效且节点未变：直接返回缓存，零网络请求（毫秒级响应）
  //  - 缓存过期或节点变化：触发全量刷新，更新缓存
  // ══════════════════════════════════════════════════════

  const readCache  = () => { try { return JSON.parse($persistentStore.read(KEY.CACHE) || '{}'); } catch { return {}; } };
  const writeCache = o  => { try { $persistentStore.write(JSON.stringify(o), KEY.CACHE); } catch {} };

  // ══════════════════════════════════════════════════════
  //  UI  渲染层
  //  将 {ip, location, isp, asn} 转成面板显示文本
  // ══════════════════════════════════════════════════════

  /**
   * 生成单段 IP 信息块（本地 / 入口 / 落地）
   * 有几项显示几项，空字段自动跳过（不显示空行）
   *
   * 输出格式：
   *   本地：1.2.3.4
   *   位置：广东 深圳
   *   网络：中国联通
   *   代号：AS17816
   */
  function block(label, ip, info) {
    const lines = [`${label}：${ip || '-'}`];
    if (info?.location) lines.push(`位置：${info.location}`);
    if (info?.isp)      lines.push(`网络：${info.isp}`);
    if (info?.asn)      lines.push(`代号：${info.asn}`);
    return lines.join('\n');
  }

  // ══════════════════════════════════════════════════════
  //  MAIN  主流程
  //  6 个步骤：读缓存 → 检测变化 → 命中返回 / 全量刷新 → 渲染输出
  // ══════════════════════════════════════════════════════

  // ── 步骤 1：读取缓存状态 ─────────────────────────────
  const cache      = readCache();
  const cacheValid = (Date.now() - (cache.ts || 0)) < CFG.CACHE_TTL && !!cache.content;

  // ── 步骤 2：快速检测节点变化（仅调用本地 Surge API，无网络请求） ──
  // 取最近 20 条请求记录中，任意一条走代理的请求，提取其代理服务器 IP
  // 与上次记录的 IP 对比——如果不同，说明节点已切换
  const reqs1       = await getSurgeReqs();
  const curProxy    = reqs1.slice(0, 20).find(r => /\(Proxy\)/i.test(r.remoteAddress || ''));
  const curEnt      = curProxy ? extractIP(curProxy.remoteAddress) : null;
  const lastEnt     = $persistentStore.read(KEY.ENT) || '';
  const nodeChanged = !!(curEnt && lastEnt && curEnt !== lastEnt);

  // ── 步骤 3：缓存命中且节点未切换 → 直接返回，不发任何网络请求 ──
  if (cacheValid && !nodeChanged) {
    $done({ title: '网络信息', content: cache.content });
    return; // 提前退出，防止后续代码执行
  }

  // ── 步骤 4：需要刷新 → 记录当前入口，并发查询本地 + 落地 ──────
  // 保存当前入口 IP，供下次步骤 2 比对
  if (curEnt) $persistentStore.write(curEnt, KEY.ENT);

  // 本地查询（直连）和落地查询（代理）完全独立，并发执行缩短总时间
  const [local, landing] = await Promise.all([queryLocal(), queryLanding()]);

  // ── 步骤 5：落地查询完成后重读记录，提取入口 IP ────────────────
  // queryLanding 向 ip.sb 发了一条代理请求，此时再读记录可以找到该请求的 remoteAddress
  // 即入口代理服务器的 IP，从而得到"入口"信息
  const reqs2    = await getSurgeReqs();
  const ipHit    = reqs2.slice(0, 100).find(
    r => /ip\.sb|ipinfo\.io/.test(r.URL || '') && /\(Proxy\)/i.test(r.remoteAddress || '')
  );
  const entIP    = ipHit
    ? (() => { const ip = extractIP(ipHit.remoteAddress); return ip !== landing?.ip ? ip : null; })()
    : null;
  const entrance = entIP ? await queryEntranceInfo(entIP) : null;

  // ── 步骤 6：渲染面板内容，写入缓存，输出 ──────────────────────
  const pad = n => String(n).padStart(2, '0');
  const now = new Date();

  const sections = [block('本地', local?.ip, local)];
  if (entIP) sections.push(block('入口', entIP, entrance));
  sections.push(block('落地', landing?.ip, landing));
  sections.push(`记录时间：${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`);

  const content = sections.join('\n\n');
  writeCache({ content, ts: Date.now() });
  $done({ title: '网络信息', content });

})().catch(e => $done({ title: '网络信息', content: `组件异常：${e.message}` }));
