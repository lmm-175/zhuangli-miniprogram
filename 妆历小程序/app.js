const ROLE_KEY = 'zhuangli_role'   // 'artist'（妆师）| 'guest'（约妆）
const SHARE_KEY = 'zhuangli_share_ticket'

App({
  // ════════════════════════════════════════════════════════════════
  // M0 是「纯前端假数据」的试提审包：
  //   ⛔ 不开云开发、不调 wx.login、不请求任何接口。
  //   所有页面的数据全部来自 /mock/data.js 的常量。
  //
  // 这样做的理由：M0 要回答的是「个人主体 + 这套形态能不能过审」，
  // 不是技术验证 —— 审核员看到的和真落库完全一样（§9.5 本来就要求
  // 全部用「示例」数据）。省下的时间用来把可点元素做扎实。
  //
  // M1 把这一行换成：wx.cloud.init({ env: '<云环境 ID>', traceUser: true })
  // ════════════════════════════════════════════════════════════════
  onLaunch() {},

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
