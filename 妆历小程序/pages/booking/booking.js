const { getBookings, batchButtonsOf, pickableIds, canPick, applyBatch, BATCH,
        belongsToSchedule, isScheduleSettled, matchesKeyword } =
  require('../../utils/bookingStore')
const { getSchedules, getSchedule } = require('../../utils/scheduleStore')

/* 妆娘端预约单列表：四个状态 Tab（方案草案 §4.1 · 预约单列表）。
   status → tab 的映射：
     pending → 待处理    confirmed → 已确认    done → 已完成    rejected/cancelled → 已取消 */
const TABS = [
  { key: 'pending', label: '待处理' },
  { key: 'confirmed', label: '已确认' },
  { key: 'done', label: '已完成' },
  { key: 'closed', label: '已取消' }
]

/* ══ 场次筛选（2026-09-29 加）═══════════════════════════════════════════
   妆娘手上不止一场漫展，四五十张单混在一个列表里没法看。所以上面多一条
   场次下拉条：默认只看【当前这一场】，另有一个「全部」看所有场次。

   ⚠️ 它和下面那四个状态 Tab 是【两个维度】：先挑哪一场，再看这一场里
      待处理 / 已确认 / 已完成 / 已取消各有哪些。两个筛选叠加，不是替代。
   ⚠️ 四个状态【各场互不相通】：选了某一场，四个 Tab 里就只有这一场的单。
      只有「全部」才是跨场的。 */
const ALL = 'all'
const SCHED_KEY = 'zhuangli_bk_sched'   // 上次选的哪一场，下次进来还选它

/* 'YYYY-MM-DD' → 第几天（用于算「离今天多远」）。
   ⚠️ 手算，不 new Date(str)：各平台对 '2026-05-02' 这种短横线格式的解析
      并不一致，而这里只要一个能相减的数。 */
function dayNum(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''))
  if (!m) return null
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000
}

function todayNum() {
  const d = new Date()
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000
}

/* 这场的日期离今天有多远（绝对值）。没日期 / 日期写坏了 → 排到最后。 */
function awayFromToday(date) {
  const v = dayNum(date)
  return v === null ? Number.MAX_SAFE_INTEGER : Math.abs(v - todayNum())
}

/* 场次下拉条上的几项。顺序是用户 2026-09-29 定的：
     ①「全部」永远第一颗
     ② 还没处理完的场次排前面，内部按【离今天多近】从近到远
     ③ 已经全部处理完的场次沉到最后（`sub` 标出来，让她知道为什么在下面）
   ⚠️ 「全部」不是一场档期，是「不筛」—— 它不进排序，永远钉在第一位。 */
function schedChips() {
  const chips = [{ id: ALL, label: '全部', sub: '' }]
  const live = []
  const settled = []
  getSchedules().forEach((s) => (isScheduleSettled(s) ? settled : live).push(s))
  const byNear = (a, b) => awayFromToday(a.date) - awayFromToday(b.date)
  live.sort(byNear)
  settled.sort(byNear)
  live.concat(settled).forEach((s) => {
    chips.push({
      id: s.schedule_id,
      // 只写「05-02」不写「2026-05-02」—— 同一个妆娘的档期绝大概率在同一年，
      // 带上年份会让每一项都长到撑不住。日期本身还是要带着的：
      // 同一个漫展分两天，光看名字分不出来。
      label: s.name + (s.date ? ' · ' + String(s.date).slice(5) : ''),
      sub: isScheduleSettled(s) ? '已处理完' : ''
    })
  })
  return chips
}

/* 进来默认看哪一场：
     · 上次选过的还记得（zhuangli_bk_sched）—— 妆娘连着处理同一场，不用每次重选；
       上次选了「全部」也照样记得
     · 没记录就选【最新建的那一场】—— 她刚建完、刚把链接发出去，多半就在处理它
     · 一场档期都没有 → 只能「全部」（这时下拉条整个不显示，见 wxml）
   ⚠️ 记住的那一场可能已经在别处被删了，取出来要验一下还在不在。 */
function defaultSchedId() {
  const list = getSchedules()
  if (!list.length) return ALL
  const saved = wx.getStorageSync(SCHED_KEY)
  if (saved === ALL) return ALL
  if (saved && list.some((s) => s.schedule_id === saved)) return saved
  let newest = list[0]
  list.forEach((s) => { if (idRank(s.schedule_id) > idRank(newest.schedule_id)) newest = s })
  return newest.schedule_id
}

