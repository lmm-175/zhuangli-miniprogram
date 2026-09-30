const { ARTIST_CONTACT } = require('../../mock/data')

Page({
  data: {
    // 初值跟假数据里的 show_wechat 对齐，切换是这个页面唯一的真功能
    showWechat: ARTIST_CONTACT.show_wechat
  },

  toggleWechat() {
    this.setData({ showWechat: !this.data.showWechat })
    // M1：这里要落库（artists.show_wechat），并让 C1 的 getContact() 立刻生效。
    // M0 纯前端，只翻本地状态。
  },

  /**
   * ⚠️ 提审必需项。
   * wx.openPrivacyContract 打开的是微信事后台配置并发布的《用户隐私保护指引》，
   * 不是我们自己画的一页 —— 前提是后台已经配好，否则会 fail。
   * 基础库 2.32.3+ 才有这个 API，老版本走兜底。
   */
  openPrivacy() {
    if (wx.openPrivacyContract) {
      wx.openPrivacyContract({
        fail: () => this.privacyFallback()
      })
    } else {
      this.privacyFallback()
    }
  },

  privacyFallback() {
    wx.showModal({
      title: '用户隐私保护指引',
      content: '可在微信中点击本小程序右上角「···」→「关于妆历」→「用户隐私保护指引」查看完整条款。',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  goAbout() {
    wx.showModal({ title: '妆历', content: '版本 0.1.0', showCancel: false, confirmText: '知道了' })
  }
})
