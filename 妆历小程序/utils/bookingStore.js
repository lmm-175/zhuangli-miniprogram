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
 * 🔴 2026-09-30（第十七处）：做「代填真生成一条单」时我本来打算把这一份
 *    **storage 化**，想清楚之后**否掉了**。两条理由，都不是「懒得做」：
 *      ① 全项目的单子本来就是**会话级**的 —— 妆娘标已确认、翻定金、批量处理，
 *         重启一趟全部回到初始值。只把「新代填的那几张」持久化，会造出一个
 *         **新的不对称**：重启后新增的还在、原来的改动全没了，
 *         这比「全都丢」更难跟用户解释。
 *      ② 自测 ⑥ 段的 restoreBookings() 是**就地改**这个数组的
 *         （`list.length = 0` 再 push 回快照）。storage 化之后那些写回只落在
 *         内存、不再影响后面各段读到的值 —— 它会变成一个**静默失效**的兜底，
 *         而静默失效正是这个项目吃过最多亏的那类 bug。
 *    ⇒ 这一轮只做**读入口统一**（那才是当时真正存在的违规，见下面那段）。
 *
 * 页面改状态的路径【只有这一条】（updateBooking / applyBatch / addBooking）——
 * 就是为了别再出现「某个页面自己 setData 了一下，别的地方看不到」。
 */
const { BOOKINGS } = require('../mock/data')

/* ══ 读入口 —— 全项目唯一 ═════════════════════════════════════════════
   🔴 下面**每一个**读函数都必须经过这里。⛔ 别在别处再写 `BOOKINGS.filter(...)`。
      2026-09-30 之前 getBooking / bookingsOfSchedule 就是直接读 import 进来那份，
      于是「统一读入口」这句话只对了一半。当时真正踩到的坑在顾客端：
      pages/guest-bookings 自己 require 了 BOOKINGS，绕开了这一整层。
      自测里有一条**源码级**断言专门钉这件事（扫这个文件里还有没有裸的 BOOKINGS）。
   ⚠️ 返回的是**数组本身**（不是副本）：updateBooking / applyBatch 都是原地改，
      页面 setData 进来的引用跟着变，不用手工同步两份 —— 这是故意留的。 */
function getBookings() {
  return BOOKINGS
}

function getBooking(id) {
  return getBookings().filter((b) => b.booking_id === id)[0] || null
}

function newId() {
  return 'bk-' + Date.now()
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

/* ══ 一单属于哪位妆娘 ═════════════════════════════════════════════════
   🔴 2026-09-30（第二十处）新增。原因：预约单里【第一次出现了不是 demo 的单】
      —— 顾客端「我约过的妆娘」要求预置的 3 位每一位都有一条「我约过她」的记录
      （少一条就会出现「列表里有她、我却从没约过」的行，那一眼就是人肉目录，
      是红线 1）。于是 BOOKINGS 里有 artist_id: 'demo-mian' / 'demo-ali' 的单了。

   ⚠️ 为什么妆娘端必须按这个滤：pages/booking/booking.js 的 buildList 选
      「全部」场次时是 `!s || belongsToSchedule(...)` —— **不按场次滤**，
      只按四个状态 Tab 滤。它以前不需要认人，因为以前只有一个妆娘。
      ⇒ 少了这一层，demo 打开「已确认」会看见【青蓝漫展 · 别人的客人】。
      自测里那几条固定单号的断言（'bk-4,bk-5,bk-7' 之类）就是它的看门人。

   ⚠️ `b.artist_id || 'demo'` 的兜底【不要删】：
      - buildBooking() 保证新单一定带 artist_id（默认就是 'demo'）；
      - 但 mock 之前手写的、以及 M1 落库之前可能出现的老单没有这个字段，
        直接比会让它们**从妆娘端凭空消失**（而不是报错）。
      ⚠️ 这是「没有值时的诚实兜底」，⛔ 不是「按名字猜」——
         猜的那一类已经在 belongsToSchedule 那边被明确否掉了。 */
function bookingsOfArtist(artistId) {
  return getBookings().filter((b) => (b.artist_id || 'demo') === artistId)
}

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
  return getBookings().filter((b) => belongsToSchedule(b, s))
}

