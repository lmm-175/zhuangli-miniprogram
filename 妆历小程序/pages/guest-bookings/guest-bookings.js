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
const { getBookings } = require('../../utils/bookingStore')

const STATUS_TEXT = {
  pending: '待处理',
  confirmed: '已确认',
  done: '已完成',
  // 顾客自己申请了取消，等妆娘回话。⚠️ 写「中」不说「已取消」——
  // 她还没退成，妆位也还占着，说成已取消她就直接不去了。
  cancel_requested: '申请取消中',
  rejected: '已拒绝',
  cancelled: '已取消'
}

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
        statusText: STATUS_TEXT[b.status] || b.status
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
