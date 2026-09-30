/**
 * 档期详情 · 妆师端 —— 妆位时段表。
 *
 * 时间规则全在 utils/schedule.js 里（纯函数、有 node 断言），这一层只负责：
 *   ① 把「这一行发生了什么」翻译成给用户看的一句话；
 *   ② 需要用户拍板的地方弹一下（缩短午休前妆位要不要提前午休、删已预订妆位……）。
 * 页面自己【不重算时间】—— 一处算错就会跟别处对不上。
 *
 * 午休在列表里是【独立一行】（浅蓝），能改起点+时长、能取消。
 * 「＋」在每一行下面：把新妆位塞进这一行之后的空档，后面妆位时间一律不动。
 */
const { getSchedule, updateSchedule } = require('../../utils/scheduleStore')
const {
  toMin, toHHMM, buildRows, markBooked, shiftSlot, adjustLunch, removeLunch,
  removeSlot, insertSlot, scheduleRange, lunchMovable
} = require('../../utils/schedule')
const { bookedSeqsOfSchedule } = require('../../utils/bookingStore')

/* M0：「已预订」由假预约单推导。
   ⚠️ 判定口径【不在这里】，在 utils/bookingStore.js 的 BOOKED_STATUS ——
      同一件事还被落地页的可约标记、提交时的并发校验读着，只能有一处实现。
      2026-09-29 起 done 也算「有人了」：做完了的妆位不能当空位再约给别人。
   M1：slots.booked 字段直接带出来，这一行整块删掉。 */

/* 「＋」默认插多长 = 【这个档期自己的妆位时长】，不是写死的 30 分钟。
   妆娘当天要补一个跟别的妆位同时长的妆位（很常见：临时多一位客人），
   插进来还得手动改时长就很别扭。套用模板生成的档期会把模板的妆位时长
   带过来，所以这里读到什么就用什么。
   ⚠️ 只在档期没记时长时才落到兜底值，别拿兜底值去覆盖已有的设置。 */
const INSERT_FALLBACK_MIN = 30

