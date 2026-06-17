const NAME = 'network-info';
const $ = new Env(NAME);

!(async () => {
  let title = '网络信息';
  let content = '正在查询中...';

  try {
    // 1. 获取本地直连 IP 信息
    const localRes = await $.http.get({ url: 'https://myip.ipip.net/json', timeout: 5000 });
    const localData = JSON.parse(localRes.body || '{}')?.data || {};
    
    // 2. 获取落地代理 IP 信息 (强制使用 ip.sb，对节点最准)
    const proxyRes = await $.http.get({ url: 'https://api-ipv4.ip.sb/geoip', timeout: 5000 });
    const proxyData = JSON.parse(proxyRes.body || '{}');

    // 3. 构建显示内容 (完全展示原始数据，不进行二次精简，防止逻辑错误)
    content = `本地 IP: ${localData.ip || '-'}\n` +
              `位置: ${localData.location ? localData.location.slice(0, 2).join(' ') : '-'}\n` +
              `网络: ${localData.location ? localData.location[4] : '-'}\n\n` +
              `落地 IP: ${proxyData.ip || '-'}\n` +
              `位置: ${proxyData.country || '-'} ${proxyData.city || ''}\n` +
              `网络: ${proxyData.isp || proxyData.organization || '-'}\n` +
              `代号: ${proxyData.asn ? 'AS' + proxyData.asn : '-'}\n\n` +
              `记录时间: ${new Date().toLocaleTimeString()}`;

  } catch (e) {
    content = `查询出错: ${e.message}`;
  }

  $.done({ title, content });
})();

// 此处保留原脚本的 Env 环境工具类，无需修改
function Env(t,e){
    // ... (保持原脚本末尾的 Env 类不变) ...
}
