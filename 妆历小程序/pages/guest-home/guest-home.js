/* 「我约过的妆娘」这一页叫什么、首页那张卡两行说什么，全在 utils/myArtists.js ——
   那一份同时被 pages/artist-list/ 读着，两处必须是同一个口径（规矩 11 / 25）。 */
const { TITLE, myArtistsBrief } = require('../../utils/myArtists')

Page({
  data: {
    title: TITLE,
    /* ⚠️ 初值是个能渲染的空壳，真数据在 onShow 里灌（理由见 onShow）。
       ⚠️ 键名必须和 myArtistsBrief() 的返回一致，缺了会渲染成空白
          —— 而那正好也是「一位都没约过」的样子，混在一起看不出来。 */
    brief: { count: 0, head: '', sub: '' }
  },

  /* ⚠️ 读真数据必须在 onShow，⛔ 不能写进 data 初值 ——
     页面模块只求值一次然后被缓存，写进初值的话第二次进来还是第一份：
     顾客新提交了一单、妆娘改了状态，这一页都不跟着变，且完全不报错。 */
  onShow() {
    this.setData({ brief: myArtistsBrief() })
  },

  /* 我约过的妆娘列表页。
     📌 2026-09-30（第二十处）：这里原来是
        `wx.navigateTo({ url: '/pages/landing/landing?artist_id=demo' })` ——
        首页替顾客挑好了一位，而且是**写死的 'demo'**。
        现在首页不再代表某一位，落点是列表页，由她自己点进去。
     ⛔ 别把 goLanding 加回来：那等于首页又替她选了一位（用户定的 D6）。 */
  goArtistList() {
    wx.navigateTo({ url: '/pages/artist-list/artist-list' })
  },

  /* 我的预约 */
  goMyBookings() {
    wx.navigateTo({ url: '/pages/guest-bookings/guest-bookings' })
  },

  /* 切换身份 → 回到角色选择 */
  switchRole() {
    wx.redirectTo({ url: '/pages/role-select/role-select' })
  }
})