/* 这一场档期上【已经被占住】的妆位序号 */
function bookedSeqsOfSchedule(s) {
  return bookingsOfSchedule(s).filter((b) => BOOKED_STATUS[b.status]).map((b) => b.seq)
}

/* ══ 这一单是不是【我】的 ═════════════════════════════════════════════
   🔴 2026-10-01（第二十四处）新增。用户要的是：C1 上**我自己约的那一位**
      写金色的「已预约」，别人约的仍然是灰色的「已被预订」——
      「可以和别人的区分，然后也知道自己约没约」。

   ⚠️ M0 没有登录，以 `created_by === 'user'` 近似（= 顾客端提交的那些单，
      妆师端「代填」出来的是 'artist'，不算我的）。
   ⚠️ 全项目【只有这一处】实现这个判断：顾客端「我的预约」、「我约过的妆娘」
      和 C1 上那颗金标都读它。各写一份的那天，就会出现
      「我的预约里没有它、C1 上却说是我的」——而两边都不报错。
   ⛔ 别改成比 cn / wechat：那两样是**自由文本**，重名就串了；
      也别改成比 artist_id —— 那说的是「我不认识这位妆娘」，不是「这一单是我下的」。 */
function isMine(b) {
  return !!b && b.created_by === 'user'
}

/* 这一场里【我】占住的妆位序号（bookedSeqsOfSchedule 的「我的」那一半） */
function mySeqsOfSchedule(s) {
  return bookingsOfSchedule(s).filter((b) => BOOKED_STATUS[b.status] && isMine(b)).map((b) => b.seq)
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

/* ══ 新建一单（2026-09-30 第十七处 · 妆师端「代填」）═══════════════════
   🔴 全项目【第一处】创建预约单的代码 —— 之前所有单都是 mock 里手写的。
      所以这个函数的形状是照 `bk-1` **一个键一个键抄的**，⛔ 一个键都不能少：
      详情页会读 extra / note / phone / styles，缺了就是 undefined 渲染成空白，
      而那种空白在真机上跟「她没填」长得一模一样。
      自测里有一条断言：`Object.keys(buildBooking({})).sort()`
      必须跟 `Object.keys(BOOKINGS[0]).sort()` **逐字相等**。
      ⚠️ 加字段时**两边一起加**，否则那条断言当场红（这是它存在的意义）。

   ⚠️ 纯函数：不碰 storage、不碰 BOOKINGS、不生成 Date.now() 之外的副作用，
      所以能直接进 node 自测。
   ⚠️ `deposit_amount` 默认 **0**，⛔ 不许瞎填一个 50：
      代填是【线下谈好的】单，表单里根本没有让她填定金的字段（加一个是范围外，
      而且金额字段离红线 2 太近）。0 是「没谈定金」的诚实表示；
      `deposit_paid: false` 让「定金一键已支付」那个批量键有事可做。
   ⚠️ `slot_time` 的分隔符是 **`–`（U+2013 短破折号）**，⛔ 不是连字符 `-`：
      要跟 mock 里那 7 张单、以及 scheduleStore 生成妆位时用的那个字符逐字一致，
      否则同一场档期的妆位在这一单上显示成「10:30 - 11:50」、在别处是另一种。
      照抄的时候别让编辑器自动替换（这个字符在全项目都是这么写的）。 */
function buildBooking(patch) {
  const p = patch || {}
  return {
    booking_id: p.booking_id || newId(),
    artist_id: p.artist_id || 'demo',
    // ⚠️ 只看 schedule_id 就能认出这一单属于哪一场（见 belongsToSchedule）
    schedule_id: p.schedule_id || '',
    /* ⚠️ 妆师端代填出来的单**没有**顾客端那个 slot_id（那是 C1 落地页的
       SLOTS 夹具才有的东西，形如 `demo-s2`）。所以这里留空串，
       ⛔ 不要去借一个 —— 借来的 slot_id 会指向一场她根本不存在的漫展，
       而那正是这一轮要修掉的那个 bug。妆位身份 = (schedule_id, seq)。 */
    slot_id: p.slot_id || '',
    event: p.event || '',
    date: p.date || '',
    slot_time: p.slot_time || '',
    seq: Number(p.seq) || 0,
    created_by: p.created_by || 'artist',
    role: p.role || '',
    cn: p.cn || '',
    eye: Array.isArray(p.eye) ? p.eye.slice() : [],
    skin: Array.isArray(p.skin) ? p.skin.slice() : [],
    gender: p.gender || '',
    is_minor: !!p.is_minor,
    guardian_consent: !!p.guardian_consent,
    styles: Array.isArray(p.styles) ? p.styles.slice() : [],
    extra: Array.isArray(p.extra) ? p.extra.slice() : [],
    note: p.note || '',
    wechat: p.wechat || '',
    phone: p.phone || '',
    status: p.status || 'pending',
    deposit_amount: Number(p.deposit_amount) || 0,
    deposit_paid: !!p.deposit_paid,
    created_at: p.created_at || nowText()
  }
}

/* `2026-05-01 20:14` —— 跟 mock 里那 7 张单同一个写法（本地时间，非 ISO）。
   ⛔ 别用 toISOString()：那是 UTC，会带上 T 和 Z，详情页直接把它当字符串印出来。 */
function nowText() {
  const d = new Date()
  const p2 = (n) => (n < 10 ? '0' + n : '' + n)
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) +
         ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes())
}

