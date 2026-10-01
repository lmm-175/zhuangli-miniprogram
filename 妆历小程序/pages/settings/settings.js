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

/* 当前是不是妆娘。
   🔴 2026-10-01（第二十一处第二轮）：妆师端和约妆端**共用这一页**
      （用户原话「设置和妆娘端一模一样」）—— 唯一的差别是顶上那个
      「在分享页展示我的微信号」开关**只对妆娘画**（见 wxml）。
      用户原话：「顾客没有展示微信号的开关，顾客不展示」。
   ⚠️ 角色住在 storage（app.js 的 getRole），这里**每次现读**，⛔ 不缓存 ——
      缓存住的话，切完身份再进来会按上一轮的答案画。
   ⚠️ `getApp()` 在这里一定有值（页面 onShow 时 App 已经起来了），
      但那一下 try/catch 留着：真的取不到时回 `false`（＝不画那个开关），
      而「对一个顾客少画一个开关」正是安全的那一边，⛔ 不是反过来。 */
function isArtistRole() {
  let role = ''
  try { role = getApp().getRole() } catch (e) {}
  return role === 'artist'
}

const { shareCard } = require('../../utils/share')
Page({
  onShareAppMessage() { return shareCard(this.artistId) },

  data: {
    // 初值跟假数据里的 show_wechat 对齐，切换是这个页面唯一的真功能
    showWechat: myShowWechat(),
    /* ⚠️ 初值也现算一遍（不只是 onShow 里算）：只在 onShow 里算的话，
       妆娘进来那一下会先画出一个「没有开关」的设置页，再补上。
       ⛔ 也别写死 `true` —— 那就等于把顾客那一边忘了。 */
    isArtist: isArtistRole()
  },

  /* ⚠️ 这一页是**两个角色共用**的，而角色是可以在本页之外变的
      （「我的」→「切换身份」→ 选另一个角色 → `wx.switchTab` 换页，
       整条页面栈会重建，所以正常走不到"这一页还开着但角色变了"）。
      onShow 里再读一次是**便宜且不会错**的那一手 —— 见 isArtistRole 的注释。 */
  onShow() {
    const isArtist = isArtistRole()
    if (isArtist !== this.data.isArtist) this.setData({ isArtist })
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
