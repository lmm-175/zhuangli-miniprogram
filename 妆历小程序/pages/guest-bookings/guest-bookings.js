const { BOOKINGS } = require('../../mock/data')

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
    const list = BOOKINGS
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
