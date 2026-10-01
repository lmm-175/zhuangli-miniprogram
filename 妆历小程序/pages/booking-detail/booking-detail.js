const { getBookings, getBooking, updateBooking } = require('../../utils/bookingStore')

const STATUS_TEXT = {
  pending: '待处理',
  confirmed: '已确认',
  done: '已完成',
  // 顾客点了「申请取消」，等妆娘表态。妆位到妆娘点头前【一直占着】。
  cancel_requested: '顾客申请取消',
  rejected: '已拒绝',
  cancelled: '已取消'
}

/* 每个动作只允许从哪个状态出发。跟 booking-detail.wxml 里底栏那几个 wx:if
   一一对应 —— 两边同时存在不是冗余：wxml 管「画不画这个键」，
   这里管「点了算不算数」。

   ⚠️ 取消是【两步】，不是一步（2026-09-29 用户定的）：
       顾客自己点「申请取消」→ 状态变 cancel_requested
       → 妆娘在【这里】点「同意取消」才算真取消（cancelled + 妆位释放），
         或者点「不同意」把它按回 confirmed。
       ⛔ 已确认状态下【没有】那个「妆娘替她取消」的键了 ——
          顾客没开口，妆娘不该替她做这个决定。 */
const ALLOW = {
  confirm: 'pending',
  reject: 'pending',
  done: 'confirmed',
  agreeCancel: 'cancel_requested',   // 同意取消 → cancelled，妆位空出来
  rejectCancel: 'cancel_requested'   // 不同意 → 按回 confirmed，妆位继续占着
}

