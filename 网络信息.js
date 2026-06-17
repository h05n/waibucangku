const API_LANG = 'zh-CN';
const TIMEOUT = 5;

// 极简 HTTP 请求包装
async function httpGet(url, policy = null) {
    let options = { url, timeout: TIMEOUT, headers: { 'Cache-Control': 'no-cache' } };
    if (policy) options.policy = policy;
    return new Promise((resolve) => {
        $httpClient.get(options, (err, resp, body) => {
            if (!err && resp.status === 200) {
                try { resolve(JSON.parse(body)); } catch (e) { resolve(null); }
            } else {
                resolve(null);
            }
        });
    });
}

// 国家代码翻译表
const ccMap = {
    'CN': '中国', 'HK': '香港', 'TW': '台湾', 'MO': '澳门', 'JP': '日本', 'SG': '新加坡', 'US': '美国',
    'KR': '韩国', 'GB': '英国', 'DE': '德国', 'FR': '法国', 'NL': '荷兰', 'AU': '澳大利亚', 'CA': '加拿大',
    'IN': '印度', 'MY': '马来西亚', 'TH': '泰国', 'VN': '越南', 'PH': '菲律宾', 'ID': '印尼', 'RU': '俄罗斯'
};

// 极简位置清理：强制剥离后缀，保留前2级，丢弃生僻英文
function cleanLocation(c, r, ct) {
    const transMap = {
        'Tokyo': '东京', 'Osaka': '大阪', 'Hong Kong': '香港', 'Taipei': '台北', 'Taiwan': '台湾',
        'New Taipei': '新北', 'Singapore': '新加坡', 'California': '加州', 'Frankfurt': '法兰克福',
        'London': '伦敦', 'Sydney': '悉尼', 'New York': '纽约', 'Los Angeles': '洛杉矶',
        'San Jose': '圣何塞', 'Seattle': '西雅图', 'Washington': '华盛顿', 'Japan': '日本',
        'United States': '美国', 'Korea': '韩国', 'South Korea': '韩国', 'United Kingdom': '英国',
        'Germany': '德国', 'France': '法国', 'Kanagawa': '神奈川', 'Yokohama': '横滨',
        'Saitama': '埼玉', 'Chiba': '千叶', 'Fukuoka': '福冈', 'Hokkaido': '北海道', 'Hyogo': '兵库',
        'Kyoto': '京都', 'Aichi': '爱知', 'Nagoya': '名古屋', 'Kwai Tsing': '葵青', 'Kwai Chung': '葵涌',
        'Tsuen Wan': '荃湾', 'Sha Tin': '沙田', 'Tai Po': '大埔', 'Yuen Long': '元朗', 'Tuen Mun': '屯门',
        'Sham Shui Po': '深水埗', 'Kwun Tong': '观塘', 'Wong Tai Sin': '黄大仙', 'Yau Tsim Mong': '油尖旺',
        'Central and Western': '中西', 'Wan Chai': '湾仔', 'Eastern': '东区', 'Southern': '南区',
        'Islands': '离岛', 'Kowloon': '九龙', 'New Territories': '新界'
    };

    let arr = [c, r, ct].filter(Boolean).map(i => {
        let s = String(i).replace(/Province|City|Prefecture|County|District|State/gi, '').trim();
        s = transMap[s] || s;
        // 核心：无情砍掉所有的州、都、府、县、区
        s = s.replace(/(特别行政区|自治区|维吾尔|壮族|回族|省|市|府|县|区|州|都)$/g, '');
        return s.trim();
    });

    // 去重，并抛弃翻译后依然是纯英文字母的垃圾碎片
    let resArr = [...new Set(arr)].filter(s => s && !/^[a-zA-Z0-9\s\-\.,]+$/.test(s));
    if (resArr[0] === '中国' && resArr.length > 1) resArr.shift();
    
    // 永远只截取前两个元素（如：日本 神奈川）
    return resArr.slice(0, 2).join(' ') || '未知';
}

