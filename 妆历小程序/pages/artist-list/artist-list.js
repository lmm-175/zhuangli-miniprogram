/**
 * 我约过的妆娘（约妆端）· **约妆端 tabBar 第 1 格**（2026-10-01 第二十一处）。
 *
 * 📌 第二十一处之前它是约妆首页那张聚合卡点进来的一个普通页，首页上还有
 *    「我的」那一段。用户原话是「**不要放在同一个页面里面**」——
 *    于是约妆端有了一条和妆师端一样的底部条（自定义 tabBar，理由见
 *    custom-tab-bar/index.js），这一页升成第 1 格，第 2 格是
 *    `pages/guest-mine/`，`pages/guest-home/` 整页退役。
 *    （规矩 37：这是**搬家**，⛔ 不是复制一份 —— 首页那两段的话术和判据
 *      一个字都没在这儿重写。）
 *
 * 点一行进哪：`pages/landing/`（C1 分享落地页）—— 复用，⛔ 没有第二个妆娘主页。
 *
 * 🔴 这一页装的是【一份私人记录】，⛔ 不是「平台上有哪些妆娘」。
 *    每一行都来自「我自己提交过的那张预约单」，口径全在 utils/myArtists.js，
 *    连标题和空态文案都是那一份里来的（规矩 11 / 25）。
 *
 * 📌 形状照 pages/settings/、pages/feedback/：只有 `.js` + `.wxml`，
 *    样式全进 app.wxss（自测钉着这个形状）。
 */
const { TITLE, EMPTY, EMPTY_SUB, listMyArtists, matchArtist } =
  require('../../utils/myArtists')
const { syncTabBar } = require('../../utils/tabbar')

Page({
  data: {
    title: TITLE,
    empty: EMPTY,
    emptySub: EMPTY_SUB,
    // 搜索框是不是展开的。默认收起 —— 这一页一共几行，先让她看见人。
    open: false,
    kw: '',
    // 显示出来的（已筛过的）行
    rows: [],
    // 「筛过词」这个状态要单独存：空态得分成两支（一个都没有 / 有但筛没了），
    // 两支说的话完全不同（规矩 25：结论必须和当前的范围同口径）。
    searching: false
  },

  /* ⚠️ 读真数据必须在 onShow，⛔ 不能写进 data 初值 ——
     页面模块只求值一次然后被缓存，写进初值的话第二次进来还是第一份：
     妆娘那边把单标成已确认了、顾客这边新填了一单，这一页都不跟着变，
     而且完全不报错。这一页尤其要命：它是 tab 页，顾客**每次切回来都走 onShow**
     而⛔ 不走 onLoad —— 写进初值的话，切过去一次之后就永远是那一份了。 */
  onShow() {
    // 第一行：把底部那条点亮（本页是约妆端第 1 格）。见 utils/tabbar.js
    syncTabBar(this)

    // ⚠️ 全量存在 `this._all` 上，⛔ 不塞进 data ——
    //    塞进去会被 setData 序列化一遍，而页面根本不该渲染「筛之前那一份」。
    this._all = listMyArtists()
    this.apply()
  },

  /* 筛 + 报数。⛔ 只有这一处 setData({rows}) —— 打字、清空、重进都走它，
     免得出现「某条路径忘了重算 rows」那种静默残留。 */
  apply() {
    const kw = String(this.data.kw || '').trim()
    const all = this._all || []
    const rows = kw ? all.filter((r) => matchArtist(r, kw)) : all
    this.setData({ rows, searching: !!kw })
  },

  /* ══ 搜索 ═══════════════════════════════════════════════════════════
     🔴 【输入即筛】，⛔ 不走妆师端那套「回车才搜」的两级状态
        （那边是 kwInput 打字只重算下拉面板 / kw 提交才搜主列表）。
        为什么这里不要两级：妆师端要两级，是因为**每敲一个字符就重建一次主列表**
        会打断她正在处理的场次分组；这一页是一份**不分组的短列表**（你约过几个人），
        重建的代价约等于零，而两级态会让「我打完了怎么还没筛」变成一个疑问。
        ⚠️ 所以这里只有一个 `kw`，没有 `kwInput` —— 下一个人看到妆师端有两级，
           别以为这里漏了（理由就是上面这两行）。
     ⚠️ 判据只认昵称和城市（`matchArtist`），⛔ 不搜风格词：
        搜索框的 placeholder 写的也是这两样，两处必须同口径。 */
  onKwInput(e) {
    this.setData({ kw: e.detail.value })
    this.apply()
  },

  /* 点右上角「搜索」：开 / 收那个输入框。
     🔴 收起的时候【一定把词清掉】—— 框都收了还留着筛选，症状是
        「列表里只有一位，而屏幕上没有任何地方写着为什么」，顾客会以为数据丢了。
        （规矩 25 的近亲：看得见的列表必须能被看得见的状态解释。）
     ⚠️ 两件事一次说完：`open` 和 `kw` 在同一个 setData 里 ——
        分两次的话中间那一刻是「框收了、词还在」，虽然只闪一帧，但没理由冒这个险。 */
  toggleSearch() {
    const open = !this.data.open
    this.setData({ open, kw: '' })
    this.apply()
  },

  /* 点一行 → 她的妆位页。⚠️ 用 catchtap 会挡住卡片自己的手势，
     用 bindtap 就够 —— 这一行上没有别的可点元素（⛔ 尤其别再挂一颗
     「查看」：那就是「看着是可点的键、其实靠冒泡」那个形状，README §3.5 第 21 条）。 */
  goArtist(e) {
    wx.navigateTo({
      url: '/pages/landing/landing?artist_id=' + e.currentTarget.dataset.id
    })
  }
})
