const { SCHEDULE, SLOTS } = require('../../mock/data')
const { getArtist } = require('../../utils/artistStore')
const { getContact } = require('../../utils/contact')
const { TOAST } = require('../../utils/toast')

Page({
  data: {
    /* ⛔ artist 里没有 wechat_id，也不会有 —— 见 utils/contact.js。
       ⚠️ 2026-09-30（第十七处）：数据源从 `mock/data.js` 的 ARTIST_PUBLIC
          换成 artistStore.getArtist()。决定 2 说的是「资料改动要同步给顾客看」，
          而这一页就是**顾客看的那一页**（提审截图 ②）—— 妆娘改了昵称/城市/风格，
          这里必须跟着变。字段名一个字没改，所以 wxml 那段 `{{artist.xxx}}` 照旧。
       ⚠️ 初值只给个能渲染的空壳，真数据在 onShow 里灌 —— 理由见下面 onShow。 */
    artist: { nickname: '', city: '', style_text: '', intro: '', avatar_color: 'rose' },
    // ⛔ 微信号只能落在这个字段里，来源只能是 getContact()
    contact: {},
    schedule: SCHEDULE,
    slots: SLOTS,
    copied: false
  },

  /* ⚠️ 必须在 onShow 里读，⛔ 不能写进 data 的初值（`artist: getArtist()`）。
     小程序的页面模块【只求值一次】然后被缓存：第二次进这一页时，
     data 初值还是第一次那一份 —— 妆娘改了资料，顾客这边纹丝不动，
     而且没有任何报错。这正是「同步」那条决定最容易假实现的地方。
     ⚠️ onShow 也覆盖了「从填写页退回来」这条路径（不必是 onLoad）。 */
  onShow() {
    this.setData({ artist: getArtist() })
  },

  onLoad(options) {
    const artistId = options.artist_id || 'demo'

    // 🔴 这一行就是「微信号唯一出口」的落地处。
    //    M1 换成：
    //      wx.cloud.callFunction({ name: 'showContact', data: { artistId } })
    //        .then(res => this.setData({ contact: res.result || {} }))
    //    注意：切换「展示微信号」开关后，这里要重新拉一次。
    const contact = getContact(artistId)
    this.setData({ contact })
  },

  /**
   * §9.4 #8 · 复制微信号（M0 里唯一一个「真功能」）。
   * 停留原页不跳转，按钮短暂变「已复制」再复原。
   * ⛔ 不要做「跳去微信」的引导弹窗 —— 小程序无法唤起微信加好友，那是死路。
   */
  copyWechat() {
    if (!this.data.contact.wechat_id) return
    wx.setClipboardData({
      data: this.data.contact.wechat_id,
      success: () => {
        // 系统自己会弹一个「内容已复制」，先收掉，换成我们定死的文案
        wx.hideToast()
        wx.showToast({ title: TOAST.WECHAT_COPIED, icon: 'none', duration: 1500 })
        this.setData({ copied: true })
        setTimeout(() => this.setData({ copied: false }), 1500)
      },
      fail: () => {
        wx.showToast({ title: TOAST.WECHAT_COPIED, icon: 'none', duration: 1500 })
      }
    })
  },

  /** §9.4 #9 / #10 · 本文件最关键的两个元素，必须是真跳转 */
  pickSlot(e) {
    wx.navigateTo({
      url: '/pages/booking-form/booking-form?slot_id=' + e.currentTarget.dataset.id
    })
  },

  /** §9.4 #7 · 我的预约。落地页是顾客端，去约妆端「我的预约」。
       ⛔ 空态里绝不放「浏览化妆师」按钮。 */
  goMyBookings() {
    wx.navigateTo({ url: '/pages/guest-bookings/guest-bookings' })
  }

  /* ⛔ 本页不实现 onShareTimeline —— 见 pages/schedule-edit 里的说明。
     顾客把落地页转到朋友圈，别人点开会进「小程序单页模式」：
     路由 API 全禁用 + 无登录态，【选这个妆位】点不动。
     真要朋友圈，得单独做一个「单页模式展示版」落地页。M0 不做。 */
})
