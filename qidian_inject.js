// qidian_inject.js (GitHub Raw 直连版 - 失败绝对拦截)

const rawUrl = "https://raw.githubusercontent.com/h05n/waibucangku/main/%E8%B5%B7%E7%82%B9.html";

$httpClient.get(rawUrl, function(error, response, data) {
    if (error) {
        console.log("从 GitHub 拉取失败: " + error);
        // 失败绝对不放行，直接强行返回一个报错页面
        $done({
            response: {
                status: 500,
                headers: {
                    "Content-Type": "text/html; charset=utf-8",
                    "Cache-Control": "no-cache, no-store, must-revalidate"
                },
                body: `<div style="padding: 20px; text-align: center; font-family: sans-serif; margin-top: 50px;">
                        <h2 style="color: #d32f2f;">⚠️ 页面替换失败</h2>
                        <p>无法连接到 GitHub 拉取最新代码。</p>
                        <p style="color: #666; font-size: 14px; word-break: break-all;">错误信息: ${error}</p>
                       </div>`
            }
        });
    } else {
        // 成功拿到代码，直接伪装成服务器把网页发给 App
        $done({
            response: {
                status: 200,
                headers: {
                    "Content-Type": "text/html; charset=utf-8",
                    "Cache-Control": "no-cache, no-store, must-revalidate"
                },
                body: data
            }
        });
    }
});
