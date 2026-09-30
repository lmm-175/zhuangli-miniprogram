const ROLE_KEY = 'zhuangli_role'   // 'artist'（妆师）| 'guest'（约妆）
const SHARE_KEY = 'zhuangli_share_ticket'

const { initCloud } = require('./utils/cloud')

App({
  // ════════════════════════════════════════════════════════════════
  // 📌 2026-09-30（第十九处）：这里原先写着「M0 是纯前端假数据的试提审包，
  //    ⛔ 不开云开发、不调 wx.login、不请求任何接口」——**那句话已经不成立了**，
  //    所以整段重写，⛔ 别照着旧版改回去。
  //
  // 现在的事实（分两半，别混）：
  //   ① **页面数据仍然是纯前端假数据**：所有档期 / 预约单 / 妆位 / 妆娘资料
  //      都来自本机 storage（播种自 mock/data.js）。这一点**没变**，
  //      不调 wx.login、不拉远端列表，审核员看到的和真落库一样。
  //   ② **只有一个例外：问题反馈**。用户当场定的原话是「点击确认反馈
  //      就能把反馈发到小程序开发那」⇒ 选的是「现在就接云开发（真发送）」。
  //      所以只要云环境配好了，这一条是会真的写到云数据库里去的。
  //
  // 🔴 云环境 ID 由 utils/cloud.js 一个常量持有。**没配也照样能启动**：
  //    initCloud() 会返回 false 并且**什么都不做**（⛔ 不拿一个假环境去
  //    wx.cloud.init，那会在控制台刷一片报错，还会让人以为云通了）。
  //    反馈那一条会当场出声说没发出去（utils/feedbackStore.js），
  //    ⛔ 永远不会出现「按了确认、屏幕上什么都没发生」。
  //    ⚠️ 提审前必须把环境 ID 填上（README §6 有那几步）。
  // ════════════════════════════════════════════════════════════════
  onLaunch() {
    initCloud()
  },

  /**
   * 群转发信息（shareTicket）：
   * 页面开启 wx.showShareMenu({ withShareTicket: true }) 后，
   * 转发卡片在群聊被他人打开时，此处 options.shareTicket 会带值。
   * M0 只把 shareTicket 留存，并调 wx.getShareInfo 示意拿到转发信息
   * （返回 encryptedData / iv，解密需登录态 openid，M1 在服务端做）。
   */
  onShow(options) {
    if (!options || !options.shareTicket) return
    wx.setStorageSync(SHARE_KEY, options.shareTicket)
    if (wx.getShareInfo) {
      wx.getShareInfo({
        shareTicket: options.shareTicket,
        success: (res) => {
          // res.encryptedData / res.iv —— M1 拿 openid 后服务端解密获取群信息。
          // M0 纯前端只确认链路能通，不落库原始密文。
          console.log('getShareInfo ok', res.errMsg)
        },
        fail: () => {}
      })
    }
  },

  globalData: {
    // 本次会话当前身份；持久化走 storage（ROLE_KEY）。
    role: wx.getStorageSync(ROLE_KEY) || ''
  },

  /** 设定身份并持久化。role ∈ {artist, guest} */
  setRole(role) {
    this.globalData.role = role
    wx.setStorageSync(ROLE_KEY, role)
  },

  /** 当前身份；未选择时返回 ''。 */
  getRole() {
    const r = this.globalData.role || wx.getStorageSync(ROLE_KEY) || ''
    this.globalData.role = r
    return r
  }
})