// 激进清理冗余 ISP
function cleanISP(isp) {
    if (!isp) return '未知';
    let i = isp.toLowerCase();
    if (i.includes('zhipinshang')) return '智品尚';
    if (i.includes('unicom')) return '中国联通';
    if (i.includes('telecom') || i.includes('chinanet')) return '中国电信';
    if (i.includes('mobile') || i.includes('cmcc')) return '中国移动';
    if (i.includes('alibaba') || i.includes('aliyun') || i.includes('taobao')) return '阿里云';
    if (i.includes('tencent')) return '腾讯云';
    if (i.includes('baidu')) return '百度云';
    if (i.includes('huawei')) return '华为云';
    if (i.includes('misaka')) return 'Misaka';

    let res = isp
        .replace(/\s*[（\(]?(hong\s*kong|hk|taiwan|tw|macau|macao|korea|kr|japan|jp|singapore|sg|america|us)[）\)]?\s*/gi, ' ')
        .replace(/\b(electronic|electron|communication|communications|information|technology|tech|data|network|networks|cloud|solutions|services|group|telecom|host|hosting|datacenter|server|co|ltd|inc|llc|limited|corporation|corp)\b/gi, '')
        .replace(/[,.（）\(\)]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return res || isp;
}

// 核心离线库裁决逻辑：100% 信任你配置的 GeoIP2-CN 数据库
function getFinalLoc(ip, apiCc, apiC, apiR, apiCt) {
    if (typeof $utils !== 'undefined' && $utils.geoip && ip) {
        let surgeCc = $utils.geoip(ip); // 调用 Surge 系统自带的离线库引擎
        if (surgeCc) {
            let ccName = ccMap[surgeCc] || surgeCc;
            if (apiCc && surgeCc === apiCc) {
                // 如果外部API认定的国家跟离线库一致，就保留它的市级数据
                return cleanLocation(ccName, apiR, apiCt);
            } else {
                // 触发拦截！如果API说是荷兰，离线库说是香港，强制剥除一切虚假数据，只显示真实国家
                return ccName;
            }
        }
    }
    return cleanLocation(apiC, apiR, apiCt);
}

function formatNode(title, ipStr, locationStr, ispStr, asnStr) {
    return `${title}：${ipStr || '未获取'}\n位置：${locationStr || '-'}\n网络：${ispStr || '-'}\n代号：${asnStr || '-'}`;
}

(async () => {
    try {
        const timestamp = Date.now();

        // 仅保留三个极简请求，抛弃所有没用的探针
        const [localIpip, localApi, landingApi] = await Promise.all([
            httpGet(`https://myip.ipip.net/json?_t=${timestamp}`, 'DIRECT'),
            httpGet(`http://ip-api.com/json/?lang=${API_LANG}&_tag=local&_t=${timestamp}`, 'DIRECT'),
            httpGet(`http://ip-api.com/json/?lang=${API_LANG}&_tag=landing&_t=${timestamp}`)
        ]);

        // 解析本地
        let localIP = '-', localLoc = '-', localISP = '-', localASN = '-';
        if (localApi) {
            localIP = localApi.query;
            localASN = localApi.as ? localApi.as.split(' ')[0] : '-';
        }
        if (localIpip && localIpip.data) {
            localIP = localIpip.data.ip || localIP;
            const locArr = localIpip.data.location || [];
            localLoc = cleanLocation(locArr[0], locArr[1], locArr[2]);
            if (locArr[4]) localISP = cleanISP(locArr[4]);
        }

        // 解析落地
        let landingIP = '-', landingLoc = '-', landingISP = '-', landingASN = '-';
        if (landingApi) {
            landingIP = landingApi.query;
            landingASN = landingApi.as ? landingApi.as.split(' ')[0] : '-';
            landingISP = cleanISP(landingApi.isp || landingApi.org);
            // 这里将强制接受 GeoIP2-CN 的洗礼
            landingLoc = getFinalLoc(landingIP, landingApi.countryCode, landingApi.country, landingApi.regionName, landingApi.city);
        }

        // 提取入口 IP
        let entranceIP = '-';
        const recentReqsStr = await new Promise(r => $httpAPI('GET', '/v1/requests/recent', null, r));
        if (recentReqsStr && recentReqsStr.requests) {
            const req = recentReqsStr.requests.reverse().find(r => r.URL.includes(`_tag=landing&_t=${timestamp}`));
            if (req && req.remoteAddress) {
                if (req.remoteAddress.includes('(Proxy)')) {
                    let rawProxyStr = req.remoteAddress.split(' (Proxy)')[0];
                    let lastColon = rawProxyStr.lastIndexOf(':');
                    entranceIP = (lastColon > -1 && !rawProxyStr.endsWith(']')) ? rawProxyStr.substring(0, lastColon) : rawProxyStr.replace(/[\[\]]/g, '');
                } else {
                    entranceIP = localIP;
                }
            }
        }

        // 测算入口
        let entLoc = '-', entISP = '-', entASN = '-';
        if (entranceIP !== '-' && entranceIP !== localIP) {
            if (entranceIP === landingIP) {
                entLoc = landingLoc; entISP = landingISP; entASN = landingASN;
            } else {
                const entApi = await httpGet(`http://ip-api.com/json/${entranceIP}?lang=${API_LANG}&_t=${timestamp}`, 'DIRECT');
                if (entApi) {
                    entASN = entApi.as ? entApi.as.split(' ')[0] : '-';
                    entISP = cleanISP(entApi.isp || entApi.org);
                    if (entApi.query && entApi.query !== entranceIP) entranceIP = entApi.query;
                    entLoc = getFinalLoc(entranceIP, entApi.countryCode, entApi.country, entApi.regionName, entApi.city);
                }
            }
        } else if (entranceIP === localIP) {
            entLoc = localLoc; entISP = localISP; entASN = localASN;
        }

        // 拼装面板
        const blocks = [
            formatNode('本地', localIP, localLoc, localISP, localASN),
            formatNode('入口', entranceIP, entLoc, entISP, entASN),
            formatNode('落地', landingIP, landingLoc, landingISP, landingASN),
            `记录时间：${new Date().toTimeString().split(' ')[0]}`
        ];

        $done({ title: "网络信息", content: blocks.join('\n\n') });

    } catch (err) {
        $done({ title: "网络信息", content: `查询失败：\n${err.message || err}` });
    }
})();
