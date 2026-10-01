const { getSchedules, cancelSchedule } = require('../../utils/scheduleStore')
const { scheduleRange } = require('../../utils/schedule')
const { blockingBookings } = require('../../utils/bookingStore')
const { syncTabBar } = require('../../utils/tabbar')

const { shareCard } = require('../../utils/share')
Page({
  onShareAppMessage() { return shareCard(this.artistId) },

  data: {
    schedules: []
  },

  onShow() {
    // 第一行：把底部那条点亮（本页是妆师端第 1 格）。见 utils/tabbar.js
    syncTabBar(this)

    // 从 storage 读妆师自己建好的档期（M1 换成查 schedules 集合）
    const schedules = getSchedules().map((s) => ({
      id: s.schedule_id,
      name: s.name,
      date: s.date,
      count: s.slots.length,
      range: scheduleRange(s.slots),
      /* 「N 人已预约」和拦住她时说的张数【必须是同一个数】。
         ⛔ 不许在卡片这边另算一遍 —— 判据只有 bookingStore.blockingBookings()
            一处实现，各算一遍的结局是「卡片写 3 人、点取消却放行」。
         口径 = 还占着妆位的单（pending / confirmed / done / cancel_requested）；
         已经拒绝 / 已经取消的单不占妆位，也就不该算进「已预约」里。 */
      booked: blockingBookings(s).length
    }))
    this.setData({ schedules })
  },

  // 进入单个档期的时段表（可改特殊妆位时间）
  goDetail(e) {
    wx.navigateTo({ url: '/pages/schedule-detail/schedule-detail?id=' + e.currentTarget.dataset.id })
  },

  goNew() {
    wx.navigateTo({ url: '/pages/schedule-edit/schedule-edit' })
  },

  goTemplates() {
    wx.navigateTo({ url: '/pages/template-list/template-list' })
  },

  /* ══ 取消场次 ═══════════════════════════════════════════════════════
     2026-09-30 用户定的：入口在【档期列表卡片】上，漫展名右边。

     两条路，判据是「这一场还有没有【还占着妆位】的单」：
       · 有 → 拦住，让她先去协商取消预约单；等变成 0 张再来
       · 没有 → 弹二次确认，确认才真取消

     ⚠️ 判据取自 bookingStore.blockingBookings()，也就是 BOOKED_STATUS ——
        【还占着妆位】的单才算数。已拒绝 / 已取消的单不占妆位，
        那几张单不该把妆娘永久锁在这一场里出不去（见那个函数的注释）。

     ⚠️ 拦住那一下用 `showCancel:false`：这不是一个问句，是告诉她「现在还不行」。
        给个取消键她会以为「取消」= 取消场次。 */
  onCancelSchedule(e) {
    const id = e.currentTarget.dataset.id
    const s = getSchedules().filter((x) => x.schedule_id === id)[0]

    /* ⚠️ 兜底必须【出声】。
       原先这里是 `if (!s) { this.onShow(); return }` —— 它把「卡片过期了」
       和「按钮根本没接上」压成完全一样的表现（都是「什么都没发生」），
       那正是查了三轮都在猜、猜错两次的原因（README 第 22 条）。
       任何一条走不通的分支都要留下一点痕迹。 */
    if (!s) {
      wx.showToast({ title: '这一场已经不在了，列表刚刷新', icon: 'none', duration: 1800 })
      this.onShow()
      return
    }

    const busy = blockingBookings(s).length
    if (busy > 0) {
      wx.showModal({
        title: '这一场还有 ' + busy + ' 张预约单',
        content: '要先跟客人协商，把这 ' + busy + ' 张单取消掉，才能取消这一场。\n\n'
          + '客人在她那边申请取消、你点「同意取消」；还没处理的单可以直接拒绝。\n\n'
          + '等这一场的预约单变成 0 张，这里就能取消了。',
        showCancel: false,
        confirmText: '知道了'
      })
      return
    }

    /* 🔴 这条路上【一个字都不许碰 wx.hideKeyboard()】。
       hideKeyboard 会打断当前触摸序列，紧跟其后的 showModal 在部分基础库上
       会被整个吃掉 —— 表现就是「点了一下什么都没有」且不报错（README 第 20 条）。
       ⚠️ 判据不是「习惯性先收键盘」，而是「这一页此刻有没有可能开着键盘」：
          档期列表页没有任何输入框，本来就不该收。自测 ⑧ 有一条断言
          钉死这条路径上 hideKeyboard 的调用次数 = 0。 */
    wx.showModal({
      title: '取消场次？',
      content: s.name + '（' + s.date + '）会从档期列表里消失，客人那边也约不到这一场了。',
      confirmText: '取消场次',
      cancelText: '返回',
      confirmColor: '#D54941',
      success: (res) => {
        if (!res.confirm) return
        cancelSchedule(s.schedule_id)
        wx.showToast({ title: '场次已取消', icon: 'none', duration: 1500 })
        /* 就地重画，⛔ 不 navigateBack —— 她本来就在列表页上，
           退回会直接跳出小程序。 */
        this.onShow()
      }
    })
  }
})