/* 比新旧用的那个数 = id 末尾连续的几位数字。
     · 自建档期 'sched-<毫秒时间戳>' → 时间戳本身，天然能比大小
     · 示例档期 'sched-demo-0502'    → 502，比任何时间戳都小 → 排在自建的后面
   ⛔ 别直接比字符串：'d' > '1'，那两场示例档期会被当成「最新建的」，
      而它俩恰恰是最老的。 */
function idRank(id) {
  const m = /(\d+)$/.exec(String(id || ''))
  return m ? Number(m[1]) : 0
}

/* 下拉条上那一行字：当前选中的是哪个场次 */
function chipLabel(chips, id) {
  const c = (chips || []).filter((x) => x.id === id)[0]
  return c ? c.label : '全部'
}

/* 面板里列出来的几项。搜漫展名时这个列表跟着缩 ——
   用户说的「点击可在下拉菜单输入漫展场次搜索展子」就是这个。
   ⚠️「全部」在搜索时【也留着】：搜完展子还想退回来看全量，
      要是它被筛没了，她就得先清空关键词才点得回去。
   ⛔ 但它不参与名字匹配 —— 它本来就不是一个展子的名字。 */
function schedOptions(chips, kw) {
  const q = String(kw == null ? '' : kw).trim().toLowerCase()
  if (!q) return chips || []
  return (chips || []).filter((c) => c.id === ALL || c.label.toLowerCase().indexOf(q) >= 0)
}

/* 批量处理完之后跟用户说的一句人话。N 换成单数 */
const RESULT_TEXT = {
  pending: '已确认 N 单，已移入已确认',
  confirm: '已完成 N 单，已移入已完成',
  deposit: '已标记 N 单定金已付'
}

/* 一单落在哪个 Tab 里。
   ⚠️ 「顾客申请取消」的单【留在「已确认」】—— 妆娘还没表态，这单还是确认着的，
      妆位也还占着。它有自己的一行红标，不单独占一个 Tab：
      用户要的是四个状态，多一个 Tab 会让「这一场里各状态有几单」变糊。 */
function inTab(b, key) {
  if (key === 'closed') return b.status === 'rejected' || b.status === 'cancelled'
  if (key === 'confirmed') return b.status === 'confirmed' || b.status === 'cancel_requested'
  return b.status === key
}

