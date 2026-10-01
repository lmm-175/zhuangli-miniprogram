const { bookingsOfArtist, batchButtonsOf, pickableIds, canPick, applyBatch, BATCH,
        belongsToSchedule, isScheduleSettled, matchesKeyword } =
  require('../../utils/bookingStore')
const { getSchedules, getSchedule } = require('../../utils/scheduleStore')
const { getArtist } = require('../../utils/artistStore')
/* 📌 2026-09-30（第二十处）：`dayNum` / `todayNum` / `awayFromToday` 三个
   原先就是这个文件的私有函数，现在【搬到 utils/schedule.js】了 ——
   顾客端妆位页也要「只列今天及以后」+「按离今天多近排」，
   同一件事必须在同一处算（规矩 11）。⛔ 别在这儿再写一份。 */
const { awayFromToday } = require('../../utils/schedule')
const { syncTabBar } = require('../../utils/tabbar')

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
const HIST_KEY = 'zhuangli_bk_hist'     // 搜索历史（2026-09-30 用户要的）
const HIST_MAX = 10                     // 用户原话：「最多容纳十条记录」

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

/* ══ 2026-09-30 删掉了 schedOptions(chips, kw) ══════════════════════
   原先这条条子上是【一个输入框带着两套搜索】，而且范围还不一样：
     · 下拉面板 —— 只匹配场次名（label = 漫展名 · 日期）
     · 主列表   —— 匹配顾客 CN 或漫展名，且【跨全部场次】

   用户报的症状：打一个 CN（「千夏」），面板里一场都对不上 → 清单只剩
   「全部」→ 弹出「没有叫这个名字的展子 / CN」。
   🔴 那句是【假的】：它宣称 CN 也查过了，其实只查了场次名 —— 人明明在，
      它说没有。然后她点放大镜，这回真去查 CN 了，又找到了。
      表现就是「结果对、过程错」，看着像搜索坏了。

   用户 2026-09-30 定的解法（方案 B）：两个控件【彻底拆开】——
     [当前场次][▾] 只管选场次     [输入框][🔍] 只管搜 CN / 漫展名
   打字⛔ 不再碰面板，面板也不再被关键词筛。歧义从根上消失：
   一个输入框只对应一套范围，谁也不会再替谁下结论。

   ⚠️ 代价（已当面跟用户讲明）：他 2026-09-29 定的「点击可在下拉菜单
      输入漫展场次搜索展子」这个功能【没有了】—— 选场次回到纯点选。 */

/* ── 搜索历史（2026-09-30 用户要的）─────────────────────────────────
   用户原话：「点击输入框会显示搜索历史，搜索历史框最多容纳十条记录，
   在搜索历史框里面有一个清空图标，点一下即可清空搜索历史。」
   ⚠️ 去重按【小写】比：搜索本身就是大小写不敏感的（matchesKeyword 也 toLowerCase），
      留着「千夏」「QIANXIA」「qianxia」三条一模一样的记录没有意义。
      但存下来的仍然是【她最后打的那个写法】（所见即所搜）。
   ⚠️ 只存【提交过的】词（回车 / 点放大镜那一下），打字过程中的半截词不进历史 ——
      否则打「千夏」会先存进「千」「千夏」两条。 */
function readHist() {
  const v = wx.getStorageSync(HIST_KEY)
  return Array.isArray(v) ? v : []
}

function pushHist(kw) {
  const q = String(kw == null ? '' : kw).trim()
  if (!q) return readHist()
  const low = q.toLowerCase()
  // 把同一条旧记录摘掉，再把新的插到最前面 —— 重复搜同一个词就是「置顶」
  const rest = readHist().filter((x) => String(x).toLowerCase() !== low)
  const next = [q].concat(rest).slice(0, HIST_MAX)  // 超过上限从尾巴上砍
  wx.setStorageSync(HIST_KEY, next)
  return next
}

