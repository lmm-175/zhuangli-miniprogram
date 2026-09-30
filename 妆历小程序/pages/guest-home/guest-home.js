const { ARTIST_PUBLIC, SCHEDULE, SLOTS } = require('../../mock/data')

Page({
  data: {
    artist: ARTIST_PUBLIC,
    schedule: SCHEDULE,
    slots: SLOTS
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
