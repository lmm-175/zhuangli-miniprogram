const { ARTIST_PUBLIC } = require('../../mock/data')
const { TOAST } = require('../../utils/toast')

Page({
  data: {
    artist: ARTIST_PUBLIC
  },

  goProfile() {
    wx.showToast({ title: '昵称：' + this.data.artist.nickname, icon: 'none', duration: 1500 })
  },

  goWorks() {
    wx.showToast({ title: TOAST.NO_WORK, icon: 'none', duration: 1500 })
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
