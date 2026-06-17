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

    // 兜底清理公司后缀
    return isp.replace(/,?\s*(inc|ltd|llc|limited|corporation|co\.?)\.?$/i, '').trim();
}

// 核心：地理位置精简与翻译
function cleanLocation(country, region, city) {
    let c = (country === '中国' || country === 'China') ? '' : (country || '');
    let r = (region || '').replace(/Province/i, '').replace(/City/i, '').replace(/省$/, '').replace(/市$/, '').trim();
    let ct = (city || '').replace(/City/i, '').replace(/市$/, '').trim();

    // 翻译英文地名
    const transMap = {
        'Tokyo': '东京', 'Tokyo-to': '东京', '東京都': '东京', 'Shinjuku': '新宿',
        'Osaka': '大阪', 'Osaka-fu': '大阪', 'Seoul': '首尔', 'Gyeonggi-do': '京畿道',
        'Hong Kong': '香港', 'Taipei': '台北', 'Taiwan': '台湾', 'New Taipei': '新北',
        'Singapore': '新加坡', 'California': '加州', 'Frankfurt': '法兰克福',
        'London': '伦敦', 'Sydney': '悉尼', 'New York': '纽约', 'Los Angeles': '洛杉矶',
        'San Jose': '圣何塞', 'Seattle': '西雅图', 'Japan': '日本', 'United States': '美国',
        'Korea': '韩国', 'South Korea': '韩国', 'United Kingdom': '英国', 'Germany': '德国', 
        'France': '法国', 'Russia': '俄罗斯', 'Canada': '加拿大', 'Australia': '澳大利亚'
    };

    if (transMap[c]) c = transMap[c];
    if (transMap[r]) r = transMap[r];
    if (transMap[ct]) ct = transMap[ct];

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
        // 1. 并发请求：引入 URL Tag 防止 Surge 内部请求抓取错乱
        const pLocalIpip = httpGet('https://myip.ipip.net/json', 'DIRECT').then(JSON.parse).catch(()=>null);
        // 本地获取 ASN 等数据，强制定向 DIRECT
        const pLocalApi = httpGet(`http://ip-api.com/json/?lang=${API_LANG}&_tag=local`, 'DIRECT').then(JSON.parse).catch(()=>null);
        // 落地获取数据，跟随节点
        const pLandingApi = httpGet(`http://ip-api.com/json/?lang=${API_LANG}&_tag=landing`).then(JSON.parse).catch(()=>null);

        const [localIpip, localApi, landingApi] = await Promise.all([pLocalIpip, pLocalApi, pLandingApi]);

        // 2. 解析本地数据
        let localIP = '-', localLoc = '-', localISP = '-', localASN = '-';
        if (localApi) {
            localIP = localApi.query;
            localASN = localApi.as ? localApi.as.split(' ')[0] : '-';
        }
        // ipip.net 覆盖国内物理位置，实现高精度
        if (localIpip && localIpip.data) {
            localIP = localIpip.data.ip || localIP;
            const locArr = localIpip.data.location || [];
            localLoc = cleanLocation(locArr[0], locArr[1], locArr[2]);
            if (locArr[4]) localISP = cleanISP(locArr[4]);
        }

        // 3. 解析落地数据
        let landingIP = '-', landingLoc = '-', landingISP = '-', landingASN = '-';
        if (landingApi) {
            landingIP = landingApi.query;
            landingASN = landingApi.as ? landingApi.as.split(' ')[0] : '-';
            landingLoc = cleanLocation(landingApi.country, landingApi.regionName, landingApi.city);
            landingISP = cleanISP(landingApi.isp || landingApi.org);
        }

        // 4. 抓取 Surge 内部请求，精准定位底层入口 IP
        let entranceIP = '-';
        const recentReqsStr = await new Promise(r => $httpAPI('GET', '/v1/requests/recent', null, r));
        if (recentReqsStr && recentReqsStr.requests) {
            // 通过 _tag=landing 准确捞出那条走代理的请求
            const req = recentReqsStr.requests.reverse().find(r => r.URL.includes('_tag=landing'));
            if (req && req.remoteAddress) {
                // 确保它真的走了代理
                if (req.remoteAddress.includes('(Proxy)')) {
                    let rawProxyStr = req.remoteAddress.split(' (Proxy)')[0]; // 提取 "IP/域名:端口"
                    let lastColon = rawProxyStr.lastIndexOf(':');
                    if (lastColon > -1 && !rawProxyStr.endsWith(']')) {
                        entranceIP = rawProxyStr.substring(0, lastColon); // 剥离端口号
                    } else {
                        entranceIP = rawProxyStr.replace(/[\[\]]/g, ''); // 兼容纯净情况
                    }
                } else {
                    entranceIP = localIP; // 直连节点
                }
            }
        }

        // 5. 获取入口 IP 的详细信息
        let entLoc = '-', entISP = '-', entASN = '-';
        if (entranceIP !== '-' && entranceIP !== localIP) {
            if (entranceIP === landingIP) {
                entLoc = landingLoc; entISP = landingISP; entASN = landingASN;
            } else {
                // 入口信息只查地理位置，强制走 DIRECT 最快
                const entApi = await httpGet(`http://ip-api.com/json/${entranceIP}?lang=${API_LANG}`, 'DIRECT').then(JSON.parse).catch(()=>null);
                if (entApi) {
                    entASN = entApi.as ? entApi.as.split(' ')[0] : '-';
                    entLoc = cleanLocation(entApi.country, entApi.regionName, entApi.city);
                    entISP = cleanISP(entApi.isp || entApi.org);
                }
            }
        } else if (entranceIP === localIP) {
            entLoc = localLoc; entISP = localISP; entASN = localASN;
        }

        // 6. 拼装最终面板输出内容
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
