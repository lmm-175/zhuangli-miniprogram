const app = getApp()

Page({
  data: {
    lastRole: '',
    lastLabel: ''
  },

  onShow() {
    // 提示上次身份，方便一键续用 / 切换
    const r = app.getRole()
    this.setData({
      lastRole: r,
      lastLabel: r === 'artist' ? '妆师' : (r === 'guest' ? '约妆' : '')
    })
  },

  /* 我是妆师 → 妆师端 tabBar 第 1 位「档期」。
     ⛔ 工作台页已取消（2026-09-29 真机调试决定）：它是纯聚合页，
        新建在「档期」、设置在「我的」、待处理在「预约单」Tab，没有独有内容。 */
  chooseArtist() {
    app.setRole('artist')
    wx.switchTab({ url: '/pages/schedule/schedule' })
  },

  /* 我是约妆 → 约妆端首页（非 tab 页，redirectTo 换掉入口页避免返回栈堆积） */
  chooseGuest() {
    app.setRole('guest')
    wx.redirectTo({ url: '/pages/guest-home/guest-home' })
  }
})
