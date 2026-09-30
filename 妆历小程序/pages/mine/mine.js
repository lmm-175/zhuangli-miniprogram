const { getArtist } = require('../../utils/artistStore')

Page({
  data: {
    /* ⚠️ 2026-09-30（第十七处）：数据源从 ARTIST_PUBLIC 换成 getArtist()。
       这一页那张卡片原来把头像首字**写死成「示」**，改了昵称它也不动 ——
       现在 `{{artist.initial}}` 由 store 从昵称算（一处实现，⛔ 不各页 slice 一遍）。
       ⚠️ 初值是个能渲染的空壳，真数据在 onShow 里灌（理由见 onShow）。 */
    artist: { nickname: '', city: '', style_text: '', intro: '', initial: '妆' }
  },

  /* ⚠️ 读真数据必须在 onShow，⛔ 不能写进 data 初值 ——
     页面模块只求值一次然后被缓存，写进初值的话第二次进来还是第一份。
     ⚠️ 这一页尤其需要 onShow：她改完资料是**退回这一页**的
     （my-profile 的返回键 / 底部 Tab），不重读就还是旧名字。 */
  onShow() {
    this.setData({ artist: getArtist() })
  },

  // ⛔ 别在这里又改成弹 toast —— 那正是第十四处要修的病（缺的是落点页）。
  goProfile() {
    wx.navigateTo({ url: '/pages/my-profile/my-profile' })
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
