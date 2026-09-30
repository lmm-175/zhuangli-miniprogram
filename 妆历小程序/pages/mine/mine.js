const { ARTIST_PUBLIC } = require('../../mock/data')

Page({
  data: {
    artist: ARTIST_PUBLIC
  },

  // 「我的资料」只读页。⛔ 别在这里又改成弹 toast —— 那正是这次要修的病。
  goProfile() {
    wx.navigateTo({ url: '/pages/my-profile/my-profile' })
  },

  // 「我的作品」空态页（M0 一页空态，没有上传入口）
  goWorks() {
    wx.navigateTo({ url: '/pages/my-works/my-works' })
  },

  // §9.4 #6 的落点页 → 壳 4
  goSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' })
  },

  goAbout() {
    wx.showModal({ title: '妆历', content: '版本 0.1.0', showCancel: false, confirmText: '知道了' })
  },

  // 切换身份：回到角色选择（约妆 / 妆师）
  switchRole() {
    wx.navigateTo({ url: '/pages/role-select/role-select' })
  }
})
