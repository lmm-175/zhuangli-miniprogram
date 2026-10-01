const app = getApp()

const { shareCard } = require('../../utils/share')
Page({
  onShareAppMessage() { return shareCard(this.artistId) },

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

  /* 我是约妆 → 约妆端 tab 1「我约过的妆娘」。
     🔴 2026-10-01（第二十一处）：约妆端现在也有底部 tabBar 了（第 1 格
        「我约过的妆娘」、第 2 格「我的」），所以这里和上面那句妆师端一样走
        **switchTab**。⛔ 别再写回 redirectTo —— 它在 tabBar 页上会直接失败，
        而且是**静默**失败（人卡在角色选择页，屏幕上没有一个字）。 */
  chooseGuest() {
    app.setRole('guest')
    wx.switchTab({ url: '/pages/artist-list/artist-list' })
  }
})
