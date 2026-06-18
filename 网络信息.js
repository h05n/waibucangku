/**
 * Surge Panel 脚本：节点/本地 IP 详细信息展示
 * 解决定位漂移、无中文、无 AS 前缀等问题
 */

const url = "http://ip-api.com/json/?lang=zh-CN";

$httpClient.get(url, function(error, response, data) {
  if (error) {
    $done({
      title: "网络状态",
      content: "获取节点信息失败\n请检查网络或策略组设置",
      icon: "wifi.exclamationmark"
    });
    return;
  }

  try {
    const info = JSON.parse(data);
    
    // 1. 获取 IP
    const ip = info.query || "未知 IP";
    
    // 2. 位置精简处理
    let location = "未知位置";
    if (info.country && info.regionName) {
      if (info.country === "中国" || info.country === "China") {
        // 国内节点：丢弃易漂移的市级，只保留省份
        // 有些接口返回“江苏省”，去掉“省”字让 UI 更干净
        location = `${info.country} ${info.regionName.replace(/省|市|(维吾尔|壮族|回族)?自治区/g, '')}`;
      } else {
        // 海外节点：正常拼接（排除 region 和 city 重名的情况）
        location = info.regionName === info.city ? 
                   `${info.country} ${info.regionName}` : 
                   `${info.country} ${info.regionName} ${info.city || ''}`.trim();
      }
    }

    /* * 针对 DMIT 等 Anycast 路由的硬核纠正（可选）
     * 如果 API 死活把你的香港节点识别成美国加州，可解开下方注释进行强制覆盖
     */
    // if (info.isp && info.isp.toUpperCase().includes("DMIT") && location.includes("美国")) {
    //   location = "中国 香港"; 
    // }

    // 3. 网络（ISP）中文映射
    let isp = formatISP(info.isp);

    // 4. 代号（ASN）精准提取
    let asn = formatASN(info.as);

    // 5. 组合最终 Panel 吐出
    $done({
      title: "网络状态",
      content: `落地：${ip}\n位置：${location}\n网络：${isp}\n代号：${asn}`,
      icon: "server.rack"
    });

  } catch (e) {
    $done({
      title: "网络状态",
      content: `数据解析异常: ${e.message}`,
      icon: "exclamationmark.triangle"
    });
  }
});

/**
 * --- 数据清洗工具函数 ---
 */

// 运营商中文映射拦截器
function formatISP(isp) {
  if (!isp) return "未知网络";
  const upperISP = isp.toUpperCase();
  
  // 匹配国内御三家及广电、教育网
  if (upperISP.includes("CHINANET") || upperISP.includes("TELECOM")) return "中国电信";
  if (upperISP.includes("CHINA169") || upperISP.includes("UNICOM") || upperISP.includes("AS4837")) return "中国联通";
  if (upperISP.includes("CMNET") || upperISP.includes("MOBILE")) return "中国移动";
  if (upperISP.includes("CERNET")) return "教育网";
  if (upperISP.includes("BROADCAST") || upperISP.includes("RADIO")) return "中国广电";
  
  // 匹配不到的海外商家（如 DMIT），原样放行
  return isp; 
}

// ASN 提取与格式化
function formatASN(asnRaw) {
  if (!asnRaw) return "未知";
  // ip-api 返回的 as 字段格式通常是 "AS132110 DMIT INC"
  // 这里用正则强行把 AS 和后面的数字抠出来，丢弃后面的公司名
  const match = String(asnRaw).match(/(AS\d+|\d+)/i);
  if (match) {
    let asn = match[0].toUpperCase();
    // 如果只有数字没有 AS，补上 AS
    return asn.startsWith("AS") ? asn : `AS${asn}`;
  }
  return "未知";
}
