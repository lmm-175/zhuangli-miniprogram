/**
 * 妆师端 · 预约单存储（M0 纯前端）。
 *
 * ⚠️ 这里【故意不写 storage】，而是直接改 mock/data.js 里那一份 BOOKINGS：
 *    同一批单还被另外两处读着 ——
 *      · pages/schedule-detail  靠 status 推「这个妆位是不是已预订」
 *      · pages/guest-bookings   顾客端「我的预约」看的是同一批单
 *    一旦复制一份进 storage，这两处立刻变旧值：妆娘把单标成已确认了，
 *    档期那边还当它待处理、顾客那边状态纹丝不动。
 *    M0 是单机假数据，一份内存就够；M1 换成云开发的 booking 集合时把
 *    这一整个文件替掉即可，调用方一行不动。
 *
 * 页面改状态的路径【只有这一条】（updateBooking / applyBatch）——
 * 就是为了别再出现「某个页面自己 setData 了一下，别的地方看不到」。
 */
const { BOOKINGS } = require('../mock/data')

function getBookings() {
  return BOOKINGS
}

function getBooking(id) {
  return BOOKINGS.filter((b) => b.booking_id === id)[0] || null
}

/* ══ 妆位「已经有人了」的判定 ═════════════════════════════════════════
   ⚠️ 全项目【只有这一处】实现。它同时服务三件事：
        · 档期详情页给妆位画「已预订」
        · 落地页的可约标记（M1）
        · 提交预约单时的并发校验（M1）
      写第二份的那天，就是这三处开始互相打架的那天。

   ⚠️ done 也算「有人了」（2026-09-29 用户定的）：
      客人这一单已经做完了，那个妆位照样是「有人了」——
      不能因为做完了就把它当空位再约给别人。
   ⚠️ cancel_requested 也算「有人了」：
      顾客只是【申请】取消，妆娘还没点头，妆位当然还占着。
      要等妆娘同意（→ cancelled）才真的放出来。
   只有 rejected / cancelled 才真的**释放**妆位。 */
const BOOKED_STATUS = { pending: true, confirmed: true, done: true, cancel_requested: true }

/* ══ 一单属于哪一场档期 ═══════════════════════════════════════════════
   ⚠️ 只看 schedule_id。⛔ 不要拿「漫展名 + 日期」认 —— 那是【认不出来】的：
      同一个漫展分两天、或者两场重名，都会撞在一起。2026-09-29 用户报的
      「不同场次的预约单弄混了」就是这个：单子挂的名字对不上她建的档期名，
      于是哪一场都不属于，只在「全部」里出现。
   兜底：没有 schedule_id 的旧单（M0 之前手写的、或 M1 落库前的老数据）
      才回落到名字+日期。这条兜底【不要删】—— 删了那些单会凭空消失。 */
function belongsToSchedule(b, s) {
  if (!s) return false
  if (b.schedule_id) return b.schedule_id === s.schedule_id
  return b.event === s.name && b.date === s.date
}

/* 这一场档期上的全部单 */
function bookingsOfSchedule(s) {
  return BOOKINGS.filter((b) => belongsToSchedule(b, s))
}

/* 这一场档期上【已经被占住】的妆位序号 */
function bookedSeqsOfSchedule(s) {
  return bookingsOfSchedule(s).filter((b) => BOOKED_STATUS[b.status]).map((b) => b.seq)
}

/* ══ 取消一场档期之前，先看它有没有「还占着妆位」的单 ═════════════════
   2026-09-30 用户定的：档期可以取消，但【这一场没有预约单时才让取消】；
   有的话要先跟客人沟通把单子处理掉。
   ⚠️ 判据复用 BOOKED_STATUS（pending / confirmed / done / cancel_requested），
      ⛔ 不是「有没有 booking 记录」—— 已拒绝 / 已取消的单不占妆位，
      那几张单不该把妆娘永久锁在这一场里出不去。
   ⚠️ 和 bookedSeqsOfSchedule 是同一次过滤，只是这里要的是【单子本身】
      （要拿张数跟她说话），那边要的是序号（要画「已预订」标记）。 */
function blockingBookings(s) {
  return bookingsOfSchedule(s).filter((b) => BOOKED_STATUS[b.status])
}

/* ══ 这一场是不是「已经全部处理完了」 ═════════════════════════════════
   用来给预约单的场次下拉条排序 —— 手上没事的场次沉到底下去。
   判据是【没有一张单还需要她动手】：pending / confirmed / cancel_requested
   都还要她处理；done / rejected / cancelled 都不用了。
   ⚠️ 一场单都没有的档期也算「处理完了」（空集当然没人要处理）——
      它本来就该排到最后，符合直觉。
   ⚠️ 别改成「全部都是 done」：那样一个 3 单做完 + 1 单被拒的场次会被当成
      还有事没干，永远挂在上面。 */
const OPEN_STATUS = { pending: true, confirmed: true, cancel_requested: true }

function isScheduleSettled(s) {
  return !bookingsOfSchedule(s).some((b) => OPEN_STATUS[b.status])
}

/* 改一单。原地改、返回【同一个对象】—— 页面 setData 进来的引用跟着变，
   不用再手工同步两份。 */
function updateBooking(id, patch) {
  const b = getBooking(id)
  if (!b) return null
  for (const k in patch) b[k] = patch[k]
  return b
}