Page({
  data: {
    s: null,
    rows: [],            // 混合行：妆位 + 午休（见 buildRows）
    rangeText: '',
    editingKey: '',      // '' = 没有行在编辑；'s3' / 'L'
    editMin: '',
    editStart: '',       // 只有午休用
    justInserted: false  // 刚用「＋」插进来的那一行：点「取消」= 撤销插入
  },

  onLoad(options) {
    const id = options.id || ''
    const s = getSchedule(id)
    if (!s) {
      wx.showToast({ title: '档期不存在', icon: 'none', duration: 1500 })
      setTimeout(() => wx.navigateBack({ delta: 1 }), 1200)
      return
    }
    s.slots = markBooked(s.slots, bookedSeqsOfSchedule(s))
    updateSchedule(s)
    this.setData({ s })
    this.render()
  },

  /* ── 渲染 ───────────────────────────────────────────────── */

  /* 只重画行视图；要一起改编辑态就把字段塞进 extra */
  render(extra) {
    const s = this.data.s
    const patch = { rows: buildRows(s.slots, s.lunch), rangeText: scheduleRange(s.slots) }
    if (extra) for (const k in extra) patch[k] = extra[k]
    this.setData(patch)
  },

  /* 落库 + 重画。slots / lunch 一律整份换掉，不做局部改 */
  commit(slots, lunch, extra) {
    const s = this.data.s
    s.slots = slots
    s.lunch = lunch
    updateSchedule(s)
    this.render(extra)
  },

  rowByKey(key) {
    const rows = this.data.rows
    for (let i = 0; i < rows.length; i++) if (rows[i].key === key) return rows[i]
    return null
  },

  /* ── 行内编辑：点「改」→ 该行【原位置】展开输入，不新增行、整行不位移 ── */

  onEdit(e) {
    const key = e.currentTarget.dataset.key
    const row = this.rowByKey(key)
    if (!row) return
    const patch = { editingKey: key, editMin: String(row.minutes), justInserted: false }
    if (row.type === 'lunch') patch.editStart = row.start
    this.setData(patch)
  },

  onEditInput(e) { this.setData({ editMin: e.detail.value }) },
  onEditStart(e) { this.setData({ editStart: e.detail.value }) },

  /* 编辑态点「取消」。刚插进来的那一行 → 取消 = 把这次插入撤回 */
  cancelEdit() {
    if (this.data.justInserted) {
      const row = this.rowByKey(this.data.editingKey)
      if (row && row.type === 'slot') {
        const s = this.data.s
        const r = removeSlot(s.slots, row.seq, s.lunch)
        this.commit(r.slots, r.lunch, { editingKey: '', justInserted: false })
        wx.showToast({ title: '已撤销插入', icon: 'none', duration: 1200 })
        return
      }
    }
    this.setData({ editingKey: '', justInserted: false })
  },

  /* ── 确认改【妆位】时长 ── */

  confirmEdit() {
    const s = this.data.s
    const row = this.rowByKey(this.data.editingKey)
    if (!row || row.type !== 'slot') return

    const m = Number(this.data.editMin)
    if (!(m > 0)) {
      wx.showToast({ title: '时长要大于 0 分钟', icon: 'none', duration: 1500 })
      return
    }
    const seq = row.seq
    const delta = m - row.minutes
    if (delta === 0) { this.setData({ editingKey: '', justInserted: false }); return }

    const lunch = s.lunch
    const beforeLunch = !!(lunch && lunch.enabled && seq <= lunch.afterSeq)
    // 午休这会儿到底动得了动不了 —— 中间隔着已预订妆位就动不了（见 utils/schedule.js）
    const canMoveLunch = lunchMovable(s.slots, seq, lunch)

    // 缩短 + 在午休前面 → 问一句要不要把午休一起提前（用户拍板，不替他决定）
    // ⚠️ 只在午休【动得了】的时候问。隔着已预订妆位的活，顺延到它就得停，
    //    午休压根动不了 —— 弹一个做不到的确认框，比不弹更糟。
    if (beforeLunch && delta < 0 && canMoveLunch) {
      wx.hideKeyboard()
      wx.showModal({
        title: '要提前午休吗？',
        content: '这个妆位缩短 ' + (-delta) + ' 分钟。\n\n确认 → 午休起止一起提前 ' + (-delta) + ' 分钟。\n取消 → 午休留在原地，中间多出一段空档。',
        confirmText: '提前午休',
        cancelText: '午休不动',
        success: (res) => this.applyShift(seq, m, res.confirm ? 'follow' : 'pin')
      })
      return
    }

    // 延长 + 在午休前面 → 只推午休起始。推过头会把午休整个吃掉，先问
    if (beforeLunch && delta > 0 && canMoveLunch) {
      const newStart = toMin(lunch.start) + delta
      if (newStart >= toMin(lunch.end)) {
        wx.hideKeyboard()
        wx.showModal({
          title: '午休会被挤没',
          content: '这样改，午休开始时间会推迟到 ' + toHHMM(newStart) + '，已经不早于午休结束的 ' + lunch.end + ' 了。\n\n确认后午休会被取消。',
          confirmText: '确认并取消午休',
          cancelText: '返回改小',
          success: (res) => { if (res.confirm) this.applyShift(seq, m, 'squeeze') }
        })
        return
      }
      this.applyShift(seq, m, 'squeeze')
      return
    }

    this.applyShift(seq, m, 'pin')
  },

  applyShift(seq, m, lunchMode) {
    const s = this.data.s
    const lunchOn = !!(s.lunch && s.lunch.enabled)
    const beforeLunch = lunchOn && seq <= s.lunch.afterSeq
    const moveLunch = lunchMovable(s.slots, seq, s.lunch)

    const r = shiftSlot(s.slots, seq, m, s.gapMin, s.lunch, lunchMode)
    this.commit(r.slots, r.lunch, { editingKey: '', justInserted: false })

    if (r.lunchRemoved) {
      wx.showToast({ title: '已改：午休被挤掉，已取消午休', icon: 'none', duration: 2200 })
    } else if (r.collision) {
      wx.showToast({ title: '已改，但顶到了已预订的妆位，请手动调一下', icon: 'none', duration: 2400 })
    } else if (beforeLunch && !moveLunch) {
      // 中间隔着已预订的妆位：顺延到它就停了，午休也就跟着停
      wx.showToast({ title: '已改，中间隔着已预订的妆位，午休没动', icon: 'none', duration: 2400 })
    } else if (beforeLunch && lunchMode === 'pin') {
      wx.showToast({ title: '已改，午休没动', icon: 'none', duration: 1500 })
    } else {
      wx.showToast({ title: '已改，后面时段已顺延', icon: 'none', duration: 1500 })
    }
  },

  /* ── 午休：改起点 + 时长 ── */

  confirmLunch() {
    const row = this.rowByKey(this.data.editingKey)
    if (!row || row.type !== 'lunch') return

    const m = Number(this.data.editMin)
    if (!(m > 0)) {
      wx.showToast({ title: '午休时长要大于 0 分钟', icon: 'none', duration: 1500 })
      return
    }
    const s = this.data.s
    const r = adjustLunch(s.slots, s.lunch, toMin(this.data.editStart), m, s.gapMin)
    this.commit(r.slots, r.lunch, { editingKey: '' })
    wx.showToast({
      title: r.collision ? '已改，但顶到了已预订的妆位，请手动调一下' : '午休已改，后面时段已顺延',
      icon: 'none',
      duration: r.collision ? 2400 : 1500
    })
  },

  /* ── 取消午休：只拿掉午休，后面妆位时间一律不动 ── */

  cancelLunch() {
    const s = this.data.s
    wx.hideKeyboard()
    wx.showModal({
      title: '取消午休',
      content: '只把午休这一段拿掉，后面妆位的时间一律不动，中间会留下一段空档。',
      confirmText: '确认取消',
      cancelText: '返回',
      success: (res) => {
        if (!res.confirm) return
        this.commit(s.slots, removeLunch(s.lunch), { editingKey: '' })
        wx.showToast({ title: '午休已取消', icon: 'none', duration: 1500 })
      }
    })
  },

  /* ── 取消（删除）妆位：后面妆位时间一律不动，只重排序号 ── */

  cancelSlot(e) {
    const seq = Number(e.currentTarget.dataset.seq)
    const s = this.data.s
    if (s.slots.length <= 1) {
      wx.showToast({ title: '至少保留一个妆位', icon: 'none', duration: 1500 })
      return
    }
    const slot = s.slots[seq - 1] || {}
    wx.hideKeyboard()
    wx.showModal({
      title: '取消第 ' + seq + ' 个妆位',
      content: (slot.booked ? '⚠️ 这个妆位已经有客人预订了，取消前先跟客人说一声。\n\n' : '')
        + '只拿掉这一个，后面妆位的时间一律不动，序号顺次重排，中间留下一段空档。',
      confirmText: '确认取消',
      cancelText: '返回',
      success: (res) => {
        if (!res.confirm) return
        const r = removeSlot(s.slots, seq, s.lunch)
        this.commit(r.slots, r.lunch, { editingKey: '', justInserted: false })
        wx.showToast({
          title: r.lunchRemoved ? '已取消妆位，午休已一并取消' : '已取消，后面妆位时间没动',
          icon: 'none',
          duration: r.lunchRemoved ? 2200 : 1600
        })
      }
    })
  },

  /* ── 「＋」：在这一行下面插一个妆位。只塞进已有空档，后面时间一律不动 ── */

  onInsert(e) {
    const key = e.currentTarget.dataset.key
    const s = this.data.s
    const rows = this.data.rows
    let i = -1
    for (let k = 0; k < rows.length; k++) if (rows[k].key === key) i = k
    if (i < 0) return

    const row = rows[i]
    const gap = Number(s.gapMin) || 10
    const isLunch = row.type === 'lunch'

    // 新妆位从这一行结束之后开始；午休那行则是从午休结束开始
    const startMin = toMin(row.end) + (isLunch ? 0 : gap)
    // 插到第几个妆位之后。插在午休后面 = 插在午休前那个妆位之后（序号不变）
    const afterSeq = isLunch ? s.lunch.afterSeq : row.seq
    // 这一行下面紧挨着就是午休行 → 新妆位要挡在午休【前面】。
    // 光看序号分不清这种情况，得把「下一行是不是午休」明确告诉 insertSlot，
    // 否则行序会反过来（午休 12:00 排在一个 10:30 的新妆位前面）。
    const lunchNext = !isLunch && !!(rows[i + 1] && rows[i + 1].type === 'lunch')

    const next = rows[i + 1] || null
    const avail = next ? toMin(next.start) - startMin : Infinity
    if (avail <= 0) {
      wx.showToast({
        title: next ? '这里没有空档：下一个妆位 ' + next.start + ' 就开始了' : '这里插不进去',
        icon: 'none',
        duration: 2400
      })
      return
    }

    // 想插的和档期自己的妆位一样长；塞不下就按空档来
    const wantMin = Number(s.slotMin) > 0 ? Number(s.slotMin) : INSERT_FALLBACK_MIN
    const m = Math.min(wantMin, avail)
    const r = insertSlot(s.slots, afterSeq, startMin, m, s.lunch, lunchNext)
    this.commit(r.slots, r.lunch, {
      editingKey: 's' + (afterSeq + 1),
      editMin: String(m),
      justInserted: true
    })
    wx.showToast({
      title: avail < wantMin ? '这里最多能放 ' + avail + ' 分钟' : '已插入 ' + m + ' 分钟的妆位',
      icon: 'none',
      duration: 2000
    })
  },

  /* ⛔ 这一页【不再有】「取消这一场」。
     2026-09-30 用户定的：整场的取消挪到【档期列表卡片】上（漫展名右边）。
     连带删掉的：data.leaving、只被它调用的 goBack()、scheduleStore.cancelSchedule
     这个 import，以及 wxml 底栏那一整块。

     ⚠️ 为什么不是「修好它」而是「删掉它」：真机上它是这一页唯一一个
        「点了完全没反应」的键。它的代码路径上有一句 wx.hideKeyboard() ——
        会打断当前触摸序列，紧跟的 showModal 在部分基础库上被整个吃掉
        （README 第 20 条）。既然入口本来就要挪走，就不留第二处了。
     ⚠️ 这一页自己的 wx.hideKeyboard()【留着是对的】：这页真有输入框
        （改时长的那个 .min-ip），那几处调用前键盘可能真开着。
        判据不是「习惯性先收键盘」，而是「这一页此刻有没有可能开着键盘」。 */
})
