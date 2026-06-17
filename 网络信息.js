const API_LANG = 'zh-CN';
const TIMEOUT = 5;

// 封装带重试与超时控制的 HTTP GET
async function httpGet(url, policy = null) {
    let options = { url, timeout: TIMEOUT };
    if (policy) options.policy = policy; // Surge 中可指定策略强制直连或走代理

    let attempt = 0;
    while (attempt <= 2) {
        try {
            return await new Promise((resolve, reject) => {
                $httpClient.get(options, (err, resp, body) => {
                    if (err) reject(err);
                    else if (resp.status !== 200) reject(new Error(`HTTP ${resp.status}`));
                    else {
                        try {
                            resolve(JSON.parse(body));
                        } catch (e) {
                            reject(new Error("JSON 解析失败"));
                        }
                    }
                });
            });
        } catch (e) {
            attempt++;
            if (attempt > 2) throw e;
        }
    }
}

// 通过 Surge HTTP API 获取指定请求的底层握手信息（用于捕获入口 IP）
async function getSurgeRecentRequest(urlSubstring) {
    return new Promise((resolve) => {
        $httpAPI('GET', '/v1/requests/recent', null, (data) => {
            if (data && data.requests) {
                const req = data.requests.reverse().find(r => r.URL.includes(urlSubstring));
                resolve(req);
            } else {
                resolve(null);
            }
        });
    });
}

// 节点文本格式化工具
function formatNode(title, ipStr, apiData) {
    let str = `${title}：${ipStr || '未获取到或直连'}\n`;
    if (apiData && apiData.status === 'success') {
        // 清理冗余的省市后缀与中国字样，还原“江苏 南京”这样的干爽格式
        let locArr = [];
        if (apiData.country && apiData.country !== '中国') locArr.push(apiData.country);
        if (apiData.regionName) locArr.push(apiData.regionName.replace(/省$/, '').replace(/市$/, ''));
        if (apiData.city) locArr.push(apiData.city.replace(/市$/, ''));

        const loc = [...new Set(locArr)].filter(Boolean).join(' ') || '未知';
        const net = apiData.isp || '未知';
        const asn = apiData.as ? apiData.as.split(' ')[0] : '未知'; // 提取 AS4837

        str += `位置：${loc}\n网络：${net}\n代号：${asn}`;
    } else {
        str += `位置：-\n网络：-\n代号：-`;
    }
    return str;
}

(async () => {
    let localData, entranceData, landingData;
    let localIP, entranceIP, landingIP;

    try {
        // 1. 并发请求：落地走代理（_type=landing），本地走直连（_type=local）
        const pLanding = httpGet(`http://ip-api.com/json/?lang=${API_LANG}&_type=landing`);
        const pLocal = httpGet(`http://ip-api.com/json/?lang=${API_LANG}&_type=local`, 'DIRECT');

        [landingData, localData] = await Promise.allSettled([pLanding, pLocal]).then(results =>
            results.map(r => r.status === 'fulfilled' ? r.value : null)
        );

        landingIP = landingData?.query;
        localIP = localData?.query;

        // 2. 抓取 Surge 内部请求，剥离出刚才请求落地 API 时经过的入口 IP
        const recentReq = await getSurgeRecentRequest('_type=landing');
        if (recentReq && recentReq.remoteAddress) {
            // remoteAddress 格式可能是 "198.51.100.1:443 (Proxy)"
            const match = recentReq.remoteAddress.match(/^([a-zA-Z0-9.-]+)/);
            if (match && match[1]) {
                entranceIP = match[1];
            }
        }

        // 3. 入口 IP 判断与信息获取
        if (entranceIP) {
            if (entranceIP === landingIP) {
                // 如果入口等同于落地，说明是直连型节点，直接复用信息
                entranceData = landingData;
            } else if (entranceIP === localIP) {
                entranceData = localData;
            } else {
                // 如果是标准中转，单独查询入口机的地理/网络信息
                entranceData = await httpGet(`http://ip-api.com/json/${entranceIP}?lang=${API_LANG}`);
            }
        }

        // 4. 组装面板最终内容
        const blocks = [];
        blocks.push(formatNode('本地', localIP, localData));
        blocks.push(formatNode('入口', entranceIP, entranceData));
        blocks.push(formatNode('落地', landingIP, landingData));

        // 生成时分秒记录时间
        const now = new Date();
        const timeStr = [now.getHours(), now.getMinutes(), now.getSeconds()]
            .map(n => n.toString().padStart(2, '0')).join(':');
        blocks.push(`记录时间：${timeStr}`);

        $done({
            title: "网络信息",
            content: blocks.join('\n\n')
        });

    } catch (err) {
        $done({
            title: "网络信息",
            content: `查询失败：\n${err.message || err}`
        });
    }
})();
