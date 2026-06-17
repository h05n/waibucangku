/**
 * 网络信息
 */

// 填你自己的图标直链
const PANEL_ICON = "https://github.com/h05n/tubiao/raw/main/Surge/我的节点.png";

// 处理模块传参，规避长字符串里的 "=" 被误截断
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

// 超时时间，默认 5 秒
const TIMEOUT = parseInt(arg['TIMEOUT']) || 5;

!(async () => {
  let title = "网络信息";
  let contentLines = [];

  // 1. 本地局域网信息 (在模块里控制显隐)
  if (typeof $network !== 'undefined') {
    if (arg['SSID'] === '1' && $network.wifi?.ssid) {
      contentLines.push(`SSID: ${$network.wifi.ssid}`);
    }
    if (arg['LAN'] === '1' && $network.v4?.primaryAddress) {
      contentLines.push(`LAN:  ${$network.v4.primaryAddress}`);
    }
    if (contentLines.length > 0) contentLines.push("");
  }

  // 2. 并发查直连和落地
  // 直连用 IPIP 最准，落地用 IP-API 自带中文
  const [localInfo, proxyInfo] = await Promise.all([
    fetchLocalIPIP(),
    fetchIpApi()
  ]);

  // 3. 从 Surge 最近请求里扒出真实的中转入口 IP
  let entranceInfo = null;
  const entranceIp = await getEntranceIp();
  if (entranceIp && (!proxyInfo || entranceIp !== proxyInfo.ip) && (!localInfo || entranceIp !== localInfo.ip)) {
    entranceInfo = await fetchIpApi(entranceIp);
  }

  // 4. 组装面板文字
  const isDirect = localInfo && proxyInfo && localInfo.ip === proxyInfo.ip;

  if (localInfo) {
    contentLines.push(`I P:  ${localInfo.ip}`); // I P 中间加空格，和下面两字对齐
    contentLines.push(`位置: ${localInfo.loc}`);
    contentLines.push(`网络: ${localInfo.isp}`);
  }

  // 只有挂了代理才显示入口和落地
  if (!isDirect) {
    if (entranceInfo) {
      contentLines.push("");
      contentLines.push(`入口: ${entranceInfo.ip}`);
      contentLines.push(`位置: ${entranceInfo.loc}`);
      contentLines.push(`网络: ${entranceInfo.isp}`);
    }
    if (proxyInfo) {
      contentLines.push("");
      contentLines.push(`落地: ${proxyInfo.ip}`);
      contentLines.push(`位置: ${proxyInfo.loc}`);
      contentLines.push(`网络: ${proxyInfo.isp}`);
    }
  }

  // 5. 渲染面板
  $done({
    title: title,
    content: contentLines.join('\n'),
    icon: PANEL_ICON
  });
})();

// ================= 核心请求逻辑 =================

// 查本地 IP (IPIP)
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

// 查国际 IP (IP-API)
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

// 抓取底层代理入口 IP
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

// ================= 数据清洗逻辑 =================

// 洗掉多余的省市和国家名字，保持极简
function formatLocation(region, city, country) {
  let locStr = `${region || ''} ${city || ''}`.trim();
  if (!locStr && country) locStr = country;
  
  // 干掉中国前缀
  locStr = locStr.replace(/(中国|China)\s*/g, '');
  // 干掉省市行政后缀
  locStr = locStr.replace(/(省|自治区|特别行政区|市)/g, '');
  
  // 直辖市去重 (比如 "上海 上海" 变 "上海")
  const parts = locStr.split(/\s+/).filter(i => i);
  if (parts.length === 2 && parts[0] === parts[1]) locStr = parts[0];
  
  return locStr.trim() || '未知';
}

// 洗掉 ASN 和一长串的公司后缀
function formatIsp(isp) {
  if (!isp) return '-';
  
  // 砍掉开头的 ASXXXX
  let name = isp.replace(/^AS\d+\s+/, '');
  
  // 砍掉没用的商业后缀
  const trashRegex = /(?i)(,\s*)?(Co\.,\s*Ltd\.|Inc\.|LLC|Corp\.|Corporation|Limited|Services|Network|Advertising|Technology|Information|Communications)/g;
  name = name.replace(trashRegex, '').replace(/,\s*$/, '').trim();
  
  // 防折行保护，超过 18 个字符就加省略号，不然撑破面板
  if (name.length > 18) {
    name = name.substring(0, 18) + '...';
  }
  
  return name || '-';
}

// ================= 基础设施 =================

// 包装 GET 请求，带上强制超时机制，防雪崩卡死
function httpGet(url) {
  return new Promise((resolve) => {
    let isResolved = false;
    
    $httpClient.get({ url, timeout: TIMEOUT }, (err, resp, data) => {
      if (!isResolved) {
        isResolved = true;
        resolve(err ? null : data);
      }
    });

    // 强行兜底，比设定的超时多 500ms，时间一到直接切断抛弃请求
    setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        resolve(null);
      }
    }, (TIMEOUT * 1000) + 500);
  });
}

// 调 Surge 本地 API
function httpAPI(path) {
  return new Promise((resolve) => {
    $httpAPI('GET', path, null, result => resolve(result));
  });
}
