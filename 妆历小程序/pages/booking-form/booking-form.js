const {
  SCHEDULE, SLOTS,
  EYE_TYPES, SKIN_TYPES, GENDERS,
  STYLE_GROUPS, EXTRA_SERVICES
} = require('../../mock/data')
const { TOAST } = require('../../utils/toast')

const initToggle = (arr) => arr.map((name) => ({ name, on: false }))

Page({
  data: {
    slotText: '',
    mode: 'user',              // 'user' 顾客自填 | 'artist' 妆师代填
    title: '填写预约单',
    // cn 排最前 —— 它是「这个人是谁」，其余都是她的条件（2026-09-29 加）
    form: { cn: '', role: '', wechat: '', phone: '', note: '' },
    // ── 档案层（多选 / 单选）──
    eyeTypes: [],
    skinTypes: [],
    genders: [],
    isMinor: false,
    guardian: false,
    // ── 每次层 ──
    styleGroups: [],
    extras: []
  },

  onLoad(options) {
    const slotId = options.slot_id || ''
    const slot = SLOTS.filter((s) => s.slot_id === slotId)[0] || SLOTS[1]

    const mode = options.mode === 'artist' ? 'artist' : 'user'

    // 示例预填（跟 mock 预约单 bk-1 对齐，审核员一键可提交）。
    // 真字段，可改可清空。
    const eyeTypes = initToggle(EYE_TYPES)
    const skinTypes = initToggle(SKIN_TYPES)
    const genders = initToggle(GENDERS)
    const mark = (arr, keys) => arr.forEach((x) => { if (keys.indexOf(x.name) >= 0) x.on = true })
    mark(eyeTypes, ['双眼皮', '肿眼泡'])
    mark(skinTypes, ['油皮', '敏感肌'])
    mark(genders, ['女'])

    const styleGroups = STYLE_GROUPS.map((g) => ({
      group: g.group,
      items: g.items.map((name) => ({ name, on: false }))
    }))
    // 预选前两项目标（建模感 / 浓系）
    if (styleGroups[0]) styleGroups[0].items[0].on = true
    if (styleGroups[2]) styleGroups[2].items[0].on = true

    this.setData({
      mode,
      title: mode === 'artist' ? '新建预约单（代填）' : '填写预约单',
      slotText: SCHEDULE.name + ' · 第 ' + slot.seq + ' 位 · ' + slot.time,
      form: {
        cn: mode === 'artist' ? '' : '千夏',
        role: mode === 'artist' ? '' : '示例角色',
        wechat: 'demo_guest', phone: '', note: ''
      },
      eyeTypes, skinTypes, genders, styleGroups,
      extras: EXTRA_SERVICES.map((s) => ({ ...s, on: false }))
    })
  },

  onInput(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value })
  },

  toggleMulti(e) {
    const key = e.currentTarget.dataset.k   // eyeTypes / skinTypes / styleGroups / extras
    const i = e.currentTarget.dataset.i
    const j = e.currentTarget.dataset.j
    if (key === 'styleGroups') {
      this.setData({ ['styleGroups[' + i + '].items[' + j + '].on']: !this.data.styleGroups[i].items[j].on })
    } else {
      this.setData({ [key + '[' + i + '].on']: !this.data[key][i].on })
    }
  },

  selectSingle(e) {
    const i = e.currentTarget.dataset.i
    const arr = this.data.genders.map((g, idx) => ({ name: g.name, on: idx === i }))
    this.setData({ genders: arr })
  },

  toggleMinor() {
    this.setData({ isMinor: !this.data.isMinor })
  },

  toggleGuardian() {
    this.setData({ guardian: !this.data.guardian })
  },

  /**
   * 提交。
   * M0 是纯前端假成功：给反馈 + 离开本页。
   * ⚠️ 不能写「功能开发中」那类文案（红线 10）。
   * M1 若改成真写库：角色名 / 备注就是落库的 UGC，
   *   按微信要求要先过 security.msgSecCheck，否则审核不过。
   */
  onSubmit() {
    const f = this.data.form
    /* ⚠️ CN 单独报一次，不并进下面那句「请填写角色名和微信号」（2026-09-29 加）：
       它是妆娘认人的唯一凭据，缺了整张单一文不值 —— 并在一起报的话，
       用户会以为「那我一并补上就行」，而不是「这个最要紧」。
       ⚠️ 顺序也是 CN 在先：它决定提示先说哪一个。 */
    if (!f.cn) {
      wx.showToast({ title: TOAST.NEED_CN, icon: 'none', duration: 1800 })
      return
    }
    if (!f.role || !f.wechat) {
      wx.showToast({ title: TOAST.NEED_ROLE_AND_WECHAT, icon: 'none', duration: 1500 })
      return
    }
    // §5.6：未成年 → 必勾「已得到监护人允许」，否则不能提交
    if (this.data.isMinor && !this.data.guardian) {
      wx.showToast({ title: TOAST.NEED_GUARDIAN, icon: 'none', duration: 1800 })
      return
    }

    /* ── 订阅消息位置和时机就留在这里 ── M0 不实现，M1 插入
         wx.requestSubscribeMessage({ tmplIds: ['<预约提醒模板 ID>'] })
           .catch(() => {})   // 43101 = 额度耗尽，属正常，不阻断提交 */

    wx.showToast({ title: TOAST.BOOKING_SUBMITTED, icon: 'none', duration: 1800 })
    setTimeout(() => {
      if (this.data.mode === 'artist') {
        // 妆师代填完 → 回到妆师端预约单列表
        wx.navigateBack({ delta: 1, fail() { wx.switchTab({ url: '/pages/booking/booking' }) } })
      } else {
        // 顾客填完 → 我的预约（约妆端）
        wx.redirectTo({ url: '/pages/guest-bookings/guest-bookings' })
      }
    }, 1800)
  }
})