/* ══ 批量勾选：三个入口，各自一套勾选态 ═══════════════════════════════
   2026-09-29 用户定的：
     · 待处理 → 「一键处理」      → 勾上的一批进已确认
     · 已确认 → 「一键确认」      → 勾上的一批进已完成
     · 已确认 → 「定金一键已支付」→ 勾上的一批标定金已付
   前两个键【各走各的勾选态】，不是同一套。

   tab      : 这个入口只出现在哪个 Tab
   to       : 批量执行后状态变成什么。'' = 不换状态，只翻定金
   canPick  : 这一单能不能被勾上。⛔ 注意是「根本勾不上」，不是「勾了以后跳过」——
              用户明确选的这条：未付定金的单在「一键确认」里是灰的。
              理由：静默跳过 = 妆娘以为处理了 5 单、实际只动了 3 单。
   lockHint : 勾不上时【点它那一下】浮出来的那句话。⚠️ 不是行尾常驻提示 ——
              一屏有 3 单未付就是 3 遍「未付定金」，纯噪声（用户 2026-09-29 报的）。
              「勾不上」本身已经说明问题了，解释只在用户真去点的时候给一次。 */
const BATCH = {
  pending: {
    tab: 'pending', to: 'confirmed',
    entry: '一键处理', apply: '标记已确认',
    canPick: () => true, lockHint: ''
  },
  confirm: {
    tab: 'confirmed', to: 'done',
    entry: '一键确认', apply: '标记已完成',
    // 定金没付就进不了已完成 —— 跟详情页那个「标记已完成」同一把锁
    canPick: (b) => !!b.deposit_paid,
    lockHint: '未付定金无法标记已完成，请确认定金是否已支付'
  },
  deposit: {
    tab: 'confirmed', to: '',
    entry: '定金一键已支付', apply: '标记定金已付',
    canPick: () => true, lockHint: ''
  }
}

/* 底部按钮的排列顺序。已确认页「定金」在前 —— 它是「确认」的前置条件，
   排前面正好是「先标定金，再标完成」那个顺序。 */
const BATCH_ORDER = ['pending', 'deposit', 'confirm']

/* 某个 Tab 平时该显示哪几个批量入口（没单就不给，没啥可批的） */
function batchButtonsOf(tabKey, count) {
  if (!count) return []
  return BATCH_ORDER
    .filter((m) => BATCH[m].tab === tabKey)
    .map((m) => ({ mode: m, label: BATCH[m].entry }))
}

/* 这一单在这个模式下勾不勾得上。
   ⚠️ 状态必须【正好是】这个入口管的那个 Tab —— 少了这一条，「已确认」页里
      那张「顾客申请取消」的单会被勾上，点执行时又被 applyBatch 按状态跳过，
      于是变成它自己最讨厌的那件事：静默少处理（用户 2026-09-29 明确否掉的）。 */
function canPick(mode, b) {
  const cfg = BATCH[mode]
  if (!cfg || !b) return false
  if (b.status !== cfg.tab) return false
  return !!cfg.canPick(b)
}

/* 这个模式下，这一批里哪些单勾得上。
   ⚠️ 这里【必须走 canPick】，⛔ 不能图省事直接调 cfg.canPick(b) ——
      少了状态守卫，「已确认」页那张「顾客申请取消」的单会被预先勾上，
      点执行时 applyBatch 又把它跳过，正好复现上面那条注释里说的静默少处理。
      自测里「3 单里勾 2 单」那条断言就是专门盯这个的。 */
function pickableIds(list, mode) {
  return (list || []).filter((b) => canPick(mode, b)).map((b) => b.booking_id)
}

/* 执行一批。返回【真正改动的单数】，调用方拿它做 Toast。
   ⚠️ 这里再查一遍 tab + canPick：勾选态是页面状态，可能已经过期 ——
      比如进了勾选态之后又去详情页把定金退了。挡住它，就不会出现
      「已完成的单还欠着定金」这种脏状态。少处理几单，调用方要说出来。 */
function applyBatch(mode, ids) {
  const cfg = BATCH[mode]
  if (!cfg) return 0
  let n = 0
  ;(ids || []).forEach((id) => {
    const b = getBooking(id)
    if (!b || b.status !== cfg.tab || !cfg.canPick(b)) return
    if (cfg.to) b.status = cfg.to
    else b.deposit_paid = true
    n++
  })
  return n
}

/* ══ 按关键词找单子 ═══════════════════════════════════════════════════
   妆娘找一张单只有两种找法，所以【只认这两个字段】：
     · 「那个叫千夏的」      → 顾客 CN
     · 「那天的那个展子」    → 漫展名
   ⛔ 不搜角色名 / 备注 / 微信号：前两个是她不会拿来当索引的东西，
      第三个是高风险字段，不该出现在一个可以模糊匹配的入口后面。
   ⚠️ 大小写不敏感（CN 里混英文是常态），前后空格去掉。 */
function matchesKeyword(b, kw) {
  const q = String(kw == null ? '' : kw).trim().toLowerCase()
  if (!q) return true
  return String(b.cn || '').toLowerCase().indexOf(q) >= 0 ||
         String(b.event || '').toLowerCase().indexOf(q) >= 0
}

module.exports = {
  BATCH, BATCH_ORDER, BOOKED_STATUS, OPEN_STATUS,
  getBookings, getBooking, updateBooking,
  belongsToSchedule, bookingsOfSchedule, bookedSeqsOfSchedule, blockingBookings,
  isScheduleSettled,
  batchButtonsOf, pickableIds, canPick, applyBatch, matchesKeyword
}
