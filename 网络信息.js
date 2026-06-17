const API_LANG = 'zh-CN';
const TIMEOUT = 5;

// 极简 HTTP 请求包装，彻底干掉缓存
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

// 终极繁简转换与错字修正
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
        '橫':'横','瀨':'濑','谷':'谷','圖':'图','頓':'顿'
    };
    let res = "";
    for (let i = 0; i < str.length; i++) {
        res += map[str[i]] || str[i];
    }
    return res;
}

// 核心地理位置清理（强制抛弃生僻英文，强力去后缀，永远只保留前2级）
function cleanLocation(c, r, ct, d) {
    let arr = [c, r, ct, d].filter(Boolean).map(i => {
        let s = String(i).replace(/Province|City|Prefecture|County|District|State/gi, '').trim();
        const transMap = {
            'Tokyo': '东京', 'Tokyo-to': '东京', 'Shinjuku': '新宿', 'Osaka': '大阪', 'Osaka-fu': '大阪',
            'Hong Kong': '香港', 'Taipei': '台北', 'Taiwan': '台湾', 'New Taipei': '新北', 'Singapore': '新加坡',
            'California': '加州', 'Frankfurt': '法兰克福', 'London': '伦敦', 'Sydney': '悉尼', 'New York': '纽约',
            'Los Angeles': '洛杉矶', 'San Jose': '圣何塞', 'Seattle': '西雅图', 'Washington': '华盛顿',
            'Japan': '日本', 'United States': '美国', 'Korea': '韩国', 'South Korea': '韩国', 'United Kingdom': '英国',
            'Germany': '德国', 'France': '法国', 'Kanagawa': '神奈川', 'Yokohama': '横滨', 'Seya': '濑谷', 
            'Saitama': '埼玉', 'Chiba': '千叶', 'Fukuoka': '福冈', 'Hokkaido': '北海道', 'Hyogo': '兵库', 
            'Kyoto': '京都', 'Aichi': '爱知', 'Nagoya': '名古屋', 'Kwai Tsing District': '葵青', 'Kwai Tsing': '葵青', 
            'Kwai Chung': '葵涌', 'Tsuen Wan': '荃湾', 'Sha Tin': '沙田', 'Tai Po': '大埔', 'Yuen Long': '元朗', 
            'Tuen Mun': '屯门', 'Sham Shui Po': '深水埗', 'Kwun Tong': '观塘', 'Wong Tai Sin': '黄大仙', 
            'Yau Tsim Mong': '油尖旺', 'Central and Western': '中西', 'Wan Chai': '湾仔', 'Eastern': '东区', 
            'Southern': '南区', 'Islands': '离岛', 'Kowloon': '九龙', 'New Territories': '新界'
        };
        s = transMap[s] || s;
        s = toSimp(s);
        
        // 激进模式：所有后缀一律砍掉（华盛顿州->华盛顿，葵青区->葵青）
        s = s.replace(/(特别行政区|自治区|维吾尔|壮族|回族|省|市|府|县|区|州|都)$/g, '');
        return s.trim();
    });

    // 去重，并抛弃翻译后依然纯英文的垃圾碎片（比如 Seya 这种生僻字）
    let resArr = [...new Set(arr)].filter(s => s && !/^[a-zA-Z0-9\s\-\.,]+$/.test(s));
    
    // 如果包含省市且开头是中国，直接隐藏中国以求极简
    if (resArr[0] === '中国' && resArr.length > 1) {
        resArr.shift();
    }
    
    // 终极绝杀：永远只截取数组里的前两个元素（如只显示 "香港 葵青" 或 "美国 华盛顿"）
    return resArr.slice(0, 2).join(' ') || '未知';
}

