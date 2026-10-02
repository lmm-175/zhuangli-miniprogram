/**
 * 妆历 · 分享卡片（Page.onShareAppMessage / onShareTimeline 的返回值）
 * · 规矩 41 / 43
 *
 * ══════════════════════════════════════════════════════════════════════
 * 🔴 为什么「能不能分享」不是一个小开关
 *
 * 微信的规矩是：**只有定义了 onShareAppMessage，右上角菜单才显示「转发」**
 * （官方文档 Page.onShareAppMessage 原话）。所以这一条不是全局开关，
 * 而是 **18 个页面各自的一件事** —— 漏一页的症状是那一页点「···」
 * 里根本没有「转发」这一项：不报错、不白屏、没有任何别的信号。
 *    📌 2026-10-01 之前全项目只有 `pages/schedule-edit/` 一页定义了它，
 *       其余 17 页点「···」都没有转发。用户报的就是这个。
 * ⇒ 卡片内容收拢到这一个函数，每个页面只留一行 `onShareAppMessage`。
 *
 * 🔴 【转发】落点统一 = 妆位页（C1 `pages/landing/`）
 *
 * 用户 2026-10-01 当场定的原话：「**全部页面都能转发，但落点统一到妆位页**」。
 * 理由是这两个页面性质不同：
 *   · 妆娘的「档期 / 预约单 / 我的」是**私人管理页** —— 转出去顾客点开
 *     看到的是一屏管理按钮（还有「取消场次」），那不是给顾客看的东西；
 *   · C1 是**唯一一页「顾客看了知道该干什么」的页**（挑一场、挑个妆位、下单）。
 * ⇒ 所以不管妆娘在哪一页点「···」，卡片点开都落到妆位页。
 *   ⚠️ ⛔ 别给某一页单独换落点：一换就会出现「同一个卡片从不同页发出去、
 *      落到不同地方」，而两边看起来都对 —— 那种错最难查。
 *
 * ⚠️ `imageUrl` 【故意不设】：
 *    · 转发 —— 微信拿当前页的截图当卡片图。界面稿 §3.1 原方案是「第一张妆面
 *      样片 5:4」，但**样片在第二十处已经删掉了**（C1 不再展示妆面），工程里
 *      没有任何一张可用的图。宁可用微信的截图，也不去指一个不存在的文件
 *      —— 指向不存在的图在真机上就是一张空白卡片，且不报错。
 *    · 朋友圈 —— 微信默认用小程序的 Logo（不是截图）。同理，不设。
 * ══════════════════════════════════════════════════════════════════════
 */
const { getArtist, getArtistById, scheduleById } = require('./artistStore')

/* 落点那一页的路径。⛔ 唯一一处拼这个路径的地方（包括 landing 自己在内，
   页面上别的地方要跳它也走这儿 —— 见 pages/landing/landing.js 的 pickSlot）。 */
const LANDING_PATH = '/pages/landing/landing'

/**
 * 卡片内容。页面上的写法一律是 `shareCard(this.artistId)`。
 *
 * ⚠️ 形参是 **artistId**，⛔ 不是微信传进来的 `options`：
 *    微信调用 onShareAppMessage 时第一个参数是 `{from, target}`。
 *    把它当成 artist_id 会拼出
 *    `/pages/landing/landing?artist_id=[object Object]` ——
 *    **不报错，卡片还能正常发出去**，只是点开落到兜底那位。
 *    ⇒ 所以下面这条「对象一律当没传」的闸是**必须**的，不是防御性编程：
 *      它把「有人图省事写成 shareCard(options)」从一个静默的错误
 *      变成卡片照常正常工作。
 *
 * @param {string} artistId 哪一位妆娘的妆位页。留空 = 妆娘端那一位。
 */
function shareCard(artistId) {
  /* 只认字符串。对象 / 数组 / 数字 / undefined 一律当「没传」——
     见上面那段：微信的 options 正好是个对象。 */
  const want = (typeof artistId === 'string') ? artistId.trim() : ''
  /* 空 → 妆娘端那一位。走 getArtist() 而 ⛔ 不是写死 'demo'：
     这一层的语义是「我自己的妆位页」，`artist_id` 该由 store 说了算
     （M1 接云端之后它就不再恒等于 'demo' 了）。 */
  const who = getArtistById(want || getArtist().artist_id)
  const nick = who.nickname || ''
  return {
    /* 文案【只陈述、不吆喝】：⛔ 不写「来约妆」「快来看」那类话。
       界面稿 §3.1 记着一条 —— 自己画分享面板/写诱导性文案，
       审核会额外找麻烦。转发卡片同理。 */
    title: (nick || '妆历') + '的妆位',
    /* ⚠️ 用 `who.artist_id`（过完兜底的那一位），⛔ 不是入参 `want`：
       want 是个不存在的 id 时会落到兜底那位，标题写的是那位的昵称，
       路径却带着那个不存在的 id —— 卡片自己前后矛盾（点开又落到另一个人）。 */
    path: LANDING_PATH + '?artist_id=' + who.artist_id
  }
}

