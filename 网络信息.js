// 网络信息.js

!(async () => {
  // ─── 配置与持久化状态 ────────────────────────
  const CACHE_KEY = 'IP_INFO_DICT_V1';
  const CACHE_TIME_KEY = 'IP_INFO_DICT_TIME';
  // 使用官方短链接，套上 encodeURI 确保中文字符安全请求
  const CONFIG_URL = encodeURI('https://github.com/h05n/waibucangku/raw/main/映射库.json');
  
  const TIMEOUT_DIRECT = 5;
  const TIMEOUT_PROXY  = 10;
  
  function httpGet(opt) {
    return new Promise((res, rej) =>
      $httpClient.get(opt, (err, _, body) => err ? rej(new Error(String(err))) : res(body))
    )
  }
  const httpAPI = (path, method = 'GET', data = null) => new Promise(r => $httpAPI(method, path, data, r))

  // 1. 加载云端配置并预编译哈希表/正则表达式
  async function initEngine() {
    let rawDict = $persistentStore.read(CACHE_KEY);
    let lastTime = $persistentStore.read(CACHE_TIME_KEY);
    let now = Date.now();
    
    // 如果无缓存，或者缓存超过 7 天 (604800000 毫秒)，或者通过 argument=flush=1 强制刷新，则重新下载
    if (!rawDict || (now - (lastTime || 0) > 604800000) || ($argument && $argument.includes('flush=1'))) {
      try {
        rawDict = await httpGet({ url: CONFIG_URL, timeout: TIMEOUT_DIRECT });
        $persistentStore.write(rawDict, CACHE_KEY);
        $persistentStore.write(String(now), CACHE_TIME_KEY);
      } catch (e) {
        if (!rawDict) throw new Error('字典下载失败，请检查网络或配置 URL');
        // 下载失败但有旧缓存时，静默使用旧缓存
      }
    }
    
    const dict = JSON.parse(rawDict);
    
    // 预编译 O(1) 繁简转换（底层 C++ 正则驱动）
    const T2S_REGEX = new RegExp(`[${Object.keys(dict.t2s).join('')}]`, 'g');
    const t2s = s => s.replace(T2S_REGEX, c => dict.t2s[c]);
    
    // 预排序 ISP 键值，按长度降序保证最大匹配原则
    const ISP_KEYS = Object.keys(dict.isp).sort((a, b) => b.length - a.length);

    const CORP_RE = /\b(Technology|Technologies|Telecommunication|Telecommunications|Communication|Communications|Network|Networks|Internet|Service|Services|Telecom|Limited|Ltd|Corp|Corporation|Inc|Incorporated|Group|Global|International|Holdings|Solutions|Systems|Enterprise|Enterprises|Electric|Electron|Information|Data|Cloud|Digital|Media|Connect|Fiber)\b\.?/gi;

    return { dict, t2s, ISP_KEYS, CORP_RE };
  }

  const engine = await initEngine();
  const DICT = engine.dict;

  // ─── O(1) 解析算法 ────────────────────────────────

  function translateGeo(str = '') {
    if (!str) return '';
    const sL = str.trim().toLowerCase();
    // O(1) 哈希直查，找不到则执行繁简转换
    return DICT.geos[sL] || engine.t2s(str);
  }

  function stripSuffix(str = '') {
    for (const suf of DICT.admin_suffixes) {
      if (str.endsWith(suf)) {
        const cut = str.slice(0, -suf.length).trim();
        if (cut.length >= 2) return cut;
      }
    }
    return str;
  }

  function normalizeProvince(raw = '') {
    const s = raw.replace(/维吾尔自治区$/, '').replace(/壮族自治区$/, '').replace(/回族自治区$/, '').replace(/藏族自治区$/, '').replace(/朝鲜族自治州$/, '').trim();
    return stripSuffix(s) || stripSuffix(raw) || raw;
  }

  function cleanParts(parts) {
    const translated = parts.map(p => {
      if (/[\u4e00-\u9fff]/.test(p)) return p;
      const cn = translateGeo(p.trim());
      return /[\u4e00-\u9fff]/.test(cn) ? cn : p;
    });
    const seen = new Set();
    return translated.filter(p => p && !seen.has(p) && seen.add(p));
  }

  function formatLocation(countryCode, region, city) {
    const tR = stripSuffix(translateGeo(region));
    const tC = stripSuffix(translateGeo(city));
    let parts;
    if (countryCode === 'CN') {
      parts = [tR, tC];
    } else {
      const country = DICT.countries[(countryCode || '').toLowerCase()] || countryCode || '';
      parts = [country, tR || tC];
    }
    return cleanParts(parts.filter(Boolean)).join(' ');
  }

  function formatISP(raw = '') {
    let s = raw.replace(/^AS\d+\s*/i, '').trim();
    if (!s) return '';
    
    const cleaned = s.replace(/\s*[\(\（][^\)\）]{0,30}[\)\）]\s*/g, ' ').replace(/\s+/g, ' ').trim();
    const cleanedL = cleaned.toLowerCase();
    const sL = s.toLowerCase();
    
    // 快速查找，规避每次循环内部的 toLowerCase() 运算
    const hitKey = engine.ISP_KEYS.find(k => cleanedL.includes(k) || sL.includes(k));
    if (hitKey) return engine.t2s(DICT.isp[hitKey]);

    // 兜底清洗
    s = cleaned.replace(engine.CORP_RE, ' ').replace(/\s+/g, ' ').replace(/[,\-.\s]+$/, '').trim();
    s = engine.t2s(s);
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length > 2) s = words.slice(0, 2).join(' ');
    if (s.length > 15) s = s.slice(0, 15).trimEnd();
    return s;
  }

  function normalizeASN(raw) {
    if (raw === null || raw === undefined || raw === '') return '';
    const s = String(raw).trim();
    const m = s.match(/\b(AS\d+)\b/i);
    if (m) return m[1].toUpperCase();
    if (/^\d+$/.test(s) && s.length > 0) return `AS${s}`;
    return '';
  }

  // ─── 解析器 ──────────────────────────────────
  function parseIPAPI(d) {
    if (d.status !== 'success') throw new Error('ip-api fail');
    return {
      ip: d.query || '',
      location: formatLocation(d.countryCode, d.regionName, d.city),
      isp: formatISP(d.isp || ''),
      asn: normalizeASN((d.as || '').match(/\b(AS\d+)\b/i)?.[1]),
    };
  }

  function parseIPIP(d) {
    if (d?.ret !== 'ok' || !d.data?.ip) throw new Error('ipip fail');
    const loc = d.data.location || [];
    const province = normalizeProvince(engine.t2s(loc[1] || ''));
    const city = stripSuffix(engine.t2s(loc[2] || ''));
    return {
      ip: d.data.ip,
      location: cleanParts([province, city].filter(Boolean)).join(' '),
      isp: engine.t2s(loc[3] || ''),
    };
  }

  function parseIPSB(d) {
    if (!d?.ip) throw new Error('ip.sb fail');
    return {
      ip: d.ip,
      location: formatLocation(d.country_code, d.region, d.city),
      isp: formatISP(d.isp || d.organization || ''),
      asn: normalizeASN(d.asn),
    };
  }

  function parseIPInfoIO(d) {
    if (!d?.ip) throw new Error('ipinfo fail');
    return {
      ip: d.ip,
      location: formatLocation(d.country, d.region, d.city),
      isp: formatISP(d.org || ''),
      asn: normalizeASN((d.org || '').match(/^AS\d+/i)?.[0]),
    };
  }

  // ─── 并发查询逻辑 ────────────────────────────
  async function safeFetchJSON(url, extra = {}, timeout = TIMEOUT_DIRECT) {
    try { return JSON.parse(await httpGet({ url, ...extra, timeout })); } catch (e) { return null; }
  }

  async function queryLocal() {
    const [ipipRaw, ipapiRaw] = await Promise.all([
      safeFetchJSON('https://myip.ipip.net/json', { policy: 'DIRECT' }, TIMEOUT_DIRECT),
      safeFetchJSON('http://ip-api.com/json/?lang=zh-CN&fields=status,query,countryCode,regionName,city,isp,as', { policy: 'DIRECT' }, TIMEOUT_DIRECT)
    ]);
    
    const ipip = ipipRaw ? (() => { try { return parseIPIP(ipipRaw); } catch { return null; } })() : null;
    const ipapi = ipapiRaw?.status === 'success' ? parseIPAPI(ipapiRaw) : null;
    
    if (!ipip && !ipapi) return null;
    return {
      ip: ipip?.ip || ipapi?.ip || '',
      location: ipip?.location || ipapi?.location || '',
      isp: ipip?.isp || ipapi?.isp || '',
      asn: ipapi?.asn || '',
    };
  }

  async function queryLanding() {
    try { return parseIPSB(await safeFetchJSON('https://api-ipv4.ip.sb/geoip', {}, TIMEOUT_PROXY)); } catch { /* fallthrough */ }
    try { return parseIPInfoIO(await safeFetchJSON('https://ipinfo.io/json', {}, TIMEOUT_PROXY)); } catch { return null; }
  }

  async function queryEntrance(ip) {
    const d = await safeFetchJSON(`http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN&fields=status,query,countryCode,regionName,city,isp,as`, { policy: 'DIRECT' }, TIMEOUT_DIRECT);
    if (d?.status === 'success') return parseIPAPI(d);
    
    const fallback = await safeFetchJSON(`https://api-ipv4.ip.sb/geoip/${encodeURIComponent(ip)}`, { policy: 'DIRECT' }, TIMEOUT_DIRECT);
    return fallback ? parseIPSB(fallback) : null;
  }

  async function findEntrance(landingIP) {
    try {
      const { requests = [] } = await httpAPI('/v1/requests/recent');
      const hit = requests.slice(0, 40).find(r => /ip\.sb|ipinfo\.io/.test(r.URL || '') && /\(Proxy\)/i.test(r.remoteAddress || ''));
      if (!hit) return null;
      const ip = (hit.remoteAddress || '').replace(/\s*\(Proxy\)\s*/gi, '').trim().replace(/:\d+$/, '').replace(/^\[(.+)\]$/, '$1');
      return ip && ip !== landingIP ? ip : null;
    } catch { return null; }
  }

  // ─── UI 渲染流程 ──────────────────────────────
  function block(label, ip, info) {
    const lines = [`${label}：${ip || '-'}`];
    if (info?.location) lines.push(`位置：${info.location}`);
    if (info?.isp)      lines.push(`网络：${info.isp}`);
    if (info?.asn)      lines.push(`代号：${info.asn}`);
    return lines.join('\n');
  }

  const [local, landing] = await Promise.all([queryLocal(), queryLanding()]);
  const entranceIP = await findEntrance(landing?.ip);
  const entrance = entranceIP ? await queryEntrance(entranceIP) : null;

  const sections = [block('本地', local?.ip, local)];
  if (entranceIP) sections.push(block('入口', entranceIP, entrance));
  sections.push(block('落地', landing?.ip, landing));

  const pad = n => String(n).padStart(2, '0');
  const nowTime = new Date();
  sections.push(`记录时间：${pad(nowTime.getHours())}:${pad(nowTime.getMinutes())}:${pad(nowTime.getSeconds())}`);

  $done({ title: '网络信息', content: sections.join('\n\n') });

})().catch(e => $done({ title: '网络信息', content: `组件异常：${e.message}` }));
