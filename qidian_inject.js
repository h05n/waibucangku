// qidian_inject.js
// 这是替你从 GitHub 搬运代码并替换给阅读 App 的机器人

// 我已经帮你转换成了安全的 Raw 直链
const githubUrl = "https://raw.githubusercontent.com/h05n/waibucangku/main/%E8%B5%B7%E7%82%B9.html";

$httpClient.get(githubUrl, function(error, response, data) {
    if (error) {
        console.log("拉取 GitHub 上的起点.html 失败: " + error);
        // 如果遇到断网或者 GitHub 连不上，就放行原版页面，保证你至少有书看
        $done({}); 
    } else {
        // 成功拿到代码，瞬间替换掉原本的网页！
        $done({ body: data });
    }
});
