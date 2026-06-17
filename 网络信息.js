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

// 繁简转换与行政区划清理
function toSimp(str) {
    if (!str) return '';
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
    return res;
}

// 核心地理位置清理（保留"区"，强力去重）
function cleanLocation(c, r, ct, d) {
    // 提取国家、省、市、区
    let arr = [c, r, ct, d].filter(Boolean).map(i => {
        let s = String(i).replace(/Province|City|District|Prefecture/gi, '').trim();
        const transMap = {
            'Tokyo': '东京', 'Tokyo-to': '东京', 'Shinjuku': '新宿',
            'Osaka': '大阪', 'Osaka-fu': '大阪', 'Seoul': '首尔', 'Gyeonggi-do': '京畿道',
            'Hong Kong': '香港', 'Taipei': '台北', 'Taiwan': '台湾', 'New Taipei': '新北',
            'Singapore': '新加坡', 'California': '加州', 'Frankfurt': '法兰克福',
            'London': '伦敦', 'Sydney': '悉尼', 'New York': '纽约', 'Los Angeles': '洛杉矶',
            'San Jose': '圣何塞', 'Seattle': '西雅图', 'Japan': '日本', 'United States': '美国',
            'Korea': '韩国', 'South Korea': '韩国', 'United Kingdom': '英国', 'Germany': '德国', 
            'France': '法国', 'Russia': '俄罗斯', 'Canada': '加拿大', 'Australia': '澳大利亚',
            'Kowloon': '九龙', 'New Territories': '新界', 'Kwai Tsing': '葵青', 'Kwai Chung': '葵涌',
            'Tsuen Wan': '荃湾', 'Sha Tin': '沙田', 'Tai Po': '大埔', 'Yuen Long': '元朗',
            'Tuen Mun': '屯门', 'Sham Shui Po': '深水埗', 'Kwun Tong': '观塘', 'Wong Tai Sin': '黄大仙',
            'Central and Western': '中西区', 'Wan Chai': '湾仔', 'Eastern': '东区', 'Southern': '南区'
        };
        s = transMap[s] || s;
        s = toSimp(s);
        // 剥离大行政区划，但坚决保留"区"
        s = s.replace(/特别行政区|自治区|维吾尔|壮族|回族|省|市|府|县$/g, '');
        return s.trim();
    });

    // 核心去重：过滤掉 ["上海", "上海"] 这种情况
    let resArr = [...new Set(arr)].filter(Boolean);
    
    // 如果包含省市且开头是中国，直接隐藏中国以求极简
    if (resArr[0] === '中国' && resArr.length > 1) {
        resArr.shift();
    }
    return resArr.join(' ') || '未知';
}