const { shareCard } = require('../../utils/share')
Page({
  onShareAppMessage() { return shareCard(this.artistId) },

  data: {
    b: null,
    statusText: '',
    // '' = 没在退回；否则就是底栏那行灰字（「已确认，正在退回…」这种）。
    // 一旦是话，底栏就【只剩这一行】—— 见 mark() 里的说明
    leaving: ''
  },

  onLoad(options) {
    const id = options.id || 'bk-1'
    const b = getBooking(id) || getBookings()[0]
    // 联系方式只在详情页、且请求者是该单化妆师时可见（§11 高风险字段）。
    // M0 假数据只有这一个妆娘，直接展开；M1 由 getBookingDetail 校验。
    this.setData({ b, statusText: STATUS_TEXT[b.status] || b.status })
  },

  /* 定金标记：妆娘收款后翻转。真功能（本地状态）。
     ⚠️ 改完要 Toast —— 这一下会解锁「标记已完成」，不吭声的话
        用户不知道那个灰按钮为什么突然能点了。 */
  toggleDeposit() {
    const b = this.data.b
    const next = updateBooking(b.booking_id, { deposit_paid: !b.deposit_paid })
    if (!next) return
    this.setData({ 'b.deposit_paid': next.deposit_paid })
    wx.showToast({
      title: next.deposit_paid ? '已标记定金已付' : '已撤销定金已付',
      icon: 'none',
      duration: 1400
    })
  },

  /* 复制顾客微信号 —— 妆娘要主动去加她（§8.2 联系方式方向反转）。 */
  copyWechat() {
    const w = this.data.b.wechat
    if (!w) return
    wx.setClipboardData({
      data: w,
      success: () => {
        wx.hideToast()
        wx.showToast({ title: '已复制，去加她微信', icon: 'none', duration: 1500 })
      }
    })
  },

  /* 状态动作（M0 为前端 mock：toast + 改本地状态）。M1 落库。 */
  mark(e) {
    const act = e.currentTarget.dataset.act
    const id = this.data.b.booking_id

    /* 每个动作先看这一单【现在】是什么状态。
       底栏的按钮本来就是按状态画的，走不到不匹配的分支 —— 这一层是防
       「代码路径」而不是防用户的：
       ⛔ 没有它，一个已完成的单被 UI 之外的调用点碰一下就会被拉回已确认，
          而且是来回跳（再点确认又变已完成），状态没有出口。 */
    if (ALLOW[act] !== this.data.b.status) return

    /* 「标记已确认」→ 【立刻退回列表】，不留在这一页。
       ⚠️ 为什么非退不可：这一屏确认完，底栏马上会换成「标记已完成」——
          两个键长在同一个位置上，手抖一下就把客人的单标成已完成了。
          退回列表之后要再动它，得重新点进来，中间隔了一次「选择」。
       leaving 是给那一瞬间兜底的：万一退回慢半拍，也绝不渲染出「标记已完成」。 */
    if (act === 'confirm') {
      updateBooking(id, { status: 'confirmed' })
      this.setData({ 'b.status': 'confirmed', statusText: STATUS_TEXT.confirmed, leaving: '已确认，正在退回…' })
      wx.showToast({ title: '已确认，已退回列表', icon: 'none', duration: 1500 })
      this.goBack()
      return
    }

    /* 「同意取消」（2026-09-29 改成两步里的第二步）—— 顾客自己申请过取消，
       妆娘现在点头。
       ⚠️ 走的是 cancelled 而不是把记录删掉（用户定的）：妆位【照样空出来】，
          但这一单留在「已取消」Tab 里 —— 调研里 60% 的妆娘经常被跑单，
          删掉记录等于把她唯一的凭据也删了。
       ⚠️ 必须先弹一下确认：这一下把客人的位置真的拿掉了，而且她人不在现场。
          误触之后妆娘要自己再去微信上跟人解释。
       ⚠️ 和「标记已确认」一样做完【立刻退回列表】—— 理由同上面那条：
          底栏一换键，手抖就点错。 */
    if (act === 'agreeCancel') {
      wx.showModal({
        title: '同意顾客取消',
        content: '确认后这一单移入「已取消」，妆位空出来可以约给别人。',
        confirmText: '同意取消',
        cancelText: '再想想',
        confirmColor: '#D54941',
        success: (res) => {
          if (!res.confirm) return
          updateBooking(id, { status: 'cancelled' })
          this.setData({
            'b.status': 'cancelled',
            statusText: STATUS_TEXT.cancelled,
            leaving: '已取消，正在退回…'
          })
          wx.showToast({ title: '已取消，妆位空出来了', icon: 'none', duration: 1500 })
          this.goBack()
        }
      })
      return
    }

    /* 「不同意，继续保留」—— 妆娘没答应退，这一单【原样按回已确认】。
       ⚠️ 妆位从头到尾没动过（cancel_requested 一直占着），所以这里
          除了状态什么都没改。⛔ 不要写成「重新占位」—— 那会多占一次。
       ⚠️ 不弹确认框：这个动作是可逆的（顾客还能再申请一次），
          代价只是她得再说一遍。为它加一次点击不值得。 */
    if (act === 'rejectCancel') {
      updateBooking(id, { status: 'confirmed' })
      this.setData({ 'b.status': 'confirmed', statusText: STATUS_TEXT.confirmed })
      wx.showToast({ title: '已保留这一单', icon: 'none', duration: 1500 })
      return
    }

    /* 「标记已完成」需要定金已付。按钮平时就是灰的，这里再挡一道 ——
       灰按钮拦不住代码路径，而脏状态的代价是「已完成的单还欠着定金」。 */
    if (act === 'done') {
      if (!this.data.b.deposit_paid) {
        wx.showToast({ title: '定金未付，先去标定金', icon: 'none', duration: 1800 })
        return
      }
      updateBooking(id, { status: 'done' })
      this.setData({ 'b.status': 'done', statusText: STATUS_TEXT.done })
      wx.showToast({ title: '已标记为已完成', icon: 'none', duration: 1500 })
      return
    }

    if (act === 'reject') {
      updateBooking(id, { status: 'rejected' })
      this.setData({ 'b.status': 'rejected', statusText: STATUS_TEXT.rejected })
      wx.showToast({ title: '已拒绝，妆位已释放', icon: 'none', duration: 1500 })
    }
  },

  goBack() {
    wx.navigateBack({
      delta: 1,
      fail() { wx.switchTab({ url: '/pages/booking/booking' }) }
    })
  }
})
