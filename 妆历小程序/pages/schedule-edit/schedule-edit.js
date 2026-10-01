const { generateSlots, buildSlotsView, scheduleRange, toMin, toHHMM } = require('../../utils/schedule')
const { addSchedule, newId: newScheduleId } = require('../../utils/scheduleStore')
const { addTemplate, newId: newTemplateId } = require('../../utils/templateStore')
const { TOAST } = require('../../utils/toast')

function today() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

const { shareCard } = require('../../utils/share')
Page({
  onShareAppMessage() { return shareCard(this.artistId) },

  data: {
    title: '新建档期',
    isTemplate: false,          // false=新建档期 | true=新建模板
    form: {
      name: '示例漫展',
      date: today(),
      startTime: '09:00',
      slotMin: 80,
      gapMin: 10,
      count: 3,
      lunchEnabled: false,
      lunchMin: 60,
      lunchAfter: 2
    },
    lunchAfterIndex: 0,
    lunchOptions: [],   // [{ value: 2, label: '第 2 个妆位之后 · 12:00 起' }] —— 跟妆位数联动
    lunchLabel: '',     // 当前选中项的那行字，picker 里显示它
    preview: [],        // 原始妆位时段
    lunch: null,        // { start, end, min, afterSeq } —— 午休预期起止
    slotsView: [],      // 展示视图（午休以「后接午休」注释附在午休前妆位）
    rangeText: ''
  },

  onLoad(options) {
    const isTemplate = options.mode === 'template'
    // 日期默认【本机今天】（2026-09-30 用户定的），进来就能直接建，想改点一下就行。
    // ⚠️ 这里再刷一遍，不只是靠 data 里那个初值：小程序从后台恢复时
    //    page 模块【不会重新执行】，隔一夜再进来会拿昨天的日期当「今天」。
    this.setData({ isTemplate, title: isTemplate ? '新建模板' : '新建档期', 'form.date': today() })

    /* 🔴 2026-10-02（第二十六处）：这里原来有一句
       `wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage'] })`，
       **整块删了** —— 它不是「开启转发」的开关（转发按钮出不出现只看
       本页有没有定义 `onShareAppMessage`，本页现在走 utils/share.js 的
       shareCard，见规矩 41），它开的那个 `withShareTicket` 也只是把群标识
       塞给 app.js 去 `console.log`（那段也一起删了）。留着它等于让
       《隐私保护指引》多申报一条实际没人用的数据。 */

    this.refreshPreview()
  },

  onInput(e) {
    const k = e.currentTarget.dataset.k
    this.setData({ ['form.' + k]: e.detail.value })
    if (k !== 'name') this.refreshPreview()
  },

  onDate(e) { this.setData({ 'form.date': e.detail.value }) },

  onStartTime(e) {
    this.setData({ 'form.startTime': e.detail.value })
    this.refreshPreview()
  },

  toggleLunch() {
    this.setData({ 'form.lunchEnabled': !this.data.form.lunchEnabled })
    this.refreshPreview()
  },

  onLunchAfter(e) {
    const opt = this.data.lunchOptions[Number(e.detail.value)]
    if (!opt) return
    this.setData({ 'form.lunchAfter': opt.value })
    this.refreshPreview()
  },

  refreshPreview() {
    const f = this.data.form
    const gap = Number(f.gapMin) || 0
    // 「妆位数」清空时输入框里是 ''，别让它把预览打成 0 个妆位
    const count = Math.max(1, Math.floor(Number(f.count)) || 1)

    // 先按「没有午休」生成一遍，只为拿到每个妆位的结束时间 ——
    // 午休的选项要列出【真实的几点开始】，用户才知道自己选的是哪个时间。
    const bare = generateSlots({
      startTime: f.startTime, slotMin: f.slotMin, gapMin: f.gapMin,
      count, lunch: { enabled: false }
    })
    const lunchOptions = bare.slots.map((s) => ({
      value: s.seq,
      label: '第 ' + s.seq + ' 个妆位之后 · ' + toHHMM(toMin(s.end) + gap) + ' 起'
    }))

    // ⚠️ 关键一处：把「在第几号后」夹进 1..妆位数。
    //    不夹的话，选到超过妆位数的值（原来那个写死的 1..8 列表很容易选到），
    //    generateSlots 里 `i === afterSeq` 就永远不成立 → 午休【整个不生成】：
    //    预览里那行预期时间直接消失（看着像"没生效"），而且保存下去的是一条
    //    start/end 为空的废午休记录，详情页 toMin('') 会算出 NaN。
    //    夹住之后，长休息就能落在【任意一个妆位后面】，包括最后一个。
    let after = Math.floor(Number(f.lunchAfter)) || 1
    if (after > count) after = count
    if (after < 1) after = 1

    const { slots, lunch } = generateSlots({
      startTime: f.startTime,
      slotMin: f.slotMin,
      gapMin: f.gapMin,
      count,
      lunch: { enabled: f.lunchEnabled, min: f.lunchMin, afterSeq: after }
    })

    const idx = lunchOptions.length ? Math.max(0, lunchOptions.findIndex((o) => o.value === after)) : 0
    const patch = {
      preview: slots,
      lunch,
      slotsView: buildSlotsView(slots, lunch, f.gapMin),
      rangeText: scheduleRange(slots),
      lunchOptions,
      lunchAfterIndex: idx,
      lunchLabel: lunchOptions[idx] ? lunchOptions[idx].label : ''
    }
    // 只在真的被夹过时才写回 form —— picker 不是正在输入的框，不会跳光标
    if (after !== Number(f.lunchAfter)) patch['form.lunchAfter'] = after
    this.setData(patch)
  },

  /* 把当前 form 转成要保存的 lunch（含预期起止，供详情页展示） */
  buildLunchRecord() {
    const f = this.data.form
    const afterSeq = Number(f.lunchAfter) || 1
    // 兜底：开关开着、但午休没算出来（理论上夹过之后不会发生）→ 存成「没有午休」，
    // 绝不写一条 start/end 为空的记录出去，那会让详情页算出 NaN。
    if (!f.lunchEnabled || !this.data.lunch) {
      return { enabled: false, min: Number(f.lunchMin), afterSeq }
    }
    return {
      enabled: true,
      min: Number(f.lunchMin),
      afterSeq,
      start: this.data.lunch.start,
      end: this.data.lunch.end
    }
  },

  /* 攒一条模板记录。⚠️ 除了名称和妆位，slotMin / gapMin / lunch 也必须一起存 ——
     模板页的「应用」是拿它【当场生成一条档期】，少存一样，应用出来的档期就
     会丢掉午休、妆位时长也只能靠猜。这是之前真丢过的东西。 */
  buildTemplateRecord(name, slots) {
    const f = this.data.form
    return {
      template_id: newTemplateId(),
      name: name,
      slots: slots,
      updated: today(),
      startTime: f.startTime,
      slotMin: Number(f.slotMin),
      gapMin: Number(f.gapMin),
      lunch: this.buildLunchRecord()
    }
  },

  validate() {
    const f = this.data.form
    if (!f.name) { wx.showToast({ title: '请填写名称', icon: 'none', duration: 1500 }); return false }
    if (!(Number(f.count) > 0)) { wx.showToast({ title: '妆位数需大于 0', icon: 'none', duration: 1500 }); return false }
    return true
  },

  onSave() {
    if (!this.validate()) return
    const f = this.data.form
    // ⚠️ 存【预览里的那一份】，不再拿 form 重算一遍 ——
    //    重算的入参已经和 refreshPreview 夹过的不一样了（比如妆位数空着时
    //    预览按 1 个、重算按默认 3 个），存下去就会跟用户看到的对不上。
    const slots = JSON.parse(JSON.stringify(this.data.preview || []))

    if (this.data.isTemplate) {
      addTemplate(this.buildTemplateRecord(f.name, slots))
      wx.showToast({ title: '模板已保存', icon: 'success', duration: 1200 })
      setTimeout(() => wx.navigateTo({ url: '/pages/template-list/template-list' }), 1200)
    } else {
      addSchedule({
        schedule_id: newScheduleId(),
        name: f.name,
        date: f.date,
        startTime: f.startTime,
        slotMin: Number(f.slotMin),
        gapMin: Number(f.gapMin),
        count: slots.length,          // 以实际存下来的妆位数为准
        lunch: this.buildLunchRecord(),
        slots
      })
      wx.showToast({ title: TOAST.SCHEDULE_SAVED, icon: 'success', duration: 1200 })
      setTimeout(() => wx.switchTab({ url: '/pages/schedule/schedule' }), 1200)
    }
  },

  /* 新建档期页的「存为模板」：把当前档期录入模板列表 */
  onSaveTemplate() {
    if (!this.validate()) return
    const f = this.data.form
    const slots = JSON.parse(JSON.stringify(this.data.preview || []))
    addTemplate(this.buildTemplateRecord(f.name, slots))
    wx.showToast({ title: '已存为模板', icon: 'success', duration: 1200 })
    setTimeout(() => wx.navigateTo({ url: '/pages/template-list/template-list' }), 1200)
  },

  goBack() {
    wx.navigateBack({
      delta: 1,
      fail() { wx.switchTab({ url: '/pages/schedule/schedule' }) }
    })
  }
})
