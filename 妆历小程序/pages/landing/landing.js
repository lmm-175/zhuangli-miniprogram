/**
 * C1 分享落地页（妆位页）· 提审截图 ② · 无需登录
 * 落点：分享卡片的 path /pages/landing/landing?artist_id=demo
 *       （也由「我约过的妆娘」列表页的每一行点进来，带各自 artist_id）
 *
 * 📌 2026-10-01（第二十处）：这一页从「demo 一个人的、妆位写死的分享页」
 *    变成了**任意一位妆娘的、数据是真的**的妆位页。四件事：
 *      ① 认人（5.1，已落地）—— 读 `options.artist_id`，⛔ 不再写死 'demo'；
 *      ② 删妆面样片（5.2，已落地）；
 *      ③ 场次筛选（本步）—— `[当前场次][▾]` 放妆位表正上方；
 *      ④ 妆位排序（本步）—— 可约的按时间在前、被占的灰色沉底。
 *
 * 🔴 ③ 把这一页的**数据源整个换掉了**：原先读 `mock/data.js` 的 `SLOTS` 夹具
 *    （`busy` 是个写死的布尔值），现在读真档期 + 真预约单。
 *    ⚠️ 那个夹具当初写死是有理由的（真按预约单推会把三个妆位全占掉，
 *       提审截图上「选这个妆位」一个都点不到）—— 见 mock/data.js 里那段退役说明。
 *       现在用**另一条**保证顶上：示例数据保证「默认那一场至少 2 个空妆位」，
 *       自测里有断言钉着（旧那条「landing 不许 require bookingStore」也跟着换了判据）。
 *
 * 🔴 ④ 之后**必须连着做**：妆位身份从 `slot_id` 换成 `(schedule_id, seq)`，
 *    而且 `pages/booking-form/booking-form.js` 要【同一步改完】——
 *    只改这一边的话，每一个选完妆位进填写页的顾客都会看到
 *    「这个妆位已经不在了」。**出声了，但说的是错话**，比静默更糟（方案 §1.3）。
 */
const { getArtistById, schedulesOfArtist } = require('../../utils/artistStore')
const { getContact } = require('../../utils/contact')
const { TOAST } = require('../../utils/toast')
/* 🔴 这一行是第二十处新加的，而且是【故意的】：这一页的妆位状态必须来自
   预约单（`bookedSeqsOfSchedule`），⛔ 不许在这儿再写一份「什么算被占」。
   口径只有一处：`utils/bookingStore.js` 的 `BOOKED_STATUS` ——
   「已完成的单仍然占着妆位」这条第十五处定死的规矩就住在那里。
   ⚠️ 原先自测里有一条「landing 不许 require bookingStore」（两个世界故意解耦），
      第二十处把它【换了判据】而不是删掉：要保的性质是「C1 上永远有点得动的妆位」，
      当初用「冻结夹具」实现，现在用「默认那场至少 2 个空妆位」实现。 */
const { bookedSeqsOfSchedule, mySeqsOfSchedule } = require('../../utils/bookingStore')
const { buildRows, markBooked, toMin, awayFromToday, isTodayOrLater } =
  require('../../utils/schedule')

