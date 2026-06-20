// 网络信息.js
!(async () => {
  // ─── 配置区 ───────────────────────────────────────────
  const CONFIG = {
    CACHE_KEY: 'IP_INFO_DICT_V2',
    CACHE_TIME_KEY: 'IP_INFO_DICT_TIME_V2',
    DICT_URL: 'https://github.com/h05n/waibucangku/raw/main/映射库.json',
    TIMEOUT_DIRECT: 6,
    TIMEOUT_PROXY: 8,
    SCAN_WINDOW: 50,
    // API URLs
    URL_IPIP: 'https://myip.ipip.net/json',
    URL_IPAPI: 'https://ip-api.com/json/?lang=zh-CN&fields=status,query,countryCode,regionName,city,isp,as',
    URL_IPINFO: 'https://ipinfo.io/json',
    URL_IPSB: 'https://api-ipv4.ip.sb/geoip',
    URL_IPAPI_QUERY: (ip) => `https://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN&fields=status,query,countryCode,regionName,city,isp,as`,
    URL_IPINFO_QUERY: (ip) => `https://ipinfo.io/${encodeURIComponent(ip)}/json`,
    URL_IPSB_QUERY: (ip) => `https://api-ipv4.ip.sb/geoip/${encodeURIComponent(ip)}`,
  };

  // ─── 工具层 ───────────────────────────────────────────
  const httpGet = (opt) => new Promise((res, rej) => {
    $httpClient.get(opt, (err, _, body) => err ? rej(new Error(String(err))) : res(body));
  });

  const httpAPI = (path, method = 'GET', data = null) => new Promise(r => $httpAPI(method, path, data, r));

  const safeFetchJSON = async (url, opt = {}, timeout) => {
    try {
      return JSON.parse(await httpGet({ url, ...opt, timeout }));
    } catch {
      return null;
    }
  };

  // 转义正则特殊字符
  const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // ─── 引擎层 (字典与正则预编译) ─────────────────────────
  async function initEngine() {
    let rawDict = $persistentStore.read(CONFIG.CACHE_KEY);
    let lastTime = parseInt($persistentStore.read(CONFIG.CACHE_TIME_KEY) || '0', 10);
    const now = Date.now();

    // 24小时更新一次字典，失败则降级使用空字典
    if (!rawDict || now - lastTime > 86400000) {
      try {
        const fresh = await httpGet({ url: CONFIG.DICT_URL, timeout: CONFIG.TIMEOUT_DIRECT });
        JSON.parse(fresh); // 校验合法 JSON
        rawDict = fresh;
        $persistentStore.write(rawDict, CONFIG.CACHE_KEY);
        $persistentStore.write(String(now), CONFIG.CACHE_TIME_KEY);
      } catch {
        if (!rawDict) rawDict = '{}';
      }
    }

    const dict = JSON.parse(rawDict);

    // 统一小写预处理，实现极速 O(1) 查表
    const lowerKeys = (obj) => {
      const o = {};
      for (const k in obj) o[k.toLowerCase()] = obj[k];
      return o;
    };

    dict.t2s = dict.t2s || {};
    dict.countries = lowerKeys(dict.countries || {});
    dict.geos = lowerKeys(dict.geos || {});
    dict.isp = lowerKeys(dict.isp || {});
    dict.admin_suffixes = dict.admin_suffixes || [];

    // 预编译正则
    const T2S_REGEX = new RegExp(`[${Object.keys(dict.t2s).join('')}]`, 'g');
    const t2s = s => s.replace(T2S_REGEX, c => dict.t2s[c] || c);

    const ISP_KEYS = Object.keys(dict.isp).sort((a, b) => b.length - a.length);
    
    // 预编译地理提取正则：提取纯英文且长度大于3的词，长词优先，防止误匹配
    const GEO_EXTRACT_KEYS = Object.keys(dict.geos)
      .filter(k => /^[a-z\s]+$/i.test(k) && k.length > 3)
      .sort((a, b) => b.length - a.length);
    const GEO_EXTRACT_RE = new RegExp(`\\b(${GEO_EXTRACT_KEYS.map(escapeRegExp).join('|')})\\b`, 'ig');

    const CORP_RE = /\b(Technology|Technologies|Telecommunication|Telecommunications|Communication|Communications|Network|Networks|Internet|Service|Services|Telecom|Limited|Ltd|Corp|Corporation|Inc|Incorporated|Group|Global|International|Holdings|Solutions|Systems|Enterprise|Enterprises|Electric|Electron|Information|Data|Cloud|Digital|Media|Connect|Fiber|Co|Company|LLC|Pte|Pty)\b\.?/gi;

    const sortedSuffixes = dict.admin_suffixes.sort((a, b) => b.length - a.length);
    const SUFFIX_RE = new RegExp(`(${sortedSuffixes.map(s => s.replace(/ /g, '\\s')).join('|')})$`, 'i');

    return { dict, t2s, ISP_KEYS, GEO_EXTRACT_RE, CORP_RE, SUFFIX_RE };
  }

  const engine = await initEngine();

  // ─── 格式化层 ─────────────────────────────────────────
  const STOP_WORDS = /^(of|for|and|the|in|at|by|to|a|an|no)$/i;

  function translateGeo(str = '') {
    if (!str) return '';
    const sL = str.trim().toLowerCase();
    return engine.dict.geos[sL] || engine.t2s(str);
  }

  function stripSuffix(str = '') {
    const match = str.match(engine.SUFFIX_RE);
    if (match) {
      const cut = str.slice(0, -match[0].length).trim();
      if (cut.length >= 2) return cut;
    }
    return str;
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

  // 极速提取：当省市缺失时，从原始 ISP/Org 字符串中动态正则提取地理信息
  function extractGeoFromText(text = '') {
    if (!text || !engine.GEO_EXTRACT_RE) return '';
    const match = text.match(engine.GEO_EXTRACT_RE);
    if (match && match[0]) {
      const cn = engine.dict.geos[match[0].toLowerCase()];
      if (/[\u4e00-\u9fff]/.test(cn)) return cn;
    }
    return '';
  }

  function formatLocation(countryCode, region, city, isCN, fallbackGeo = '') {
    let tR = stripSuffix(translateGeo(region));
    let tC = stripSuffix(translateGeo(city));

    // 兜底：如果省市均为空，使用提取到的地理信息
    if (!tR && !tC && fallbackGeo) {
      tC = fallbackGeo;
    }

    let parts;
    if (isCN) {
      parts = [tR, tC];
    } else {
      const country = engine.dict.countries[(countryCode || '').toLowerCase()] || countryCode || '';
      const locationPart = (/[\u4e00-\u9fff]/.test(tC) ? tC : null) || tR || tC;
      parts = [country, locationPart];
    }

    return cleanParts(parts.filter(Boolean)).join(' ');
  }

  function formatISP(raw = '') {
    let s = raw.replace(/^AS\d+\s*/i, '').trim();
    if (!s) return '';

    const cleaned = s.replace(/\s*[\(\（][^\)\）]{0,30}[\)\）]\s*/g, ' ').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    const cleanedL = cleaned.toLowerCase();

    // 优先命中字典
    const hitKey = engine.ISP_KEYS.find(k => cleanedL.includes(k));
    if (hitKey) return engine.t2s(engine.dict.isp[hitKey]);

    // 兜底清洗
    s = cleaned.replace(engine.CORP_RE, ' ').replace(/\s+/g, ' ').replace(/[,\-.\s]+$/, '').trim();
    s = engine.t2s(s);

    const uniqueWords = [];
    const seenWords = new Set();
    for (const w of s.split(/\s+/).filter(Boolean)) {
      const wL = w.toLowerCase();
      if (!seenWords.has(wL)) {
        seenWords.add(wL);
        if (!/^AS\d+$/i.test(w) && !STOP_WORDS.test(w)) uniqueWords.push(w);
      }
    }

    return uniqueWords.slice(0, 2).join(' ');
  }

  function normalizeASN(raw) {
    if (raw == null || raw === '') return '';
    const m = String(raw).trim().match(/\b(AS\d+)\b/i);
    if (m) return m[1].toUpperCase();
    if (/^\d+$/.test(raw)) return `AS${raw}`;
    return '';
  }

  // ─── 解析器层 ─────────────────────────────────────────
  const parseIPAPI = (d) => {
    if (d?.status !== 'success') return null;
    const rawISP = `${d.isp || ''} ${d.as || ''}`;
    const fallbackGeo = (!d.regionName && !d.city) ? extractGeoFromText(rawISP) : '';
    return {
      ip: d.query || '',
      location: formatLocation(d.countryCode, d.regionName, d.city, d.countryCode === 'CN', fallbackGeo),
      isp: formatISP(rawISP),
      asn: normalizeASN((d.as || '').match(/\b(AS\d+)\b/i)?.[1]),
    };
  };

  const parseIPIP = (d) => {
    if (d?.ret !== 'ok' || !d.data?.ip) return null;
    const loc = d.data.location || [];
    const province = stripSuffix(engine.t2s(loc[1] || ''));
    const city = stripSuffix(engine.t2s(loc[2] || ''));
    return {
      ip: d.data.ip,
      location: cleanParts([province, city].filter(Boolean)).join(' '),
      isp: formatISP(engine.t2s(loc[3] || '')),
      asn: '',
    };
  };

  const parseIPSB = (d) => {
    if (!d?.ip) return null;
    const rawISP = `${d.isp || ''} ${d.organization || ''}`;
    const fallbackGeo = (!d.region && !d.city) ? extractGeoFromText(rawISP) : '';
    return {
      ip: d.ip,
      location: formatLocation(d.country_code, d.region, d.city, d.country_code === 'CN', fallbackGeo),
      isp: formatISP(rawISP),
      asn: normalizeASN(d.asn),
    };
  };

  const parseIPInfoIO = (d) => {
    if (!d?.ip) return null;
    const rawISP = `${d.org || ''} ${d.asn || ''}`;
    const fallbackGeo = (!d.region && !d.city) ? extractGeoFromText(rawISP) : '';
    return {
      ip: d.ip,
      location: formatLocation(d.country, d.region, d.city, d.country === 'CN', fallbackGeo),
      isp: formatISP(rawISP),
      asn: normalizeASN((d.org || '').match(/^AS\d+/i)?.[0]),
    };
  };

  // ─── 数据合并层 (字段级交叉补全) ──────────────────────
  function mergeResults(priorityList) {
    const result = { ip: '', location: '', isp: '', asn: '' };
    for (const key of ['ip', 'location', 'isp', 'asn']) {
      for (const data of priorityList) {
        if (data && data[key]) {
          result[key] = data[key];
          break;
        }
      }
    }
    return result;
  }

  // ─── 查询层 ───────────────────────────────────────────
  async function queryLocal() {
    const [ipipRaw, ipapiRaw, ipinfoRaw] = await Promise.allSettled([
      safeFetchJSON(CONFIG.URL_IPIP, { policy: 'DIRECT' }, CONFIG.TIMEOUT_DIRECT),
      safeFetchJSON(CONFIG.URL_IPAPI, { policy: 'DIRECT' }, CONFIG.TIMEOUT_DIRECT),
      safeFetchJSON(CONFIG.URL_IPINFO, { policy: 'DIRECT' }, CONFIG.TIMEOUT_DIRECT)
    ]);

    const ipip = ipipRaw.status === 'fulfilled' ? parseIPIP(ipipRaw.value) : null;
    const ipapi = ipapiRaw.status === 'fulfilled' ? parseIPAPI(ipapiRaw.value) : null;
    const ipinfo = ipinfoRaw.status === 'fulfilled' ? parseIPInfoIO(ipinfoRaw.value) : null;

    if (!ipip && !ipapi && !ipinfo) return null;
    // 本地优先级：ipip (国内最准) > ipapi > ipinfo
    return mergeResults([ipip, ipapi, ipinfo]);
  }

  async function queryLanding() {
    const [ipsbRaw, ipinfoRaw, ipapiRaw] = await Promise.allSettled([
      safeFetchJSON(CONFIG.URL_IPSB, {}, CONFIG.TIMEOUT_PROXY),
      safeFetchJSON(CONFIG.URL_IPINFO, {}, CONFIG.TIMEOUT_PROXY),
      safeFetchJSON(CONFIG.URL_IPAPI, {}, CONFIG.TIMEOUT_PROXY)
    ]);

    const ipsb = ipsbRaw.status === 'fulfilled' ? parseIPSB(ipsbRaw.value) : null;
    const ipinfo = ipinfoRaw.status === 'fulfilled' ? parseIPInfoIO(ipinfoRaw.value) : null;
    const ipapi = ipapiRaw.status === 'fulfilled' ? parseIPAPI(ipapiRaw.value) : null;

    if (!ipsb && !ipinfo && !ipapi) return null;
    // 落地优先级：ipsb (国外最准) > ipinfo > ipapi
    return mergeResults([ipsb, ipinfo, ipapi]);
  }

  async function queryEntrance(ip) {
    const [ipsbRaw, ipinfoRaw, ipapiRaw] = await Promise.allSettled([
      safeFetchJSON(CONFIG.URL_IPSB_QUERY(ip), {}, CONFIG.TIMEOUT_PROXY),
      safeFetchJSON(CONFIG.URL_IPINFO_QUERY(ip), {}, CONFIG.TIMEOUT_PROXY),
      safeFetchJSON(CONFIG.URL_IPAPI_QUERY(ip), {}, CONFIG.TIMEOUT_PROXY)
    ]);

    const ipsb = ipsbRaw.status === 'fulfilled' ? parseIPSB(ipsbRaw.value) : null;
    const ipinfo = ipinfoRaw.status === 'fulfilled' ? parseIPInfoIO(ipinfoRaw.value) : null;
    const ipapi = ipapiRaw.status === 'fulfilled' ? parseIPAPI(ipapiRaw.value) : null;

    if (!ipsb && !ipinfo && !ipapi) return null;
    return mergeResults([ipsb, ipinfo, ipapi]);
  }

  async function findEntrance(landingIP) {
    try {
      const { requests = [] } = await httpAPI('/v1/requests/recent');
      // 扫描最近 50 条记录中带 (Proxy) 标记的查 IP 请求
      const hit = requests.slice(0, CONFIG.SCAN_WINDOW).find(r => 
        /ip\.sb|ipinfo\.io|ip-api\.com|ipip\.net/.test(r.URL || '') && 
        /\(Proxy\)/i.test(r.remoteAddress || '')
      );
      if (!hit) return null;

      const ip = (hit.remoteAddress || '')
        .replace(/\s*\(Proxy\)\s*/gi, '').trim()
        .replace(/:\d+$/, '').replace(/^\[(.+)\]$/, '$1');

      // 纯 IP 比对：与落地 IP 不同则确认为入口
      return (ip && ip !== landingIP) ? ip : null;
    } catch {
      return null;
    }
  }

  // ─── UI 渲染层 ────────────────────────────────────────
  function block(label, ip, info) {
    const lines = [`${label}：${ip || '-'}`];
    if (info?.location) lines.push(`位置：${info.location}`);
    if (info?.isp) lines.push(`网络：${info.isp}`);
    if (info?.asn) lines.push(`代号：${info.asn}`);
    return lines.join('\n');
  }

  // ─── 主流程 ───────────────────────────────────────────
  const [local, landing] = await Promise.all([queryLocal(), queryLanding()]);
  const entranceIP = await findEntrance(landing?.ip);
  const entrance = entranceIP ? await queryEntrance(entranceIP) : null;

  const sections = [block('本地', local?.ip, local)];
  if (entranceIP) sections.push(block('入口', entranceIP, entrance));
  sections.push(block('落地', landing?.ip, landing));

  const pad = n => String(n).padStart(2, '0');
  const t = new Date();
  sections.push(`记录时间：${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`);

  $done({ title: '网络信息', content: sections.join('\n\n') });
})().catch(e => $done({ title: '网络信息', content: `组件异常：${e.message}` }));
