// 网络信息.js
// Surge 面板脚本 · 本地 / 入口 / 落地 IP 查询
// 本地: ip-api.com (国内城市精准) · 落地: ipinfo.io + ip.sb 双备份

!(async () => {

  const TIMEOUT_DIRECT = 5    // 直连超时（秒）
  const TIMEOUT_PROXY  = 10   // 代理查询超时（秒，落地通过代理可能较慢）
  const RETRIES        = 2    // 重试次数
  const RETRY_DELAY    = 1000 // 重试间隔（毫秒）

  // ─────────────────────────────────────
  //  HTTP 工具
  // ─────────────────────────────────────

  function httpGet(opt) {
    return new Promise((res, rej) =>
      $httpClient.get(opt, (err, _, body) =>
        err ? rej(new Error(String(err))) : res(body)
      )
    )
  }

  const httpAPI = (path, method = 'GET', data = null) =>
    new Promise(r => $httpAPI(method, path, data, r))

  async function fetchJSON(url, extra = {}, timeout = TIMEOUT_DIRECT) {
    let last
    for (let i = 0; i <= RETRIES; i++) {
      try {
        const body = await httpGet({ url, ...extra, timeout })
        return JSON.parse(body)
      } catch (e) {
        last = e
        if (i < RETRIES) await new Promise(r => setTimeout(r, RETRY_DELAY))
      }
    }
    throw last
  }

  // ─────────────────────────────────────
  //  繁体 → 简体（电信行业常用字）
  // ─────────────────────────────────────

  const T2S = {
    '電':'电','訊':'讯','網':'网','絡':'络','聯':'联','國':'国','際':'际',
    '業':'业','數':'数','據':'据','線':'线','傳':'传','輸':'输','務':'务',
    '體':'体','語':'语','設':'设','備':'备','號':'号','碼':'码','開':'开',
    '關':'关','點':'点','長':'长','時':'时','為':'为','對':'对','從':'从',
    '雲':'云','廣':'广','實':'实','進':'进','發':'发','應':'应','總':'总',
    '資':'资','強':'强','區':'区','帶':'带','連':'连','億':'亿','豐':'丰',
    '謝':'谢','請':'请','購':'购','廣':'广','鐵':'铁','勝':'胜','興':'兴',
    '來':'来','這':'这','個':'个','還':'还','無':'无','處':'处','華':'华',
    '寬':'宽','頻':'频','橋':'桥','節':'节','頭':'头','顯':'显','態':'态',
    '圖':'图','龍':'龙','鳳':'凤','盤':'盘','賣':'卖','貿':'贸',
  }
  const t2s = s => s.split('').map(c => T2S[c] || c).join('')

  // ─────────────────────────────────────
  //  国家代码 → 简体中文
  // ─────────────────────────────────────

  const COUNTRIES = {
    CN:'中国', HK:'香港', TW:'台湾', MO:'澳门',
    JP:'日本', KR:'韩国', SG:'新加坡', TH:'泰国',
    VN:'越南', MY:'马来西亚', ID:'印度尼西亚', PH:'菲律宾',
    IN:'印度', BD:'孟加拉', PK:'巴基斯坦', LK:'斯里兰卡',
    AU:'澳大利亚', NZ:'新西兰',
    US:'美国', CA:'加拿大', MX:'墨西哥',
    BR:'巴西', AR:'阿根廷', CL:'智利', CO:'哥伦比亚',
    GB:'英国', DE:'德国', FR:'法国', NL:'荷兰',
    IT:'意大利', ES:'西班牙', PT:'葡萄牙', CH:'瑞士',
    AT:'奥地利', BE:'比利时', SE:'瑞典', NO:'挪威',
    DK:'丹麦', FI:'芬兰', PL:'波兰', CZ:'捷克',
    RO:'罗马尼亚', HU:'匈牙利', GR:'希腊', UA:'乌克兰',
    RU:'俄罗斯', TR:'土耳其', IL:'以色列',
    SA:'沙特阿拉伯', AE:'阿联酋', EG:'埃及', IR:'伊朗',
    ZA:'南非', NG:'尼日利亚', KE:'肯尼亚',
    IE:'爱尔兰', LU:'卢森堡', IS:'冰岛',
  }

  // ─────────────────────────────────────
  //  地名英文 → 简体中文
  //  注意：美国州名用全称，避免剥后缀后只剩1字
  // ─────────────────────────────────────

  const GEOS = {
    // 中国省份 / 直辖市
    Beijing:'北京', Shanghai:'上海', Tianjin:'天津', Chongqing:'重庆',
    Guangdong:'广东', Zhejiang:'浙江', Jiangsu:'江苏', Shandong:'山东',
    Sichuan:'四川', Henan:'河南', Hubei:'湖北', Hunan:'湖南',
    Anhui:'安徽', Fujian:'福建', Jiangxi:'江西', Yunnan:'云南',
    Liaoning:'辽宁', Shaanxi:'陕西', Heilongjiang:'黑龙江', Jilin:'吉林',
    Shanxi:'山西', Guizhou:'贵州', Guangxi:'广西', Xinjiang:'新疆',
    Tibet:'西藏', Hainan:'海南', Ningxia:'宁夏', Qinghai:'青海',
    Gansu:'甘肃', Hebei:'河北', 'Inner Mongolia':'内蒙古',
    // 中国主要城市
    Guangzhou:'广州', Shenzhen:'深圳', Hangzhou:'杭州', Nanjing:'南京',
    Wuhan:'武汉', Chengdu:'成都', Suzhou:'苏州', Jinan:'济南',
    Qingdao:'青岛', Zhengzhou:'郑州', Changsha:'长沙', Shenyang:'沈阳',
    Harbin:'哈尔滨', Changchun:'长春', Taiyuan:'太原', Hefei:'合肥',
    Fuzhou:'福州', Xiamen:'厦门', Kunming:'昆明', Nanchang:'南昌',
    Xian:'西安', Haikou:'海口', Guiyang:'贵阳', Nanning:'南宁',
    Lanzhou:'兰州', Xining:'西宁', Yinchuan:'银川', Urumqi:'乌鲁木齐',
    Wenzhou:'温州', Wuxi:'无锡', Zhuhai:'珠海', Foshan:'佛山',
    Dongguan:'东莞', Shijiazhuang:'石家庄', Ningbo:'宁波',
    Yancheng:'盐城', Nantong:'南通', Changzhou:'常州',
    // 香港 18 区
    'Central and Western':'中西区', Eastern:'东区', Southern:'南区',
    'Wan Chai':'湾仔', 'Sham Shui Po':'深水埗',
    'Kowloon City':'九龙城', 'Kwun Tong':'观塘',
    'Wong Tai Sin':'黄大仙', 'Yau Tsim Mong':'油尖旺',
    'Kwai Tsing':'葵青', 'Tsuen Wan':'荃湾', 'Tuen Mun':'屯门',
    'Yuen Long':'元朗', 'Tai Po':'大埔', 'Sha Tin':'沙田',
    'Sai Kung':'西贡', Islands:'离岛', 'Kwai Chung':'葵涌',
    Kowloon:'九龙', 'Hong Kong':'香港',
    // 台湾
    Taipei:'台北', 'New Taipei':'新北', Taoyuan:'桃园',
    Taichung:'台中', Tainan:'台南', Kaohsiung:'高雄',
    Hsinchu:'新竹', Keelung:'基隆', Pingtung:'屏东',
    // 日本 47 都道府县
    Tokyo:'东京', Osaka:'大阪', Kanagawa:'神奈川',
    Aichi:'爱知', Saitama:'埼玉', Chiba:'千叶',
    Hyogo:'兵库', Hokkaido:'北海道', Fukuoka:'福冈',
    Shizuoka:'静冈', Ibaraki:'茨城', Hiroshima:'广岛',
    Kyoto:'京都', Miyagi:'宫城', Niigata:'新潟',
    Nagano:'长野', Gifu:'岐阜', Tochigi:'栃木',
    Gunma:'群马', Okayama:'冈山', Mie:'三重',
    Kumamoto:'熊本', Kagoshima:'鹿儿岛', Oita:'大分',
    Yamaguchi:'山口', Shiga:'滋贺', Ehime:'爱媛',
    Nara:'奈良', Nagasaki:'长崎', Miyazaki:'宫崎',
    Aomori:'青森', Iwate:'岩手', Akita:'秋田',
    Yamagata:'山形', Fukushima:'福岛', Ishikawa:'石川',
    Toyama:'富山', Fukui:'福井', Yamanashi:'山梨',
    Wakayama:'和歌山', Tottori:'鸟取', Shimane:'岛根',
    Tokushima:'德岛', Kagawa:'香川', Kochi:'高知',
    Okinawa:'冲绳', Saga:'佐贺',
    Yokohama:'横滨', Nagoya:'名古屋', Sapporo:'札幌',
    Kobe:'神户', Sendai:'仙台',
    // 韩国
    Seoul:'首尔', Busan:'釜山', Incheon:'仁川',
    Daegu:'大邱', Daejeon:'大田', Gwangju:'光州', Ulsan:'蔚山',
    Gyeonggi:'京畿', Gangwon:'江原', Jeju:'济州',
    'North Gyeongsang':'庆北', 'South Gyeongsang':'庆南',
    'North Jeolla':'全北', 'South Jeolla':'全南',
    'North Chungcheong':'忠北', 'South Chungcheong':'忠南',
    // 美国 - 州（全称，避免剥"州"后只剩1字）
    California:'加利福尼亚', Washington:'华盛顿', Texas:'德克萨斯',
    Florida:'佛罗里达', Illinois:'伊利诺伊', Virginia:'弗吉尼亚',
    Massachusetts:'马萨诸塞', Georgia:'佐治亚', Ohio:'俄亥俄',
    Michigan:'密歇根', Pennsylvania:'宾夕法尼亚', Arizona:'亚利桑那',
    Nevada:'内华达', Colorado:'科罗拉多', Oregon:'俄勒冈',
    Missouri:'密苏里', Tennessee:'田纳西', Indiana:'印第安纳',
    Minnesota:'明尼苏达', Wisconsin:'威斯康星', Maryland:'马里兰',
    'New York':'纽约', 'New Jersey':'新泽西',
    'North Carolina':'北卡罗来纳', 'South Carolina':'南卡罗来纳',
    Connecticut:'康涅狄格', 'District of Columbia':'华盛顿特区',
    // 美国 - 城市
    'Los Angeles':'洛杉矶', 'San Francisco':'旧金山',
    'San Jose':'圣何塞', 'New York City':'纽约市',
    Chicago:'芝加哥', Dallas:'达拉斯', Seattle:'西雅图',
    Atlanta:'亚特兰大', Miami:'迈阿密', Houston:'休斯顿',
    Phoenix:'凤凰城', Philadelphia:'费城', Boston:'波士顿',
    Denver:'丹佛', Portland:'波特兰', 'Las Vegas':'拉斯维加斯',
    Ashburn:'阿什本', Newark:'纽瓦克', Fremont:'弗里蒙特',
    'San Antonio':'圣安东尼奥', 'San Diego':'圣地亚哥', Austin:'奥斯汀',
    // 加拿大
    Toronto:'多伦多', Vancouver:'温哥华', Montreal:'蒙特利尔',
    Calgary:'卡尔加里', Ontario:'安大略', Quebec:'魁北克',
    // 欧洲
    London:'伦敦', Frankfurt:'法兰克福', Amsterdam:'阿姆斯特丹',
    Paris:'巴黎', Madrid:'马德里', Milan:'米兰', Rome:'罗马',
    Zurich:'苏黎世', Vienna:'维也纳', Brussels:'布鲁塞尔',
    Stockholm:'斯德哥尔摩', Copenhagen:'哥本哈根',
    Helsinki:'赫尔辛基', Oslo:'奥斯陆', Warsaw:'华沙',
    Prague:'布拉格', Budapest:'布达佩斯', Athens:'雅典',
    Lisbon:'里斯本', Dublin:'都柏林', Moscow:'莫斯科',
    Istanbul:'伊斯坦布尔', Berlin:'柏林', Munich:'慕尼黑',
    Hamburg:'汉堡', Bucharest:'布加勒斯特', Kyiv:'基辅',
    // 亚太（其余）
    Singapore:'新加坡', Bangkok:'曼谷', 'Kuala Lumpur':'吉隆坡',
    Jakarta:'雅加达', Manila:'马尼拉', 'Ho Chi Minh':'胡志明',
    Hanoi:'河内', Sydney:'悉尼', Melbourne:'墨尔本',
    Perth:'珀斯', Auckland:'奥克兰',
    Mumbai:'孟买', Delhi:'德里', Bangalore:'班加罗尔',
    // 中东 / 非洲 / 南美
    Dubai:'迪拜', Riyadh:'利雅得', Cairo:'开罗',
    Johannesburg:'约翰内斯堡', 'Sao Paulo':'圣保罗',
  }

  function translateGeo(str = '') {
    if (!str) return ''
    const s = str.trim()
    if (GEOS[s]) return GEOS[s]
    // 最长前缀匹配
    let best = '', bestLen = 0
    for (const [en, cn] of Object.entries(GEOS)) {
      if (s.startsWith(en) && en.length > bestLen) {
        best = cn; bestLen = en.length
      }
    }
    // 未匹配：繁转简后原样返回
    return best || t2s(s)
  }

  // ─────────────────────────────────────
  //  去除行政区划后缀
  //  必须保证剥掉后至少剩 2 个字符，避免"德州"→"德"
  // ─────────────────────────────────────

  const ADMIN_SUFFIXES = [
    '特别行政区','自治区','直辖市','自治州','自治县',
    '省','州','市','区','县','镇','乡','都','道','府',
    ' Province',' State',' Prefecture',' Region',
    ' District',' County',' Territory',' City',
  ]

  function stripSuffix(str = '') {
    for (const suf of ADMIN_SUFFIXES) {
      if (str.endsWith(suf)) {
        const cut = str.slice(0, -suf.length).trim()
        if (cut.length >= 2) return cut   // 剥后至少2字才生效
      }
    }
    return str
  }

  // ─────────────────────────────────────
  //  位置格式化
  //  CN: 省 + 市（去重，不显示"中国"）
  //  非CN: 国家 + 省/州（不显示城市，避免三段过长）
  // ─────────────────────────────────────

  function formatLocation(countryCode, region, city) {
    const tR = stripSuffix(translateGeo(region))
    const tC = stripSuffix(translateGeo(city))

    let parts
    if (countryCode === 'CN') {
      parts = [tR, tC]
    } else {
      const country = COUNTRIES[countryCode] || countryCode || ''
      parts = [country, tR || tC]
    }

    const seen = new Set()
    return parts.filter(Boolean).filter(p => !seen.has(p) && seen.add(p)).join(' ')
  }

  // ─────────────────────────────────────
  //  ISP / Org 处理
  // ─────────────────────────────────────

  const ISP_MAP = [
    // 中国运营商
    ['China Unicom','中国联通'],   ['CHINANET','中国电信'],
    ['China Telecom','中国电信'],  ['China Mobile','中国移动'],
    ['China Broadnet','中国广电'], ['China Tietong','铁通'],
    ['CERNET','教育网'],           ['CNCGROUP','中国联通'],
    // 中国云
    ['Alibaba','阿里云'],    ['Aliyun','阿里云'],
    ['Tencent','腾讯云'],    ['Huawei Cloud','华为云'],
    ['Baidu','百度云'],      ['UCloud','UCloud'],
    ['21Vianet','世纪互联'], ['GDS','万国数据'],
    // 香港
    ['PCCW','电讯盈科'],     ['HGC','香港宽频国际'],
    ['HKBN','香港宽频'],     ['iAdvantage','iAdvantage'],
    ['Zhipinshang','智品尚'],
    // 台湾
    ['Chunghwa','中华电信'], ['Taiwan Mobile','台湾大哥大'],
    ['FarEasTone','远传电信'],
    // 日本
    ['NTT','NTT'],   ['KDDI','KDDI'],
    ['SoftBank','软银'], ['IIJ','IIJ'], ['OCN','OCN'],
    ['ARTERIA','ARTERIA'], ['Internet Initiative Japan','IIJ'],
    ['Sakura Internet','樱花互联网'],
    // 韩国
    ['SK Telecom','SKT'], ['KT Corp','KT'], ['LG Uplus','LG U+'],
    // 新加坡
    ['Singtel','新电信'], ['StarHub','StarHub'],
    // 美国运营商
    ['Comcast','Comcast'], ['AT&T','AT&T'],
    ['Verizon','Verizon'], ['T-Mobile','T-Mobile'],
    ['Level 3','Level3'],  ['Lumen','Lumen'],
    // 全球云 / CDN
    ['Amazon','AWS'],         ['AMAZON','AWS'],
    ['Google','Google'],      ['Microsoft','微软'],
    ['Cloudflare','Cloudflare'], ['Fastly','Fastly'],
    ['Akamai','Akamai'],      ['Vultr','Vultr'],
    ['DigitalOcean','DO'],    ['Linode','Linode'],
    ['Hetzner','Hetzner'],    ['OVH','OVH'],
    ['Contabo','Contabo'],    ['Zayo','Zayo'],
    ['Cogent','Cogent'],      ['Leaseweb','Leaseweb'],
    // 机场 / 代理网络
    ['Misaka','Misaka'],         ['DMIT','DMIT'],
    ['Zenlayer','Zenlayer'],     ['Datacamp','Datacamp'],
    ['Hurricane Electric','HE.net'], ['Quadrant','Quadrant'],
    ['IPTELECOM','IPTELECOM'],
    // 欧洲运营商
    ['Deutsche Telekom','德国电信'], ['Orange','Orange'],
    ['Vodafone','沃达丰'], ['KPN','KPN'], ['Swisscom','Swisscom'],
    ['BT Group','BT'], ['Iliad','Iliad'],
    // 澳洲
    ['Telstra','Telstra'], ['Optus','Optus'],
    // 中东
    ['Etisalat','Etisalat'], ['Ooredoo','Ooredoo'], ['STC','沙特电信'],
  ]

  const CORP_RE = new RegExp(
    '\\b(Technology|Technologies|Telecommunication|Telecommunications' +
    '|Communication|Communications|Network|Networks|Internet' +
    '|Service|Services|Telecom|Limited|Ltd|Corp|Corporation' +
    '|Inc|Incorporated|Group|Global|International|Holdings' +
    '|Solutions|Systems|Enterprise|Enterprises|Electric|Electron' +
    '|Information|Data|Cloud|Digital|Media|Connect|Fiber)\\b\\.?',
    'gi'
  )

  function formatISP(raw = '') {
    // 接受"AS12345 CompanyName"或纯"CompanyName"两种格式
    let s = raw.replace(/^AS\d+\s*/i, '').trim()
    if (!s) return ''

    // 去括号内地理标注：(Hongkong) (HK) (Shanghai) 等
    const cleaned = s
      .replace(/\s*[\(\（][^\)\）]{0,30}[\)\）]\s*/g, ' ')
      .replace(/\s+/g, ' ').trim()

    // 查映射表（去括号前后都试）
    for (const [key, val] of ISP_MAP) {
      if (cleaned.toLowerCase().includes(key.toLowerCase()) ||
          s.toLowerCase().includes(key.toLowerCase())) {
        return t2s(val)
      }
    }

    // 未命中：去常见公司/行业后缀
    s = cleaned.replace(CORP_RE, ' ').replace(/\s+/g, ' ').replace(/[,\-.\s]+$/, '').trim()
    s = t2s(s)

    // 超长：取前两词，最多 15 字符
    const words = s.split(/\s+/).filter(Boolean)
    if (words.length > 2) s = words.slice(0, 2).join(' ')
    if (s.length > 15) s = s.slice(0, 15).trimEnd()

    return s
  }

  // ─────────────────────────────────────
  //  解析各 API 响应 → 统一结构
  // ─────────────────────────────────────

  // ip-api.com 响应（带 lang=zh-CN，已含中文省市）
  function parseIPAPI(d) {
    if (d.status !== 'success') throw new Error(d.message || 'ip-api fail')
    return {
      ip:       d.query || '',
      location: formatLocation(d.countryCode, d.regionName, d.city),
      isp:      formatISP(d.isp || ''),            // isp 字段无 ASN 前缀
      asn:      (d.as || '').match(/^(AS\d+)/i)?.[1]?.toUpperCase() || '',
    }
  }

  // ipinfo.io 响应（全英文，org 含 ASN 前缀）
  function parseIPInfoIO(d) {
    if (!d || !d.ip) throw new Error('ipinfo fail')
    return {
      ip:       d.ip,
      location: formatLocation(d.country, d.region, d.city),
      isp:      formatISP(d.org || ''),            // "AS12345 Company..."
      asn:      (d.org || '').match(/^(AS\d+)/i)?.[1]?.toUpperCase() || '',
    }
  }

  // ip.sb 响应（备用）
  function parseIPSB(d) {
    if (!d || !d.ip) throw new Error('ip.sb fail')
    return {
      ip:       d.ip,
      location: formatLocation(d.country_code, d.region, d.city),
      isp:      formatISP(d.isp || d.organization || ''),
      asn:      d.asn || '',
    }
  }

  // ─────────────────────────────────────
  //  查询本地 IP（国内精准，直连）
  //  ip-api.com lang=zh-CN，直接返回中文省市
  // ─────────────────────────────────────

  const IPAPI_FIELDS = 'status,message,query,country,countryCode,regionName,city,isp,as'

  async function queryLocal() {
    const d = await fetchJSON(
      `http://ip-api.com/json?lang=zh-CN&fields=${IPAPI_FIELDS}`,
      { policy: 'DIRECT' },
      TIMEOUT_DIRECT
    )
    return parseIPAPI(d)
  }

  // ─────────────────────────────────────
  //  查询落地 IP（通过代理规则路由）
  //  ipinfo.io 主，ip.sb 备
  // ─────────────────────────────────────

  async function queryLanding() {
    // 主：ipinfo.io（HTTPS，实际路由定位准）
    try {
      const d = await fetchJSON('https://ipinfo.io/json', {}, TIMEOUT_PROXY)
      return parseIPInfoIO(d)
    } catch { /* fallthrough */ }

    // 备：ip.sb（HTTPS）
    const d = await fetchJSON('https://api-ipv4.ip.sb/geoip', {}, TIMEOUT_PROXY)
    return parseIPSB(d)
  }

  // ─────────────────────────────────────
  //  查询指定 IP 信息（入口，直连）
  //  ip-api.com lang=zh-CN，国内精准，国外也够用
  // ─────────────────────────────────────

  async function queryByIP(ip) {
    const d = await fetchJSON(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN&fields=${IPAPI_FIELDS}`,
      { policy: 'DIRECT' },
      TIMEOUT_DIRECT
    )
    return parseIPAPI(d)
  }

  // ─────────────────────────────────────
  //  从 Surge 最近请求日志提取入口 IP
  //  落地查询经过代理（HTTPS），remoteAddress 带 (Proxy)
  // ─────────────────────────────────────

  async function findEntrance(landingIP) {
    try {
      const { requests = [] } = await httpAPI('/v1/requests/recent')
      const hit = requests.slice(0, 40).find(r =>
        // 匹配落地查询用的两个域名
        /ipinfo\.io|ip\.sb/.test(r.URL || '') &&
        /\(Proxy\)/i.test(r.remoteAddress || '')
      )
      if (!hit) return null
      const ip = (hit.remoteAddress || '')
        .replace(/\s*\(Proxy\)\s*/gi, '').trim()
        .replace(/:\d+$/, '')          // 去端口
        .replace(/^\[(.+)\]$/, '$1')   // 去 IPv6 方括号
      return ip && ip !== landingIP ? ip : null
    } catch {
      return null
    }
  }

  // ─────────────────────────────────────
  //  格式化单块输出
  // ─────────────────────────────────────

  function block(label, ip, info) {
    const lines = [`${label}：${ip || '-'}`]
    if (info?.location) lines.push(`位置：${info.location}`)
    if (info?.isp)      lines.push(`网络：${info.isp}`)
    if (info?.asn)      lines.push(`代号：${info.asn}`)
    return lines.join('\n')
  }

  // ─────────────────────────────────────
  //  主流程
  // ─────────────────────────────────────

  // 本地（直连）与落地（代理）并发
  const [local, landing] = await Promise.all([
    queryLocal().catch(() => null),
    queryLanding().catch(() => null),
  ])

  // 从日志提取入口 IP
  const entranceIP = await findEntrance(landing?.ip)

  // 查入口详情（若检测到）
  const entrance = entranceIP
    ? await queryByIP(entranceIP).catch(() => null)
    : null

  // 组装面板内容
  const sections = [block('本地', local?.ip, local)]
  if (entranceIP) sections.push(block('入口', entranceIP, entrance))
  sections.push(block('落地', landing?.ip, landing))

  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  sections.push(
    `记录时间：${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  )

  $done({ title: '网络信息', content: sections.join('\n\n') })

})().catch(e =>
  $done({ title: '网络信息', content: `查询失败：${e.message || e}` })
)
