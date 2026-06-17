const API_LANG = 'zh-CN';
const TIMEOUT = 5;

// HTTP 请求包装
async function httpGet(url, policy = null) {
    let options = { url, timeout: TIMEOUT };
    if (policy) options.policy = policy;

    let attempt = 0;
    while (attempt <= 2) {
        try {
            return await new Promise((resolve, reject) => {
                $httpClient.get(options, (err, resp, body) => {
                    if (err) reject(err);
                    else if (resp.status !== 200) reject(new Error(`HTTP ${resp.status}`));
                    else resolve(body);
                });
            });
        } catch (e) {
            attempt++;
            if (attempt > 2) throw e;
        }
    }
}

// 核心：强制中文化与清理 ISP 命名
function cleanISP(isp) {
    if (!isp) return '未知';
    const i = isp.toLowerCase();
    
    // 国内常见
    if (i.includes('unicom')) return '中国联通';
    if (i.includes('telecom') || i.includes('chinanet')) return '中国电信';
    if (i.includes('mobile') || i.includes('cmcc')) return '中国移动';
    if (i.includes('alibaba') || i.includes('aliyun') || i.includes('taobao')) return '阿里云';
    if (i.includes('tencent')) return '腾讯云';
    if (i.includes('baidu')) return '百度云';
    if (i.includes('huawei')) return '华为云';
    
    // 国际常见
    if (i.includes('google')) return 'Google';
    if (i.includes('amazon') || i.includes('aws')) return 'AWS';
    if (i.includes('microsoft') || i.includes('azure')) return 'Azure';
    if (i.includes('cloudflare')) return 'Cloudflare';
    if (i.includes('misaka')) return 'Misaka';
    if (i.includes('oracle')) return 'Oracle';
    if (i.includes('digitalocean')) return 'DigitalOcean';
    if (i.includes('linode') || i.includes('akamai')) return 'Akamai';
    
    // 港台日常见
    if (i.includes('hkt') || i.includes('pccw')) return 'HKT';
    if (i.includes('csl') || i.includes('hkcsl')) return 'CSL';
    if (i.includes('hgc')) return 'HGC';
    if (i.includes('hkbn')) return 'HKBN';
    if (i.includes('hinet')) return 'HiNet';
    if (i.includes('softbank')) return 'SoftBank';
    if (i.includes('kddi')) return 'KDDI';
    if (i.includes('ntt')) return 'NTT';
    if (i.includes('iij')) return 'IIJ';

    // 兜底清理公司后缀 (如 Co., Ltd, Inc.)
    return isp.replace(/,?\s*(inc|ltd|llc|limited|corporation|co\.?)\.?$/i, '').trim();
}

// 核心：地理位置精简与翻译
function cleanLocation(country, region, city) {
    let c = (country === '中国' || country === 'China') ? '' : (country || '');
    let r = (region || '').replace(/Province/i, '').replace(/City/i, '').replace(/省$/, '').replace(/市$/, '').trim();
    let ct = (city || '').replace(/City/i, '').replace(/市$/, '').trim();

    // 翻译 ip-api.com 漏掉的英文/拼音
    const transMap = {
        'Tokyo': '东京', 'Tokyo-to': '东京', '東京都': '东京', 'Shinjuku': '新宿',
        'Osaka': '大阪', 'Osaka-fu': '大阪', 'Seoul': '首尔', 'Gyeonggi-do': '京畿道',
        'Hong Kong': '香港', 'Taipei': '台北', 'Taiwan': '台湾', 'New Taipei': '新北',
        'Singapore': '新加坡', 'California': '加州', 'Frankfurt': '法兰克福',
        'London': '伦敦', 'Sydney': '悉尼', 'New York': '纽约', 'Los Angeles': '洛杉矶',
        'San Jose': '圣何塞', 'Seattle': '西雅图', 'Japan': '日本', 'United States': '美国'
    };

    if (transMap[c]) c = transMap[c];
    if (transMap[r]) r = transMap[r];
    if (transMap[ct]) ct = transMap[ct];

    // 去重并拼接，例如 ["日本", "东京", "东京"] 会变成 "日本 东京"
    let arr = [c, r, ct].filter(Boolean);
    return [...new Set(arr)].join(' ') || '未知';
}