/* ══ 一位妆娘的场次：今天及以后、离今天最近的排最前 ═══════════════════
   🔴 「今天及以后」这条卡得比妆娘端严：妆娘在自己的档期列表里能翻到过去
      排过的班，而顾客点进来是来【约】的，看到一场昨天的展只会困惑。
   ⚠️ 日期写坏了的场次【留着】（`isTodayOrLater` 认不出日期时返回 true）——
      藏掉一个妆娘自己建好的场次，得是因为「它确实过期了」，
      不是因为「我读不懂它的日期」，后者她不报错、顾客也看不到。
   ⚠️ 排序用 `awayFromToday`（从 utils/schedule.js 抽出来的那一份），
      ⛔ 别在这儿自己算「差几天」—— 妆娘端那条场次下拉用的是同一个函数。

   🔴 2026-10-01（第二十二处）· **取消的东西在这一页一个都不出现**：
      · 取消掉的**场次** → 整个不显示（不是灰掉、更不是写一句「已取消」）。
        滤在 `schedulesOfArtist` 那一层（demo 那份由 scheduleStore 滤、
        另外两位那份由 artistStore 滤），所以**下拉菜单里也不会再有它** ——
        那是顺带白拿的，⛔ 不是第二处过滤。
        这一页⛔ 不要自己再滤一遍：两处过滤 = 两份真相（artistStore 那段注释）。
      · 妆娘删掉的**妆位** → 根本不在 `slots` 里，于是这一页连行都不画。
      · 单子被拒 / 被取消放出来的妆位 → 回到「可约」，**这行照常显示**。
        ⚠️ 这一条是**故意**的（BOOKED_STATUS 的口径，第十五处定死）：
           妆位真的空出来了，藏着它等于让妆娘少卖一单。
      ⇒ 合起来是一条能验的性质：**这一页上画出来的每一个「选这个妆位」，
        点进去都必须真的落在那个妆位上**（自测里三位妆娘各走一遍整条路）。
        ⚠️ 反过来说：画出一个「点进去会说它不在了」的按钮 = 这一页在骗人，
           顾客看到的是一句他无法理解的错话（第二十二处那个 bug 就是这样）。 */
function liveSchedulesOf(artistId) {
  return schedulesOfArtist(artistId)
    .filter((s) => s && isTodayOrLater(s.date))
    .sort((a, b) => awayFromToday(a.date) - awayFromToday(b.date))
}

/* 下拉条上的一项：漫展名 · 月-日，右边标「N 个妆位可约」。
   ⚠️ 日期只写「05-02」不写「2026-05-02」—— 同一位妆娘的场次绝大概率在同一年，
      带上年份会让每一项都长到撑不住；日期本身还是要带着的，
      因为**同一个漫展分两天，光看名字分不出来**（这正是这个筛选条存在的理由）。
   ⚠️ 「可约」的判据和妆位表**必须同源**：都走 markBooked + bookedSeqsOfSchedule。
      分开算的话会出现「条子上写 3 个可约、点进去只有 2 行能点」，
      而两处各自看都挺合理、谁都不报错。 */
function chipOf(s) {
  const rows = markBooked(s.slots || [], bookedSeqsOfSchedule(s))
  const free = rows.filter((x) => !x.is_break && !x.booked).length
  return {
    id: s.schedule_id,
    label: s.name + (s.date ? ' · ' + String(s.date).slice(5) : ''),
    sub: free ? free + ' 个妆位可约' : '已约满'
  }
}

/* ══ 妆位表的行（第二十处第 ④ 步）════════════════════════════════════
   顾客 2026-10-01 当场挑的排法（三选一），⛔ 别替他改回去：
     ① **可约的在上** —— 按开始时间（`toMin(start)`）从早到晚；
     ② **午休行当一条分隔条，夹在两段中间** —— 不参与排序、也不灰；
     ③ **被占的沉底** —— 加 `.busy`，灰底；内部也按时间从早到晚。
   于是长这样：`可约的几位 → 午休 → 已被预订的几位`。

   🔴 ② 这条是**当场问过顾客**才定下来的，因为方案里那三条要求本身打架
      （「午休不参与排序」+「不进被占那一段」+「还在原位」——
      示例数据里午休跟的那一位正好已被预订，「原位」就在被占段里，三条不可能同时成立）。
      三种排法都画给他看过，他挑了「当分隔条」：
        · 好处：干净、确定（不依赖任何时间比较），而且它天然满足
          「不参与排序」「不进被占段」—— 它在两个段**之间**。
        · 代价：它不再表示「几点休息」了。⚠️ 认了 —— 妆位一旦重排，
          这张表就已经**不是一条时间轴**了（上面 14:30、下面 09:00），
          午休「插在 11:50 和 13:00 中间」那个语义在重排之后本来也保不住。
   ⚠️ 被占的判据**只用** `bookedSeqsOfSchedule()`（+ markBooked 标上去），
      ⛔ 不在这页另写一份：`done`（已完成）也算占，这是第十五处定死的口径，
      在这儿重写一遍迟早会漏掉它。
   ⚠️ `buildRows` 负责把午休插成独立一行（妆师端详情页用的是同一个函数）——
      这一页只是把它挑出来单独放，⛔ 不重写一份「午休怎么算」。
   ⚠️ 三段各自都按时间排（包括午休那一段）—— 一场档期只可能有一个午休，
      排序在这里是「万一以后有多个也不乱」的兜底，⛔ 不是靠它表达什么语义。 */
