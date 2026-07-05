// ================== 解析本地配置 ==================
let accounts = [];
const storeKey = "NTE_ACCOUNT_DATA";

// 自动读取抓包保存的 Token 数据
const storedData = $persistentStore.read(storeKey);
if (storedData) {
    try {
        accounts.push(JSON.parse(storedData));
    } catch (e) {
        console.log("本地存储读取失败：" + e);
    }
}

// 兼容手动传参：如果你强行在 argument 里填了 JSON，也会合并进来
if (typeof $argument !== "undefined" && $argument !== "" && !$argument.includes("#") && $argument.startsWith("[")) {
    try {
        let argAccounts = JSON.parse($argument);
        if (Array.isArray(argAccounts)) accounts = accounts.concat(argAccounts);
    } catch (e) {
        console.log("Argument 解析失败：" + e);
    }
}

// ================== 常量定义 ==================
const DEFAULT_GAME_ID = '1289'; 
const APPVERSION = '1.1.0'; 
const OKHTTP_UA = 'okhttp/4.12.0'; 
const REQUEST_HEADERS_BASE = {
    'platform': 'android',
    'Content-Type': 'application/x-www-form-urlencoded' 
};

const CLOUD_APP_ID = '10597'; 
const CLOUD_SECRET = 'f1b7f11fc3774f898e387368cce4da04'; 
const CLOUD_DEVICE_TYPE = 'TB321FU'; 
const CLOUD_DEVICE_NAME = 'TB321FU'; 
const CLOUD_DEVICE_SYS = '15'; 
const CLOUD_DEVICE_MODEL = 'TB321FU'; 
const CLOUD_APP_VERSION = '1.1.0'; 
const CLOUD_GAME_SDK_VERSION = '1.34.0'; 
const CLOUD_BID = 'com.pwrd.cloud.yh.laohu'; 
const CLOUD_CHANNEL_ID = '1'; 
const CLOUD_NETWORK = 'wifi'; 
const CLOUD_PROVIDER = '0'; 
const CLOUD_GAME_UA = 'okhttp/${project.version}'; 

const API = {
    REFRESH: 'https://bbs-api.tajiduo.com/usercenter/api/refreshToken', 
    COMMUNITY_SIGN: 'https://bbs-api.tajiduo.com/apihub/api/signin', 
    GET_ROLES: 'https://bbs-api.tajiduo.com/usercenter/api/v2/getGameRoles', 
    GAME_SIGN: 'https://bbs-api.tajiduo.com/apihub/awapi/sign', 
    CLOUD_INFO: 'https://user.laohu.com/cloud/game/getUserInfo' 
};

// ================== 工具函数 ==================
const post = (url, headers, body) => {
    return new Promise((resolve, reject) => {
        $httpClient.post({ url, headers, body }, (err, resp, data) => {
            if (err) return reject(err);
            if (resp.status === 402) return reject(new Error('Token 已失效，请重新登录 App 抓包')); 
            try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
        });
    });
};

const get = (url, headers) => {
    return new Promise((resolve, reject) => {
        $httpClient.get({ url, headers }, (err, resp, data) => {
            if (err) return reject(err);
            try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
        });
    });
};