function wipeHist() {
  wx.setStorageSync(HIST_KEY, [])
  return []
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

const { shareCard } = require('../../utils/share')
Page({
  onShareAppMessage() { return shareCard(this.artistId) },

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
    schedOpen: false,   // 场次下拉面板展开着没
    // 搜索历史（最多 HIST_MAX 条，最近搜的排最前）。⚠️ 只在她点过输入框时弹出来，
    // 不是常驻 —— 平时这一格是空的，不占屏。
    hist: [],
    histOpen: false,
    /* 搜索是【两级】状态（2026-09-30 用户定的），别合并成一个：
         kwInput —— 输入框里正在打的字。⛔ 它【不驱动任何东西】，就是框里那个字。
                    （方案 B 之前它还负责筛面板里的场次清单，那一套已经拆掉了，
                      见上面删掉 schedOptions() 那段说明。）
         kw      —— 已提交的关键词（回车 / 点放大镜 / 点一条历史）。
                    驱动主列表和 searching。
       合成一个的话，打字打到「千」主列表就开始筛 ——
       她还没输完，列表已经翻过一遍了，而且每个字符重建一次列表纯属白费。 */
    kwInput: '',
    kw: '',             // 搜索关键词（顾客 CN 或 漫展名）
    // 下面几个是 paint() 现算的，放在 data 里只为 wxml 读得到
    schedLabel: '全部',
    // kw 非空。⚠️ 它【不再】表示「跨全部场次」—— 2026-09-30 起搜索跟着
    // 左边选的场次走，两个条件相乘，空态文案也据此分成两种（见 wxml）。
    searching: false
  },

  onShow() {
    // 第一行：把底部那条点亮（本页是妆师端第 2 格）。见 utils/tabbar.js
    syncTabBar(this)

    // 回到这一页一律【退出勾选态】：勾选态是「当时那一屏」的状态，
    // 离开过就可能过期（别的页面把某单状态改了），留着它迟早误伤。
    // 两个下拉面板也一并收起来 —— 它们是「刚才那一下」的临时态，不该跨页活着。
    this.clearWarn()
    this.setData({
      sel: null, pickWarn: '', schedOpen: false, histOpen: false,
      kw: '', kwInput: '',
      // 历史每次进来从 storage 重读，不缓存在 data 里当唯一真相
      hist: readHist()
    })

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
       🔴 2026-09-30 用户改的：搜索【也】按当前场次筛，两个条件【相乘】——
          选「全部」= 这个 CN 在这位妆娘这儿的全部单；
          选某一场 = 只有这一场里这个 CN 的单；没有就是空的。
          ⚠️ 同一轮里 pickSched 也【不再清搜索】了 —— 不清才叠加得起来，
             清了就变成「一挑场次搜索就没了」，正是这一条要的用法反而做不到。
          ⛔ 这段原来写的是「搜索时跨全部场次，所以 kw 非空就不按场次滤」，
             那个做法已按用户要求反过来，连界面上的「搜索中：跨全部场次」一起删。 */
    /* 🔴 2026-09-30（第二十处）：这一行原来是 getBookings()，现在按人滤。
       原因：BOOKINGS 里第一次有了【不是 demo 的单】（顾客端「我约过的妆娘」
       要求每位妆娘都有一条「我约过她」的记录）。
       ⚠️ 上面那段「全部 = 这个 CN 在【这位妆娘】这儿的全部单」——「这位妆娘」
          这一层以前是白写的（只有一位），现在它是真的了。
       🔴 少了这一层什么都不会报错：demo 只是在自己的「已确认」里
          多看见一张【青蓝漫展 · 别人的客人】。
       ⚠️ getArtist() 必须在这里现读、⛔ 不缓存到 data 里 ——
          页面模块只求值一次，妆娘改过昵称/号之后要跟着变（规矩：能变的都走 onShow）。 */
    const kw = this.data.kw
    const allScope = this.data.schedId !== ALL
    const s = allScope ? getSchedule(this.data.schedId) : null
    const mine = bookingsOfArtist(getArtist().artist_id)
    this._groups = TABS.map((tab) => mine.filter((b) =>
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

     一条上从左到右四件，⚠️ 但它们是【两套互不相干】的控件：
       [当前场次][▾] ── 只管选场次，⛔ 不认输入框里的字
       [输入框][🔍] ── 只管搜 CN / 漫展名，⛔ 不碰面板
     2026-09-30 方案 B 之前这两套是【串着的】（打字顺手把面板里的场次清单
     筛一遍），结果同一个框对应两套范围，面板还会替 CN 下一个「没有」的
     假结论。拆开之后一个输入框只对一套范围，见删掉 schedOptions() 那段。 */
  toggleSched() {
    // 两个面板都挂在条子下面同一个位置，同时开着会叠在一起 —— 开这个就关那个
    this.setData({ schedOpen: !this.data.schedOpen, histOpen: false })
  },

  /* 点蒙层：两个面板一起收。⚠️ 它们共用一层蒙层（不同时开），
     ⛔ 别只收 sched —— 那样历史面板点不掉。
     ⚠️ 这里【只有一个】收起入口（原先分开的 closeSched / closeHist 已删）：
        两个都只被蒙层调，留两个必然有一个先烂掉。 */
  closePanels() {
    this.setData({ schedOpen: false, histOpen: false })
  },

  /* ── 搜索历史（2026-09-30 用户要的）────────────────────────────────
     点输入框就弹出来。⚠️ 收起用【蒙层】，⛔ 不用 bindblur ——
     blur 会在「手指落到列表项」之前就触发，把那一项先抽走，结果是点了没反应。
     和场次面板同一套办法（那也是当初踩过的坑）。 */
  onFocus() {
    // 一条历史都没有就什么都不弹（一个空的「搜索历史」框只是噪声）
    // ⚠️ 顺手把 hist 也【当场重读】一遍，⛔ 别只读它算个长度 ——
    //    面板里的内容必须和这次算长度的依据是同一份，不然会出现
    //    「弹出来了但里面是空的」（或者反过来）这种自己跟自己对不上的画面。
    const h = readHist()
    this.setData({ hist: h, histOpen: h.length > 0, schedOpen: false })
  },

  /* 清空搜索历史。用户原话：「点一下即可清空」——
     ⛔ 不弹二次确认：这是她自己手机上的搜索记录，删了不损失任何业务数据。 */
  clearHist() {
    this.setData({ hist: wipeHist(), histOpen: false })
  },

  /* 点一条历史 → 填进框【并立刻搜】。用户 2026-09-30 定的「直接搜」：
     历史本来就是拿来重复用的，再多一步「还得再点下放大镜」没有意义。 */
  pickHist(e) {
    this.applySearch(String(e.currentTarget.dataset.k == null ? '' : e.currentTarget.dataset.k))
  },

  /* 打字：⛔ 什么都不做，就是把字存进 kwInput。
     · 不重建主列表 —— 主列表只认已提交的 kw（回车 / 放大镜）。
       每个字符重建一次列表既卡又白费，而且她字还没打完列表就翻过一遍了。
     · 也⛔ 不再弹面板 / 不再筛面板里的清单（2026-09-30 方案 B）。
       打字只跟「搜索」有关，场次面板只跟「选场次」有关，两件事互不干涉。
     · 一开始打字就把【搜索历史】收起来 —— 她已经在输了，那份清单挡在下面没用。 */
  onKwInput(e) {
    this.setData({ kwInput: e.detail.value, histOpen: false })
  },

  /* 回车 / 点放大镜 —— 这条路走到 applySearch。 */
  doSearch() {
    this.applySearch(String(this.data.kwInput == null ? '' : this.data.kwInput).trim())
  },

  /* ══ 真的搜。回车 / 点放大镜 / 点一条历史，三条路都走这里，
        保证行为一模一样（分开写迟早有一处漏掉）。
     ⚠️ 搜完【必须收起两个面板】：它们都挂在条子下面，盖住的正好是结果第一屏，
        不收的话她搜完看不到任何一单，会以为「没搜着」。
     ⚠️ 退出勾选态：可见的那批单换了一轮，勾上的可能已经不在屏上了。
     ⚠️ 提交时【回写 kwInput】：框里打的要是带空格，得让它显示成真正搜的那个词
        （所见即所搜）。 */
  applySearch(q) {
    this.clearWarn()
    this.setData({
      kw: q, kwInput: q,
      schedOpen: false, histOpen: false, sel: null, pickWarn: '',
      // 空词（把框删光了再搜）不算一次搜索，不进历史
      hist: q ? pushHist(q) : this.data.hist
    })
    this.buildList(this.data.active)
  },

  /* 输入框里那颗 ✕：清掉当前搜索，回到「这一场的全部单」。
     ⚠️ 它【不动搜索历史】—— 那是两件事：✕ 清的是「这一次搜的那个词」，
        历史框里那个垃圾桶图标清的才是「历史记录」本身。 */
  clearKw() {
    this.clearWarn()
    this.setData({ kw: '', kwInput: '', sel: null, pickWarn: '', histOpen: false })
    this.buildList(this.data.active)
  },

  /* 挑一场。⚠️ 和切状态 Tab 一样要【退出勾选态】：勾上的那几单
     可能根本不在新选的这一场里，带着它们去执行就是误伤。
     🔴 2026-09-30 用户改的：选场次【不再清搜索】，两个条件叠加（相乘）。
        用户原话：「搜 CN 时如果点击全部可以展示这个 cn 约过的预约单，
        如果点击某场次漫展只显示该场次这个 CN 的预约单，如果没有就是空的。」
        ⛔ 原来这里会写 kw:'' / kwInput:''，那正是这条用法做不到的原因 ——
           她搜完 CN 一点场次，词就没了，看到的还是这一场的全部单。 */
  pickSched(e) {
    const id = e.currentTarget.dataset.id
    this.clearWarn()
    wx.setStorageSync(SCHED_KEY, id)
    this.setData({ schedId: id, sel: null, pickWarn: '', schedOpen: false, histOpen: false })
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
