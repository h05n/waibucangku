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

// 终极繁简转换
function toSimp(str) {
    if (!str) return '';
    const map = {
        '臺':'台','灣':'湾','國':'国','網':'网','電':'电','機':'机',
        '廣':'广','東':'东','華':'华','雲':'云','聯':'联','韓':'韩',
        '門':'门','區':'区','線':'线','業':'业','達':'达','訊':'讯',
        '飛':'飞','亞':'亚','馬':'马','遜':'逊','蘭':'兰','紐':'纽',
        '爾':'尔','聖':'圣','約':'约','羅':'罗','維':'维','愛':'爱',
        '麥':'麦','倫':'伦','豐':'丰','澤':'泽','發':'发','動':'动',
        '測':'测','試':'试','節':'节','點':'点','產':'产','縣':'县',
        '島':'岛','龍':'龙','頭':'头','橋':'桥','響':'响','寧':'宁',
        '寶':'宝','實':'实','將':'将','專':'专','導':'导','塵':'尘',
        '對':'对','導':'导','層':'层','岡':'冈','峽':'峡','崑':'昆',
        '崙':'仑','嶺':'岭','廠':'厂','廳':'厅','庫':'库','應':'应',
        '廟':'庙','龐':'庞','廢':'废','開':'开','異':'异','棄':'弃',
        '張':'张','彌':'弥','彎':'弯','彈':'弹','強':'强','歸':'归',
        '當':'当','錄':'录','彙':'汇','徹':'彻','徑':'径','從':'从',
        '復':'复','煩':'烦','態':'态','總':'总','聰':'聪','聲':'声',
        '聽':'听','肅':'肃','脈':'脉','膠':'胶','臥':'卧','臨':'临',
        '與':'与','興':'兴','舊':'旧','萬':'万','葉':'叶','號':'号',
        '虧':'亏','蟲':'虫','蝦':'虾','螢':'萤','蟬':'蝉','蠻':'蛮',
        '衛':'卫','衝':'冲','複':'复','見':'见','規':'规','視':'视',
        '親':'亲','覺':'觉','覽':'览','觀':'观','角':'角','計':'计',
        '訂':'订','認':'认','譏':'讥','討':'讨','讓':'让','訖':'讫',
        '訓':'训','議':'议','記':'记','講':'讲','諱':'讳','訝':'讶',
        '許':'许','論':'论','訟':'讼','諷':'讽','設':'设','訪':'访',
        '訣':'诀','證':'证','詁':'诂','訶':'诃','評':'评','詛':'诅',
        '識':'识','詐':'诈','訴':'诉','診':'诊','詆':'诋','謅':'诌',
        '詞':'词','譯':'译','驗':'验','蘇':'苏','州':'州','濱':'滨',
        '橫':'横','瀨':'濑','谷':'谷'
    };
    let res = "";
    for (let i = 0; i < str.length; i++) {
        res += map[str[i]] || str[i];
    }
    return res;
}

// 核心地理位置清理（完美去重，剔除冗余英文，保留"区"）
function cleanLocation(c, r, ct, d) {
    let arr = [c, r, ct, d].filter(Boolean).map(i => {
        let s = String(i).replace(/Province|City|Prefecture|County/gi, '').trim();
        // 补充常见区划字典
        const transMap = {
            'Tokyo': '东京', 'Tokyo-to': '东京', 'Shinjuku': '新宿', 'Osaka': '大阪', 'Osaka-fu': '大阪',
            'Hong Kong': '香港', 'Taipei': '台北', 'Taiwan': '台湾', 'New Taipei': '新北', 'Singapore': '新加坡',
            'California': '加州', 'Frankfurt': '法兰克福', 'London': '伦敦', 'Sydney': '悉尼', 'New York': '纽约',
            'Los Angeles': '洛杉矶', 'San Jose': '圣何塞', 'Seattle': '西雅图', 'Japan': '日本', 'United States': '美国',
            'Korea': '韩国', 'South Korea': '韩国', 'United Kingdom': '英国', 'Germany': '德国', 'France': '法国',
            'Kanagawa': '神奈川', 'Yokohama': '横滨', 'Seya': '濑谷', 'Saitama': '埼玉', 'Chiba': '千叶', 'Fukuoka': '福冈',
            'Hokkaido': '北海道', 'Hyogo': '兵库', 'Kyoto': '京都', 'Aichi': '爱知', 'Nagoya': '名古屋',
            'Kwai Tsing District': '葵青', 'Kwai Tsing': '葵青', 'Kwai Chung': '葵涌', 'Tsuen Wan': '荃湾', 
            'Sha Tin': '沙田', 'Tai Po': '大埔', 'Yuen Long': '元朗', 'Tuen Mun': '屯门', 'Sham Shui Po': '深水埗',
            'Kwun Tong': '观塘', 'Wong Tai Sin': '黄大仙', 'Yau Tsim Mong': '油尖旺', 'Central and Western': '中西区',
            'Wan Chai': '湾仔', 'Eastern': '东区', 'Southern': '南区', 'Islands': '离岛', 'Kowloon': '九龙', 'New Territories': '新界'
        };
        s = transMap[s] || s;
        s = toSimp(s);
        // 注意：这里去掉了 /区/ 的正则，这样香港的“中西区”就能完美保留
        s = s.replace(/特别行政区|自治区|维吾尔|壮族|回族|省|市|府|县$/g, '');
        return s.trim();
    });

    // 核心去重：过滤掉 ["上海", "上海"] 的重复情况
    // 并且：如果这段字里面全是英文字母（比如 Seya 没被翻译出来），直接砍掉不要，保持 UI 极简纯净
    let resArr = [...new Set(arr)].filter(s => s && !/^[a-zA-Z0-9\s\-\.,]+$/.test(s));
    
    // 如果包含省市且开头是中国，直接隐藏中国以求极简
    if (resArr[0] === '中国' && resArr.length > 1) {
        resArr.shift();
    }
    return resArr.join(' ') || '未知';
}