function formatNode(title, ipStr, locationStr, ispStr, asnStr) {
    let str = `${title}：${ipStr || '未获取'}\n`;
    str += `位置：${locationStr || '-'}\n`;
    str += `网络：${ispStr || '-'}\n`;
    str += `代号：${asnStr || '-'}`;
    return str;
}

(async () => {
    try {
        // 1. 本地直连请求（结合 ip-api 取 ASN，结合 ipip.net 取国内精准盐城/苏州数据）
        let localIP = '-', localLoc = '-', localISP = '-', localASN = '-';
        const pLocalApi = httpGet(`http://ip-api.com/json/?lang=${API_LANG}`, 'DIRECT').then(JSON.parse).catch(()=>null);
        const pLocalIpip = httpGet('https://myip.ipip.net/json', 'DIRECT').then(JSON.parse).catch(()=>null);

        // 2. 落地代理请求
        let landingIP = '-', landingLoc = '-', landingISP = '-', landingASN = '-';
        const pLandingApi = httpGet(`http://ip-api.com/json/?lang=${API_LANG}`).then(JSON.parse).catch(()=>null);

        // 并发执行缩短时间
        const [localApi, localIpip, landingApi] = await Promise.all([pLocalApi, pLocalIpip, pLandingApi]);

        // 解析本地基础数据
        if (localApi) {
            localIP = localApi.query;
            localASN = localApi.as ? localApi.as.split(' ')[0] : '-';
            localLoc = cleanLocation(localApi.country, localApi.regionName, localApi.city);
            localISP = cleanISP(localApi.isp);
        }
        
        // 覆盖国内高精度数据（完美解决常州、苏州、盐城等误差）
        if (localIpip && localIpip.data && localIpip.data.location) {
            const locArr = localIpip.data.location; // ["中国", "江苏", "盐城", "", "联通"]
            if (locArr[1] || locArr[2]) localLoc = [locArr[1], locArr[2]].filter(Boolean).join(' ');
            if (locArr[4]) localISP = cleanISP(locArr[4]);
        }

        // 解析落地基础数据
        if (landingApi) {
            landingIP = landingApi.query;
            landingASN = landingApi.as ? landingApi.as.split(' ')[0] : '-';
            landingLoc = cleanLocation(landingApi.country, landingApi.regionName, landingApi.city);
            landingISP = cleanISP(landingApi.isp);
        }

        // 3. 抓取 Surge 内部请求，定位底层入口 IP
        let entranceIP = '-';
        const recentReqsStr = await new Promise(r => $httpAPI('GET', '/v1/requests/recent', null, r));
        if (recentReqsStr && recentReqsStr.requests) {
            const req = recentReqsStr.requests.reverse().find(r => r.URL.includes('ip-api.com'));
            if (req && req.remoteAddress) {
                const match = req.remoteAddress.match(/^([a-zA-Z0-9.-]+)/);
                if (match && match[1]) entranceIP = match[1];
            }
        }

        // 4. 获取入口 IP 的详细信息
        let entLoc = '-', entISP = '-', entASN = '-';
        if (entranceIP !== '-') {
            if (entranceIP === landingIP) {
                // 入口等同落地 (直连节点)
                entLoc = landingLoc; entISP = landingISP; entASN = landingASN;
            } else if (entranceIP === localIP) {
                entLoc = localLoc; entISP = localISP; entASN = localASN;
            } else {
                // 纯中转节点入口
                const entApi = await httpGet(`http://ip-api.com/json/${entranceIP}?lang=${API_LANG}`).then(JSON.parse).catch(()=>null);
                if (entApi) {
                    entASN = entApi.as ? entApi.as.split(' ')[0] : '-';
                    entLoc = cleanLocation(entApi.country, entApi.regionName, entApi.city);
                    entISP = cleanISP(entApi.isp);
                }
            }
        }

        // 5. 拼装最终面板输出内容
        const blocks = [];
        blocks.push(formatNode('本地', localIP, localLoc, localISP, localASN));
        blocks.push(formatNode('入口', entranceIP, entLoc, entISP, entASN));
        blocks.push(formatNode('落地', landingIP, landingLoc, landingISP, landingASN));

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
