/**
 * 「我的」（约妆端）· 约妆端 tabBar 第 2 格（2026-10-01 第二十一处新增）。
 *
 * 🔴 这一页是**用户点名要的**，原话：
 *    「用户端预约过的妆娘是一个页面，我的是一个页面，你懂吗，
 *      不要放在同一个页面里面」
 *    —— 原先这两块挤在约妆首页（`pages/guest-home/`）的上下两段里。
 *    改法不是「把两段分开画」，是**给约妆端一条和妆师端一样的底部条**：
 *    第 1 格「我约过的妆娘」（`pages/artist-list/`）、第 2 格就是这一页。
 *    两块内容各回各页 —— 规矩 37：搬家，⛔ 不是复制一份。
 *    于是 `pages/guest-home/` 整页退役（⛔ 别把它加回来：首页那两段
 *    正是被投诉的形状）。
 *
 * ⚠️ 顾客**没有「资料」这个东西**（妆历里没有顾客账号，只有她提交过的单），
 *    所以这一页⛔ 不照抄妆师端「我的」那张头像卡 ——
 *    妆娘才是要维护昵称/城市/风格/简介的那个人，她的那张卡在 `pages/mine/`。
 *    抄过来只会得到一张永远不填的空白资料卡。
 *
 * ⚠️ 两行都必须**真的跳得动**：第十四处那两行「有响应、但不跳页面」
 *    （只弹 toast）就是这个项目栽过的地方，README 第 14 / 26 条。
 */
const { syncTabBar } = require('../../utils/tabbar')

Page({
  onShow() {
    // 第一行就把底部那条点亮（本页是约妆端第 2 格）—— 见 utils/tabbar.js
    syncTabBar(this)
  },

  /* 我的预约。
     ⚠️ 它是一个**普通页**（不是 tab）：底部条上属于它的位置是第 2 格「我的」，
        进去看单子再退回来，这是层次，⛔ 不是「同一个东西的两处入口」。 */
  goMyBookings() {
    wx.navigateTo({ url: '/pages/guest-bookings/guest-bookings' })
  },

  /* 切换身份 → 回到角色选择。
     ⚠️ 走 navigateTo，和妆师端 `pages/mine/mine.js` 那条**逐字一样**（规矩 11）：
        role-select 是普通页，在那边选完了会用 `wx.switchTab` 换掉整条底部条。 */
  switchRole() {
    wx.navigateTo({ url: '/pages/role-select/role-select' })
  }
})
