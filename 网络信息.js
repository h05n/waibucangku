const API_LANG = 'zh-CN';
const TIMEOUT = 5;

// HTTP 请求包装，强制干掉缓存
async function httpGet(url, policy = null) {
    let options = { 
        url, 
        timeout: TIMEOUT, 
        headers: { 'Cache-Control': 'no-cache' } 
    };
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

// 繁简转换与行政区划强力清理
function toSimp(str) {
    if (!str) return '未知';
    const map = {
        '臺': '台', '灣': '湾', '國': '国', '網': '网', '電': '电', 
        '機': '机', '廣': '广', '東': '东', '華': '华', '雲': '云', 
        '聯': '联', '韓': '韩', '門': '门', '區': '区', '線': '线',
        '業': '业', '達': '达', '訊': '讯', '飛': '飞', '亞': '亚', 
        '馬': '马', '遜': '逊', '蘭': '兰', '紐': '纽', '爾': '尔',
        '聖': '圣', '約': '约', '羅': '罗', '維': '维', '愛': '爱',
        '麥': '麦', '倫': '伦', '豐': '丰', '澤': '泽', '發': '发',
        '動': '动', '測': '测', '試': '试', '節': '节', '點': '点',
        '產': '产'
    };
    let res = "";
    for (let i = 0; i < str.length; i++) {
        res += map[str[i]] || str[i];
    }
    res = res.replace(/特别行政区/g, '')
             .replace(/省/g, '')
             .replace(/市/g, '')
             .replace(/東京都/g, '东京')
             .replace(/大阪府/g, '大阪');
    return res.trim();
}

// 强制中文化与清理 ISP 命名
function cleanISP(isp) {
    if (!isp) return '未知';
    const i = isp.toLowerCase();
    
    if (i.includes('unicom')) return '中国联通';
    if (i.includes('telecom') || i.includes('chinanet')) return '中国电信';
    if (i.includes('mobile') || i.includes('cmcc')) return '中国移动';
    if (i.includes('alibaba') || i.includes('aliyun') || i.includes('taobao')) return '阿里云';
    if (i.includes('tencent')) return '腾讯云';
    if (i.includes('baidu')) return '百度云';
    if (i.includes('huawei')) return '华为云';
    
    if (i.includes('google')) return 'Google';
    if (i.includes('amazon') || i.includes('aws')) return 'AWS';
    if (i.includes('microsoft') || i.includes('azure')) return 'Azure';
    if (i.includes('cloudflare')) return 'Cloudflare';
    if (i.includes('misaka')) return 'Misaka';
    if (i.includes('oracle')) return 'Oracle';
    if (i.includes('digitalocean')) return 'DigitalOcean';
    if (i.includes('linode') || i.includes('akamai')) return 'Akamai';
    
    if (i.includes('hkt') || i.includes('pccw')) return 'HKT';
    if (i.includes('csl') || i.includes('hkcsl')) return 'CSL';
    if (i.includes('hgc')) return 'HGC';
    if (i.includes('hkbn')) return 'HKBN';
    if (i.includes('hinet')) return 'HiNet';
    if (i.includes('softbank')) return 'SoftBank';
    if (i.includes('kddi')) return 'KDDI';
    if (i.includes('ntt')) return 'NTT';
    if (i.includes('iij')) return 'IIJ';

    let res = isp.replace(/,?\s*(inc|ltd|llc|limited|corporation|co\.?)\.?$/i, '').trim();
    return toSimp(res);
}

// 地理位置精简与翻译
function cleanLocation(country, region, city) {
    let c = (country === '中国' || country === 'China') ? '' : (country || '');
    let r = (region || '').replace(/Province/i, '').replace(/City/i, '').trim();
    let ct = (city || '').replace(/City/i, '').trim();

    const transMap = {
        'Tokyo': '东京', 'Tokyo-to': '东京', 'Shinjuku': '新宿',
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
    let res = [...new Set(arr)].join(' ') || '未知';
    
    return toSimp(res);
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
        // 独一无二的时间戳，粉碎 Surge 一切底层重用和缓存机制
        const timestamp = Date.now();
        
        // 1. 本地强制 DIRECT 走 ipip.net 获取国内极高精度定位
        const pLocalIpip = httpGet(`https://myip.ipip.net/json?_t=${timestamp}`, 'DIRECT').then(JSON.parse).catch(()=>null);
        
        // 2. 落地走代理，强制使用 maxmind 库防漂移，并打上时间戳与专属标签
        const pLandingSb = httpGet(`https://api-ipv4.ip.sb/geoip?_tag=landing&_t=${timestamp}`).then(JSON.parse).catch(()=>null);

        const [localIpip, landingSb] = await Promise.all([pLocalIpip, pLandingSb]);

        // 3. 解析本地数据
        let localIP = '-', localLoc = '-', localISP = '-', localASN = '-';
        if (localIpip && localIpip.data) {
            localIP = localIpip.data.ip || '-';
            const locArr = localIpip.data.location || [];
            localLoc = cleanLocation(locArr[0], locArr[1], locArr[2]);
            if (locArr[4]) localISP = cleanISP(locArr[4]);
            
            // ipip 免费版不给 ASN，单独用直连去拿一下本地的 AS4837 这种代号
            const localApi = await httpGet(`http://ip-api.com/json/${localIP}?lang=${API_LANG}&_t=${timestamp}`, 'DIRECT').then(JSON.parse).catch(()=>null);
            if (localApi) localASN = localApi.as ? localApi.as.split(' ')[0] : '-';
        }

        // 4. 解析落地数据 (ip.sb 完全防漂移)
        let landingIP = '-', landingLoc = '-', landingISP = '-', landingASN = '-';
        if (landingSb) {
            landingIP = landingSb.ip;
            landingASN = landingSb.asn ? `AS${landingSb.asn}` : '-';
            landingLoc = cleanLocation(landingSb.country, landingSb.region, landingSb.city);
            landingISP = cleanISP(landingSb.isp || landingSb.organization);
        }

        // 5. 抓取 Surge 内部网络请求记录，精准拆解当前中转机的入口 IP
        let entranceIP = '-';
        const recentReqsStr = await new Promise(r => $httpAPI('GET', '/v1/requests/recent', null, r));
        if (recentReqsStr && recentReqsStr.requests) {
            // 在所有记录中，精准匹配带着刚刚那个时间戳和标签的请求
            const req = recentReqsStr.requests.reverse().find(r => r.URL.includes(`_tag=landing&_t=${timestamp}`));
            if (req && req.remoteAddress) {
                // 如果请求明确包含 (Proxy)，说明走了代理，提取中转入口IP或域名
                if (req.remoteAddress.includes('(Proxy)')) {
                    let rawProxyStr = req.remoteAddress.split(' (Proxy)')[0]; 
                    let lastColon = rawProxyStr.lastIndexOf(':');
                    if (lastColon > -1 && !rawProxyStr.endsWith(']')) {
                        entranceIP = rawProxyStr.substring(0, lastColon); // 剥除端口
                    } else {
                        entranceIP = rawProxyStr.replace(/[\[\]]/g, ''); 
                    }
                } else {
                    entranceIP = localIP; // 如果没走代理，入口就是本地
                }
            }
        }

        // 6. 极速获取入口 IP 的地理位置（强制直连测算）
        let entLoc = '-', entISP = '-', entASN = '-';
        if (entranceIP !== '-' && entranceIP !== localIP) {
            if (entranceIP === landingIP) {
                // 直连型节点，入口就是落地
                entLoc = landingLoc; entISP = landingISP; entASN = landingASN;
            } else {
                // 中转节点，用 ip-api 的极速直连通道获取中转机位置，支持域名自动解析为 IP
                const entApi = await httpGet(`http://ip-api.com/json/${entranceIP}?lang=${API_LANG}&_t=${timestamp}`, 'DIRECT').then(JSON.parse).catch(()=>null);
                if (entApi) {
                    entASN = entApi.as ? entApi.as.split(' ')[0] : '-';
                    entLoc = cleanLocation(entApi.country, entApi.regionName, entApi.city);
                    entISP = cleanISP(entApi.isp || entApi.org);
                    
                    // 如果入口填的是域名，这里自动把它还原成底层的真实 IP 供面板显示
                    if (entApi.query && entApi.query !== entranceIP) {
                        entranceIP = entApi.query;
                    }
                }
            }
        } else if (entranceIP === localIP) {
            entLoc = localLoc; entISP = localISP; entASN = localASN;
        }

        // 7. 组装最终纯净输出
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
