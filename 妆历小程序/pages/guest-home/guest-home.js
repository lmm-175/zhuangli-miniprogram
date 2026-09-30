const { SCHEDULE, SLOTS } = require('../../mock/data')
const { getArtist } = require('../../utils/artistStore')

Page({
  data: {
    /* ⚠️ 2026-09-30（第十七处）：数据源从 ARTIST_PUBLIC 换成 getArtist() ——
       顾客端这两页（guest-home / landing）看到的必须是妆娘**改过之后**的资料。
       ⚠️ 初值是个能渲染的空壳，真数据在 onShow 里灌（理由见 onShow）。 */
    artist: { nickname: '', city: '', style_text: '', intro: '', initial: '妆' },
    schedule: SCHEDULE,
    slots: SLOTS
  },

  /* ⚠️ 读真数据必须在 onShow，⛔ 不能写进 data 初值 ——
     页面模块只求值一次然后被缓存，写进初值的话第二次进来还是第一份，
     妆娘改了资料这里不跟着变，且完全不报错。 */
  onShow() {
    this.setData({ artist: getArtist() })
  },

  /* 进入示例妆位页（分享落地页） */
  goLanding() {
    wx.navigateTo({ url: '/pages/landing/landing?artist_id=demo' })
  },

  /* 我的预约 */
  goMyBookings() {
    wx.navigateTo({ url: '/pages/guest-bookings/guest-bookings' })
  },

  /* 切换身份 → 回到角色选择 */
  switchRole() {
    wx.redirectTo({ url: '/pages/role-select/role-select' })
  }
})