const urlEncode = (obj) => Object.keys(obj).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(obj[k])}`).join('&');

const cloudGenerateSignature = (params) => {
    const sortedKeys = Object.keys(params).sort();
    let values = '';
    for (let k of sortedKeys) values += params[k]; 
    return md5(values + CLOUD_SECRET); 
};

// ================== 核心逻辑 ==================
async function refreshAccessToken(account) {
    const headers = {
        ...REQUEST_HEADERS_BASE,
        'deviceid': account.deviceId, 
        'authorization': account.refreshToken, 
        'appversion': APPVERSION, 
        'uid': account.uid, 
        'User-Agent': OKHTTP_UA 
    };
    const res = await post(API.REFRESH, headers, '');
    if (res && res.code === 0) {
        return { access: res.data.accessToken, refresh: res.data.refreshToken, uid: res.data.uid };
    }
    throw new Error(res.msg || '刷新 Token 失败');
}

async function communitySign(accessToken, uid, deviceId) {
    const headers = {
        ...REQUEST_HEADERS_BASE,
        'authorization': accessToken, 
        'uid': uid.toString(), 
        'deviceid': deviceId, 
        'appversion': APPVERSION, 
        'User-Agent': OKHTTP_UA 
    };
    const res = await post(API.COMMUNITY_SIGN, headers, 'communityId=1'); 
    if (res.code === 0) return `社区: 经验+${res.data.exp} 金币+${res.data.goldCoin}`; 
    if (res.msg && (res.msg.includes('已签到') || res.msg.includes('重复'))) return '社区: 今日已签到'; 
    throw new Error(res.msg || '社区签到失败');
}

async function getGameRoles(accessToken, uid, deviceId, gameId) {
    const headers = {
        'platform': 'android', 
        'authorization': accessToken, 
        'uid': uid.toString(), 
        'deviceid': deviceId, 
        'appversion': APPVERSION, 
        'User-Agent': OKHTTP_UA 
    };
    const res = await get(`${API.GET_ROLES}?gameId=${gameId}`, headers); 
    if (res.code === 0 && res.data && res.data.roles) {
        return res.data.roles.map(r => r.roleId);
    }
    return [];
}

async function gameSign(accessToken, roleId, gameId) {
    const headers = {
        ...REQUEST_HEADERS_BASE,
        'authorization': accessToken, 
        'appversion': APPVERSION, 
        'User-Agent': OKHTTP_UA 
    };
    const res = await post(API.GAME_SIGN, headers, `roleId=${roleId}&gameId=${gameId}`); 
    if (res.code === 0) return `游戏[${roleId}]: 签到成功`;
    if (res.msg && (res.msg.includes('已签到') || res.msg.includes('重复'))) return `游戏[${roleId}]: 今日已签到`; 
    return `游戏[${roleId}]: ${res.msg || '签到失败'}`;
}

async function cloudClaimDuration(account) {
    const params = {
        'userId': account.cloudUserId, 
        'token': account.cloudToken, 
        't': Math.floor(Date.now() / 1000).toString(), 
        'appId': CLOUD_APP_ID, 
        'deviceId': account.cloudDeviceId || account.deviceId || "LGE-AN10", 
        'deviceType': CLOUD_DEVICE_TYPE, 
        'deviceName': CLOUD_DEVICE_NAME, 
        'channelId': CLOUD_CHANNEL_ID, 
        'deviceModel': CLOUD_DEVICE_MODEL, 
        'deviceSys': CLOUD_DEVICE_SYS, 
        'version': CLOUD_APP_VERSION, 
        'sdkVersion': CLOUD_GAME_SDK_VERSION, 
        'network': CLOUD_NETWORK, 
        'bid': CLOUD_BID, 
        'provider': CLOUD_PROVIDER, 
        'idfa': '' 
    };
    params.sign = cloudGenerateSignature(params); 

    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded', 
        'User-Agent': CLOUD_GAME_UA 
    };

    const res = await post(API.CLOUD_INFO, headers, urlEncode(params)); 
    if (res.code === 0) {
        const info = res.result || {};
        return `云异环时长: 剩余 ${info.remainedDuration || 0}分钟`; 
    }
    return `云时长领取失败: ${res.message || res.msg || '未知错误'}`;
}

// ================== 执行入口 ==================
(async () => {
    if (accounts.length === 0) {
        const errMsg = "未获取到 Token 数据。请打开异环和云异环 App 触发抓包。";
        console.log(errMsg);
        $notification.post("异环签到", "⚠️ 配置缺失", errMsg);
        $done({ title: "异环签到", content: "请先抓包", icon: "exclamationmark.triangle.fill" });
        return;
    }

    let reportMsg = [];
    for (let i = 0; i < accounts.length; i++) {
        let acc = accounts[i];
        let accMsg = [];
        let gameId = acc.gameId || DEFAULT_GAME_ID;

        // 1. 常规签到
        if (acc.refreshToken) {
            try {
                const tokenData = await refreshAccessToken(acc);
                const uid = tokenData.uid || acc.uid;
                accMsg.push(await communitySign(tokenData.access, uid, acc.deviceId));
                
                let roleIds = acc.roleIds && acc.roleIds.length > 0 ? acc.roleIds : await getGameRoles(tokenData.access, uid, acc.deviceId, gameId);
                if(roleIds.length === 0) accMsg.push("游戏签到: 未获取到角色 ID");
                for (let roleId of roleIds) {
                    accMsg.push(await gameSign(tokenData.access, roleId, gameId));
                }
            } catch (e) {
                accMsg.push(`[常规异常] ${e.message}`);
            }
        }

        // 2. 云异环签到
        if (acc.cloudToken && acc.cloudUserId) {
            try {
                accMsg.push(await cloudClaimDuration(acc));
            } catch (e) {
                accMsg.push(`[云异环异常] ${e.message}`);
            }
        }

        reportMsg.push(`[账号 ${i + 1}]\n${accMsg.join('\n')}`);
    }

    const finalContent = reportMsg.join('\n\n');
    console.log(finalContent);
    
    if (typeof $trigger !== 'undefined' && $trigger === "cron") {
        $notification.post("异环签到完成", "", finalContent);
    }
    
    $done({
        title: "异环签到",
        content: finalContent.replace(/\n/g, '  |  '),
        icon: "gamecontroller.fill",
        "icon-color": "#FF6B6B"
    });
})();

// ================== MD5 算法 ==================
function md5(string) {
    var hc="0123456789abcdef";
    function rh(n) {var j,s="";for(j=0;j<=3;j++) s+=hc.charAt((n>>(j*8+4))&0x0F)+hc.charAt((n>>(j*8))&0x0F);return s;}
    function ad(x,y) {var l=(x&0xFFFF)+(y&0xFFFF);var m=(x>>16)+(y>>16)+(l>>16);return (m<<16)|(l&0xFFFF);}
    function rl(n,c) {return (n<<c)|(n>>>(32-c));}
    function cm(q,a,b,x,s,t) {return ad(rl(ad(ad(a,q),ad(x,t)),s),b);}
    function ff(a,b,c,d,x,s,t) {return cm((b&c)|((~b)&d),a,b,x,s,t);}
    function gg(a,b,c,d,x,s,t) {return cm((b&d)|(c&(~d)),a,b,x,s,t);}
    function hh(a,b,c,d,x,s,t) {return cm(b^c^d,a,b,x,s,t);}
    function ii(a,b,c,d,x,s,t) {return cm(c^(b|(~d)),a,b,x,s,t);}
    var x=Array();var k,AA,BB,CC,DD,a,b,c,d;var S11=7,S12=12,S13=17,S14=22;var S21=5,S22=9,S23=14,S24=20;var S31=4,S32=11,S33=16,S34=23;var S41=6,S42=10,S43=15,S44=21;
    string = unescape(encodeURIComponent(string));
    for(k=0;k<string.length;k++) x[k>>2]|=string.charCodeAt(k)<<((k%4)*8);
    x[k>>2]|=0x80<<((k%4)*8);x[(((k+8)>>6)<<4)+14]=k*8;
    a=0x67452301;b=0xEFCDAB89;c=0x98BADCFE;d=0x10325476;
    for(k=0;k<x.length;k+=16) {
        AA=a;BB=b;CC=c;DD=d;
        a=ff(a,b,c,d,x[k+0],S11,0xD76AA478);d=ff(d,a,b,c,x[k+1],S12,0xE8C7B756);c=ff(c,d,a,b,x[k+2],S13,0x242070DB);b=ff(b,c,d,a,x[k+3],S14,0xC1BDCEEE);
        a=ff(a,b,c,d,x[k+4],S11,0xF57C0FAF);d=ff(d,a,b,c,x[k+5],S12,0x4787C62A);c=ff(c,d,a,b,x[k+6],S13,0xA8304613);b=ff(b,c,d,a,x[k+7],S14,0xFD469501);
        a=ff(a,b,c,d,x[k+8],S11,0x698098D8);d=ff(d,a,b,c,x[k+9],S12,0x8B44F7AF);c=ff(c,d,a,b,x[k+10],S13,0xFFFF5BB1);b=ff(b,c,d,a,x[k+11],S14,0x895CD7BE);
        a=ff(a,b,c,d,x[k+12],S11,0x6B901122);d=ff(d,a,b,c,x[k+13],S12,0xFD987193);c=ff(c,d,a,b,x[k+14],S13,0xA679438E);b=ff(b,c,d,a,x[k+15],S14,0x49B40821);
        a=gg(a,b,c,d,x[k+1],S21,0xF61E2562);d=gg(d,a,b,c,x[k+6],S22,0xC040B340);c=gg(c,d,a,b,x[k+11],S23,0x265E5A51);b=gg(b,c,d,a,x[k+0],S24,0xE9B6C7AA);
        a=gg(a,b,c,d,x[k+5],S21,0xD62F105D);d=gg(d,a,b,c,x[k+10],S22,0x2441453);c=gg(c,d,a,b,x[k+15],S23,0xD8A1E681);b=gg(b,c,d,a,x[k+4],S24,0xE7D3FBC8);
        a=gg(a,b,c,d,x[k+9],S21,0x21E1CDE6);d=gg(d,a,b,c,x[k+14],S22,0xC33707D6);c=gg(c,d,a,b,x[k+3],S23,0xF4D50D87);b=gg(b,c,d,a,x[k+8],S24,0x455A14ED);
        a=gg(a,b,c,d,x[k+13],S21,0xA9E3E905);d=gg(d,a,b,c,x[k+2],S22,0xFCEFA3F8);c=gg(c,d,a,b,x[k+7],S23,0x676F02D9);b=gg(b,c,d,a,x[k+12],S24,0x8D2A4C8A);
        a=hh(a,b,c,d,x[k+5],S31,0xFFFA3942);d=hh(d,a,b,c,x[k+8],S32,0x8771F681);c=hh(c,d,a,b,x[k+11],S33,0x6D9D6122);b=hh(b,c,d,a,x[k+14],S34,0xFDE5380C);
        a=hh(a,b,c,d,x[k+1],S31,0xA4BEEA44);d=hh(d,a,b,c,x[k+4],S32,0x4BDECFA9);c=hh(c,d,a,b,x[k+7],S33,0xF6BB4B60);b=hh(b,c,d,a,x[k+10],S34,0xBEBFBC70);
        a=hh(a,b,c,d,x[k+13],S31,0x289B7EC6);d=hh(d,a,b,c,x[k+0],S32,0xEAA127FA);c=hh(c,d,a,b,x[k+3],S33,0xD4EF3085);b=hh(b,c,d,a,x[k+6],S34,0x4881D05);
        a=hh(a,b,c,d,x[k+9],S31,0xD9D4D039);d=hh(d,a,b,c,x[k+12],S32,0xE6DB99E5);c=hh(c,d,a,b,x[k+15],S33,0x1FA27CF8);b=hh(b,c,d,a,x[k+2],S34,0xC4AC5665);
        a=ii(a,b,c,d,x[k+0],S41,0xF4292244);d=ii(d,a,b,c,x[k+7],S42,0x432AFF97);c=ii(c,d,a,b,x[k+14],S43,0xAB9423A7);b=ii(b,c,d,a,x[k+5],S44,0xFC93A039);
        a=ii(a,b,c,d,x[k+12],S41,0x655B59C3);d=ii(d,a,b,c,x[k+3],S42,0x8F0CCC92);c=ii(c,d,a,b,x[k+10],S43,0xFFEFF47D);b=ii(b,c,d,a,x[k+1],S44,0x85845DD1);
        a=ii(a,b,c,d,x[k+8],S41,0x6FA87E4F);d=ii(d,a,b,c,x[k+15],S42,0xFE2CE6E0);c=ii(c,d,a,b,x[k+6],S43,0xA3014314);b=ii(b,c,d,a,x[k+13],S44,0x4E0811A1);
        a=ii(a,b,c,d,x[k+4],S41,0xF7537E82);d=ii(d,a,b,c,x[k+11],S42,0xBD3AF235);c=ii(c,d,a,b,x[k+2],S43,0x2AD7D2BB);b=ii(b,c,d,a,x[k+9],S44,0xEB86D391);
        a=ad(a,AA);b=ad(b,BB);c=ad(c,CC);d=ad(d,DD);
    }
    return rh(a)+rh(b)+rh(c)+rh(d);
}
