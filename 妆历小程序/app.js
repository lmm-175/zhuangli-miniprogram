const ROLE_KEY = 'zhuangli_role'   // 'artist'（妆师）| 'guest'（约妆）

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

  /* 🔴 2026-10-02（第二十六处）：这里原来有一个 `onShow(options)`，干的事是
     把 `options.shareTicket` 存进 storage、再调一次 `wx.getShareInfo`。
     **整块删了**，两个理由：
       ① 它**什么也没做** —— `wx.getShareInfo` 从基础库 2.17.3 起就
          **停止维护**（官方替代 `wx.getGroupEnterInfo`），而且就算成功，
          这里也只有一句 `console.log`，没有任何功能依赖它；
       ② 它**谎报了一件事** —— 那段代码让《隐私保护指引》里必须申报
          「缓存群标识（shareTicket）」，而实际缓存下来没有任何用途。
          用户 2026-10-02 当场说「清」，指引里那条也跟着删了。
     ⚠️ 它和「小程序能不能转发」**毫无关系** —— 转发按钮出不出现只看
        页面有没有定义 `onShareAppMessage`（见 utils/share.js / 规矩 41）。
         当年把它误当成「接入转发代码」写进来，是一处**因果错认**。 */

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