// 激进清理冗余的 ISP（网络商）垃圾后缀
function cleanISP(isp) {
    if (!isp) return '未知';
    let i = isp.toLowerCase();
    
    // 国内硬编码
    if (i.includes('unicom')) return '中国联通';
    if (i.includes('telecom') || i.includes('chinanet')) return '中国电信';
    if (i.includes('mobile') || i.includes('cmcc')) return '中国移动';
    if (i.includes('alibaba') || i.includes('aliyun') || i.includes('taobao')) return '阿里云';
    if (i.includes('tencent')) return '腾讯云';
    if (i.includes('baidu')) return '百度云';
    if (i.includes('huawei')) return '华为云';
    if (i.includes('zhipinshang')) return '智品尚';
    if (i.includes('misaka')) return 'Misaka';
    
    let res = isp
        // 移除 (Hongkong) 等括号和无意义国家代号
        .replace(/\s*[（\(]?(hong\s*kong|hk|taiwan|tw|macau|macao|korea|kr|japan|jp|singapore|sg|america|us)[）\)]?\s*/gi, ' ')
        // 激进剔除 Electron / Communication / Tech / Ltd 等冗余科技商业词汇
        .replace(/\b(electronic|electron|communication|communications|information|technology|tech|data|network|networks|cloud|solutions|services|group|telecom|host|hosting|datacenter|server|co|ltd|inc|llc|limited|corporation)\b/gi, '')
        .replace(/[,.（）\(\)]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    res = toSimp(res);
    return res || isp; // 如果全删空了，兜底返回原始字符
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
        const timestamp = Date.now();
        
        // 1. 本地
        const pLocalIpip = httpGet(`https://myip.ipip.net/json?_t=${timestamp}`, 'DIRECT').then(JSON.parse).catch(()=>null);
        const pLocalApi = httpGet(`http://ip-api.com/json/?lang=${API_LANG}&_tag=local&_t=${timestamp}`, 'DIRECT').then(JSON.parse).catch(()=>null);
        
        // 2. 落地 (换回带中文识别的接口，并用_tag防止抓错)
        const pLandingApi = httpGet(`http://ip-api.com/json/?lang=${API_LANG}&_tag=landing&_t=${timestamp}`).then(JSON.parse).catch(()=>null);

        const [localIpip, localApi, landingApi] = await Promise.all([pLocalIpip, pLocalApi, pLandingApi]);

        // 3. 解析本地
        let localIP = '-', localLoc = '-', localISP = '-', localASN = '-';
        if (localApi) {
            localIP = localApi.query;
            localASN = localApi.as ? localApi.as.split(' ')[0] : '-';
            // 重点修复：加入 district 传参
            localLoc = cleanLocation(localApi.country, localApi.regionName, localApi.city, localApi.district);
        }
        if (localIpip && localIpip.data) {
            localIP = localIpip.data.ip || localIP;
            const locArr = localIpip.data.location || [];
            // ipip.net 会把区划放在索引 3
            localLoc = cleanLocation(locArr[0], locArr[1], locArr[2], locArr[3]);
            if (locArr[4]) localISP = cleanISP(locArr[4]);
        }

        // 4. 解析落地
        let landingIP = '-', landingLoc = '-', landingISP = '-', landingASN = '-';
        if (landingApi) {
            landingIP = landingApi.query;
            landingASN = landingApi.as ? landingApi.as.split(' ')[0] : '-';
            // 重点修复：加入 district 传参，防止区划被砍
            landingLoc = cleanLocation(landingApi.country, landingApi.regionName, landingApi.city, landingApi.district);
            landingISP = cleanISP(landingApi.isp || landingApi.org);
        }

        // 5. 提取入口
        let entranceIP = '-';
        const recentReqsStr = await new Promise(r => $httpAPI('GET', '/v1/requests/recent', null, r));
        if (recentReqsStr && recentReqsStr.requests) {
            const req = recentReqsStr.requests.reverse().find(r => r.URL.includes(`_tag=landing&_t=${timestamp}`));
            if (req && req.remoteAddress) {
                if (req.remoteAddress.includes('(Proxy)')) {
                    let rawProxyStr = req.remoteAddress.split(' (Proxy)')[0]; 
                    let lastColon = rawProxyStr.lastIndexOf(':');
                    if (lastColon > -1 && !rawProxyStr.endsWith(']')) {
                        entranceIP = rawProxyStr.substring(0, lastColon); 
                    } else {
                        entranceIP = rawProxyStr.replace(/[\[\]]/g, ''); 
                    }
                } else {
                    entranceIP = localIP; 
                }
            }
        }

        // 6. 测算入口
        let entLoc = '-', entISP = '-', entASN = '-';
        if (entranceIP !== '-' && entranceIP !== localIP) {
            if (entranceIP === landingIP) {
                entLoc = landingLoc; entISP = landingISP; entASN = landingASN;
            } else {
                const entApi = await httpGet(`http://ip-api.com/json/${entranceIP}?lang=${API_LANG}&_t=${timestamp}`, 'DIRECT').then(JSON.parse).catch(()=>null);
                if (entApi) {
                    entASN = entApi.as ? entApi.as.split(' ')[0] : '-';
                    entLoc = cleanLocation(entApi.country, entApi.regionName, entApi.city, entApi.district);
                    entISP = cleanISP(entApi.isp || entApi.org);
                    if (entApi.query && entApi.query !== entranceIP) entranceIP = entApi.query;
                }
            }
        } else if (entranceIP === localIP) {
            entLoc = localLoc; entISP = localISP; entASN = localASN;
        }

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
