/* ⚠️ 2026-09-30（第十七处）：原来这里是 `require('../../mock/data').BOOKINGS`，
   绕开了 utils/bookingStore 那一整层 —— 也就是「统一读入口」这句话当时只对了一半。
   改走 getBookings()（行为零变化：过滤条件没动，过滤的还是同一批单）。
   🔴 为什么必须改：妆师端「代填」现在会**新建**单子。只要有一处页面自己
      require 了那份数组，就随时可能演成「妆师端和顾客端读两份不同的单」——
      那正是 bookingStore.js 开头那段注释反复警告的事。
   ⚠️ 过滤条件 `created_by === 'user'` 一个字没改：代填出来的单是 'artist'，
      本来就不该出现在顾客的「我的预约」里。
   ⚠️ 这是本次改动**唯一**碰到用户端的一处（用户 2026-09-29 说过「我目前只查
      妆娘端的问题，等会查用户端的」—— 所以这里只改数据来源，不动任何行为）。 */
const { getBookings, statusText } = require('../../utils/bookingStore')

/* 📌 2026-09-30（第二十处）：这里原来自己写着一份 STATUS_TEXT。
   顾客端多了一页也要显示状态（「我约过的妆娘」的「最近约妆」那一行），
   ⇒ 那份表上提到 utils/bookingStore.js（statusText）。
   ⛔ 别在这儿再抄回来：两页各写一份的下场是同一张单在两处叫两个名字。 */

Page({
  data: {
    list: []
  },

  onShow() {
    // 顾客只看自己提交的那几张单（M0 以 created_by === 'user' 近似）。
    // M1 换成按 user_openid 查 booking_form。
    const list = getBookings()
      .filter((b) => b.created_by === 'user')
      .map((b) => ({
        id: b.booking_id,
        event: b.event + ' · ' + b.date,
        slot: '第 ' + b.seq + ' 位 · ' + b.slot_time,
        status: b.status,
        statusText: statusText(b.status)
      }))
    this.setData({ list })
  },

  goHome() {
    wx.navigateBack({
      delta: 1,
      fail() {
        wx.redirectTo({ url: '/pages/guest-home/guest-home' })
      }
    })
  }
})
