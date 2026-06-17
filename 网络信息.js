/**
 * 网络信息
 */

// 图标
const PANEL_ICON = "https://github.com/h05n/tubiao/raw/main/Surge/我的节点.png";

// 安全解析 Surge 模块传参
const arg = (() => {
  if (typeof $argument === 'undefined') return {};
  return $argument.split('&').reduce((acc, item) => {
    const index = item.indexOf('=');
    if (index !== -1) {
      acc[item.substring(0, index).trim()] = item.substring(index + 1).trim();
    }
    return acc;
  }, {});
})();

// 提取功能参数
const TIMEOUT = parseInt(arg['TIMEOUT']) || 5;
const PRIVACY = arg['PRIVACY'] === '1';       
const HIDE_LOCAL = arg['HIDE_LOCAL'] === '1'; 

!(async () => {
  let contentLines = [];

  // 并发查直连和落地环境
  const [localInfo, proxyInfo] = await Promise.all([
    fetchLocalIPIP(),
    fetchIpApi()
  ]);

  // 嗅探入口 IP
  let entranceInfo = null;
  const entranceIp = await getEntranceIp();
  if (entranceIp && (!proxyInfo || entranceIp !== proxyInfo.ip) && (!localInfo || entranceIp !== localInfo.ip)) {
    entranceInfo = await fetchIpApi(entranceIp);
  }

  const isDirect = localInfo && proxyInfo && localInfo.ip === proxyInfo.ip;

  // 封装打码器：加入了防报错兜底 (!ip 判断)
  const formatIp = (ip) => {
    if (!ip) return '未知';
    if (PRIVACY) return '已隐藏';
    if (typeof ip === 'string' && ip.includes(':')) return 'IPv6 地址'; 
    return ip;
  };

  // 1. 本地信息块
  if (!HIDE_LOCAL && localInfo) {
    contentLines.push(`I P:  ${formatIp(localInfo.ip)}`); 
    contentLines.push(`位置: ${localInfo.loc}`);
    contentLines.push(`网络: ${localInfo.isp}`);
  }

  // 2. 代理信息块
  if (!isDirect) {
    if (entranceInfo) {
      if (contentLines.length > 0) contentLines.push(""); 
      contentLines.push(`入口: ${formatIp(entranceInfo.ip)}`);
      contentLines.push(`位置: ${entranceInfo.loc}`);
      contentLines.push(`网络: ${entranceInfo.isp}`);
    }
    if (proxyInfo) {
      if (contentLines.length > 0) contentLines.push("");
      contentLines.push(`落地: ${formatIp(proxyInfo.ip)}`);
      contentLines.push(`位置: ${proxyInfo.loc}`);
      contentLines.push(`网络: ${proxyInfo.isp}`);
    }
  }

  // 移交渲染权
  $done({
    title: "网络信息",
    content: contentLines.join('\n') || "网络状态获取中...",
    icon: PANEL_ICON
  });
})();

// ================= 核心请求 =================

async function fetchLocalIPIP() {
  const res = await httpGet("https://myip.ipip.net/json");
  if (!res) return null;
  try {
    const data = JSON.parse(res);
    return {
      ip: data.data.ip,
      loc: formatLocation(data.data.location[1], data.data.location[2], data.data.location[0]),
      isp: formatIsp(data.data.location[4])
    };
  } catch (e) { return null; }
}

async function fetchIpApi(targetIp = '') {
  const url = `http://ip-api.com/json${targetIp ? '/' + targetIp : ''}?lang=zh-CN`;
  const res = await httpGet(url);
  if (!res) return null;
  try {
    const data = JSON.parse(res);
    return {
      ip: data.query,
      loc: formatLocation(data.regionName, data.city, data.country),
      isp: formatIsp(data.isp || data.org || data.as)
    };
  } catch (e) { return null; }
}

async function getEntranceIp() {
  try {
    const res = await httpAPI('/v1/requests/recent');
    const req = res.requests.slice(0, 10).find(i => /ip-api\.com/.test(i.URL));
    if (req && /\(Proxy\)/.test(req.remoteAddress)) {
      return req.remoteAddress.replace(/\s*\(Proxy\)\s*/, '');
    }
  } catch (e) {}
  return '';
}

// ================= 数据清洗 =================

function formatLocation(region, city, country) {
  let locStr = `${region || ''} ${city || ''}`.trim();
  if (!locStr && country) locStr = country;
  locStr = locStr.replace(/(中国|China)\s*/g, '');
  locStr = locStr.replace(/(省|自治区|特别行政区|市)/g, '');
  const parts = locStr.split(/\s+/).filter(i => i);
  if (parts.length === 2 && parts[0] === parts[1]) locStr = parts[0];
  return locStr.trim() || '未知';
}

function formatIsp(isp) {
  if (!isp) return '-';
  let name = isp.replace(/^AS\d+\s+/, '');
  const trashRegex = /(?i)(,\s*)?(Co\.,\s*Ltd\.|Inc\.|LLC|Corp\.|Corporation|Limited|Services|Network|Advertising|Technology|Information|Communications)/g;
  name = name.replace(trashRegex, '').replace(/,\s*$/, '').trim();
  if (name.length > 18) {
    name = name.substring(0, 18) + '...';
  }
  return name || '-';
}

// ================= 基础设施 =================

function httpGet(url) {
  return new Promise((resolve) => {
    let isResolved = false;
    $httpClient.get({ url, timeout: TIMEOUT }, (err, resp, data) => {
      if (!isResolved) {
        isResolved = true;
        resolve(err ? null : data);
      }
    });
    setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        resolve(null);
      }
    }, (TIMEOUT * 1000) + 500);
  });
}

function httpAPI(path) {
  return new Promise((resolve) => {
    $httpAPI('GET', path, null, result => resolve(result));
  });
}