// 降维打击：从节点名称中反向提取真实物理国家（专杀各种数据库查不准的广播IP）
function getCountryFromNodeName(name) {
    if (!name) return null;
    const n = name.toUpperCase();
    if (/港|HK|HONG\s*KONG|KOWLOON/.test(n)) return '香港';
    if (/台|TW|TAIWAN|TAIPEI/.test(n)) return '台湾';
    if (/日|JP|JAPAN|TOKYO/.test(n)) return '日本';
    if (/新|SG|SINGAPORE/.test(n)) return '新加坡';
    if (/美|US|STATES|AMERICA/.test(n)) return '美国';
    if (/韩|KR|KOREA|SEOUL/.test(n)) return '韩国';
    if (/英|UK|KINGDOM|LONDON/.test(n)) return '英国';
    if (/德|DE|GERMANY|FRANKFURT/.test(n)) return '德国';
    if (/法|FR|FRANCE|PARIS/.test(n)) return '法国';
    if (/俄|RU|RUSSIA/.test(n)) return '俄罗斯';
    if (/澳|AU|AUSTRALIA|SYDNEY/.test(n)) return '澳大利亚';
    if (/加|CA|CANADA|TORONTO/.test(n)) return '加拿大';
    if (/荷|NL|NETHERLANDS/.test(n)) return '荷兰';
    if (/印度|IN|INDIA/.test(n)) return '印度';
    if (/印尼|ID|INDONESIA/.test(n)) return '印尼';
    if (/马|MY|MALAYSIA/.test(n)) return '马来西亚';
    if (/泰|TH|THAILAND/.test(n)) return '泰国';
    if (/菲|PH|PHILIPPINE/.test(n)) return '菲律宾';
    return null;
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

    return toSimp(res) || isp;
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
        
        // 发起极简并发请求
        const pLocalIpip = httpGet(`https://myip.ipip.net/json?_t=${timestamp}`, 'DIRECT').then(JSON.parse).catch(()=>null);
        const pLocalApi = httpGet(`http://ip-api.com/json/?lang=${API_LANG}&_tag=local&_t=${timestamp}`, 'DIRECT').then(JSON.parse).catch(()=>null);
        const pLandingApi = httpGet(`http://ip-api.com/json/?lang=${API_LANG}&_tag=landing&_t=${timestamp}`).then(JSON.parse).catch(()=>null);

        const [localIpip, localApi, landingApi] = await Promise.all([pLocalIpip, pLocalApi, pLandingApi]);

        // ================= 解析本地 =================
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

        // ================= 提取底层真实信息与节点名 =================
        let entranceIP = '-';
        let nodeName = '';
        const recentReqsStr = await new Promise(r => $httpAPI('GET', '/v1/requests/recent', null, r));
        if (recentReqsStr && recentReqsStr.requests) {
            const req = recentReqsStr.requests.reverse().find(r => r.URL.includes(`_tag=landing&_t=${timestamp}`));
            if (req) {
                nodeName = req.policyName || ''; // 获取你选的节点名称
                if (req.remoteAddress && req.remoteAddress.includes('(Proxy)')) {
                    let rawProxyStr = req.remoteAddress.split(' (Proxy)')[0]; 
                    let lastColon = rawProxyStr.lastIndexOf(':');
                    entranceIP = (lastColon > -1 && !rawProxyStr.endsWith(']')) ? rawProxyStr.substring(0, lastColon) : rawProxyStr.replace(/[\[\]]/g, ''); 
                } else {
                    entranceIP = localIP; 
                }
            }
        }

        // ================= 解析落地（开启终极节点名校验） =================
        let landingIP = '-', landingLoc = '-', landingISP = '-', landingASN = '-';
        if (landingApi) {
            landingIP = landingApi.query;
            landingASN = landingApi.as ? landingApi.as.split(' ')[0] : '-';
            landingISP = cleanISP(landingApi.isp || landingApi.org);
            
            // 生成 API 给出的定位（比如假荷兰）
            let apiLoc = cleanLocation(landingApi.country, landingApi.regionName, landingApi.city, landingApi.district);
            
            // 提取节点名里的真实物理定位（比如香港专线 -> 香港）
            let realNodeCountry = getCountryFromNodeName(nodeName);
            
            if (realNodeCountry && landingApi.country && apiLoc.indexOf(realNodeCountry) === -1) {
                // 触发截杀！如果机场节点名写的是香港，API 却扯淡说是荷兰，直接抛弃 API，强制锁死输出真实位置！
                landingLoc = realNodeCountry;
            } else {
                landingLoc = apiLoc;
            }
        }

        // ================= 测算入口 =================
        let entLoc = '-', entISP = '-', entASN = '-';
        if (entranceIP !== '-' && entranceIP !== localIP) {
            if (entranceIP === landingIP) {
                entLoc = landingLoc; entISP = landingISP; entASN = landingASN;
            } else {
                const entApi = await httpGet(`http://ip-api.com/json/${entranceIP}?lang=${API_LANG}&_t=${timestamp}`, 'DIRECT').then(JSON.parse).catch(()=>null);
                if (entApi) {
                    entASN = entApi.as ? entApi.as.split(' ')[0] : '-';
                    entISP = cleanISP(entApi.isp || entApi.org);
                    if (entApi.query && entApi.query !== entranceIP) entranceIP = entApi.query;
                    entLoc = cleanLocation(entApi.country, entApi.regionName, entApi.city, entApi.district);
                }
            }
        } else if (entranceIP === localIP) {
            entLoc = localLoc; entISP = localISP; entASN = localASN;
        }

        // ================= 拼装面板 =================
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
