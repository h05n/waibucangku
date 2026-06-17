// 核心逻辑：Surge 原生 GeoIP 库 + API 补漏 + 节点名纠偏
const API_LANG = 'zh-CN';

// 强制繁简转换与行政区划精简
function formatLoc(str) {
    if (!str) return '未知';
    // 强制砍掉冗余行政后缀
    return str.replace(/(特别行政区|自治区|省|市|府|县|区|州|都)$/g, '');
}

// 节点名称纠偏字典（针对荷兰误报）
function getRealCountry(nodeName) {
    const n = nodeName.toUpperCase();
    if (/港|HK|HONGKONG/.test(n)) return '香港';
    if (/日|JP|JAPAN|TOKYO/.test(n)) return '日本';
    if (/美|US|USA|STATES/.test(n)) return '美国';
    if (/新|SG|SINGAPORE/.test(n)) return '新加坡';
    return null;
}

(async () => {
    try {
        const now = Date.now();
        // 获取最近一次请求
        const recent = await new Promise(r => $httpAPI('GET', '/v1/requests/recent', null, r));
        const activeReq = recent.requests.find(r => r.policyName && r.remoteAddress?.includes('(Proxy)'));
        
        // 1. 本地信息（走 DIRECT）
        const local = await new Promise(r => $httpClient.get({url:'https://myip.ipip.net/json', policy:'DIRECT'}, (e,r2,b) => r(JSON.parse(b))));
        
        // 2. 确定入口/落地信息
        let landingIP = activeReq ? activeReq.remoteAddress.split(':')[0] : '-';
        let entranceIP = activeReq ? activeReq.remoteAddress.split(':')[0] : '-'; // 简单实现，可根据需求细化
        
        // 3. 利用 Surge 原生 GeoIP 查询
        let localGeo = $utils.geoip(local.data.ip);
        let landingGeo = $utils.geoip(landingIP);
        
        // 4. 纠偏逻辑
        let finalLoc = getRealCountry(activeReq?.policyName) || landingGeo || '未知';
        
        // 5. 拼装显示
        const content = [
            `本地: ${local.data.ip}`,
            `位置: ${local.data.location[0]} ${local.data.location[1]}`,
            `落地: ${landingIP}`,
            `位置: ${finalLoc}`,
            `时间: ${new Date().toLocaleTimeString()}`
        ].join('\n');

        $done({ title: "网络信息", content });
    } catch (e) {
        $done({ title: "网络信息", content: "查询失败" });
    }
})();
