/**
 * 妆师端 · 档期存储（M0 纯前端：写本机 storage）。
 * M1 换成云开发的 schedules 集合。
 */
const KEY = 'zhuangli_schedules'
const { SCHEDULES } = require('../mock/data')

/* 首次进入种入两场示例档期（2026-09-29 用户定的）。
   ⚠️ 判据是「storage 里【没有这个 key】」，不是「列表为空」——
      妆娘把档期全删光之后，不该下次打开又长出两场示例来。
      `[]` 在 JS 里是真值，所以下面这个 `!` 判断天然把两种情况分开了。 */
function seed() {
  if (!wx.getStorageSync(KEY)) {
    wx.setStorageSync(KEY, JSON.parse(JSON.stringify(SCHEDULES)))
  }
}

/* ══ 「已取消」的档期不进这个列表 ═════════════════════════════════════
   2026-09-30 用户定的：档期取消后【直接从档期列表消失】（不是灰掉留着）。
   取消走的是软删除 —— 记录还在 storage 里，只是 `status = 'cancelled'`，
   这一层把它滤掉。这样两件事一次成立：
     · 档期列表看不见它
     · 预约单的场次下拉条里也没有它（那一列也是从这个函数来的）
   ⛔ 别把它改成真删：取消只是「这一场不办了」，单子可能还挂着记录，
      妆娘回头问「那天那场呢」的时候总得有东西可查。 */
function isCancelled(s) {
  return !!(s && s.status === 'cancelled')
}

function getSchedules() {
  seed()
  return (wx.getStorageSync(KEY) || []).filter((s) => !isCancelled(s))
}

/* ⚠️ 它读的是【滤过之后】的那份 —— 已取消的档期取不到，详情页会走
   「档期不存在」那条路。这是想要的：取消完就退回列表了，不该再能点进来。 */
function getSchedule(id) {
  return getSchedules().filter((s) => s.schedule_id === id)[0] || null
}

/* ══ 原始列表（含已取消的）═══════════════════════════════════════════
   🔴 【只给「写回 storage」用】。展示一律走 getSchedules()。

   2026-09-30 挖出来的真 bug：addSchedule / updateSchedule 原先拿
   【滤过 cancelled 的】getSchedules() 当底稿写回，等于把软删除的记录
   真删掉了。路径很短：取消 A → 点开 B 的详情页（onLoad 里就有一次
   updateSchedule）→ A 的记录从 storage 里消失，cancelSchedule 的软删除白做。
   ⚠️ 这个 bug 自测一路绿着放过 —— 因为它只查了「刚取消完那一瞬间」。
      要抓住它，必须在取消和下一次写回【中间插一次别的写操作】
      （自测 ⑧-H 用一场探针档期就是这么干的）。 */
function rawList() {
  seed()
  return wx.getStorageSync(KEY) || []
}

function addSchedule(s) {
  const list = rawList()
  list.push(s)
  wx.setStorageSync(KEY, list)
  return s
}

function updateSchedule(s) {
  const list = rawList().map((x) => (x.schedule_id === s.schedule_id ? s : x))
  wx.setStorageSync(KEY, list)
  return s
}

/* ══ 取消一个档期（软删除）═══════════════════════════════════════════
   ⚠️ 走 `status = 'cancelled'` 而【不是】 splice 掉那条记录。
   ⛔ 这个函数【不负责】判断「这一场还有没有预约单」—— 那是页面的事，
      因为判据在 utils/bookingStore.js 的 BOOKED_STATUS 里（只有那一处实现），
      而这里不该反过来依赖预约单模块。页面判完再来调它。 */
function cancelSchedule(id) {
  const list = rawList()
  const hit = list.filter((s) => s.schedule_id === id)[0]
  if (!hit) return null
  hit.status = 'cancelled'
  wx.setStorageSync(KEY, list)
  return hit
}

function newId() {
  return 'sched-' + Date.now()
}

module.exports = {
  getSchedules, getSchedule, addSchedule, updateSchedule, cancelSchedule, newId,
  rawList
}