Page({
  data: {
    tabs: TABS,
    active: 0,
    rows: [],           // 当前 Tab 的单子（勾选态下每行多一个勾选框）
    // null = 不在勾选态；否则 { mode, picked: { id: true } }
    sel: null,
    selCount: 0,
    selTotal: 0,
    allPicked: false,
    selApply: '',
    footBtns: [],       // 平时的批量入口（没单时是空的）
    pickWarn: '',       // 「这一行勾不上」的那一句，1 秒后自己消失。见 warn()
    schedChips: [],     // 场次下拉条（第一项是「全部」）
    schedId: ALL,       // 当前筛的哪一场；ALL = 不筛
    schedOpen: false,   // 下拉面板展开着没
    /* 搜索是【两级】状态（2026-09-30 用户定的），别合并成一个：
         kwInput —— 输入框里正在打的字。驱动【面板里的场次清单】跟着缩，
                    每敲一个字就重算一次，但【不重建主列表】。
         kw      —— 已提交的关键词（回车或点放大镜）。驱动主列表和 searching。
       合成一个的话，打字打到「千」主列表就开始跨全部场次筛 ——
       她还没输完，列表已经翻过一遍了，而且每个字符重建一次列表纯属白费。
       输入框现在【长在条子上】（永远看得见），所以这两级各自都有落点。 */
    kwInput: '',
    kw: '',             // 搜索关键词（顾客 CN 或 漫展名）
    // 下面几个是 paint() 现算的，放在 data 里只为 wxml 读得到
    schedLabel: '全部',
    schedOptions: [],
    searching: false    // kw 非空 —— 此时【跨全部场次】找
  },

  onShow() {
    // 回到这一页一律【退出勾选态】：勾选态是「当时那一屏」的状态，
    // 离开过就可能过期（别的页面把某单状态改了），留着它迟早误伤。
    // 下拉面板也一并收起来 —— 它是「刚才那一下」的临时态，不该跨页活着。
    this.clearWarn()
    this.setData({ sel: null, pickWarn: '', schedOpen: false, kw: '', kwInput: '' })

    // 下拉条每次进来都重建：档期可能在别的页面新建 / 删掉了
    const chips = schedChips()
    // 首屏用默认值；之后保留用户在这一页自己挑的那一场（他可能是特意切过去的）
    let schedId = this._inited ? this.data.schedId : defaultSchedId()
    // 挑中的那一场没了（在别处被删）→ 退回默认，别停在一个空白列表上
    if (!chips.some((c) => c.id === schedId)) schedId = defaultSchedId()
    this._inited = true

    wx.setStorageSync(SCHED_KEY, schedId)
    this.setData({ schedId: schedId, schedChips: chips })
    this.buildList(this.data.active)
  },

  onHide() {
    // 页面藏起来了，那句提示的定时器就没必要再留着
    this.clearWarn()
  },

  /* 「这一行勾不上」的那一下说一句，1 秒后自己消失。
     ⚠️ 为什么不是行尾常驻一行字：一屏有 3 单未付就是 3 遍「未付定金」，
        那是噪声，而且它把每张卡都撑高了一截。用户 2026-09-29 报的。
        「勾不上」本身已经说明问题，解释只在真去点的时候给一次。
     ⚠️ 为什么不是 Toast：Toast 是屏幕正中一个黑块，离刚点的那一行远，
        而且它盖住列表。这句要贴着底栏浮出来，用户才连得起来。
     ⚠️ 重入要先 clearTimeout：连点两行，第一句的定时器会把第二句提前收走。 */
  warn(msg) {
    this.clearWarn()
    this.setData({ pickWarn: msg })
    this._warnT = setTimeout(() => {
      this._warnT = null
      this.setData({ pickWarn: '' })
    }, 1000)
  },

  clearWarn() {
    if (this._warnT) {
      clearTimeout(this._warnT)
      this._warnT = null
    }
  },

  buildList(i) {
    // ⚠️ dataset 出来的值先转成数字：TABS['2'] 是 undefined，会一路崩到
    //    TABS[active].key 那里去，而且报的是「读不到 key」，看不出跟 dataset 有关。
    const active = Number(i) || 0
    /* 四个 Tab 各自的单子。一次全算出来，切 Tab 就不用再读一遍了。
       ⚠️ 场次筛选在这里就滤掉，不进 _groups —— 后面所有路径（勾选、批量、
          计数）读的都是它，滤在别处迟早有一处漏掉。
       ⚠️ 搜索时【跨全部场次】：妆娘要找的是「千夏在这位妆娘这里的下单记录」，
          那是跨场的一张总账，不能只翻当前这一场。所以 kw 非空就不按场次滤了，
          界面上会写明「搜索中：跨全部场次」。 */
    const kw = this.data.kw
    const allScope = !kw && this.data.schedId !== ALL
    const s = allScope ? getSchedule(this.data.schedId) : null
    this._groups = TABS.map((tab) => getBookings().filter((b) =>
      inTab(b, tab.key) && (!s || belongsToSchedule(b, s)) && matchesKeyword(b, kw)))
    this.setData({ active: active })
    this.paint(active)
  },

  /* 把当前 Tab 的单子摆成「要画的样子」。
     勾选态下每行多两样：勾没勾上（checked）、能不能勾（locked）。
     ⚠️ locked 的行点下去只提示，不改勾选 —— 用户选的是「未付定金的
        直接勾不上」，那就连勾选框都不该亮起来。
     ⚠️ 行里【不带】理由文案：理由只在被点的那一下说一次（warn()）。 */
  paint(active) {
    const sel = this.data.sel
    const cfg = sel ? BATCH[sel.mode] : null
    const raw = (this._groups && this._groups[active]) || []

    const rows = raw.map((b) => ({
      id: b.booking_id,
      event: b.event + ' · ' + b.date,
      // 顾客的圈名。妆娘认人认的是这个，不是角色名（角色每单都不一样）。
      cn: b.cn || '—',
      slot: '第 ' + b.seq + ' 位 · ' + b.slot_time,
      role: b.role,
      // 顾客申请取消 —— 妆娘还没点头，这单还在「已确认」里，但要一眼看得见
      wantCancel: b.status === 'cancel_requested',
      depositPaid: !!b.deposit_paid,
      deposit: b.deposit_paid ? '已付定金' : '未付定金',
      created: b.created_at,
      checked: !!(sel && sel.picked[b.booking_id]),
      locked: !!(sel && !canPick(sel.mode, b))
    }))

    // 「已选」只数勾得上的那些 —— 勾不上的单本来就不该进分母以外的任何地方
    const pickable = pickableIds(raw, sel ? sel.mode : '')
    const selCount = rows.filter((r) => r.checked).length
    const tabKey = TABS[active].key

    this.setData({
      rows: rows,
      selCount: selCount,
      selTotal: rows.length,
      allPicked: pickable.length > 0 && selCount === pickable.length,
      selApply: cfg ? cfg.apply : '',
      footBtns: batchButtonsOf(tabKey, rows.length),
      schedLabel: chipLabel(this.data.schedChips, this.data.schedId),
      // 面板清单跟的是【输入框里正在打的字】，不是已提交的 kw —— 见 data 里的说明
      schedOptions: schedOptions(this.data.schedChips, this.data.kwInput),
      searching: !!this.data.kw
    })
  },

  onTab(e) {
    this.clearWarn()
    this.setData({ sel: null, pickWarn: '', schedOpen: false })
    this.buildList(e.currentTarget.dataset.i)
  },

  /* ── 场次 + 搜索条（2026-09-30 改成一条）──────────────────────────
     用户原话：「把输入框直接和下拉菜单放到一列，用户点击那一列即可输入
     cn/展名，点击图标/回车键进行搜索。点击下拉菜单那个图标时就可以下拉
     菜单选择。」

     一条上从左到右四件：
       [当前场次] [输入框] [▾] [🔍]
     · 输入框【平时空着】—— 场次名单独放左边，搜索框不兼职显示场次名
     · 点 ▾ → 展开场次面板
     · 文本框里打字 → 面板里的场次清单跟着缩（原来那个「在下拉菜单里搜展子」）
     · 回车 / 点 🔍 → 真的搜（跨全部场次找 CN 或漫展名） */
  toggleSched() {
    // 展开时按输入框里现有的字重算一遍清单 —— 上次收起前搜过的话，
    // 再展开还列全量会让人以为「我刚搜的没了」。
    this.setData(this.data.schedOpen
      ? { schedOpen: false }
      : { schedOpen: true, schedOptions: schedOptions(this.data.schedChips, this.data.kwInput) })
  },

  closeSched() {
    this.setData({ schedOpen: false })
  },

  /* 打字：只重算【面板里那份清单】，⛔ 不重建主列表 ——
     主列表只认已提交的 kw（回车 / 放大镜）。每个字符重建一次列表
     既卡又白费，而且她字还没打完列表就翻过一遍了。
     ⚠️ 打字顺手把面板带出来：输入框长在条子上，面板不收起来的话
        她看不到清单在缩，原来那个「在下拉菜单里搜展子」就白留了。 */
  onKwInput(e) {
    const v = e.detail.value
    const patch = { kwInput: v, schedOptions: schedOptions(this.data.schedChips, v) }
    if (!this.data.schedOpen) patch.schedOpen = true
    this.setData(patch)
  },

  /* 回车 / 点放大镜：这一下才真的搜。
     ⚠️ 搜完【必须收起面板】：面板挂在条子下面，盖住的正好是结果第一屏，
        不收的话她搜完看不到任何一单，会以为「没搜着」。
     ⚠️ 退出勾选态：可见的那批单换了一轮，勾上的可能已经不在屏上了。 */
  doSearch() {
    this.clearWarn()
    const q = String(this.data.kwInput == null ? '' : this.data.kwInput).trim()
    // 回写 kwInput：框里打的要是带空格，得让它显示成真正搜的那个词
    this.setData({ kw: q, kwInput: q, schedOpen: false, sel: null, pickWarn: '' })
    this.buildList(this.data.active)
  },

  clearKw() {
    this.clearWarn()
    this.setData({ kw: '', kwInput: '', sel: null, pickWarn: '' })
    this.buildList(this.data.active)
  },

  /* 挑一场。⚠️ 和切状态 Tab 一样要【退出勾选态】：勾上的那几单
     可能根本不在新选的这一场里，带着它们去执行就是误伤。
     ⚠️ 选了场次就把搜索清掉（两级状态一起清）—— 不然「我刚点了 05-02，
        怎么还是全部的单」会让人莫名其妙。搜索和场次是两种找法，
        同时开着没人说得清哪个优先，输入框里留着上一个词更会让人以为还在筛。 */
  pickSched(e) {
    const id = e.currentTarget.dataset.id
    this.clearWarn()
    wx.setStorageSync(SCHED_KEY, id)
    this.setData({ schedId: id, sel: null, pickWarn: '', schedOpen: false, kw: '', kwInput: '' })
    this.buildList(this.data.active)
  },

  /* 卡片只有这一个手势入口：不在勾选态就进详情，在勾选态就翻勾选。
     ⛔ 不做成两个 bindtap 动态切换 —— 那种写法出错时是【静默】的。 */
  onCard(e) {
    const id = e.currentTarget.dataset.id
    const sel = this.data.sel
    if (!sel) {
      wx.navigateTo({ url: '/pages/booking-detail/booking-detail?id=' + id })
      return
    }
    const row = this.data.rows.filter((r) => r.id === id)[0]
    if (!row) return
    if (row.locked) {
      // 说清楚「为什么勾不上」和「怎么办」，别让它变成一个点不动的死块
      const modeCfg = BATCH[sel.mode]
      this.warn((modeCfg && modeCfg.lockHint) || '这一单现在勾不上')
      return
    }
    const picked = {}
    for (const k in sel.picked) picked[k] = sel.picked[k]
    if (picked[id]) delete picked[id]
    else picked[id] = true
    // 勾上了一行说明用户已经换目标了，那句「为什么勾不上」就没意义了。
    // 连它那个一秒的定时器一起撤掉，不留个空跑的。
    this.clearWarn()
    this.setData({ sel: { mode: sel.mode, picked: picked }, pickWarn: '' })
    this.paint(this.data.active)
  },

  /* 进勾选态 —— 进来就是【全选】，用户再自己取消掉不要的（用户指定的流程）。
     ⚠️ 全选只勾【勾得上】的：在「一键确认」里，未付定金的单不会因为
        「反正默认全选」就混进来。 */
  enterSel(e) {
    const mode = e.currentTarget.dataset.mode
    const raw = (this._groups && this._groups[this.data.active]) || []
    const picked = {}
    pickableIds(raw, mode).forEach((id) => { picked[id] = true })
    this.clearWarn()
    this.setData({ sel: { mode: mode, picked: picked }, pickWarn: '' })
    this.paint(this.data.active)
  },

  toggleAll() {
    const sel = this.data.sel
    if (!sel) return
    const picked = {}
    if (!this.data.allPicked) {
      const raw = (this._groups && this._groups[this.data.active]) || []
      pickableIds(raw, sel.mode).forEach((id) => { picked[id] = true })
    }
    this.clearWarn()
    this.setData({ sel: { mode: sel.mode, picked: picked }, pickWarn: '' })
    this.paint(this.data.active)
  },

  cancelSel() {
    this.clearWarn()
    this.setData({ sel: null, pickWarn: '' })
    this.paint(this.data.active)
  },

  applySel() {
    const sel = this.data.sel
    if (!sel) return
    const ids = Object.keys(sel.picked)
    if (!ids.length) {
      wx.showToast({ title: '先勾选要处理的单', icon: 'none', duration: 1600 })
      return
    }
    const n = applyBatch(sel.mode, ids)
    this.clearWarn()
    this.setData({ sel: null, pickWarn: '' })
    this.buildList(this.data.active)   // 走掉的单从这个 Tab 消失，留下的原地不动

    let msg = RESULT_TEXT[sel.mode].replace('N', n)
    // 少处理了就说出来。⛔ 静默少处理 = 妆娘以为 5 单都动了
    if (n < ids.length) msg += '（' + (ids.length - n) + ' 单状态已变，跳过）'
    wx.showToast({ title: msg, icon: 'none', duration: n < ids.length ? 2600 : 1800 })
  },

  /* 妆师代填（方案草案 §3.3）：线下谈好的客人，妆娘自己录一张单。
     复用顾客填写页，mode=artist。这是单边启动的入口。 */
  goNewArtistForm() {
    wx.navigateTo({ url: '/pages/booking-form/booking-form?mode=artist' })
  }
})
