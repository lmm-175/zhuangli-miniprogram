console.log('\n════ ⑧ 取消场次（入口在档期列表卡片上）════')

/* ⚠️ 这一段打桩的是【档期列表页 pages/schedule/schedule.js】。
   ⛔ 别再改个函数名继续打桩 schedule-detail —— 详情页那个「取消这一场」
      连同 onCancelSchedule / data.leaving / 底栏 / goBack() 已经整体删掉了
      （2026-09-30 用户定了：整场取消的入口只留档期列表卡片这一处）。
      打桩一个已经没有这个方法的页面，只会得到「TypeError: not a function」，
      那不是断言失败，是这一段在验一个不存在的东西。 */
{
  const fs = require('fs')
  const store = {}
  const toasts = []
  const modals = []
  const navs = []
  let hideKb = 0
  let backsN = 0

  global.wx = {
    getStorageSync: (k) => store[k],
    setStorageSync: (k, v) => { store[k] = v },
    showToast: (o) => toasts.push(o.title),
    /* ⚠️ 这个桩【不自动回调】—— 用户拍板之前那个状态本身就是要断言的东西
       （「问了一句但还没答，什么都不该发生」）。要往下走就显式 fireYes/fireNo。
       ⑤-B 那个桩是自动回调的，因为那边验的是「答完之后落了什么」。
       两种桩各有各的用处，别为了省事合成一个。 */
    showModal: (o) => modals.push(o),
    /* 🔴 只计数、不做事。下面有一条断言钉死它必须是 0 ——
       档期列表页没有任何输入框，这条路径上一次都不该收键盘。
       README 第 20 条：hideKeyboard 会打断当前触摸序列，紧跟其后的 showModal
       在部分基础库上会被整个吃掉 —— 表现就是「点了一下什么都没有」且不报错。
       ⚠️ 详情页自己的 hideKeyboard 是另一回事，那页真有输入框，留着是对的。 */
    hideKeyboard: () => { hideKb++ },
    navigateTo: (o) => navs.push(o.url),
    navigateBack: () => { backsN++ },
    switchTab: () => { backsN++ }
  }
  const fireModal = (res) => {
    const o = modals[modals.length - 1]
    if (o && o.success) o.success(res)
  }
  const fireYes = () => fireModal({ confirm: true, cancel: false, content: '' })
  const fireNo = () => fireModal({ confirm: false, cancel: true, content: '' })

  // 收掉定时器，别让它自己跑（真等 1.2 秒的话断言会跑在回调前面 ——「绿着错」）
  const timers = []
  const realST = global.setTimeout
  global.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length }

  let cfg = null
  global.Page = (c) => { cfg = c }
  delete require.cache[require.resolve(R('妆历小程序/pages/schedule/schedule.js'))]
  require(R('妆历小程序/pages/schedule/schedule.js'))

  const mkPage = () => {
    const pg = {}
    for (const k in cfg) pg[k] = cfg[k]
    pg.data = JSON.parse(JSON.stringify(cfg.data))
    pg.setData = function (patch) {
      for (const k in patch) {
        const parts = k.split('.')
        let o = this.data
        for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]]
        o[parts[parts.length - 1]] = patch[k]
      }
    }
    return pg
  }
  /* 点一张卡片：一个「哪里被点了」的假事件。 */
  const tap = (id) => ({ currentTarget: { dataset: { id: id } } })

  const SStore = require(R('妆历小程序/utils/scheduleStore.js'))

  restoreBookings()
  const all = SStore.getSchedules()          // 第一次调 → seed() 把示例档期种进这个 store
  console.log('  种进来的档期：' + all.map((s) => s.name + '·' + s.date).join(' / '))
  console.log('  各场「还占着妆位」的单数：' +
    all.map((s) => s.name + '=' + BS.blockingBookings(s).length).join(' '))

  /* ⚠️ mock 里那两场示例档期【都挂着单】，「没单的那一场」得自己造一个。
     ⛔ 别指望示例数据里有现成的空场次 —— 那种「靠数据凑出来的前提」
        一改示例就悄悄失效，然后这一段会以「验不出差别」的方式绿着错。
     日期挑得不跟示例那两场撞、id 用【真形状】的 sched-<毫秒>。 */
  const SOLO_ID = 'sched-1791200000000'
  SStore.addSchedule({
    schedule_id: SOLO_ID, name: '单日小展', date: '2026-05-10',
    startTime: '09:00', slotMin: 80, gapMin: 10, count: 1, lunch: null,
    slots: [{ seq: 1, start: '09:00', end: '10:20', minutes: 80, is_break: false, booked: false }]
  })
  const emptyS = SStore.getSchedules().filter((s) => s.schedule_id === SOLO_ID)[0]
  const busyS = SStore.getSchedules().filter((s) => BS.blockingBookings(s).length > 0)[0]
  eq('★ 造出来的那场一张单都没有（它就是「没预约单」那一侧的样本）',
    BS.blockingBookings(emptyS).length, 0)
  eq('★ 另一侧也确实有场挂着单（不然验不出差别）',
    BS.blockingBookings(busyS).length > 0, true)

  // ── A. 卡片上的「N 人已预约」 ──
  const pg0 = mkPage()
  pg0.onShow()
  const cardOf = (id) => pg0.data.schedules.filter((x) => x.id === id)[0]
  console.log('  卡片：' + pg0.data.schedules.map((c) =>
    c.name + ' → ' + c.booked + ' 人已预约').join(' / '))

  eq('★ 卡片把「已预约人数」算出来了', typeof cardOf(busyS.schedule_id).booked, 'number')
  eq('★ 这个数 = blockingBookings() 的长度（口径只有那一处实现）',
    cardOf(busyS.schedule_id).booked, BS.blockingBookings(busyS).length)
  eq('★ 没人约的那场写 0', cardOf(SOLO_ID).booked, 0)
  eq('★ 每一张卡片都对得上（不是恰好第一张对）',
    pg0.data.schedules.every((c) => c.booked === BS.blockingBookings(
      SStore.getSchedules().filter((s) => s.schedule_id === c.id)[0]).length), true)
  eq('★ 顺带：卡片上还带着时长文案（蓝色人数就接在它右边）',
    typeof cardOf(SOLO_ID).range, 'string')

  // ── B. 卡片整面点进去详情，小签点了只取消 ──
  const nB = navs.length
  pg0.goDetail(tap(busyS.schedule_id))
  eq('★ 点卡片 → 进详情页', navs.length, nB + 1)
  eq('★ 进的是被点的那一场', navs[navs.length - 1].indexOf(busyS.schedule_id) >= 0, true)

  // ── C. 没有预约单 → 让取消 ──
  const pgA = mkPage()
  pgA.onShow()
  const n0 = SStore.getSchedules().length
  const nNav = navs.length
  pgA.onCancelSchedule(tap(SOLO_ID))
  let m = modals[modals.length - 1]
  console.log('  没单 → 弹「' + m.title + '」/ 确认键「' + m.confirmText + '」')
  eq('★ 没预约单 → 问一句「取消场次？」', m.title, '取消场次？')
  eq('★ 确认键就写「取消场次」（只写「确认」的话，按下去不知道按掉了什么）',
    m.confirmText, '取消场次')
  eq('★ 取消键是红的', m.confirmColor, '#D54941')
  eq('★ 二次确认：问了还没答，什么都不该发生', SStore.getSchedules().length, n0)
  eq('★ 点小签【不会】同时进详情页（catchtap 挡住了冒泡）', navs.length, nNav)

  fireNo()
  eq('★ 点「返回」→ 档期还在', SStore.getSchedules().length, n0)
  eq('也没说「场次已取消」', toasts.indexOf('场次已取消'), -1)

  pgA.onCancelSchedule(tap(SOLO_ID))
  fireYes()
  eq('★ 确认 → 从档期列表里消失', SStore.getSchedules().length, n0 - 1)
  eq('★ 消失的正是那一场',
    SStore.getSchedules().some((s) => s.schedule_id === SOLO_ID), false)
  eq('★ 就地重画列表，⛔ 不退回（她本来就在列表页，退回会跳出小程序）', backsN, 0)
  eq('★ 重画完卡片里也没有它了',
    pgA.data.schedules.some((c) => c.id === SOLO_ID), false)
  eq('没留跳转的定时器', timers.length, 0)
  eq('给了一句反馈', toasts[toasts.length - 1], '场次已取消')

  // ── D. 软删除：记录还在 storage 里 ──
  const gone = SStore.rawList().filter((s) => s.schedule_id === SOLO_ID)[0]
  eq('★ 记录【没被抹掉】，还在 storage 里', !!gone, true)
  eq('★ 只是状态变成 cancelled（软删除）', gone.status, 'cancelled')
  eq('★ 但 getSchedules() 里已经没有它了',
    SStore.getSchedules().some((s) => s.schedule_id === SOLO_ID), false)

  // ── E. 有预约单 → 拦住 ──
  const pgD = mkPage()
  pgD.onShow()
  const nD = SStore.getSchedules().length
  const bD = backsN
  const tD = toasts.length
  const mD = modals.length
  const navD = navs.length
  pgD.onCancelSchedule(tap(busyS.schedule_id))
  m = modals[modals.length - 1]
  console.log('  有单 → 弹「' + m.title + '」')
  eq('★ 有预约单 → 弹的是【拦住】那个框，不是确认框',
    m.title.indexOf('这一场还有') === 0, true)
  eq('★ 它把张数说出来，而且和卡片上那个数【是同一个】',
    m.title, '这一场还有 ' + cardOf(busyS.schedule_id).booked + ' 张预约单')
  eq('★ 那个框只有【一个键】—— 这不是问句，是「现在还不行」',
    m.showCancel, false)
  eq('★ 没有第二条路可走（不该再弹第二个框）', modals.length, mD + 1)
  eq('★ 拦住了就是真拦住：档期还在', SStore.getSchedules().length, nD)
  eq('★ 状态也没被动过',
    SStore.getSchedules().filter((s) => s.schedule_id === busyS.schedule_id)[0].status === 'cancelled', false)
  eq('还留在列表页，没退回', backsN, bD)
  eq('也没说「场次已取消」', toasts.length, tD)
  eq('更没排跳转', timers.length, 0)
  eq('小签这一下同样没进详情页', navs.length, navD)

  // ── F. 判据是「还占着妆位的单」，⛔ 不是「有没有单记录」──
  const bk = BS.bookingsOfSchedule(busyS)
  console.log('  这一场 ' + bk.length + ' 张单：' +
    bk.map((b) => b.booking_id + '=' + b.status).join(' '))
  bk.forEach((b) => { b.status = 'rejected' })
  eq('★ 这一场的单全被拒掉之后，就不再拦住妆娘了（不占妆位的不算数）',
    BS.blockingBookings(busyS).length, 0)
  eq('（单子本身还在，只是不占妆位了）', BS.bookingsOfSchedule(busyS).length, bk.length)

  const pgE = mkPage()
  pgE.onShow()
  eq('★ 卡片上的「N 人已预约」跟着掉到 0（它读的是同一个判据）',
    cardOf(busyS.schedule_id).booked, 0)
  pgE.onCancelSchedule(tap(busyS.schedule_id))
  eq('★ 于是这一场也放她取消了', modals[modals.length - 1].title, '取消场次？')
  fireYes()
  eq('★ 取消成功', SStore.getSchedules().some((s) => s.schedule_id === busyS.schedule_id), false)

  // ⚠️ 上面动过 BOOKINGS 的状态，这里必须还原 —— 后面的断言和收尾
  //    读的是同一批单，留着脏状态会红得莫名其妙。
  restoreBookings()
  eq('把单的状态还原回去了',
    BS.getBooking(bk[0].booking_id).status,
    SNAPSHOT.filter((b) => b.booking_id === bk[0].booking_id)[0].status)

  // ── G. 🔴 已取消的记录不许被【下一次别的写操作】顺手真删掉 ──
  /* 这是 2026-09-30 顺手挖出来的真 bug：addSchedule / updateSchedule 原先拿
     【滤过 cancelled 的】getSchedules() 当底稿写回，等于把软删除的记录真删了。
     路径极短：取消 A → 打开 B 的详情页（onLoad 里就有一次 updateSchedule）。
     ⚠️ 只查「刚取消完那一瞬间」是【绿着放过】的 —— 上面 D 段就是那一瞬间，
        它一路绿。要抓住这个 bug，必须在中间插一次【别的】写操作。 */
  const PROBE_ID = 'sched-1791300000000'
  SStore.addSchedule({
    schedule_id: PROBE_ID, name: '探针场次', date: '2026-05-11',
    startTime: '09:00', slotMin: 80, gapMin: 10, count: 1, lunch: null,
    slots: [{ seq: 1, start: '09:00', end: '10:20', minutes: 80, is_break: false, booked: false }]
  })
  SStore.cancelSchedule(PROBE_ID)
  eq('★ 探针场次已取消（展示层看不见了）',
    SStore.getSchedules().some((s) => s.schedule_id === PROBE_ID), false)

  const survivor = SStore.getSchedules()[0]
  SStore.updateSchedule(survivor)
  eq('🔴★ 中间插一次 updateSchedule 之后，已取消的记录【还在】storage 里',
    SStore.rawList().some((s) => s.schedule_id === PROBE_ID), true)
  eq('🔴★ 而且状态还是 cancelled，没被改成别的',
    (SStore.rawList().filter((s) => s.schedule_id === PROBE_ID)[0] || {}).status, 'cancelled')

  SStore.addSchedule({
    schedule_id: 'sched-1791400000000', name: '再一个探针', date: '2026-05-12',
    startTime: '09:00', slotMin: 80, gapMin: 10, count: 1, lunch: null,
    slots: [{ seq: 1, start: '09:00', end: '10:20', minutes: 80, is_break: false, booked: false }]
  })
  eq('🔴★ addSchedule 也不许把已取消的记录顺手删掉',
    SStore.rawList().some((s) => s.schedule_id === PROBE_ID), true)

  // ── H. 已取消的场次不参与预约单页的场次下拉（用户原话）──
  //    下拉条那一列来自 getSchedules()，跟档期列表同一个来源。
  //    这里【真的去跑一遍预约单页】，而不是只查 getSchedules() ——
  //    「同一个来源」这句话要能被证伪，不然它只是注释里的一句信仰。
  let bcfg = null
  global.Page = (c) => { bcfg = c }
  delete require.cache[require.resolve(R('妆历小程序/pages/booking/booking.js'))]
  require(R('妆历小程序/pages/booking/booking.js'))
  const bp = {}
  for (const k in bcfg) bp[k] = bcfg[k]
  bp.data = JSON.parse(JSON.stringify(bcfg.data))
  bp.setData = function (patch) {
    for (const k in patch) {
      const parts = k.split('.')
      let o = this.data
      for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]]
      o[parts[parts.length - 1]] = patch[k]
    }
  }
  bp.onShow()
  const chipIds = bp.data.schedChips.map((c) => c.id)
  console.log('  预约单页的场次下拉：' + bp.data.schedChips.map((c) => c.label).join(' / '))
  eq('★ 已取消的场次不出现在下拉菜单里', chipIds.indexOf(SOLO_ID), -1)
  eq('（有单被拒掉那场也取消了，同样不在）', chipIds.indexOf(busyS.schedule_id), -1)
  eq('（探针那两场也不在）', chipIds.indexOf(PROBE_ID), -1)
  eq('下拉第一项还是「全部」', chipIds[0], 'all')
  eq('下拉长度 = 还活着的场次数 + 1', chipIds.length, SStore.getSchedules().length + 1)

  // ── I. 兜底必须【出声】，⛔ 不许静默 ──
  /* 原先这里是 `if (!s) { this.onShow(); return }` —— 把「卡片过期了」和
     「按钮根本没接上」压成完全一样的表现（都是「什么都没发生」），
     那正是查了三轮都在猜、猜错两次的原因（README 第 22 条）。 */
  const tI = toasts.length
  const mI = modals.length
  pgA.onCancelSchedule(tap('sched-根本不存在'))
  eq('★ 点一张已经不在了的卡片 → 【说一句话】，不是静默', toasts.length, tI + 1)
  eq('★ 说的正是「这一场已经不在了，列表刚刷新」',
    toasts[toasts.length - 1], '这一场已经不在了，列表刚刷新')
  eq('★ 没有弹任何确认框（它压根没找到要取消的东西）', modals.length, mI)
  eq('★ 顺手把列表重画了一遍（卡片是旧的，就更新它）', Array.isArray(pgA.data.schedules), true)

  eq('取消一个不存在的档期 → cancelSchedule 返回 null，不炸',
    SStore.cancelSchedule('sched-不存在'), null)

  // ── J. 🔴 这条路径上一次都不许收键盘 ──
  eq('🔴★ 列表页这条取消路径上 hideKeyboard 调用次数 = 0（README 第 20 条）', hideKb, 0)

  // ── K. 结构断言：node 里没有排版引擎，命中区只能【读文件钉结构】 ──
  /* ⚠️ 必须先把注释摘掉再查 —— 下面这几条要找的字符串，注释里全都出现过
     （比如 .s-cancel-hit 的注释里就写着「绝不能写成 margin-left」）。
     不摘注释的话，断言会对着注释里的字下结论。 */
  const stripCss = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '')
  const stripHtml = (t) => t.replace(/<!--[\s\S]*?-->/g, '')
  const listWxss = stripCss(fs.readFileSync(R('妆历小程序/pages/schedule/schedule.wxss'), 'utf8'))
  const listWxml = stripHtml(fs.readFileSync(R('妆历小程序/pages/schedule/schedule.wxml'), 'utf8'))
  const detWxml = stripHtml(fs.readFileSync(R('妆历小程序/pages/schedule-detail/schedule-detail.wxml'), 'utf8'))
  const detJs = fs.readFileSync(R('妆历小程序/pages/schedule-detail/schedule-detail.js'), 'utf8')

  eq('★ 名字是【定宽 8em】的槽 —— 按钮横坐标不随名字长短浮动',
    /\.s-name\{[^}]*width:8em/.test(listWxss), true)
  eq('★ 名字单行截断（最多 8 个中文字，超了打省略号）',
    /\.s-name\{[^}]*white-space:nowrap/.test(listWxss) &&
    /\.s-name\{[^}]*text-overflow:ellipsis/.test(listWxss), true)
  eq('★ 名字【不许】再写 flex:1 —— 那会把小签顶到卡片最右边，正是查了三轮的那个 bug',
    /\.s-name\{[^}]*flex:1/.test(listWxss), false)
  eq('🔴★ 那一个字符的间距写在【壳的 padding-left】上（margin 是点不到的空白）',
    /\.s-cancel-hit\{[^}]*padding-left:/.test(listWxss), true)
  eq('🔴★ 小签自己【不带】margin-left',
    /\.s-cancel\{[^}]*margin-left/.test(listWxss), false)
  eq('★ 小签的命中高度够 88rpx（微信的点击区建议）',
    /\.s-cancel-hit\{[^}]*min-height:88rpx/.test(listWxss), true)
  eq('★ 「N 人已预约」是蓝色（--info）',
    /\.s-bk\{[^}]*color:var\(--info\)/.test(listWxss), true)
  eq('★ 取消场次用 catchtap，⛔ 不是 bindtap（整张卡片是 goDetail，bindtap 会冒泡成两个都做）',
    /catchtap="onCancelSchedule"/.test(listWxml), true)
  eq('★ 卡片本身还是 bindtap="goDetail"', /bindtap="goDetail"/.test(listWxml), true)
  eq('★ 人数挂在时长右边（同一个 .s-meta 行里）',
    /\.s-meta/.test(listWxml) && /s-bk/.test(listWxml), true)

  eq('⛔ 详情页 wxml 里已经【没有】「取消这一场」的入口了',
    detWxml.indexOf('onCancelSchedule'), -1)
  eq('⛔ 详情页 js 里也没有 onCancelSchedule 了',
    detJs.indexOf('onCancelSchedule'), -1)
  eq('⛔ 详情页也没有 data.leaving 了',
    /\bleaving\b/.test(detJs), false)
  eq('（详情页自己的 hideKeyboard 留着是对的 —— 那页真有输入框）',
    /wx\.hideKeyboard\(\)/.test(detJs), true)
}