// 激进清理冗余的 ISP（网络商）名字
function cleanISP(isp) {
    if (!isp) return '未知';
    let i = isp.toLowerCase();
    
    // 1. 最高优先级硬编码拦截（完美解决又臭又长的名字）
    if (i.includes('zhipinshang')) return '智品尚';
    if (i.includes('unicom')) return '中国联通';
    if (i.includes('telecom') || i.includes('chinanet')) return '中国电信';
    if (i.includes('mobile') || i.includes('cmcc')) return '中国移动';
    if (i.includes('alibaba') || i.includes('aliyun') || i.includes('taobao')) return '阿里云';
    if (i.includes('tencent')) return '腾讯云';
    if (i.includes('baidu')) return '百度云';
    if (i.includes('huawei')) return '华为云';
    if (i.includes('misaka')) return 'Misaka';
    
    // 2. 如果没被上面拦截，则进行激进的废话剥离
    let res = isp
        // 移除国家代号括号
        .replace(/\s*[（\(]?(hong\s*kong|hk|taiwan|tw|macau|macao|korea|kr|japan|jp|singapore|sg|america|us)[）\)]?\s*/gi, ' ')
        // 剔除所有冗长的科技、网络商业英文后缀
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
        
        // 1. 本地 (直连请求)
        const pLocalIpip = httpGet(`https://myip.ipip.net/json?_t=${timestamp}`, 'DIRECT').then(JSON.parse).catch(()=>null);
        const pLocalApi = httpGet(`http://ip-api.com/json/?lang=${API_LANG}&_tag=local&_t=${timestamp}`, 'DIRECT').then(JSON.parse).catch(()=>null);
        
        // 2. 落地 (彻底换回原版的 ip-api，完美解决变荷兰的问题，防乱飘)
        const pLandingApi = httpGet(`http://ip-api.com/json/?lang=${API_LANG}&_tag=landing&_t=${timestamp}`).then(JSON.parse).catch(()=>null);

        const [localIpip, localApi, landingApi] = await Promise.all([pLocalIpip, pLocalApi, pLandingApi]);

        // 3. 解析本地
        let localIP = '-', localLoc = '-', localISP = '-', localASN = '-';
        if (localApi) {
            localIP = localApi.query;
            localASN = localApi.as ? localApi.as.split(' ')[0] : '-';
            localLoc = cleanLocation(localApi.country, localApi.regionName, localApi.city, localApi.district);
        }
        if (localIpip && localIpip.data) {
            localIP = localIpip.data.ip || localIP;
            const locArr = localIpip.data.location || [];
            localLoc = cleanLocation(locArr[0], locArr[1], locArr[2], locArr[3]);
            if (locArr[4]) localISP = cleanISP(locArr[4]);
        }

        // 4. 解析落地
        let landingIP = '-', landingLoc = '-', landingISP = '-', landingASN = '-';
        if (landingApi) {
            landingIP = landingApi.query;
            landingASN = landingApi.as ? landingApi.as.split(' ')[0] : '-';
            landingLoc = cleanLocation(landingApi.country, landingApi.regionName, landingApi.city, landingApi.district);
            landingISP = cleanISP(landingApi.isp || landingApi.org);
        }

        // 5. 提取入口底层握手 IP
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

        // 6. 测算入口详细信息 (强制直连，极速测绘)
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
