// 网络信息.js

!(async () => {
  // ─── 核心引擎：配置与持久化状态 ────────────────────────
  const CACHE_KEY      = 'IP_INFO_DICT_V2';
  const CACHE_TIME_KEY = 'IP_INFO_DICT_TIME_V2';
  const CONFIG_URL     = encodeURI('https://github.com/h05n/waibucangku/raw/main/映射库.json');

  const TIMEOUT_DIRECT = 5;
  const TIMEOUT_PROXY  = 10;

  function httpGet(opt) {
    return new Promise((res, rej) =>
      $httpClient.get(opt, (err, _, body) => err ? rej(new Error(String(err))) : res(body))
    );
  }
  const httpAPI = (path, method = 'GET', data = null) => new Promise(r => $httpAPI(method, path, data, r));

  // ─── 初始化引擎：自动过期拉取 + 容错机制 ────────────────
  async function initEngine() {
    let rawDict  = $persistentStore.read(CACHE_KEY);
    let lastTime = parseInt($persistentStore.read(CACHE_TIME_KEY) || '0', 10);
    const now    = Date.now();

    if (!rawDict || now - lastTime > 86400000) {
      try {
        const fresh = await httpGet({ url: CONFIG_URL, timeout: TIMEOUT_DIRECT });
        JSON.parse(fresh); // 校验合法 JSON，防止拉到 HTML 报错页
        rawDict = fresh;
        $persistentStore.write(rawDict, CACHE_KEY);
        $persistentStore.write(String(now), CACHE_TIME_KEY);
      } catch {
        if (!rawDict) throw new Error('首次初始化字典失败，请检查 GitHub 连通性');
      }
    }

    const dict = JSON.parse(rawDict);

    // 预编译 O(1) 繁简转换引擎
    const T2S_REGEX = new RegExp(`[${Object.keys(dict.t2s).join('')}]`, 'g');
    const t2s = s => s.replace(T2S_REGEX, c => dict.t2s[c]);

    // 预排序 ISP 键值，按长度降序保证最大匹配原则
    const ISP_KEYS = Object.keys(dict.isp).sort((a, b) => b.length - a.length);

    const CORP_RE = /\b(Technology|Technologies|Telecommunication|Telecommunications|Communication|Communications|Network|Networks|Internet|Service|Services|Telecom|Limited|Ltd|Corp|Corporation|Inc|Incorporated|Group|Global|International|Holdings|Solutions|Systems|Enterprise|Enterprises|Electric|Electron|Information|Data|Cloud|Digital|Media|Connect|Fiber|Co|Company|LLC|Pte|Pty)\b\.?/gi;

    const sortedSuffixes = dict.admin_suffixes.sort((a, b) => b.length - a.length);
    const SUFFIX_RE = new RegExp(`(${sortedSuffixes.join('|')})$`, 'i');

    return { dict, t2s, ISP_KEYS, CORP_RE, SUFFIX_RE };
  }

  const engine = await initEngine();
  const DICT   = engine.dict;

  // ─── 工具函数 ────────────────────────────────────────

  function translateGeo(str = '') {
    if (!str) return '';
    const sL = str.trim().toLowerCase();
    return DICT.geos[sL] || engine.t2s(str);
  }

  function stripSuffix(str = '') {
    const match = str.match(engine.SUFFIX_RE);
    if (match) {
      const cut = str.slice(0, -match[0].length).trim();
      if (cut.length >= 2) return cut;
    }
    return str;
  }

  // ⑨ 简化冗余代码：SUFFIX_RE 已覆盖所有自治区后缀，无需手动预处理
  function normalizeProvince(raw = '') {
    return stripSuffix(raw) || raw;
  }

  function cleanParts(parts) {
    const translated = parts.map(p => {
      if (/[\u4e00-\u9fff]/.test(p)) return p;
      const cn = translateGeo(p.trim());
      return /[\u4e00-\u9fff]/.test(cn) ? cn : p;
    });
    const seen = new Set();
    return translated.filter(p => {
      if (!p || seen.has(p)) return false;
      seen.add(p);
      return true;
    });
  }

  // ④ 非中国 IP：城市能翻译成中文就优先用城市，翻译不了则回退到省/州（与改前一致）
  function formatLocation(countryCode, region, city) {
    const tR = stripSuffix(translateGeo(region));
    const tC = stripSuffix(translateGeo(city));
    let parts;
    if (countryCode === 'CN') {
      parts = [tR, tC];
    } else {
      const country      = DICT.countries[(countryCode || '').toLowerCase()] || countryCode || '';
      const locationPart = (/[\u4e00-\u9fff]/.test(tC) ? tC : null) || tR || tC;
      parts = [country, locationPart];
    }
    return cleanParts(parts.filter(Boolean)).join(' ');
  }

  // ② 停用词列表，防止英语介词混入运营商名称
  const STOP_WORDS = /^(of|for|and|the|in|at|by|to|a|an|no)$/i;

  // ② 过滤 ASN 编号和停用词，防止泄露进显示名称
  // ③ 移除 15 字符硬截断，两词上限已足够
  function formatISP(raw = '') {
    let s = raw.replace(/^AS\d+\s*/i, '').trim();
    if (!s) return '';

    const cleaned  = s.replace(/\s*[\(\（][^\)\）]{0,30}[\)\）]\s*/g, ' ').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    const cleanedL = cleaned.toLowerCase();
    const sL       = s.toLowerCase();

    const hitKey = engine.ISP_KEYS.find(k => cleanedL.includes(k) || sL.includes(k));
    if (hitKey) return engine.t2s(DICT.isp[hitKey]);

    s = cleaned.replace(engine.CORP_RE, ' ').replace(/\s+/g, ' ').replace(/[,\-.\s]+$/, '').trim();
    s = engine.t2s(s);

    const uniqueWords = [];
    const seenWords   = new Set();
    for (const w of s.split(/\s+/).filter(Boolean)) {
      const wL = w.toLowerCase();
      if (!seenWords.has(wL)) { seenWords.add(wL); uniqueWords.push(w); }
    }

    // ② 过滤 ASN 编号（如 AS5650）和英语停用词（of / the / in …）
    const filteredWords = uniqueWords.filter(w => !/^AS\d+$/i.test(w) && !STOP_WORDS.test(w));
    return filteredWords.slice(0, 2).join(' ');
  }

  function normalizeASN(raw) {
    if (raw == null || raw === '') return '';
    const s = String(raw).trim();
    const m = s.match(/\b(AS\d+)\b/i);
    if (m) return m[1].toUpperCase();
    if (/^\d+$/.test(s)) return `AS${s}`;
    return '';
  }

  // ─── 解析器 ─────────────────────────────────────────

  function parseIPAPI(d) {
    if (d.status !== 'success') throw new Error('ip-api fail');
    return {
      ip:       d.query || '',
      location: formatLocation(d.countryCode, d.regionName, d.city),
      isp:      formatISP(`${d.isp || ''} ${d.as || ''}`),
      asn:      normalizeASN((d.as || '').match(/\b(AS\d+)\b/i)?.[1]),
    };
  }

  // ⑧ IPIP 运营商名同样经过 formatISP 标准化，与其他来源保持一致
  function parseIPIP(d) {
    if (d?.ret !== 'ok' || !d.data?.ip) throw new Error('ipip fail');
    const loc      = d.data.location || [];
    const province = normalizeProvince(engine.t2s(loc[1] || ''));
    const city     = stripSuffix(engine.t2s(loc[2] || ''));
    return {
      ip:       d.data.ip,
      location: cleanParts([province, city].filter(Boolean)).join(' '),
      isp:      formatISP(engine.t2s(loc[3] || '')),
    };
  }

  function parseIPSB(d) {
    if (!d?.ip) throw new Error('ip.sb fail');
    return {
      ip:       d.ip,
      location: formatLocation(d.country_code, d.region, d.city),
      isp:      formatISP(`${d.isp || ''} ${d.organization || ''}`),
      asn:      normalizeASN(d.asn),
    };
  }

  function parseIPInfoIO(d) {
    if (!d?.ip) throw new Error('ipinfo fail');
    return {
      ip:       d.ip,
      location: formatLocation(d.country, d.region, d.city),
      isp:      formatISP(`${d.org || ''} ${d.asn || ''}`),
      asn:      normalizeASN((d.org || '').match(/^AS\d+/i)?.[0]),
    };
  }

  // ─── 核心并发查询逻辑 ────────────────────────────────

  async function safeFetchJSON(url, extra = {}, timeout = TIMEOUT_DIRECT) {
    try { return JSON.parse(await httpGet({ url, ...extra, timeout })); } catch { return null; }
  }

  async function queryLocal() {
    const [ipipRaw, ipapiRaw] = await Promise.all([
      safeFetchJSON('https://myip.ipip.net/json', { policy: 'DIRECT' }, TIMEOUT_DIRECT),
      safeFetchJSON('http://ip-api.com/json/?lang=zh-CN&fields=status,query,countryCode,regionName,city,isp,as', { policy: 'DIRECT' }, TIMEOUT_DIRECT),
    ]);

    const ipip  = ipipRaw  ? (() => { try { return parseIPIP(ipipRaw);  } catch { return null; } })() : null;
    const ipapi = ipapiRaw?.status === 'success' ? parseIPAPI(ipapiRaw) : null;

    if (!ipip && !ipapi) return null;
    return {
      ip:       ipip?.ip       || ipapi?.ip       || '',
      location: ipip?.location || ipapi?.location || '',
      isp:      ipip?.isp      || ipapi?.isp      || '',
      asn:      ipapi?.asn || '',
    };
  }

  async function queryLanding() {
    try { return parseIPSB(await safeFetchJSON('https://api-ipv4.ip.sb/geoip', {}, TIMEOUT_PROXY)); } catch { /* fallthrough */ }
    try { return parseIPInfoIO(await safeFetchJSON('https://ipinfo.io/json', {}, TIMEOUT_PROXY)); } catch { return null; }
  }

  async function queryEntrance(ip) {
    const d = await safeFetchJSON(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN&fields=status,query,countryCode,regionName,city,isp,as`,
      { policy: 'DIRECT' }, TIMEOUT_DIRECT
    );
    if (d?.status === 'success') return parseIPAPI(d);

    const fallback = await safeFetchJSON(`https://api-ipv4.ip.sb/geoip/${encodeURIComponent(ip)}`, { policy: 'DIRECT' }, TIMEOUT_DIRECT);
    return fallback ? parseIPSB(fallback) : null;
  }

  // ⑦ 扫描窗口从 40 扩大至 100 条，减少漏检入口 IP 的概率
  async function findEntrance(landingIP) {
    try {
      const { requests = [] } = await httpAPI('/v1/requests/recent');
      const hit = requests.slice(0, 100).find(
        r => /ip\.sb|ipinfo\.io/.test(r.URL || '') && /\(Proxy\)/i.test(r.remoteAddress || '')
      );
      if (!hit) return null;
      const ip = (hit.remoteAddress || '')
        .replace(/\s*\(Proxy\)\s*/gi, '').trim()
        .replace(/:\d+$/, '').replace(/^\[(.+)\]$/, '$1');
      return ip && ip !== landingIP ? ip : null;
    } catch { return null; }
  }

  // ─── UI 渲染 ─────────────────────────────────────────

  function block(label, ip, info) {
    const lines = [`${label}：${ip || '-'}`];
    if (info?.location) lines.push(`位置：${info.location}`);
    if (info?.isp)      lines.push(`网络：${info.isp}`);
    if (info?.asn)      lines.push(`代号：${info.asn}`);
    return lines.join('\n');
  }

  const [local, landing] = await Promise.all([queryLocal(), queryLanding()]);
  const entranceIP = await findEntrance(landing?.ip);
  const entrance   = entranceIP ? await queryEntrance(entranceIP) : null;

  const sections = [block('本地', local?.ip, local)];
  if (entranceIP) sections.push(block('入口', entranceIP, entrance));
  sections.push(block('落地', landing?.ip, landing));

  const pad = n => String(n).padStart(2, '0');
  const t   = new Date();
  sections.push(`记录时间：${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`);

  $done({ title: '网络信息', content: sections.join('\n\n') });

})().catch(e => $done({ title: '网络信息', content: `组件异常：${e.message}` }));
