// 获取开关参数：如果填了 #，则直接退出，不执行抓包
const arg = typeof $argument !== "undefined" ? $argument : "";
if (arg.includes("#")) {
    $done({});
}

const url = $request.url;
const headers = $request.headers || {};
// Surge 的 headers 大小写可能不统一，全部转小写方便匹配
const lowerHeaders = {};
for (let key in headers) {
    lowerHeaders[key.toLowerCase()] = headers[key];
}

const storeKey = "NTE_ACCOUNT_DATA";
let account = {};
try {
    account = JSON.parse($persistentStore.read(storeKey) || "{}");
} catch (e) {
    account = {};
}

let updated = false;

// 1. 拦截常规异环 (塔吉多)
if (url.includes("bbs-api.tajiduo.com")) {
    const auth = lowerHeaders['authorization'];
    const uid = lowerHeaders['uid'];
    const deviceId = lowerHeaders['deviceid'];
    
    if (auth && uid && deviceId && account.refreshToken !== auth) {
        account.refreshToken = auth;
        account.uid = uid;
        account.deviceId = deviceId;
        updated = "异环(常规)";
    }
} 
// 2. 拦截云异环
else if (url.includes("user.laohu.com/cloud/")) {
    let bodyParams = {};
    if ($request.body) {
        $request.body.split('&').forEach(pair => {
            const [k, v] = pair.split('=');
            if (k) bodyParams[k] = decodeURIComponent(v || "");
        });
    }
    
    // 云异环的 token 和 userId 通常在 Body 里
    const token = bodyParams['token'];
    const userId = bodyParams['userId'];
    const deviceId = bodyParams['deviceId'];
    
    if (token && userId && account.cloudToken !== token) {
        account.cloudToken = token;
        account.cloudUserId = userId;
        if (deviceId) account.cloudDeviceId = deviceId;
        updated = "云异环";
    }
}

// 如果数据有更新，写入本地存储并通知
if (updated) {
    $persistentStore.write(JSON.stringify(account), storeKey);
    $notification.post("异环抓包成功", updated + " 数据已更新", "签到脚本已可自动读取此 Token。为避免频繁弹窗，建议在模块中填入 # 关闭抓包。");
}

$done({});
