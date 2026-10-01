/* ⚠️ 2026-09-30（第十七处）：原来这里是 `require('../../mock/data').BOOKINGS`，
   绕开了 utils/bookingStore 那一整层 —— 也就是「统一读入口」这句话当时只对了一半。
   改走 getBookings()（行为零变化：过滤条件没动，过滤的还是同一批单）。
   🔴 为什么必须改：妆师端「代填」现在会**新建**单子。只要有一处页面自己
      require 了那份数组，就随时可能演成「妆师端和顾客端读两份不同的单」——
      那正是 bookingStore.js 开头那段注释反复警告的事。
   ⚠️ 过滤条件 `created_by === 'user'` 一个字没改：代填出来的单是 'artist'，
      本来就不该出现在顾客的「我的预约」里。
   🔴 2026-10-01（第二十四处）：这个过滤条件本身搬进 `bookingStore.isMine()` 了
      —— C1 上那颗金色「已预约」读的是同一个判断。⛔ 别在这儿再写一遍字面量。
   ⚠️ 这是本次改动**唯一**碰到用户端的一处（用户 2026-09-29 说过「我目前只查
      妆娘端的问题，等会查用户端的」—— 所以这里只改数据来源，不动任何行为）。 */
const { getBookings, statusText, isMine } = require('../../utils/bookingStore')
const { syncTabBar } = require('../../utils/tabbar')

/* 📌 2026-09-30（第二十处）：这里原来自己写着一份 STATUS_TEXT。
   顾客端多了一页也要显示状态（「我约过的妆娘」的「最近约妆」那一行），
   ⇒ 那份表上提到 utils/bookingStore.js（statusText）。
   ⛔ 别在这儿再抄回来：两页各写一份的下场是同一张单在两处叫两个名字。 */

const { shareCard } = require('../../utils/share')
Page({
  onShareAppMessage() { return shareCard(this.artistId) },

  data: {
    list: []
  },

  onShow() {
    /* 第一行先把底部那条点亮（本页是约妆端第 2 格，2026-10-01 第二轮升格）——
       ⚠️ 必须排在 onShow 最前面：底下那行 `setData({list})` 是这一页的正事，
          但它在 tabBar 这件事上什么都没做（见 utils/tabbar.js）。 */
    syncTabBar(this)

    // 顾客只看自己提交的那几张单（M0 以 created_by === 'user' 近似）。
    // M1 换成按 user_openid 查 booking_form。
    const list = getBookings()
      .filter(isMine)
      .map((b) => ({
        id: b.booking_id,
        event: b.event + ' · ' + b.date,
        slot: '第 ' + b.seq + ' 位 · ' + b.slot_time,
        status: b.status,
        statusText: statusText(b.status)
      }))
    this.setData({ list })
  },

  /* 空态那颗「去找妆位」。
     🔴 2026-10-01（第二十一处第二轮）：**删掉了那句 `wx.navigateBack`**。
        上一版它先退一步（那时这一页还是「我的」的下一层），现在**它就是 tab 2**，
        页面栈里只有 tab 页 —— `navigateBack` 在只有一个 tab 页时**会失败**
        （fail 分支跑 switchTab 兜住，看着能用），可那是「一次注定失败的调用
        + 一句兜底」，中间还可能闪一下。⇒ 直接 `wx.switchTab` 一步到位。
        ⚠️ 同一条教训在 Request N 出现过一次（妆娘本来就在列表页，
           `navigateBack` 会直接跳出小程序）：**先问「这一页现在在哪一层」。**
     ⛔ 别写回 redirectTo 或 navigateTo：tab 页那两个都跳不过去（静默失败）。 */
  goHome() {
    wx.switchTab({ url: '/pages/artist-list/artist-list' })
  }
})
