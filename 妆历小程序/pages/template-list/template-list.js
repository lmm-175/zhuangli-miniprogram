const { getTemplates, removeTemplate, templateToSchedule } = require('../../utils/templateStore')
const { addSchedule, newId: newScheduleId } = require('../../utils/scheduleStore')
const { getNavMetrics, fabBounds, clampFab, fabHome } = require('../../utils/navbar')

const FAB_KEY = 'zhuangli_fab_tpl'   // 圆钮被拖到哪儿了，下次进来还在那儿
const FAB_MARGIN = 20                // px，初始位置离屏幕边留一点，别贴着
const FAB_RATIO = 0.15               // 圆钮直径 ≈ 屏宽的 15%（375px 屏上约 56px）
const DRAG_SLOP = 6                  // px，手指动过这么多才算「拖」，否则算「点」

function today() {
  const d = new Date()
  const p = (n) => (n < 10 ? '0' : '') + n
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}

const { shareCard } = require('../../utils/share')
Page({
  onShareAppMessage() { return shareCard(this.artistId) },

  data: {
    templates: [],
    today: '',           // 「应用」时打开日期选择器的默认值 —— 默认就是今天
    // 可拖动的圆形「＋」。xy 是 px —— 拖动是物理位移，不能用 rpx。
    // ready 用来挡住首帧：不然圆钮会先闪现在 (0,0)，那正好是导航栏左上角。
    fab: { x: 0, y: 0, size: 56, ready: false }
  },

  onLoad() {
    this.setData({ today: today() })
    const nm = getNavMetrics()
    const box = fabBounds(nm)
    const size = Math.round(nm.winW * FAB_RATIO)

    // 存过就还用存的那个位置。⚠️ 存下来的是【绝对坐标】，换机型 / 转过屏之后
    // 可能已经越界（或者跑到导航栏底下），所以取出来先夹一遍再上屏。
    let saved = null
    try { saved = wx.getStorageSync(FAB_KEY) } catch (e) {}
    const pos = (saved && typeof saved.x === 'number' && typeof saved.y === 'number')
      ? clampFab(saved.x, saved.y, size, box)
      : fabHome(size, FAB_MARGIN, box)

    this._box = box   // 拖动时每帧都要用，别每次重算
    this.setData({ fab: { x: pos.x, y: pos.y, size, ready: true } })
  },

  onShow() {
    // 从 storage 读模板（含「存为模板」录入的档期）
    const templates = getTemplates().map((t) => ({
      ...t,
      // 兼容两种时段结构：新建的 start–end；示例的 time
      slotLabels: t.slots.map((s) => (s.start ? s.start + ' – ' + s.end : s.time))
    }))
    this.setData({ templates })
  },

  /* ── 圆形「＋」：点 = 新建模板，拖 = 换地方 ───────────────────────────
     同一个元素上两种手势，靠 DRAG_SLOP 分：动过就算拖，没动过才算点。
     所以这里【不挂 bindtap】—— 挂上的话，拖完松手会顺手把页面也带进
     新建模板，那是最烦人的一种误触。 */
  onFabStart(e) {
    const t = e.touches[0]
    this._drag = {
      sx: t.clientX, sy: t.clientY,      // 手指按下时的位置
      ox: this.data.fab.x, oy: this.data.fab.y,   // 圆钮按下时的位置
      x: this.data.fab.x, y: this.data.fab.y,     // 最后一次夹完的位置（松手时存这个）
      moved: false
    }
  },

  onFabMove(e) {
    const d = this._drag
    if (!d) return
    const t = e.touches[0]
    const dx = t.clientX - d.sx
    const dy = t.clientY - d.sy
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > DRAG_SLOP) d.moved = true

    const p = clampFab(d.ox + dx, d.oy + dy, this.data.fab.size, this._box)
    d.x = p.x
    d.y = p.y
    // 位置没变就不 setData —— 贴着边继续拖的时候，每帧发一次全是白发的
    if (p.x !== this.data.fab.x || p.y !== this.data.fab.y) {
      this.setData({ 'fab.x': p.x, 'fab.y': p.y })
    }
  },

  onFabEnd() {
    const d = this._drag
    this._drag = null
    if (!d) return
    if (!d.moved) {
      // 判定是「点」的话，把抖动带出来的那几个像素推回去 ——
      // 拖动是每帧跟手的（这样起手没有死区），可「点」不该让圆钮蹭歪一点点。
      if (d.x !== d.ox || d.y !== d.oy) this.setData({ 'fab.x': d.ox, 'fab.y': d.oy })
      this.goNew()
      return
    }
    try { wx.setStorageSync(FAB_KEY, { x: d.x, y: d.y }) } catch (e) {}
  },

  /* ── 「应用」= 当场把模板存成一条档期（相当于保存，不经过新建页）──────

     日期必须先问一句：同一条模板不同日子都用，日期猜不得。微信的原生
     picker【只能由用户点开，不能程序化打开】，所以这里让「应用」这个键
     本身就是一个 <picker mode="date"> —— 点它 → 选日期 → 确认时这里收到
     e.detail.value（= 选中的日期）。用户点取消则什么都不发生，正是想要的。

     生成完直接进详情页：妆娘要的是「立刻看到整套妆位表，能改时间、能插
     妆位」，而不是回到列表里再自己找一遍。 */
  apply(e) {
    const id = e.currentTarget.dataset.id
    const date = (e.detail && e.detail.value) || this.data.today
    const tpl = getTemplates().filter((t) => t.template_id === id)[0]
    if (!tpl) {
      wx.showToast({ title: '这个模板已经没了', icon: 'none', duration: 1800 })
      return
    }
    if (!tpl.slots || !tpl.slots.length) {
      wx.showToast({ title: '这个模板里还没有妆位', icon: 'none', duration: 1800 })
      return
    }

    // 日期选完了，再问一句这场叫什么（2026-09-30 用户定的：漫展名要能改）。
    // ⚠️ 同一个模板会套到【不同的漫展】上，名字不能锁死在模板里 ——
    //    模板名只是个预填值（editable 模式下 content 就是输入框的初值），
    //    想改直接改，不改点「生成档期」就还是模板名。
    wx.showModal({
      title: '这一场叫什么',
      editable: true,
      placeholderText: '漫展名',
      content: tpl.name || '',
      confirmText: '生成档期',
      cancelText: '返回',
      success: (res) => {
        if (!res.confirm) return
        this.create(tpl, date, res.content)
      }
    })
  },

  /* 真正落库 + 走人。名字没填 / 只打了空格 = 没改，templateStore 会回落到
     模板名（那种"传进来的名字优先、但空串不算数"的判断只有那一处实现）。 */
  create(tpl, date, name) {
    const s = templateToSchedule(tpl, date, newScheduleId(), name)
    addSchedule(s)
    wx.showToast({ title: '已生成档期', icon: 'success', duration: 1000 })
    const url = '/pages/schedule-detail/schedule-detail?id=' + s.schedule_id
    setTimeout(() => wx.navigateTo({ url: url }), 1000)
  },

  /* 删除模板（真删 storage）。 */
  del(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除模板',
      content: '删除后无法恢复，确定删除这个模板吗？',
      confirmText: '删除',
      confirmColor: '#D54941',
      success: (res) => {
        if (res.confirm) {
          removeTemplate(id)
          this.onShow()
          wx.showToast({ title: '已删除', icon: 'none', duration: 1200 })
        }
      }
    })
  },

  /* 新建模板：进「新建模板」模式（与「新建档期」分开，名称不重合） */
  goNew() {
    wx.navigateTo({ url: '/pages/schedule-edit/schedule-edit?mode=template' })
  }
})