/* ══ 朋友圈（2026-10-02 · 第二十七处）══════════════════════════════════
   📌 这一块**推翻**了本文件原先那段「⛔ 全项目不实现 onShareTimeline」。
      但推掉的只是结论，它指出的那三条事实一个字没变 —— 而且正是它们
      决定了下面这个形状。所以那段说明不是被删掉，是被**改写**：

   三条硬约束（微信官方文档）：
     ① **朋友圈卡片不能自定义页面路径。** 原文：「自定义分享内容时不支持
        自定义页面路径（可携带参数但不能改变路径）」。
        ⇒ 卡片点开的那一页 = **分享时她所在的那一页**。
        ⇒ 「转发」那套「18 页统一落到 C1」在朋友圈上**做不到**，⛔ 别抄。
     ② **从朋友圈点开必然先进「单页模式」（scene === 1154）**，不存在
        「点一下直接进小程序」。顾客要点微信自己画的那条底部操作栏
        「前往小程序」（scene 变 1155，打开**同一页同一参数**）才真进小程序。
        ⇒ 中间这一下是微信的，谁也去不掉。
     ③ 单页模式下：路由 API（navigateTo / redirectTo / switchTab /
        navigateBack）**全禁用**、无 tabBar、无登录态、剪贴板禁用、
        **本机 storage 与普通模式不共用**。
        ⚠️ 最后一条 M0 看不出来（数据本来就是夹具），M1 接云开发之后
           顾客端**必须**走「未登录可读」的云数据，否则分享出去的卡片点开
           是空的。

   🔴 由 ① 推出的那个决定（规矩 43）：**只给 C1 开朋友圈**。
      · C1 是唯一一页「顾客看了知道该干什么」的页 —— 同一个理由，转发那边也是它；
      · 其余 17 页（妆娘的档期 / 预约单 / 我的）⛔ 一律不定义 `onShareTimeline`：
        妆娘从那儿发一条，别人点开就是**她的管理界面**、而且按钮全是死的，
        而她自己**看不见**自己发出去的卡片长什么样（只有收到的人知道）。
      ⇒ 妆娘要发朋友圈，得先站到 C1 上。她在妆师端「档期详情」点「分享」，
        我们把她带到 C1（带 `schedule_id`，所以落点是**她选的那一场**）。
        ⚠️ 小程序⛔ 不能自己弹出分享面板（官方：「不支持在小程序页面内直接
           发起分享」），所以那一下「点右上角 ···」必须她本人来，去不掉。

   🔴 **返回值里⛔ 没有 `path`** —— 见约束 ①。写了它会被微信忽略，但会让
      下一个读这段代码的人以为「落点已经控住了」，于是去那一页找落点，
      找不到，也不会报错。自测里有一条断言专门钉它（规矩 41 的反面）。
   ══════════════════════════════════════════════════════════════════════ */

/**
 * 朋友圈卡片。页面上的写法一律是 `shareTimeline(this.artistId, this.data.schedId)`。
 *
 * @param {string} artistId   哪一位妆娘的妆位页。留空 = 妆娘端那一位。
 * @param {string} scheduleId 要锁定的那一场。留空 / 认不出 = 不锁定（C1 自己
 *                            按「离今天最近」挑）。认不出时 **query 里也不带它**
 *                            —— 带一个不存在的 id 过去，C1 只会当作「没指定」，
 *                            卡片自己前后矛盾（标题写的是昵称，参数指着一个不存在的东西）。
 */
function shareTimeline(artistId, scheduleId) {
  /* 形参纪律和 shareCard 逐字一样：**只认字符串**。微信调用 onShareTimeline
     时会把页面的 options 之类的东西塞进来，误传一个对象会拼出
     `schedule_id=[object Object]` —— **不报错，卡片照发**，只是点开永远
     落不到那一场。见 shareCard 上面那段。 */
  const wantArtist = (typeof artistId === 'string') ? artistId.trim() : ''
  const wantSched = (typeof scheduleId === 'string') ? scheduleId.trim() : ''

  /* 过兜底那一位（认不出的 id → demo），理由同 shareCard：标题和参数必须
     讲同一个人，否则卡片自己跟自己打架。 */
  const who = getArtistById(wantArtist || getArtist().artist_id)
  const nick = who.nickname || '妆历'
  const s = wantSched ? scheduleById(wantSched) : null

  /* 文案【只陈述、不吆喝】（和 shareCard 同一个规矩）：
     ⛔ 不写「可约」「速来」「快来看」—— 这一场**可能已经约满**，
        而且微信对营销/诱导性分享是会打击的（运营规范原话）。 */
  return {
    title: (s && s.name ? s.name + ' · ' : '') + nick + '的妆位',
    query: 'artist_id=' + who.artist_id + (s ? '&schedule_id=' + s.schedule_id : '')
  }
}

/* ══ 现在是不是「单页模式」（从朋友圈点开的那个模式）═══════════════════
   `scene === 1154` 是官方文档给的判据；1155 是顾客在单页模式里点了
   「前往小程序」之后真正进小程序的场景值（打开的是**同一页同一参数**，
   所以那时候这一页就该正常渲染了 —— 这正是我们要的分界）。

   ⚠️ 整块 try/catch 兜 `false`，写法照抄 `utils/navbar.js` 的 `getNavMetrics`：
      取不到环境信息时宁可**当成正常模式**（正常模式的键点了都有反应），
      ⛔ 不要反过来 —— 反过来会把顾客手里一个好好的妆位页降级成只读页，
      而且没有任何报错。 */
function inSinglePage() {
  try {
    return (wx.getLaunchOptionsSync() || {}).scene === 1154
  } catch (e) {
    return false
  }
}

module.exports = { shareCard, shareTimeline, inSinglePage, LANDING_PATH }