/* 把一单塞进去。⚠️ 走 getBookings()（唯一的读入口），⛔ 不直接用 BOOKINGS ——
   这样「新单」和「老单」天然在同一个数组里，bookedSeqsOfSchedule() /
   blockingBookings() / 「N 人已预约」全都立刻算得出这一单：
   妆位当场从「可约」变「已被占」。
   🔴 这一条就是「代填建了单、妆位却还显示空闲」那类静默不一致的解药。 */
function addBooking(rec) {
  if (!rec) return null
  getBookings().push(rec)
  return rec
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

/* ══ 一单的状态，给顾客看的时候叫什么 ═════════════════════════════════
   📌 2026-09-30（第二十处）：这一份原来写在 `pages/guest-bookings/guest-bookings.js`
      里。这一轮顾客端多了一页要显示状态（`pages/artist-list/` 的「最近约妆」那一行），
      ⇒ 上提到这里 —— 两页各写一份的下场是同一张单在「我的预约」里写「已确认」、
      在「我约过的妆娘」里写「妆娘已接单」，顾客会以为自己约了两单（规矩 11）。
   ⚠️ 它是**顾客侧**的说法，⛔ 和妆师端那四个 Tab（待处理/已确认/已完成/已取消）
      不是一回事：那是【分组】，这是【一单的状态】。
      ⚠️ 尤其 `cancel_requested` 这一条：写「申请取消中」⛔ 不写「已取消」——
         她还没退成，妆位也还占着，说成已取消她就直接不去了。 */
const STATUS_TEXT = {
  pending: '待处理',
  confirmed: '已确认',
  done: '已完成',
  cancel_requested: '申请取消中',
  rejected: '已拒绝',
  cancelled: '已取消'
}

/* 查不到的状态【原样吐回去】，⛔ 不吞成空串 ——
   页面上显示成一个没见过的英文词，好过显示成一片空白：
   空白会让人以为「这一单没有状态」，而原样吐出来至少说明「这是个我没见过的状态」。 */
function statusText(s) {
  return STATUS_TEXT[s] || s || ''
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
  BATCH, BATCH_ORDER, BOOKED_STATUS, OPEN_STATUS, STATUS_TEXT,
  getBookings, getBooking, updateBooking, statusText,
  buildBooking, addBooking, newId, nowText,
  belongsToSchedule, bookingsOfArtist, bookingsOfSchedule, bookedSeqsOfSchedule, blockingBookings,
  isMine, mySeqsOfSchedule,
  isScheduleSettled,
  batchButtonsOf, pickableIds, canPick, applyBatch, matchesKeyword
}
