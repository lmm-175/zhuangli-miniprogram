/* 🔴 2026-09-30（第二十处）：这里原来是
   `const { ARTIST_CONTACT } = require('../../mock/data')` + `ARTIST_CONTACT.show_wechat`。
   两件事都不对：
     ① 【违规】页面直接 require ARTIST_CONTACT —— 那个数组的唯一合法消费者是
        utils/contact.js（这一页只要一个布尔，根本不该碰那个数组）；
     ② 【真 bug】同一天 ARTIST_CONTACT 从单对象改成了数组，那一行读到的就成了
        `undefined` ⇒ 开关**恒渲染成「关」**，且不报错、不崩、屏幕上没有一句话
        （自测当时没覆盖到这一页，所以它活到了第二轮）。
   ⇒ 改走 utils/contact.js 的 myShowWechat()：它按 artist_id 查、只回一个布尔。
   ⚠️ 别改回直接读 mock —— 那既违规，又会随数据形状静默失效一次。 */
const { myShowWechat } = require('../../utils/contact')

Page({
  data: {
    // 初值跟假数据里的 show_wechat 对齐，切换是这个页面唯一的真功能
    showWechat: myShowWechat()
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