function rowsOf(s) {
  /* 🔴 2026-10-01（第二十四处）：第三个参数是「**我**占的那几位」——
     被占的行里再分两色：我约的写金色「已预约」，别人约的写灰色「已被预订」。
     ⚠️ 两个参数**同源同一次过滤**（都来自 bookingStore），所以
        「标成金色的那几位」永远是「被占的那几位」的子集，不可能出现
        「一行既不是可约、也不是任何一种被占」的裸奔状态。 */
  const marked = markBooked(s.slots || [], bookedSeqsOfSchedule(s), mySeqsOfSchedule(s))
  const free = []
  const lunch = []
  const busy = []
  buildRows(marked, s.lunch).forEach((r) => {
    if (r.type === 'lunch') lunch.push(r)
    else if (r.booked) busy.push(r)
    else free.push(r)
  })
  const byTime = (a, b) => toMin(a.start) - toMin(b.start)
  return free.sort(byTime).concat(lunch.sort(byTime), busy.sort(byTime))
}

const { shareCard } = require('../../utils/share')
Page({
  onShareAppMessage() { return shareCard(this.artistId) },

  data: {
    /* ⛔ artist 里没有 wechat_id，也不会有 —— 见 utils/contact.js。
       ⚠️ 2026-09-30（第十七处）：数据源从 `mock/data.js` 的 ARTIST_PUBLIC
          换成 artistStore.getArtist()（第二十处再换成 getArtistById，见 onShow）。
          决定 2 说的是「资料改动要同步给顾客看」，
          而这一页就是**顾客看的那一页**（提审截图 ②）—— 妆娘改了昵称/城市/风格，
          这里必须跟着变。字段名一个字没改，所以 wxml 那段 `{{artist.xxx}}` 照旧。
       ⚠️ 初值只给个能渲染的空壳，真数据在 onShow 里灌 —— 理由见下面 onShow。 */
    artist: { nickname: '', city: '', style_text: '', intro: '', avatar_color: 'rose' },
    // ⛔ 微信号只能落在这个字段里，来源只能是 getContact()
    contact: {},
    copied: false,

    /* ── 场次筛选（第二十处第 ③ 步）─────────────────────────────────
       ⚠️ 这一页【没有搜索框、没有搜索历史】—— 那两件是妆师端预约单页的：
          那边妆娘要在一堆单子里找一个人，顾客在这一页只是「挑一场、挑个位」，
          一共两三个场次，一个下拉就够。⛔ 别照搬那半条条子。 */
    schedOpen: false,
    schedList: [],     // 下拉里的项 [{id,label,sub}]
    schedId: '',       // 当前选中的 schedule_id
    schedLabel: '',    // 条子上那行字
    // 妆位表的小标题。⚠️ 由 refresh() 算，⛔ 不在 wxml 里拼字符串 ——
    // 它要跟着「有几个场次」换口径（见 refresh）。
    secTitle: '可约妆位',
    rows: []           // 妆位行（含午休行），已排好序
  },

  /* ⚠️ 必须在 onShow 里读，⛔ 不能写进 data 的初值（`artist: getArtistById(...)`）。
     小程序的页面模块【只求值一次】然后被缓存：第二次进这一页时，
     data 初值还是第一次那一份 —— 妆娘改了资料，顾客这边纹丝不动，
     而且没有任何报错。这正是「同步」那条决定最容易假实现的地方。
     ⚠️ onShow 也覆盖了「从填写页退回来」这条路径（不必是 onLoad）。
     🔴 2026-10-01（第二十处）：读的是 `getArtistById(this.artistId)`，⛔ 不再是
        光秃秃的 `getArtist()` —— 这一页从「妆娘 demo 一个人的分享页」变成了
        「**任意一位**妆娘的妆位页」（顾客从「我约过的妆娘」点进来）。
        `artistId` 只能来自 onLoad 的查询串，所以它存在【实例】上
        （`this.artistId`），⛔ 不进 data：它不是要渲染的东西，
        进了 data 反而会被 setData 无谓地送一遍。
        ⚠️ demo（或没带参数）仍然走 storage —— 妆娘改了资料顾客端要跟着变，
           这条决定一个字没改，见 artistStore.getArtistById 的注释。
     🔴 场次和妆位也在这儿重读（refresh）：妆娘那边刚改了妆位、或后台有单子
        被标了已确认，顾客从填写页退回来时看到的是新的 —— 这是「真数据」的
        全部意义所在，写在 onLoad 里就只有第一次对。 */
  onShow() {
    this.setData({ artist: getArtistById(this.artistId) })
    this.refresh()
  },

  onLoad(options) {
    // 🔴 「这一页是谁的」只在这里解一次。⛔ 缺省仍是 demo（提审备注那条路径
    //    `/pages/landing/landing?artist_id=demo`，以及所有老分享卡片）。
    const artistId = options.artist_id || 'demo'
    this.artistId = artistId

    // 🔴 这一行就是「微信号唯一出口」的落地处。
    //    M1 换成：
    //      wx.cloud.callFunction({ name: 'showContact', data: { artistId } })
    //        .then(res => this.setData({ contact: res.result || {} }))
    //    注意：切换「展示微信号」开关后，这里要重新拉一次。
    const contact = getContact(artistId)
    this.setData({ contact })
  },

  /**
   * 重算场次清单 + 当前那一场的妆位。
   * ⛔ 全页只有这一处 setData({rows, schedList, ...}) —— 换场次、onShow 回来、
   *    妆娘改完档期，走的都是它，免得出现「某条路径忘了重算」那种静默残留。
   *
   * ⚠️ 选中的场次【不落 storage】（妆师端那条 `zhuangli_bk_sched` 是另一回事）：
   *    妆师端记的是「她连着在处理哪一场」，顾客端要的是「进来就看见最近的一场」
   *    （决定 D3）—— 记住上一次看的是哪一场，对一个偶尔来一次的顾客只是困惑。
   *    所以 `schedId` 是页面内的状态，重进这一页就回到默认那场。
   */
  refresh() {
    const list = liveSchedulesOf(this.artistId)
    const chips = list.map(chipOf)

    /* 选中的那一场：默认 = 离今天最近的（list 已经排好，取第 0 个）。
       ⚠️ 已经选过的那一场如果还在，就继续用它 —— 换场次之后 onShow 不该把它弹回去。
       ⛔ 但**必须验一下它还在不在**：妆娘可能刚把那一场取消了，而顾客这一页
          还开着（下拉里已经没有它了，再按 id 去取就会取到 undefined，
          妆位表整个空掉，顾客看到的是「一场空」而不是「那场没了」）。 */
    let id = this.data.schedId
    if (!chips.some((c) => c.id === id)) id = chips.length ? chips[0].id : ''
    const cur = list.filter((s) => s.schedule_id === id)[0] || null
    const hit = chips.filter((c) => c.id === id)[0]

    /* 妆位表的小标题。⚠️ 两种口径，⛔ 不许各写各的（规矩 25）：
       · 场次 ≥ 2 → 小标题只说「可约妆位」，**哪一场由上面那条条子说** ——
         否则同一个名字在一屏里出现两遍。
       · 场次 = 1 → 那条条子整个不显示（只剩一项的下拉等于没得选，白占一行），
         于是这一行必须自己把场次名带上，不然顾客不知道这是哪一天。
       · 一场都没有 → 就四个字，空态那段负责说清楚。 */
    const secTitle = cur && chips.length === 1
      ? '可约妆位 · ' + cur.name
      : '可约妆位'

    this.setData({
      schedList: chips,
      schedId: id,
      schedLabel: hit ? hit.label : '',
      secTitle,
      rows: cur ? rowsOf(cur) : []
    })
  },

  /** 点条子（或右边那个 ▾）开合场次面板。⚠️ 两处都挂这个函数。 */
  toggleSched() {
    this.setData({ schedOpen: !this.data.schedOpen })
  },

  /** 点面板以外的地方收起它（那层铺满全屏的透明蒙层）。 */
  closePanel() {
    this.setData({ schedOpen: false })
  },

  /** 选一场。⚠️ 选完立刻收起面板 —— 不收起的话它盖在妆位表上，
      顾客还得再点一下才看得见自己选出来的那几个妆位。 */
  pickSched(e) {
    this.setData({ schedId: e.currentTarget.dataset.id, schedOpen: false })
    this.refresh()
  },

  /**
   * §9.4 #8 · 复制微信号（M0 里唯一一个「真功能」）。
   * 停留原页不跳转，按钮短暂变「已复制」再复原。
   * ⛔ 不要做「跳去微信」的引导弹窗 —— 小程序无法唤起微信加好友，那是死路。
   */
  copyWechat() {
    if (!this.data.contact.wechat_id) return
    wx.setClipboardData({
      data: this.data.contact.wechat_id,
      success: () => {
        // 系统自己会弹一个「内容已复制」，先收掉，换成我们定死的文案
        wx.hideToast()
        wx.showToast({ title: TOAST.WECHAT_COPIED, icon: 'none', duration: 1500 })
        this.setData({ copied: true })
        setTimeout(() => this.setData({ copied: false }), 1500)
      },
      fail: () => {
        wx.showToast({ title: TOAST.WECHAT_COPIED, icon: 'none', duration: 1500 })
      }
    })
  },

  /**
   * §9.4 #9 / #10 · 本文件最关键的两个元素，必须是真跳转。
   *
   * 🔴 2026-10-01（第二十处第 ⑥ 步）：查询串从 `?slot_id=` 改成
   *    `?schedule_id=&seq=`。妆位的身份**一直是** `(schedule_id, seq)`
   *    —— `slot_id` 是那个冻结夹具（`SLOTS`）才有的东西，夹具一退役它就没意义了。
   *    ⚠️ `pages/booking-form/booking-form.js` 那边是【同一步】改的：
   *       分开改的话，中间那一刻整条顾客路径都会说「这个妆位已经不在了」。
   *    ⚠️ 「查不到就出声」那条兜底（`slotMissing`）一个字没动，见 booking-form。
   */
  pickSlot(e) {
    const d = e.currentTarget.dataset
    /* 🔴 2026-10-01（第二十三处）：把 `artist_id` 一起带过去 —— 填写页提交时
       要拿它建单。⛔ 不能省：不带的话 `buildBooking` 兜底成 'demo'，
       于是**在别人页面上下单、单子记到 demo 名下** —— 顾客端「我约过的妆娘」
       凭空多出一个他没约过的人，妆师端那一场的「N 人已预约」也不加。
       ⚠️ 和 `booking-form.js` 的 onLoad 是【同一步】改的。 */
    wx.navigateTo({
      url: '/pages/booking-form/booking-form?schedule_id=' + d.sid +
           '&seq=' + d.seq + '&artist_id=' + this.artistId
    })
  },

  /** §9.4 #7 · 我的预约。落地页是顾客端，去约妆端「我的预约」。
       ⛔ 空态里绝不放「浏览化妆师」按钮。
       🔴 2026-10-01（第二十一处第二轮）：原来是 `navigateTo` —— 那一页
          **升成 tab 页之后，`navigateTo`（和 `redirectTo`）都会静默失败**：
          不报错、不跳转、屏幕上一个字都没有，用户看到的就是「点了没反应」。
          这是 C1 上唯一那个按钮，它坏掉等于落地页少了半条路。
       ⚠️ 同一轮里 `pages/booking-form/` 提交完那一跳是同一个病，一起改的。 */
  goMyBookings() {
    wx.switchTab({ url: '/pages/guest-bookings/guest-bookings' })
  }

  /* ⛔ 本页不实现 onShareTimeline —— 理由见 utils/share.js。
     📌 这里原先写的是「见 pages/schedule-edit 里的说明」，而那段说明
        在那一页里根本不存在（断链，2026-10-01 查出来的）。

     🔴 转发卡片（上面第一行的 onShareAppMessage）走的是全项目共用那一个函数，
        ⛔ 别在这一页另写一份 —— 这一页唯一特殊的地方是它**知道自己在讲谁**
        （`this.artistId`，onLoad 里从查询串解出来），所以它把那个人传进去。
        其余 17 页没有 artistId，落点由 shareCard 兜底到妆娘端那一位。 */
})
