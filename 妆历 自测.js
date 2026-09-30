/**
 * 妆历 · 自测（排班时间规则 + 档期详情页交互 + 导航栏布局算式）
 *
 * 跑法：在「make up」这一层目录下
 *     node "妆历 自测.js"
 * 全绿输出 ALL PASS n assertions；有任何一条红就会以非 0 退出码结束。
 *
 * ⚠️ 这个文件放在【妆历小程序/ 外面】，提审包里不会带上它。
 *    它 require 的是真实源码，不复制一份逻辑 —— 所以它绿 = 那份代码真的是对的。
 *    改 utils/schedule.js 或 pages/schedule-detail/* 之后务必重跑。
 *
 * 三段：
 *   ① 排班纯函数（utils/schedule.js）—— 时间算术，最容易算错的地方
 *   ② 档期详情页（戏最多的那一页）—— 打桩 wx/Page，把整条交互走一遍
 *   ③ 导航栏宽度算式 —— 把「为什么标题压不住按钮」写成可执行的算术
 */
const path = require('path')
const R = (p) => path.join(__dirname, p)

const S = require(R('妆历小程序/utils/schedule.js'))
const { generateSlots, shiftSlot, adjustLunch, removeLunch, removeSlot, insertSlot,
        markBooked, buildRows, scheduleRange, toMin, toHHMM } = S

let pass = 0, fail = 0
function eq(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok   ' + label) }
  else { fail++; console.log('  FAIL ' + label + '\n       got  ' + g + '\n       want ' + w) }
}
function dump(slots) { return slots.map((s) => s.seq + ':' + s.start + '-' + s.end + '(' + s.minutes + ')' + (s.booked ? 'B' : '')).join(' ') }
function lunchStr(l) { return l && l.enabled ? l.start + '-' + l.end + '(' + l.min + ') after' + l.afterSeq : 'OFF' }

/* ══════════════════════════════════════════════════════════════════════
   ① 排班纯函数
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n════ ① 排班纯函数 ════')

// ── 底料：3 个 80 分钟妆位，间隔 10，午休 60 分钟跟在第 2 个后面 ──
const base = generateSlots({ startTime: '09:00', slotMin: 80, gapMin: 10, count: 3,
  lunch: { enabled: true, min: 60, afterSeq: 2 } })
console.log('\n[base] ' + dump(base.slots) + '  lunch ' + lunchStr(base.lunch))
// 09:00-10:20, 10:30-11:50, lunch 12:00-13:00, 13:00-14:20
eq('base slots', dump(base.slots), '1:09:00-10:20(80) 2:10:30-11:50(80) 3:13:00-14:20(80)')
eq('base lunch', lunchStr(base.lunch), '12:00-13:00(60) after2')
eq('booked flag defaults false', base.slots.map((s) => s.booked), [false, false, false])

// ── 规则① 改时长：常规顺延（没有已预订）──
{
  const r = shiftSlot(base.slots, 1, 100, 10, base.lunch, 'squeeze')
  console.log('\n[R1 extend slot1 80->100, no booking] ' + dump(r.slots) + '  lunch ' + lunchStr(r.lunch))
  eq('slot1 self', r.slots[0].start + '-' + r.slots[0].end, '09:00-10:40')
  eq('slot2 pushed +20', r.slots[1].start + '-' + r.slots[1].end, '10:50-12:10')
  eq('lunch only START pushed (end fixed)', lunchStr(r.lunch), '12:20-13:00(40) after2')
  eq('post-lunch slot3 unchanged (lunch end fixed)', r.slots[2].start + '-' + r.slots[2].end, '13:00-14:20')
  eq('no collision', r.collision, false)
}

// ── 规则① 缩短午休前妆位 + 用户选「提前午休」(follow) ──
{
  const r = shiftSlot(base.slots, 1, 60, 10, base.lunch, 'follow')
  console.log('\n[R1 shorten slot1 80->60, follow] ' + dump(r.slots) + '  lunch ' + lunchStr(r.lunch))
  eq('lunch both start+end moved -20', lunchStr(r.lunch), '11:40-12:40(60) after2')
  eq('slot2 pulled -20', r.slots[1].start + '-' + r.slots[1].end, '10:10-11:30')
  eq('slot3 follows lunch end', r.slots[2].start + '-' + r.slots[2].end, '12:40-14:00')
}

// ── 规则① 缩短 + 用户选「午休不动」(pin) ──
{
  const r = shiftSlot(base.slots, 1, 60, 10, base.lunch, 'pin')
  console.log('\n[R1 shorten slot1, pin] ' + dump(r.slots) + '  lunch ' + lunchStr(r.lunch))
  eq('lunch untouched', lunchStr(r.lunch), '12:00-13:00(60) after2')
  eq('slot2 pulled -20 (still reflows)', r.slots[1].start + '-' + r.slots[1].end, '10:10-11:30')
  eq('slot3 untouched (lunch end untouched)', r.slots[2].start + '-' + r.slots[2].end, '13:00-14:20')
}

// ── 规则① 午休被挤没 ──
{
  const r = shiftSlot(base.slots, 2, 150, 10, base.lunch, 'squeeze')
  console.log('\n[R1 extend slot2 so lunch dies] ' + dump(r.slots) + '  lunch ' + lunchStr(r.lunch))
  eq('lunchRemoved', r.lunchRemoved, true)
  eq('lunch off', r.lunch.enabled, false)
}

// ── 规则① 已预订妆位是锚点 ──
{
  const slots = markBooked(base.slots, [3])       // 第 3 个已预订
  console.log('\n[R1 anchor] ' + dump(slots))
  const r = shiftSlot(slots, 2, 100, 10, base.lunch, 'squeeze')
  console.log('  extend slot2 80->100 -> ' + dump(r.slots) + '  lunch ' + lunchStr(r.lunch))
  eq('slot3 = anchor, never moves', r.slots[2].start + '-' + r.slots[2].end, '13:00-14:20')
  // 午休被压成 12:20-13:00，正好顶在锚点 13:00 上 —— 没有越界，不算撞
  eq('no collision: squeezed lunch ends exactly at anchor start', r.collision, false)
  const r1b = shiftSlot(slots, 2, 200, 10, base.lunch, 'squeeze')
  console.log('  extend slot2 80->200 -> ' + dump(r1b.slots) + '  lunch ' + lunchStr(r1b.lunch))
  eq('really runs past the anchor -> collision true', r1b.collision, true)
  eq('slot3 still the anchor', r1b.slots[2].start + '-' + r1b.slots[2].end, '13:00-14:20')
  eq('lunch squeezed out on the way', r1b.lunchRemoved, true)

  // 锚点在最后一个、前面还有自由妆位时可正常顺延
  const s2 = markBooked(base.slots, [2])
  const r2 = shiftSlot(s2, 1, 100, 10, base.lunch, 'squeeze')
  console.log('  [anchor=slot2] extend slot1 -> ' + dump(r2.slots))
  eq('slot1 grew', r2.slots[0].end, '10:40')
  eq('slot2 anchor untouched', r2.slots[1].start + '-' + r2.slots[1].end, '10:30-11:50')
  eq('slot3 after anchor untouched too', r2.slots[2].start + '-' + r2.slots[2].end, '13:00-14:20')
  eq('collision true: slot1 grew past the anchor', r2.collision, true)
}

// ── ★ 真机 bug 回归：锚点卡在被改妆位和午休之间 → 午休【不许】跟着动 ──
// 缩短 s1，午休一度被挪到 11:20-12:20，正好压在已预订的 s2（10:30-11:50）头上。
{
  const slots = markBooked(base.slots, [2])       // s2 已预订，卡在 s1 和午休之间
  console.log('\n[R1 ★blocked] ' + dump(slots))
  eq('lunchMovable = false（隔着已预订妆位）', S.lunchMovable(slots, 1, base.lunch), false)
  const r = shiftSlot(slots, 1, 40, 10, base.lunch, 'follow')
  console.log('  shorten slot1 with follow -> ' + dump(r.slots) + '  lunch ' + lunchStr(r.lunch))
  eq('★ lunch did NOT slide onto the booked slot', lunchStr(r.lunch), '12:00-13:00(60) after2')
  eq('★ booked anchor s2 untouched', r.slots[1].start + '-' + r.slots[1].end, '10:30-11:50')
  eq('slot1 shrunk', r.slots[0].start + '-' + r.slots[0].end, '09:00-09:40')
  // 中间没有已预订妆位时，午休照常可以动
  eq('lunchMovable = true（没隔东西）', S.lunchMovable(markBooked(base.slots, [3]), 1, base.lunch), true)
  eq('午休之后的妆位不影响', S.lunchMovable(base.slots, 3, base.lunch), false)
}

// ── 规则② 删除妆位：时间一律不动，只重排序号 ──
{
  const r = removeSlot(base.slots, 2, base.lunch)
  console.log('\n[R2 remove slot2] ' + dump(r.slots) + '  lunch ' + lunchStr(r.lunch))
  eq('seq renumbered', r.slots.map((s) => s.seq), [1, 2])
  eq('slot1 time untouched', r.slots[0].start + '-' + r.slots[0].end, '09:00-10:20')
  eq('old slot3 keeps 13:00-14:20 (gap left behind)', r.slots[1].start + '-' + r.slots[1].end, '13:00-14:20')
  eq('lunch re-attached to new slot1', lunchStr(r.lunch), '12:00-13:00(60) after1')
  eq('lunch not reported removed', r.lunchRemoved, false)

  const r2 = removeSlot(base.slots, 3, base.lunch)
  console.log('  [remove slot3] ' + dump(r2.slots) + '  lunch ' + lunchStr(r2.lunch))
  eq('slot3 removed, 1&2 untouched', dump(r2.slots), '1:09:00-10:20(80) 2:10:30-11:50(80)')
  eq('trailing lunch KEPT (no way to add one back)', lunchStr(r2.lunch), '12:00-13:00(60) after2')
  eq('trailing lunch rows render after the last slot',
    buildRows(r2.slots, r2.lunch).map((x) => x.key), ['s1', 's2', 'L'])

  // 午休跟在第 1 个妆位后面，删掉第 1 个 → 午休前面没妆位了，只能取消
  const b1 = generateSlots({ startTime: '09:00', slotMin: 80, gapMin: 10, count: 3,
    lunch: { enabled: true, min: 60, afterSeq: 1 } })
  const r3 = removeSlot(b1.slots, 1, b1.lunch)
  console.log('  [lunch after slot1, remove slot1] ' + dump(r3.slots) + '  lunch ' + lunchStr(r3.lunch))
  eq('lunch has no pre-slot left -> removed', r3.lunchRemoved, true)
  eq('remaining slots keep their times', dump(r3.slots), '1:11:30-12:50(80) 2:13:00-14:20(80)')

  // 但删掉第 2 个时，午休只是前移一格，仍然保留
  const r4 = removeSlot(b1.slots, 2, b1.lunch)
  console.log('  [lunch after slot1, remove slot2] ' + dump(r4.slots) + '  lunch ' + lunchStr(r4.lunch))
  eq('lunch kept', lunchStr(r4.lunch), '10:30-11:30(60) after1')
  eq('slot3 keeps its time', r4.slots[1].start + '-' + r4.slots[1].end, '13:00-14:20')
}

// ── 规则② 插入妆位：时间一律不动 ──
{
  // 先删掉第 2 个腾出空档，再往第 1 个后面插
  const after = removeSlot(base.slots, 2, base.lunch).slots
  console.log('\n[R2 insert after slot1] before ' + dump(after))
  const r = insertSlot(after, 1, toMin(after[0].end) + 10, 30, base.lunch)
  console.log('  -> ' + dump(r.slots) + '  lunch ' + lunchStr(r.lunch))
  eq('new slot is seq2 at 10:30-11:00', r.slots[1].start + '-' + r.slots[1].end, '10:30-11:00')
  eq('the 13:00 slot untouched, now seq3', r.slots[2].start + '-' + r.slots[2].end, '13:00-14:20')
  eq('lunch afterSeq moved with it', r.lunch.afterSeq, 3)
}

// ── 规则② 插在午休后面（afterSeq 不变）──
{
  const r = insertSlot(base.slots, base.lunch.afterSeq, toMin(base.lunch.end), 30, base.lunch)
  console.log('\n[R2 insert right after lunch] ' + dump(r.slots) + '  lunch ' + lunchStr(r.lunch))
  eq('lunch still follows seq2', r.lunch.afterSeq, 2)
  eq('new slot seq3 at 13:00-13:30', r.slots[2].start + '-' + r.slots[2].end, '13:00-13:30')
  eq('old slot3 shifted seq only, time same', r.slots[3].start + '-' + r.slots[3].end, '13:00-14:20')
}

// ── ★ 插在「午休前那个妆位」后面 vs 插在「午休那一行」后面 ──
// 两者 afterSeq 是同一个数，只有第 6 个参数分得清。判错了行序会反过来：
// 午休 12:00 会排在一个 10:30 的新妆位前面，列表看着就是坏的。
{
  const gapped = removeSlot(base.slots, 2, base.lunch)     // 空档 [10:30, 12:00)
  const before = insertSlot(gapped.slots, 1, toMin('09:00') + 80 + 10, 30, gapped.lunch, true)
  console.log('\n[R2 ★ insert BEFORE lunch] ' + dump(before.slots) + '  lunch ' + lunchStr(before.lunch))
  eq('★ lunch follows the NEW slot', lunchStr(before.lunch), '12:00-13:00(60) after2')
  eq('★ row order stays in time order',
    buildRows(before.slots, before.lunch).map((r) => r.key), ['s1', 's2', 'L', 's3'])
  const after = insertSlot(gapped.slots, gapped.lunch.afterSeq, toMin(gapped.lunch.end), 30, gapped.lunch, false)
  eq('insert after the lunch row keeps the lunch where it is', lunchStr(after.lunch), '12:00-13:00(60) after1')
  eq('and the new slot lands after it',
    buildRows(after.slots, after.lunch).map((r) => r.key), ['s1', 'L', 's2', 's3'])
}

// ── 规则③ 午休改起点 + 时长 ──
{
  const r = adjustLunch(base.slots, base.lunch, toMin('12:30'), 45, 10)
  console.log('\n[R3 lunch -> 12:30 +45] ' + dump(r.slots) + '  lunch ' + lunchStr(r.lunch))
  eq('lunch', lunchStr(r.lunch), '12:30-13:15(45) after2')
  eq('post-lunch slot3 follows new lunch end', r.slots[2].start + '-' + r.slots[2].end, '13:15-14:35')
  eq('pre-lunch slots untouched', r.slots[1].start + '-' + r.slots[1].end, '10:30-11:50')
}

// ── 规则② 取消午休：后面妆位时间不动 ──
{
  const l = removeLunch(base.lunch)
  const rows = buildRows(base.slots, l)
  console.log('\n[R2 remove lunch] rows ' + rows.map((r) => r.key).join(',') + '  lunch ' + lunchStr(l))
  eq('lunch off', l.enabled, false)
  eq('rows have no lunch row', rows.some((r) => r.type === 'lunch'), false)
  eq('slot times untouched', dump(base.slots), '1:09:00-10:20(80) 2:10:30-11:50(80) 3:13:00-14:20(80)')
}

// ── buildRows 的 nextStart ──
{
  const rows = buildRows(base.slots, base.lunch)
  console.log('\n[rows] ' + rows.map((r) => r.key + '[' + r.start + '->' + (r.nextStart || 'END') + ']').join(' '))
  eq('row keys', rows.map((r) => r.key), ['s1', 's2', 'L', 's3'])
  eq('lunch sits right after seq2', rows[2].type, 'lunch')
  eq('s2.nextStart is lunch start', rows[1].nextStart, '12:00')
  eq('L.nextStart is slot3 start', rows[2].nextStart, '13:00')
  eq('last row nextStart empty', rows[3].nextStart, '')
  // 空档计算：s1 结束 10:20 + 间隔 10 = 10:30 起，下一行 s2 是 10:30 → 剩 0
  eq('gap after s1 = 0 (tight)', toMin(rows[0].nextStart) - (toMin(rows[0].end) + 10), 0)
  // 删掉 s2 之后，s1 下面就有空档了
  const rows2 = buildRows(removeSlot(base.slots, 2, base.lunch).slots, base.lunch)
  const gap2 = toMin(rows2[0].nextStart) - (toMin(rows2[0].end) + 10)
  console.log('  after removing slot2, gap after s1 = ' + gap2 + ' min')
  eq('gap after s1 = 150 after deletion', gap2, 150)
}

// ── ★「午休在第几号后」超出妆位数 → 午休【根本不生成】──
// 这是新建档期页那个「午休最晚只能到十二点」的真根因：
// 页面把「在第几号后」的选项写死成 1..8，选到大于妆位数的值时
// `i === afterSeq` 永远不成立 → 午休整个不生成，预览里那行字直接消失，
// 而且保存下去的是一条 start/end 为空的废记录。页面必须自己把它夹进 1..count。
{
  const r = generateSlots({ startTime: '09:00', slotMin: 80, gapMin: 10, count: 3,
    lunch: { enabled: true, min: 60, afterSeq: 5 } })
  console.log('\n[★ afterSeq=5 / 只有 3 个妆位] lunch = ' + (r.lunch === null ? 'null（没生成）' : lunchStr(r.lunch)))
  eq('★ 午休不生成', r.lunch, null)
  eq('妆位照常生成（所以看着像"午休没生效"）', r.slots.length, 3)
  // 夹到 1..count 之内就正常了 —— 最后一个妆位后面也行
  const ok = generateSlots({ startTime: '09:00', slotMin: 80, gapMin: 10, count: 3,
    lunch: { enabled: true, min: 60, afterSeq: 3 } })
  eq('夹进范围内 → 午休落在最后一个妆位后面', lunchStr(ok.lunch), '13:30-14:30(60) after3')
}

// ── 范围文案 ──
eq('range', scheduleRange(base.slots), '09:00 – 14:20')

/* ══════════════════════════════════════════════════════════════════════
   ② 档期详情页：打桩 wx / Page，把整条交互走一遍
   纯函数对不代表页面就对 —— 这一层抓「setData 漏字段」「dataset 取错」
   「点了之后 rows 没重算」这类只有跑起来才看得见的问题。
   ⚠️ 每个小节开头都要 reset()，否则前一节的弹窗回答会把状态带歪，
      后面每一节的硬编码期望全跟着错 —— 那是测试的问题，不是代码的问题。
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n════ ② 档期详情页（打桩 wx/Page）════')

let cfg = null
const toasts = []
let modalAnswers = []
let modalLog = []

const wx = {
  _store: {},
  getStorageSync(k) { return this._store[k] },
  setStorageSync(k, v) { this._store[k] = JSON.parse(JSON.stringify(v)) },
  showToast(o) { toasts.push(o.title); console.log('    toast> ' + o.title) },
  hideKeyboard() {},
  navigateBack() {}, switchTab() {}, redirectTo() {},
  showModal(o) {
    const ans = modalAnswers.length ? modalAnswers.shift() : true
    modalLog.push({ title: o.title, content: o.content || '', answer: ans })
    console.log('    modal> ' + o.title + '  => ' + (ans ? '确认' : '取消'))
    if (o.success) o.success(ans ? { confirm: true, cancel: false } : { confirm: false, cancel: true })
  }
}
global.wx = wx
global.Page = (c) => { cfg = c }
global.getApp = () => ({ getRole: () => 'artist' })

require(R('妆历小程序/pages/schedule-detail/schedule-detail.js'))

const inst = {}
for (const k in cfg) inst[k] = cfg[k]
inst.setData = function (patch) { for (const k in patch) this.data[k] = patch[k] }

function tap(key) { return { currentTarget: { dataset: { key } } } }
function del(seq) { return { currentTarget: { dataset: { seq } } } }
function dumpRows() { return inst.data.rows.map((r) => r.key + ':' + r.start + '-' + r.end + (r.booked ? 'B' : '')).join(' ') }
function dumpSlots() {
  return inst.data.s.slots.map((s) => s.seq + ':' + s.start + '-' + s.end + '(' + s.minutes + ')' + (s.booked ? 'B' : '')).join(' ')
}
function lunch() { const l = inst.data.s.lunch; return l && l.enabled ? l.start + '-' + l.end + '(' + l.min + ')' : 'OFF' }
function modalText() { return modalLog.map((m) => m.title + '|' + m.content).join(' ~ ') }

const { addSchedule } = require(R('妆历小程序/utils/scheduleStore.js'))

/* 每个小节从同一块干净地基上起跑：
   3 个 80 分钟妆位 / 间隔 10 / 午休 60 分钟在第 2 个妆位后面
   → 09:00-10:20 · 10:30-11:50 · 午休 12:00-13:00 · 13:00-14:20
   name='示例漫展' 时 mock BOOKINGS 会把 seq1(confirmed) seq2(pending) 算成已预订；
   换个名字（花瞳漫展）就没有任何预订，用来测午休会动的那条路径。
   ⚠️ 2026-09-29 起「一单属于哪一场」认的是【schedule_id】，不再认名字 ——
      所以这个地基档期必须挂上 mock 那两场示例档期里对应那一场的 id
      （示例漫展 05-02 = sched-demo-0502）。挂错了不是「没预订」，
      而是那些单会变成「哪一场都不属于」，测出来的东西全是假的。
   ⚠️ FREE 那一路（花瞳漫展）用一个【谁都不属于】的 id：mock 里没有单挂它。 */
function reset(name, date) {
  /* ⚠️ 这里【必须】给 storage 一个空的 zhuangli_schedules，不能只写 `{}`：
     只写 {} 的话 getSchedules() 会触发 seed()，把两场示例档期塞进来，
     而其中一场的 id 正好也是 sched-demo-0502 —— getSchedule 取 [0]，
     拿到的是那份示例档期，不是下面 addSchedule 加进去的这块地基。
     症状是「数据看着对但午休时长是 undefined」，很难查到这儿。 */
  wx._store = { zhuangli_schedules: [] }
  const built = generateSlots({ startTime: '09:00', slotMin: 80, gapMin: 10, count: 3,
    lunch: { enabled: true, min: 60, afterSeq: 2 } })
  const id = name === '示例漫展' ? 'sched-demo-0502' : 'sch-free'
  addSchedule({
    schedule_id: id,
    name, date,
    startTime: '09:00', slotMin: 80, gapMin: 10, count: 3,
    lunch: built.lunch, slots: built.slots
  })
  toasts.length = 0
  modalLog.length = 0
  modalAnswers = []
  inst.data = JSON.parse(JSON.stringify(cfg.data))
  inst.onLoad({ id })
}

const BOOKED = '示例漫展', FREE = '花瞳漫展'

// ── A. onLoad：已预订由假预约单推导 ──
console.log('\n[A] onLoad · 示例漫展')
reset(BOOKED, '2026-05-02')
console.log('  slots ' + dumpSlots() + '  lunch ' + lunch())
console.log('  rows  ' + dumpRows())
eq('seq1 marked booked（bk-2 confirmed）', inst.data.s.slots[0].booked, true)
eq('seq2 marked booked（bk-1 pending）', inst.data.s.slots[1].booked, true)
/* ★ 2026-09-29 用户定的新规则：done 也算「有人了」。
   做完了的妆位不能当空位再约给别人 —— 那天客人确实来过、这个位子确实被占了。 */
eq('★ seq3 也是 booked（bk-3 是 done，照样占着位子）', inst.data.s.slots[2].booked, true)
eq('rows = 3 slots + lunch in place', dumpRows(),
  's1:09:00-10:20B s2:10:30-11:50B L:12:00-13:00 s3:13:00-14:20B')
eq('rangeText', inst.data.rangeText, '09:00 – 14:20')

// ── B. 改午休【后面】的妆位：直接顺延，不弹问 ──
console.log('\n[B] 改 s3（午休后）80 → 100')
reset(BOOKED, '2026-05-02')
inst.onEdit(tap('s3'))
eq('editingKey', inst.data.editingKey, 's3')
eq('editMin prefilled', inst.data.editMin, '80')
eq('rows count unchanged while editing', inst.data.rows.length, 4)
inst.onEditInput({ detail: { value: '100' } })
inst.confirmEdit()
console.log('  slots ' + dumpSlots())
eq('slot3 grew', inst.data.s.slots[2].start + '-' + inst.data.s.slots[2].end, '13:00-14:40')
eq('editing closed', inst.data.editingKey, '')
eq('anchors untouched', inst.data.s.slots[0].start + '|' + inst.data.s.slots[1].start, '09:00|10:30')
eq('no modal for a post-lunch slot', modalLog.length, 0)

// ── C. 午休前面改妆位、中间卡着已预订妆位 → 不弹问、午休不动 ──
console.log('\n[C] 改 s1（示例漫展：s2 已预订卡在中间）80 → 40')
reset(BOOKED, '2026-05-02')
inst.onEdit(tap('s1'))
inst.onEditInput({ detail: { value: '40' } })
inst.confirmEdit()
console.log('  slots ' + dumpSlots() + '  lunch ' + lunch())
eq('★ no「要提前午休吗」弹窗（弹了也办不到）', modalLog.length, 0)
eq('★ lunch did NOT slide onto the booked slot', lunch(), '12:00-13:00(60)')
eq('booked anchor s2 untouched', inst.data.s.slots[1].start + '-' + inst.data.s.slots[1].end, '10:30-11:50')
eq('slot1 shrunk', inst.data.s.slots[0].start + '-' + inst.data.s.slots[0].end, '09:00-09:40')
eq('later slot untouched', inst.data.s.slots[2].start + '-' + inst.data.s.slots[2].end, '13:00-14:20')
eq('toast explains why the lunch stayed', /中间隔着已预订的妆位/.test(toasts[0] || ''), true)

// ── D. 没有预订的档期：缩短 → 弹问，确认 = 午休起止一起提前 ──
console.log('\n[D] 改 s1（花瞳漫展：没有预订）80 → 40，选「提前午休」')
reset(FREE, '2026-05-03')
eq('no bookings on this schedule', inst.data.s.slots.some((s) => s.booked), false)
inst.onEdit(tap('s1'))
inst.onEditInput({ detail: { value: '40' } })
modalAnswers = [true]
inst.confirmEdit()
console.log('  slots ' + dumpSlots() + '  lunch ' + lunch())
eq('modal asked', modalLog[0] && modalLog[0].title, '要提前午休吗？')
eq('lunch moved earlier with its end', lunch(), '11:20-12:20(60)')
eq('slot2 pulled earlier', inst.data.s.slots[1].start + '-' + inst.data.s.slots[1].end, '09:50-11:10')
eq('slot3 starts right after the lunch', inst.data.s.slots[2].start + '-' + inst.data.s.slots[2].end, '12:20-13:40')

// ── E. 同一档期：缩短但选「午休不动」 ──
console.log('\n[E] 改 s1 80 → 40，选「午休不动」')
reset(FREE, '2026-05-03')
inst.onEdit(tap('s1'))
inst.onEditInput({ detail: { value: '40' } })
modalAnswers = [false]
inst.confirmEdit()
console.log('  slots ' + dumpSlots() + '  lunch ' + lunch())
eq('lunch stays put', lunch(), '12:00-13:00(60)')
eq('slot2 pulled earlier anyway', inst.data.s.slots[1].start + '-' + inst.data.s.slots[1].end, '09:50-11:10')
eq('slot3 still starts at the lunch end', inst.data.s.slots[2].start + '-' + inst.data.s.slots[2].end, '13:00-14:20')
eq('toast says the lunch did not move', toasts[0], '已改，午休没动')

// ── F. 延长午休前的妆位 → 只推午休【起始】，结束不动 ──
console.log('\n[F] 改 s2 80 → 100（午休前最后一个）')
reset(FREE, '2026-05-03')
inst.onEdit(tap('s2'))
inst.onEditInput({ detail: { value: '100' } })
inst.confirmEdit()
console.log('  slots ' + dumpSlots() + '  lunch ' + lunch())
eq('lunch start pushed to 12:20, end still 13:00', lunch(), '12:20-13:00(40)')
eq('slot2 grew', inst.data.s.slots[1].start + '-' + inst.data.s.slots[1].end, '10:30-12:10')
eq('slot3 unchanged (starts at the lunch end)', inst.data.s.slots[2].start + '-' + inst.data.s.slots[2].end, '13:00-14:20')
eq('no modal asked', modalLog.length, 0)

// ── G. 延长到把午休整个挤没 → 先问，确认才取消午休 ──
console.log('\n[G] 改 s2 80 → 140：午休会被挤没')
reset(FREE, '2026-05-03')
inst.onEdit(tap('s2'))
inst.onEditInput({ detail: { value: '140' } })
modalAnswers = [true]
inst.confirmEdit()
console.log('  slots ' + dumpSlots() + '  lunch ' + lunch())
eq('asked first', modalLog[0] && modalLog[0].title, '午休会被挤没')
eq('lunch cancelled', lunch(), 'OFF')
eq('slot2 grew to 140', inst.data.s.slots[1].start + '-' + inst.data.s.slots[1].end, '10:30-12:50')
eq('slot3 still starts at 13:00', inst.data.s.slots[2].start + '-' + inst.data.s.slots[2].end, '13:00-14:20')
eq('toast says the lunch is gone', toasts[0], '已改：午休被挤掉，已取消午休')

// ── H. 「＋」只塞进空档：紧挨着就拒绝 ──
console.log('\n[H] ＋ 在 s1 下面（s2 紧跟着开始）→ 应拒绝')
reset(FREE, '2026-05-03')
inst.onInsert(tap('s1'))
console.log('  slots ' + dumpSlots())
eq('refused, nothing inserted', inst.data.s.slots.length, 3)
eq('refuse toast names the blocker', /没有空档：下一个妆位 10:30 就开始了/.test(toasts[0] || ''), true)
toasts.length = 0
inst.onInsert(tap('L'))
eq('＋ under the lunch row also refused (s3 starts 13:00)', inst.data.s.slots.length, 3)
eq('and says so', /没有空档/.test(toasts[0] || ''), true)

// ── I. 「＋」在最后一行下面 → 追加，撤销可回滚 ──
//      ⚠️ 默认插多长 = 这个档期自己的 slotMin（这里 80），不是写死的 30。
//         妆娘当天补一个跟别的妆位同时长的妆位是常态，插进来还要手动改时长很别扭。
console.log('\n[I] ＋ 在 s3 下面 → 追加一个同时长的妆位（80 分钟）；点取消回滚')
reset(FREE, '2026-05-03')
inst.onInsert(tap('s3'))
console.log('  slots ' + dumpSlots())
eq('★ 追加的是 80 分钟（跟档期的妆位时长一致），不是硬编码的 30',
  inst.data.s.slots[3].start + '-' + inst.data.s.slots[3].end + '/' + inst.data.s.slots[3].minutes,
  '14:30-15:50/80')
eq('editor opened on the new row', inst.data.editingKey, 's4')
eq('justInserted flag on', inst.data.justInserted, true)
toasts.length = 0
inst.cancelEdit()
console.log('  slots ' + dumpSlots())
eq('insert rolled back', dumpSlots(), '1:09:00-10:20(80) 2:10:30-11:50(80) 3:13:00-14:20(80)')
eq('撤销 toast', toasts[0], '已撤销插入')

// ── J. 删一个妆位腾出空档 → ＋ 把它插回去，后面时间一律不动 ──
console.log('\n[J] 删 s2 → ＋ 在 s1 下面插回来')
reset(FREE, '2026-05-03')
modalAnswers = [true]
inst.cancelSlot(del(2))
console.log('  slots ' + dumpSlots() + '  lunch ' + lunch())
eq('slot2 gone, no time changed', dumpSlots(), '1:09:00-10:20(80) 2:13:00-14:20(80)')
eq('lunch afterSeq moved up to 1', inst.data.s.lunch.afterSeq, 1)
eq('lunch time untouched', lunch(), '12:00-13:00(60)')
toasts.length = 0
inst.onInsert(tap('s1'))
console.log('  slots ' + dumpSlots())
eq('inserted into the gap (10:30–12:00 → 80 min，正好塞得下)', inst.data.s.slots[1].start + '-' + inst.data.s.slots[1].end, '10:30-11:50')
eq('the old s2 kept its time', inst.data.s.slots[2].start + '-' + inst.data.s.slots[2].end, '13:00-14:20')
eq('lunch afterSeq pushed back to 2', inst.data.s.lunch.afterSeq, 2)
eq('★ 行序仍按时间排：新妆位在午休【前面】', dumpRows(),
  's1:09:00-10:20 s2:10:30-11:50 L:12:00-13:00 s3:13:00-14:20')
eq('editor opened on the inserted row', inst.data.editingKey, 's2')
inst.cancelEdit()
eq('rollback also restores the lunch position', dumpRows(), 's1:09:00-10:20 L:12:00-13:00 s2:13:00-14:20')

// ── K. 删已预订的妆位：确认框要提醒 ──
console.log('\n[K] 删 s2（已预订）')
reset(BOOKED, '2026-05-02')
modalAnswers = [true]
inst.cancelSlot(del(2))
console.log('  slots ' + dumpSlots())
eq('★ 确认框里提醒了「已经有客人预订」', /已经有客人预订/.test(modalText()), true)
eq('remaining times untouched', dumpSlots(), '1:09:00-10:20(80)B 2:13:00-14:20(80)B')
eq('seq1 still booked', inst.data.s.slots[0].booked, true)

// ── L. 只剩一个妆位时不许再删 ──
console.log('\n[L] 删到只剩一个 → 拒绝')
reset(FREE, '2026-05-03')
modalAnswers = [true, true]
inst.cancelSlot(del(3))
inst.cancelSlot(del(2))
toasts.length = 0
inst.cancelSlot(del(1))
eq('refused to delete the last slot', inst.data.s.slots.length, 1)
eq('toast explains', /至少保留一个妆位/.test(toasts[0] || ''), true)
eq('rows = 1 slot + trailing lunch', dumpRows(), 's1:09:00-10:20 L:12:00-13:00')

// ── M. 取消午休：后面妆位时间一律不动 ──
console.log('\n[M] 取消午休')
reset(BOOKED, '2026-05-02')
modalAnswers = [true]
inst.cancelLunch()
console.log('  rows ' + dumpRows() + '  lunch ' + lunch())
eq('lunch row gone', inst.data.rows.some((r) => r.type === 'lunch'), false)
eq('lunch off', lunch(), 'OFF')
eq('no slot time changed', dumpSlots(), '1:09:00-10:20(80)B 2:10:30-11:50(80)B 3:13:00-14:20(80)B')
eq('rows keys', dumpRows().split(' ').map((x) => x.split(':')[0]).join(','), 's1,s2,s3')
eq('toast', toasts[0], '午休已取消')

// ── N. 改午休：起点 + 时长 ──
//    ⚠️ 2026-09-29 起这一节拆成两条路径，因为「后面那个妆位已经有人了」时
//       结果完全不同：妆位是【锚点】不许动，于是午休改完会顶到它头上，
//       必须先告诉妆娘，不能闷头顺延（那等于把客人的时间改掉了）。
console.log('\n[N-1] 改午休，后面那个妆位【已预订】→ 不许动它，撞上要提示')
reset(BOOKED, '2026-05-02')
inst.onEdit(tap('L'))
eq('editStart prefilled', inst.data.editStart, '12:00')
eq('editMin prefilled', inst.data.editMin, '60')
inst.onEditStart({ detail: { value: '13:00' } })
inst.onEditInput({ detail: { value: '45' } })
inst.confirmLunch()
console.log('  slots ' + dumpSlots() + '  lunch ' + lunch() + '  toast> ' + toasts[0])
eq('lunch moved & resized', lunch(), '13:00-13:45(45)')
eq('★ 已预订的 s3 钉在原地，没被推走',
  inst.data.s.slots[2].start + '-' + inst.data.s.slots[2].end, '13:00-14:20')
eq('slots before the lunch untouched',
  inst.data.s.slots[0].start + '|' + inst.data.s.slots[1].start, '09:00|10:30')
eq('editing closed', inst.data.editingKey, '')
eq('★ 撞上了就说出来，让她自己手动调（⛔ 不许闷头把客人的时间改掉）',
  toasts[0], '已改，但顶到了已预订的妆位，请手动调一下')

console.log('\n[N-2] 改午休，后面那个妆位没人 → 正常顺延')
reset(FREE, '2026-05-04')
inst.onEdit(tap('L'))
inst.onEditStart({ detail: { value: '13:00' } })
inst.onEditInput({ detail: { value: '45' } })
inst.confirmLunch()
console.log('  slots ' + dumpSlots() + '  lunch ' + lunch() + '  toast> ' + toasts[0])
eq('lunch moved & resized', lunch(), '13:00-13:45(45)')
eq('★ 后面的妆位跟着新午休结束时间走',
  inst.data.s.slots[2].start + '-' + inst.data.s.slots[2].end, '13:45-15:05')
eq('前面两个妆位不动',
  inst.data.s.slots[0].start + '|' + inst.data.s.slots[1].start, '09:00|10:30')
eq('顺延了就说顺延了', toasts[0], '午休已改，后面时段已顺延')

/* ── ②-B 新建档期页（壳 5）：参数 → 预览 ───────────────────────────────
   这一页的活就是「把参数算成时段表」，而且它刚出过一个【静默】的坏：
   午休选到超过妆位数的位置时什么都不生成、还存一条空记录。
   静默失败正是最该拿测试钉住的东西。 */
console.log('\n[B] 新建档期页 · 参数 → 预览')

let cfg2 = null
global.Page = (c) => { cfg2 = c }
require(R('妆历小程序/pages/schedule-edit/schedule-edit.js'))

const edit = {}
for (const k in cfg2) edit[k] = cfg2[k]
edit.data = JSON.parse(JSON.stringify(cfg2.data))
// setData 要支持 'form.count' 这种路径写法，否则改动全落在 data 顶层
edit.setData = function (patch) {
  for (const k in patch) {
    const parts = k.split('.')
    let o = this.data
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]]
    o[parts[parts.length - 1]] = patch[k]
  }
}
function setForm(k, v) { edit.setData({ ['form.' + k]: v }); edit.refreshPreview() }
function lunchOpts() { return edit.data.lunchOptions.map((o) => o.label).join(' | ') }

edit.onLoad({})
/* 日期默认【本机今天】（2026-09-30 用户定的）：进来就能直接建，想改点一下就行。
   ⚠️ 期望值现算，不写死某一天 —— 写死的话这条断言从第二天起就永远是红的，
      而红的原因跟被测代码毫无关系。 */
const TODAY = (() => {
  const d = new Date(), p = (n) => (n < 10 ? '0' : '') + n
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
})()
eq('★ 新建档期的日期默认跟随本机今天', edit.data.form.date, TODAY)
eq('★ 写成 YYYY-MM-DD（picker mode="date" 只认这个形状，2026-5-2 它会空着）',
  /^\d{4}-\d{2}-\d{2}$/.test(edit.data.form.date), true)
console.log('  默认：' + edit.data.preview.length + ' 个妆位 · ' + edit.data.rangeText)
console.log('  午休选项：' + lunchOpts())
eq('默认 3 个妆位', edit.data.preview.length, 3)
eq('★ 午休选项跟着妆位数走（3 个），不是写死的 1..8', edit.data.lunchOptions.length, 3)
eq('★ 每项直接写出几点开始',
  edit.data.lunchOptions.map((o) => o.value + '@' + o.label.split('· ')[1]).join(' '),
  '1@10:30 起 2@12:00 起 3@13:30 起')
// 默认 form.lunchAfter = 2，所以选中项和索引都要对上第 2 项
eq('默认选中第 2 项', edit.data.lunchLabel, '第 2 个妆位之后 · 12:00 起')
eq('索引跟着选中项', edit.data.lunchAfterIndex, 1)

// 打开午休，选「第 3 个妆位之后」—— 这一项在老版本里是存在但【不生效】的
edit.setData({ 'form.lunchEnabled': true })
setForm('lunchAfter', 3)
console.log('  午休在第 3 个之后 → ' + lunchStr(edit.data.lunch) + '  标签「' + edit.data.lunchLabel + '」')
eq('★ 午休真的落在第 3 个妆位后面（13:30）', lunchStr(edit.data.lunch), '13:30-14:30(60) after3')
eq('预览里贴上了午休注释',
  edit.data.slotsView[2].lunchAfter, '后接午休 13:30 – 14:30')

// 妆位数改小 → 午休位置必须跟着夹回来，否则午休会静默消失
setForm('count', 2)
console.log('  妆位数改 2 → after=' + edit.data.form.lunchAfter + '  ' + lunchStr(edit.data.lunch))
eq('★ afterSeq 被夹回 2', edit.data.form.lunchAfter, 2)
eq('★ 午休没消失', lunchStr(edit.data.lunch), '12:00-13:00(60) after2')
eq('选项也跟着变少', edit.data.lunchOptions.length, 2)

// 妆位数改大 → 后面的位置回来了
setForm('count', 5)
console.log('  妆位数改 5 → 选项 ' + lunchOpts())
eq('选项扩到 5 个', edit.data.lunchOptions.length, 5)
eq('最后一个选项就是当天的收尾时间',
  edit.data.lunchOptions[4].label, '第 5 个妆位之后 · 16:30 起')

// 选最后一个妆位后面（收工后那一段）
setForm('lunchAfter', 5)
console.log('  午休在第 5 个之后 → ' + lunchStr(edit.data.lunch))
eq('★ 最后一个妆位后面也能放', lunchStr(edit.data.lunch), '16:30-17:30(60) after5')

// ★ 存出去的午休记录不许有空起止（老版本这里会存出 {start:'',end:''} → 详情页 NaN）
{
  const rec = edit.buildLunchRecord()
  console.log('  buildLunchRecord ' + JSON.stringify(rec))
  eq('记录里 afterSeq 正确', rec.afterSeq, 5)
  eq('★ start 是能解析的时间，不是空串', Number.isFinite(toMin(rec.start)), true)
  eq('★ end 是能解析的时间', Number.isFinite(toMin(rec.end)), true)
  eq('start/end 对得上', rec.start + '–' + rec.end, '16:30–17:30')
}

// 妆位数被清空：不崩、夹到 1 个、午休跟着夹
edit.setData({ 'form.count': '' })
edit.refreshPreview()
console.log('  妆位数清空 → ' + edit.data.preview.length + ' 个妆位, after=' + edit.data.form.lunchAfter)
eq('妆位数清空不崩，按 1 个算', edit.data.preview.length, 1)
eq('午休夹到第 1 个之后', edit.data.form.lunchAfter, 1)
// 只剩 1 个妆位：09:00–10:20，午休 = 10:20 + 间隔 10 分 = 10:30–11:30
eq('午休照常生成', lunchStr(edit.data.lunch), '10:30-11:30(60) after1')

// 关掉午休 → 记录里 enabled=false，且不含任何时间
edit.setData({ 'form.lunchEnabled': false })
edit.refreshPreview()
{
  const rec = edit.buildLunchRecord()
  console.log('  关掉午休后 buildLunchRecord ' + JSON.stringify(rec))
  eq('enabled=false', rec.enabled, false)
  eq('不带 start/end', rec.start === undefined && rec.end === undefined, true)
  eq('预览里没有午休', edit.data.lunch, null)
}

// 存的时候存的是【预览那一份】，不是拿 form 重算——两者夹的值必须一致
edit.setData({ 'form.lunchEnabled': true })
setForm('count', 4)
setForm('lunchAfter', 4)
eq('保存前预览 = 4 个妆位', edit.data.preview.length, 4)
eq('预览与 form 的 afterSeq 一致', edit.data.form.lunchAfter, 4)
// 4 个妆位排到 14:50 收工，午休 = 14:50 + 10 = 15:00–16:00
eq('午休在第 4 个之后', lunchStr(edit.data.lunch), '15:00-16:00(60) after4')

/* ══════════════════════════════════════════════════════════════════════
   ③ 导航栏宽度算式
   把「标题为什么压不住右侧按钮」写成可执行的算术 —— 这段是 CSS 规则的
   模型（不是浏览器本身），所以它证明的是「按现在这套规则算下来不会重叠」，
   真机观感仍要人眼看一次。
   规则：胶囊避让的 padding 挂在整条 .nv 上，左右两段平分【可用宽度】。
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n════ ③ 导航栏宽度算式 ════')

const RPX = 750                       // 750rpx = 屏宽
const BAR_PAD = 22                    // .nv 左右各 22rpx
const TITLE = 66 + 26                 // 标题「档期」2 字 × 33rpx + 左右 padding 26rpx
const ACTIONS = 2 * (2 * 30) + 26     // 「模板」「新建」各 2 字 × 30rpx + 间隔 26rpx

function layout(winW, capsulePx) {
  const capsule = capsulePx * RPX / winW              // 胶囊避让宽度，换算成 rpx
  const usable = RPX - BAR_PAD * 2 - capsule          // 让开胶囊之后的可用宽度
  const half = (usable - TITLE) / 2                   // 左右两段各分到多少
  const toPx = (rpx) => rpx * winW / RPX
  return {
    usable: toPx(usable), half: toPx(half),
    titleRight: toPx(BAR_PAD + half + TITLE),
    actLeft: toPx(BAR_PAD + half + TITLE + half) - toPx(ACTIONS),
    actRight: winW - toPx(BAR_PAD) - capsulePx,
    clamped: toPx(half) < toPx(ACTIONS)
  }
}

// 胶囊是固定物理尺寸、贴右放的：屏宽 - 胶囊左边缘 ≈ 94px，各家都差不多，
// 再留 8px 余量 → 约 102px。真机上这个数由 wx.getMenuButtonBoundingClientRect 给。
;[320, 360, 375, 390, 414, 428].forEach((w) => {
  const L = layout(w, 102)
  console.log('  ' + w + 'px 屏：两段各 ' + L.half.toFixed(1) + 'px，右侧要 ' + (ACTIONS * w / RPX).toFixed(1)
    + 'px；标题右缘 ' + L.titleRight.toFixed(1) + ' → 按钮左缘 ' + L.actLeft.toFixed(1)
    + '（净空 ' + (L.actLeft - L.titleRight).toFixed(1) + 'px），按钮右缘距右屏边 ' + (w - L.actRight).toFixed(1) + 'px')
  eq(w + 'px 屏：右段分得到的宽度够放两个按钮（不用压到标题）', L.clamped, false)
  eq(w + 'px 屏：标题与按钮之间留得出净空', L.actLeft - L.titleRight > 8, true)
  eq(w + 'px 屏：按钮止步在胶囊左边（≥8px 余量）', w - L.actRight >= 102 - 8, true)
})

// 旧的排法：标题绝对定位横跨整条（居中于整屏），避让 padding 挂在右段里。
// 右段的最小宽度 = 按钮 73px + 避让 102px = 175px，它的盒于是从
// 375 - 11 - 175 = 189px 处开始 —— 而标题右缘在 187.5 + 23 = 210.5px。
{
  const w = 375, capsulePx = 102
  const barPad = BAR_PAD * w / RPX
  const actPx = ACTIONS * w / RPX
  const oldRightGroupLeft = w - barPad - (actPx + capsulePx)
  const oldTitleRight = w / 2 + TITLE * w / RPX / 2
  console.log('\n  [旧排法对照] 375px 屏：标题右缘 ' + oldTitleRight.toFixed(1)
    + 'px，右段内容左缘 ' + oldRightGroupLeft.toFixed(1) + 'px → 压了 '
    + (oldTitleRight - oldRightGroupLeft).toFixed(1) + 'px')
  eq('★ 旧排法在 375px 屏上必然重叠（这就是真机看到的那个 bug）',
    oldTitleRight > oldRightGroupLeft, true)
}

/* ── center="screen"（档期 / 预约单：动作放左上角）─────────────────────
   目标：标题居中于【整屏】，且动作贴在左边不碰胶囊。
   这里要证明的是「为什么标题必须脱流」—— 光给左右加一样宽的留白没用。 */
console.log('\n  [center="screen" · 档期页] 动作在左上角，标题居中于整屏')

function layoutCS(winW, capsulePx) {
  const toPx = (rpx) => rpx * winW / RPX
  const actPx = toPx(ACTIONS)
  const barPadPx = toPx(BAR_PAD)
  const titleMaxPx = winW - capsulePx * 2      // nav.js 给标题的 max-width 缰绳
  return {
    actLeft: barPadPx,
    actRight: barPadPx + actPx,
    titleMaxPx,
    // 绝对定位，left:50% + translateX(-50%) → 左右边距必然相等
    titleMaxLeft: (winW - titleMaxPx) / 2,
    titleMaxRight: (winW + titleMaxPx) / 2
  }
}

;[320, 360, 375, 390, 414, 428].forEach((w) => {
  const L = layoutCS(w, 102)
  console.log('  ' + w + 'px 屏：动作占 [' + L.actLeft.toFixed(1) + ', ' + L.actRight.toFixed(1)
    + ']px，标题 max-width ' + L.titleMaxPx.toFixed(1) + 'px（撑满时占 ['
    + L.titleMaxLeft.toFixed(1) + ', ' + L.titleMaxRight.toFixed(1) + ']px）')
  eq(w + 'px 屏：标题居中于整屏（左右边距相等）',
    L.titleMaxLeft, w - L.titleMaxRight)
  eq(w + 'px 屏：标题撑到最宽也不碰左边的动作', L.titleMaxLeft > L.actRight, true)
  eq(w + 'px 屏：标题撑到最宽仍止步在胶囊左边（≥8px 余量）',
    w - L.titleMaxRight >= 102 - 8, true)
  // 缰绳之所以顺手也挡住了左边：胶囊避让恒宽于那两个动作
  eq(w + 'px 屏：避让宽（102）比动作宽（' + (ACTIONS * w / RPX).toFixed(1) + '）宽 —— 同一根缰绳管两边',
    (ACTIONS * w / RPX) < 102, true)
})

// ── 对照：标题【留在流里】+ 左右加一样宽的留白，能不能居中？──
// 不能。flex 拿内容最小宽度当起点再加等份 → 左边有动作、右边空着，
// 标题恒偏「动作宽 / 2」，而且这个偏移跟屏宽、跟留白多少全都无关。
function layoutSymmetric(winW, capsulePx) {
  const c = capsulePx * RPX / winW
  const inner = RPX - 2 * c
  const free = inner - ACTIONS - TITLE                 // 标题 flex:none，先扣掉
  const nvL = ACTIONS + free / 2                       // 左段：动作宽 + 一份等分
  const nvR = free / 2                                 // 右段：只有一份等分
  return {
    offsetPx: (nvL - nvR) / 2 * winW / RPX,
    nvLPx: nvL * winW / RPX,
    nvRPx: nvR * winW / RPX
  }
}
;[320, 375, 428].forEach((w) => {
  const S2 = layoutSymmetric(w, 102)
  console.log('\n  [对称留白对照 · ' + w + 'px 屏] 左段 ' + S2.nvLPx.toFixed(1) + 'px / 右段 '
    + S2.nvRPx.toFixed(1) + 'px → 标题偏右 ' + S2.offsetPx.toFixed(1) + 'px')
  eq(w + 'px 屏：★ 标题恒偏「动作宽 ÷ 2」＝ '
    + (ACTIONS * w / RPX / 2).toFixed(1) + 'px —— 所以「左右加对称留白」这招根本没用',
    Math.round(S2.offsetPx * 10), Math.round(ACTIONS * w / RPX / 2 * 10))
})

/* ══════════════════════════════════════════════════════════════════════
   ④ 可拖动圆钮（档期模板页的「＋」）
   用户要求：「初始放在屏幕右下，可拖动移动到其他地方，但不超过最上边的
   档期模板那个地」—— 那块地方就是自定义导航栏（标题「档期模板」+
   「‹ 返回」）。所以这里的核心断言只有一条：
   【任何一次拖动，圆钮的上沿都不许越过导航栏下沿。】
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n════ ④ 可拖动圆钮（档期模板「＋」）════')

const NB = require(R('妆历小程序/utils/navbar.js'))

// 一台 375×812 的全面屏：状态栏 44、胶囊顶部 48、高 32 → 导航栏 40
const INFO = { windowWidth: 375, windowHeight: 812, statusBarHeight: 44, safeArea: { bottom: 778 } }
const RECT = { top: 48, height: 32, left: 281, width: 87, right: 368, bottom: 80 }

const nm = NB.navMetrics(INFO, RECT)
console.log('  375×812 全面屏 → 状态栏 ' + nm.statusH + '，导航栏 ' + nm.navH
  + '，导航栏下沿 ' + nm.navBottom + '，避让宽 ' + nm.capsulePad
  + '，底部安全区 ' + nm.insetBottom)
eq('导航栏高 = (胶囊顶 - 状态栏) * 2 + 胶囊高', nm.navH, (48 - 44) * 2 + 32)
eq('导航栏下沿 = 状态栏 + 导航栏高', nm.navBottom, 44 + 40)
eq('避让宽 = 屏宽 - 胶囊左缘 + 8', nm.capsulePad, 375 - 281 + 8)
eq('底部安全区 = 窗口高 - safeArea.bottom', nm.insetBottom, 812 - 778)

// ── 胶囊接口返回垃圾值时的两道闸（这段逻辑刚从 nav.js 挪过来，钉住别再退化）──
{
  const zero = NB.navMetrics(INFO, { top: 0, height: 0, left: 0, width: 0, right: 0, bottom: 0 })
  eq('★ 胶囊返回全 0 → 退回默认避让宽', zero.capsulePad, 96)
  eq('★ 胶囊返回全 0 → 退回默认导航栏高', zero.navH, 44)
  // 胶囊宽度大过半个屏：明显不是真胶囊
  const wide = NB.navMetrics(INFO, { top: 48, height: 32, left: 30, width: 300 })
  eq('★ 胶囊宽过半屏 → 不采信', wide.capsulePad, 96)
  const noRect = NB.navMetrics(INFO, null)
  eq('拿不到胶囊 → 全走默认', [noRect.navH, noRect.capsulePad], [44, 96])
  eq('拿不到窗口信息 → 也不崩', NB.navMetrics(null, null).winW, 375)
}

const box = NB.fabBounds(nm)
const size = Math.round(nm.winW * 0.15)
const home = NB.fabHome(size, 20, box)
console.log('  拖动范围 left=' + box.left + ' top=' + box.top
  + ' right=' + box.right + ' bottom=' + box.bottom + '；圆钮 ' + size + 'px')
console.log('  初始位置 → x=' + home.x + ' y=' + home.y + '（右下角，离边 20px）')
eq('★ 拖动范围的上沿就是导航栏下沿（圆钮越不过去）', box.top, nm.navBottom)
eq('拖动范围的下沿让开了全面屏横杠', box.bottom, 812 - 34)
eq('圆钮直径 ≈ 屏宽的 15%', size, 56)
eq('初始位置贴右下角', [home.x, home.y], [375 - 56 - 20, 778 - 56 - 20])

// ── 核心那条：往哪个方向拖过，圆钮都完整待在允许的范围里 ──
{
  const tries = [
    ['往左上角狠拖（想钻到导航栏底下）', -500, -500],
    ['往上拖到导航栏里', 0, -900],
    ['往右下角狠拖（想出屏）', 900, 900],
    ['往左出屏', -900, 300],
    ['正常拖到屏幕中间', -100, -200]
  ]
  let worstY = Infinity
  tries.forEach(([label, dx, dy]) => {
    const p = NB.clampFab(home.x + dx, home.y + dy, size, box)
    worstY = Math.min(worstY, p.y)
    console.log('  ' + label + ' → x=' + p.x + ' y=' + p.y)
    eq('  ↑ 上沿 ' + p.y + ' ≥ 导航栏下沿 ' + nm.navBottom, p.y >= nm.navBottom, true)
    eq('  ↑ 整颗圆钮在屏内', p.x >= 0 && p.y >= box.top
      && p.x + size <= box.right && p.y + size <= box.bottom, true)
  })
  eq('★ 最靠上的一次拖动，上沿正好停在导航栏下沿（不是"差不多"）', worstY, nm.navBottom)
}

// ── 存的位置换台机器可能就废了：取出来要先夹一遍 ──
{
  const sm = NB.navMetrics({ windowWidth: 320, windowHeight: 568, statusBarHeight: 20 }, null)
  const sbox = NB.fabBounds(sm)
  const ssize = Math.round(sm.winW * 0.15)
  // 上个手机（375 宽）存在右下角的位置，到大屏换小屏上就出界了
  const stale = NB.clampFab(299, 702, ssize, sbox)
  console.log('\n  [换机型] 375 宽存的 (299,702) → 320×568 上夹成 (' + stale.x + ',' + stale.y + ')')
  eq('★ 越界的旧位置被夹回屏内', [stale.x, stale.y], [320 - 48, 568 - 48])
  eq('★ 夹完仍在导航栏下面', stale.y >= sbox.top, true)
}

/* ── ④-B 档期模板页的手势本身（打桩 wx/Page）─────────────────────────
   纯函数对了不代表手势对：「点」和「拖」长在同一个元素上，
   判错的后果是【拖完顺手把页面带进新建模板】—— 最烦人的一种误触。 */
console.log('\n[④-B] 档期模板页 · 圆钮的手势')

{
  const store = {}
  const navs = []
  global.wx = {
    getWindowInfo: () => INFO,
    getMenuButtonBoundingClientRect: () => RECT,
    getStorageSync: (k) => store[k],
    setStorageSync: (k, v) => { store[k] = v },
    navigateTo: (o) => navs.push(o.url),
    getStorageInfoSync: () => ({ keys: [] })
  }

  let cfg = null
  global.Page = (c) => { cfg = c }
  delete require.cache[require.resolve(R('妆历小程序/pages/template-list/template-list.js'))]
  require(R('妆历小程序/pages/template-list/template-list.js'))

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
  const touch = (x, y) => ({ touches: [{ clientX: x, clientY: y }] })
  const goNewCount = () => navs.length
  // 每个小 case 都从同一个位置起手 —— 不然上一 case 把圆钮挪走了，下面的期望全跟着飘
  const put = (x, y) => pg.setData({ 'fab.x': x, 'fab.y': y })

  pg.onLoad()
  console.log('  首次进入 → x=' + pg.data.fab.x + ' y=' + pg.data.fab.y + ' 直径 ' + pg.data.fab.size)
  eq('首次进入落在右下角', [pg.data.fab.x, pg.data.fab.y], [299, 702])
  eq('初始 ready=true（不闪现在左上角）', pg.data.fab.ready, true)

  // ① 纯点一下（手指一点没动）→ 进新建模板，位置纹丝不动
  put(299, 702)
  pg.onFabStart(touch(320, 720))
  pg.onFabEnd(touch(320, 720))
  eq('★ 点一下 → 进新建模板', goNewCount(), 1)
  eq('点一下不动位置', [pg.data.fab.x, pg.data.fab.y], [299, 702])

  // ② 手抖 5px 仍算「点」：进新建模板，且位置要回到原处
  put(299, 702)
  pg.onFabStart(touch(320, 720))
  pg.onFabMove(touch(323, 722))
  pg.onFabEnd(touch(323, 722))
  eq('手抖 5px 仍算点，进新建模板', goNewCount(), 2)
  eq('★ 抖完位置回到原处（判成"点"就不许把圆钮蹭歪）',
    [pg.data.fab.x, pg.data.fab.y], [299, 702])

  // ③ 动过 8px（超过阈值 6px）算「拖」→ 不进新建模板，位置留住并记下来
  put(299, 702)
  pg.onFabStart(touch(320, 720))
  pg.onFabMove(touch(328, 728))
  pg.onFabEnd(touch(328, 728))
  console.log('  拖 8px → x=' + pg.data.fab.x + ' y=' + pg.data.fab.y)
  eq('★ 动过 8px 就算拖，不进新建模板', goNewCount(), 2)
  eq('位置跟着手指走', [pg.data.fab.x, pg.data.fab.y], [307, 710])
  eq('★ 拖完的位置记进了 storage', [store.zhuangli_fab_tpl.x, store.zhuangli_fab_tpl.y], [307, 710])

  // ④ 长距离斜拖 → 一路跟手
  put(299, 702)
  pg.onFabStart(touch(320, 720))
  pg.onFabMove(touch(320, 600))
  pg.onFabMove(touch(120, 400))
  pg.onFabEnd(touch(120, 400))
  eq('长距离拖 → 跟到手指落点', [pg.data.fab.x, pg.data.fab.y], [99, 382])

  // ⑤ 往导航栏里狠拖 → 上沿停在下沿，不许盖住标题和「‹ 返回」
  put(299, 702)
  pg.onFabStart(touch(320, 720))
  pg.onFabMove(touch(320, -2000))
  pg.onFabEnd(touch(320, -2000))
  console.log('  往导航栏里狠拖 (dy=-2720) → y=' + pg.data.fab.y + '（导航栏下沿 ' + nm.navBottom + '）')
  eq('★ 拖不上去：上沿正好停在导航栏下沿', pg.data.fab.y, nm.navBottom)
  eq('★ 记进 storage 的也是夹过的值', store.zhuangli_fab_tpl.y, nm.navBottom)

  // ⑥ 重进页面 → 用回存下的位置（不是又回右下角）
  pg.data.fab = { x: 0, y: 0, size: 56, ready: false }
  pg.onLoad()
  eq('★ 重进页面还在你放的地方', [pg.data.fab.x, pg.data.fab.y], [299, nm.navBottom])

  // ⑦ 存的位置是坏数据 → 不崩，退回右下角
  store.zhuangli_fab_tpl = { x: 'aaa', y: null }
  pg.data.fab = { x: 0, y: 0, size: 56, ready: false }
  pg.onLoad()
  eq('坏数据 → 退回右下角，不崩', [pg.data.fab.x, pg.data.fab.y], [299, 702])
}

/* ══════════════════════════════════════════════════════════════════════
   ⑤ 模板 → 档期（模板页「应用」）
   ══════════════════════════════════════════════════════════════════════
   为什么单独测：「应用」以前只弹个 toast 就完事（点了等于没点），现在要
   【当场生成一条完整档期】。而模板里只存了名称和妆位，可档期要的是起始
   时间 / 妆位时长 / 间隔 / 午休 —— 少推一样，生成出来的档期排班就是错的。

   ⚠️ 妆位有【两种历史形状】，两种都得认：
       新建模板存的：{ seq, start:'09:00', end:'10:20', minutes:80 }
       老示例存的  ：{ seq, time:'09:00 – 10:20' }  ← 带空格的短横线
      用户手机上已经装着的旧 seed 就是后者，光改 mock 数据救不了他。
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n════ ⑤ 模板 → 档期（「应用」）════')

const TS = require(R('妆历小程序/utils/templateStore.js'))
const { templateToSchedule } = TS
const { getSchedules } = require(R('妆历小程序/utils/scheduleStore.js'))

// ── 老格式：起止得从 time 那串文本里捞出来 ──
{
  const tpl = {
    template_id: 't-legacy', name: '老格式模板', updated: '2026-05-01',
    slots: [
      { seq: 1, time: '09:00 – 10:20' },
      { seq: 2, time: '10:30 – 11:50' },
      { seq: 3, time: '12:00 – 13:20' }
    ]
  }
  const s = templateToSchedule(tpl, '2026-05-04', 'sch-x')
  console.log('\n[老格式] 起始 ' + s.startTime + ' · slotMin=' + s.slotMin + ' · gapMin=' + s.gapMin +
              ' · count=' + s.count + ' · lunch=' + (s.lunch ? 'YES' : 'null'))
  console.log('   ' + dump(s.slots))
  eq('起止从 time 里捞出来', dump(s.slots), '1:09:00-10:20(80) 2:10:30-11:50(80) 3:12:00-13:20(80)')
  eq('★ 妆位时长 = 模板的妆位时长（不是写死的 30）', s.slotMin, 80)
  eq('★ 间隔从妆位之间反推（10:20 → 10:30）', s.gapMin, 10)
  eq('★ 老模板没有午休记录 → 就是没有，不许凭空编一个出来', s.lunch, null)
  eq('日期用的是用户在 picker 里选的那天', s.date, '2026-05-04')
  eq('名称带过来了', s.name, '老格式模板')
  eq('新档期当然还没有人预订', s.slots.map((x) => x.booked), [false, false, false])
  // 真正的证明：应用出来的妆位表 = 按推出来的参数现排一次的结果
  eq('★ 生成的妆位表 = 用推出来的参数现排的妆位表',
    s.slots.map((x) => x.start + '-' + x.end).join(' '),
    generateSlots({ startTime: '09:00', slotMin: 80, gapMin: 10, count: 3 })
      .slots.map((x) => x.start + '-' + x.end).join(' '))
}

// ── 新格式 + 午休：这几样必须原样带过来，不能被解析过程吃掉 ──
{
  const tpl = {
    template_id: 't-new', name: '带午休的模板', updated: '2026-05-02',
    startTime: '09:00', slotMin: 80, gapMin: 10,
    lunch: { enabled: true, min: 60, afterSeq: 2, start: '12:00', end: '13:00' },
    slots: [
      { seq: 1, start: '09:00', end: '10:20', minutes: 80, is_break: false, booked: false },
      { seq: 2, start: '10:30', end: '11:50', minutes: 80, is_break: false, booked: false },
      { seq: 3, start: '13:00', end: '14:20', minutes: 80, is_break: false, booked: false }
    ]
  }
  const s = templateToSchedule(tpl, '2026-05-05', 'sch-y')
  eq('★ 模板块的午休带过来了（浅蓝那一行不会丢）', lunchStr(s.lunch), '12:00-13:00(60) after2')
  eq('slotMin 用模板自己的，不去反推', s.slotMin, 80)
  eq('gapMin 用模板自己的，不去反推（13:00-11:50=70 是午休，不是间隔）', s.gapMin, 10)
  // ⚠️ 上面这条正是「不许用妆位间隔去覆盖模板设置」的理由：带午休的模板里，
  //    seq2→seq3 之间隔着午休，硬推会算出 70 分钟间隔。
  eq('template_id / updated 这些模板专属字段不混进档期', !!s.template_id, false)
}

// ── 空模板 / 坏数据：不许崩 ──
{
  const s0 = templateToSchedule({ template_id: 't0', name: '空模板', slots: [] }, '2026-05-04', 'sch-0')
  eq('空模板 → 0 个妆位，不崩', [s0.count, s0.slots.length], [0, 0])
  const sb = templateToSchedule({ slots: [{ seq: 1, time: '不是时间' }] }, '2026-05-04', 'sch-b')
  eq('time 里捞不到 HH:MM → 落到兜底时长，不崩', sb.slots[0].minutes, 80)
  const sn = templateToSchedule(null, '2026-05-04', 'sch-n')
  eq('模板是 null → 空档期，不崩', [sn.name, sn.count], ['未命名档期', 0])
}

// ── 页面：点「应用」→ 选日期 → 生成档期 → 直接进详情页 ──
console.log('\n[⑤-B] 档期模板页 · 「应用」的手势与落库')

{
  const store = {}
  const navs = []
  const toasts = []
  /* 弹框桩（2026-09-30 加）。
     ⚠️ success 回调【同步】调 —— 定时的东西都由下面那个 timers 管，
        弹框不掺和进来，否则每个断言前面都得记得 flush 一次。
     modalReply.content === null → 用弹框自带的 content 当用户输入，
        也就是「一个字没改」（那个 content 就是模板名）。
     想演「用户把名字改了」就把它设成那个名字；想演「点了返回」就
     confirm = false。跟 ⑥-C 那套 modalAnswer 是同一个套路。 */
  let modalReply = { confirm: true, content: null }
  const modals = []
  global.wx = {
    getWindowInfo: () => INFO,
    getMenuButtonBoundingClientRect: () => RECT,
    getStorageSync: (k) => store[k],
    setStorageSync: (k, v) => { store[k] = v },
    navigateTo: (o) => navs.push(o.url),
    showToast: (o) => toasts.push(o.title),
    showModal: (o) => {
      modals.push(o)
      if (o.success) {
        o.success({
          confirm: modalReply.confirm,
          cancel: !modalReply.confirm,
          content: modalReply.content == null ? (o.content || '') : modalReply.content
        })
      }
    },
    getStorageInfoSync: () => ({ keys: [] })
  }

  // 跳转排在 setTimeout 后面（先让「已生成档期」这个 toast 看得见）。
  // 这里把定时器收进数组、由测试自己决定什么时候触发 —— 既不会让断言跑在
  // 回调前面，也顺带钉住「确实是延后跳的，不是当场跳走」。
  const timers = []
  const realSetTimeout = global.setTimeout
  global.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length }
  const flush = () => { const t = timers.splice(0); t.forEach((x) => x.fn()) }

  let cfg = null
  global.Page = (c) => { cfg = c }
  delete require.cache[require.resolve(R('妆历小程序/pages/template-list/template-list.js'))]
  require(R('妆历小程序/pages/template-list/template-list.js'))

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
  const pick = (id, date) => ({ currentTarget: { dataset: { id } }, detail: { value: date } })

  pg.onLoad()
  eq('★ 日期选择器默认停在今天', /^\d{4}-\d{2}-\d{2}$/.test(pg.data.today), true)
  eq('默认值就是本机今天', pg.data.today, (() => {
    const d = new Date(), p = (n) => (n < 10 ? '0' : '') + n
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
  })())

  /* ⚠️ 这一段【不拿 mock 里的示例模板当基准】。
     示例数据是「人会去改」的东西（改个名字、加一单、换个格式都合理），
     拿它当基准的话，改一次断言就红一片，而红的原因跟被测代码毫无关系。
     所以自己往 storage 里塞一条【形状完整】的模板当基准；
     示例模板另外单独过一遍「不崩 + 时间对」，那只要求形状无关的性质。 */
  const FIX = {
    template_id: 't-fix', name: '基准模板', updated: '2026-05-01',
    startTime: '09:00', slotMin: 80, gapMin: 10,
    lunch: { enabled: true, min: 60, afterSeq: 2, start: '12:00', end: '13:00' },
    slots: [
      { seq: 1, start: '09:00', end: '10:20', minutes: 80, is_break: false, booked: false },
      { seq: 2, start: '10:30', end: '11:50', minutes: 80, is_break: false, booked: false },
      { seq: 3, start: '13:00', end: '14:20', minutes: 80, is_break: false, booked: false }
    ]
  }
  /* ⚠️ 清单里【本来就垫着两场示例档期】—— scheduleStore 的 seed() 干的
     （用户 2026-09-29 定的，好让场次筛选一打开就有东西可选）。
     所以这里不能断言「一共 1 条」，要看的是「多出来的那条是不是新的」。 */
  const before = getSchedules().map((x) => x.schedule_id)
  store.zhuangli_templates = [FIX]
  pg.apply(pick('t-fix', '2026-05-04'))

  const added = getSchedules().filter((x) => before.indexOf(x.schedule_id) < 0)
  eq('★ 点「应用」真的写进去了一条档期（不再是弹个 toast 就完事）', added.length, 1)
  const sc = added[0]
  console.log('  生成 → ' + sc.name + ' ' + sc.date + ' · slotMin=' + sc.slotMin +
              ' · gapMin=' + sc.gapMin + ' · lunch=' + lunchStr(sc.lunch))
  console.log('   ' + dump(sc.slots))
  eq('名称 = 模板名', sc.name, FIX.name)
  eq('★ 日期 = 用户在 picker 里选的那天', sc.date, '2026-05-04')
  eq('★ 妆位表跟模板一字不差', dump(sc.slots), dump(FIX.slots))
  eq('★ 妆位时长 = 模板的（当天再点「＋」补妆位时也用它）', sc.slotMin, FIX.slotMin)
  eq('★ 午休跟着过来（浅蓝那一行）', lunchStr(sc.lunch), '12:00-13:00(60) after2')
  eq('给了「已生成档期」的反馈', toasts[toasts.length - 1], '已生成档期')
  eq('落库的那一刻还没跳走（toast 得让人看见）', navs.length, 0)
  eq('★ 跳转是延后 1 秒发出的', timers[0] && timers[0].ms, 1000)
  flush()
  eq('★ 生成完直接进新档期的详情页', navs[navs.length - 1],
    '/pages/schedule-detail/schedule-detail?id=' + sc.schedule_id)

  // ── 漫展名可改（2026-09-30 用户定的）──────────────────────────────
  //    日期选完之后再弹一个【可输入】的框问这场叫什么，预填模板名。
  //    同一个模板会套到不同的漫展上，名字不能锁死在模板里。
  {
    const mName = modals[modals.length - 1]
    eq('★ 选完日期会再问一句「这一场叫什么」', mName.title, '这一场叫什么')
    eq('★ 那个框是可以打字的', mName.editable, true)
    eq('★ 预填模板名（不改就还是它）', mName.content, FIX.name)
    eq('确认键写的是「生成档期」', mName.confirmText, '生成档期')

    // 改了名字 → 落库的是新名字
    const nA = getSchedules().length
    let nv = navs.length
    modalReply = { confirm: true, content: '  CP2026 上海  ' }
    pg.apply(pick('t-fix', '2026-05-05'))
    const scA = getSchedules()[getSchedules().length - 1]
    eq('★ 改了漫展名 → 档期用的是新名字', scA.name, 'CP2026 上海')
    eq('还是只多一条', getSchedules().length, nA + 1)
    eq('日期照样是选的那天', scA.date, '2026-05-05')
    flush()
    eq('改名之后也照常跳进详情页', navs.length, nv + 1)

    // 只打了空格 → 等于没改，回落到模板名（别落一个空名字）
    const nB = getSchedules().length
    modalReply = { confirm: true, content: '   ' }
    pg.apply(pick('t-fix', '2026-05-06'))
    eq('★ 名字填了空白 → 回落到模板名，不落空名字', getSchedules()[getSchedules().length - 1].name, FIX.name)
    eq('照样落库', getSchedules().length, nB + 1)
    flush()

    // 点「返回」→ 什么都不发生
    const nC = getSchedules().length
    const navC = navs.length
    const tC = toasts.length
    modalReply = { confirm: false, content: '不该被用上的名字' }
    pg.apply(pick('t-fix', '2026-05-08'))
    eq('★ 点「返回」→ 不落库', getSchedules().length, nC)
    eq('不跳转', navs.length, navC)
    eq('也没排跳转（桌上干干净净）', timers.length, 0)
    eq('不弹「已生成档期」', toasts.length, tC)

    // ★ 两个早退必须在【弹框之前】：模板没了 / 空模板，压根不该弹问名字的框
    const mBefore = modals.length
    modalReply = { confirm: true, content: null }
    pg.apply(pick('tpl-不存在', '2026-05-04'))
    store.zhuangli_templates = [{ template_id: 't-empty', name: '空模板', slots: [], updated: '2026-05-01' }]
    pg.apply(pick('t-empty', '2026-05-04'))
    eq('★ 模板没了 / 空模板 → 连问名字的框都不弹（先拦掉再问）', modals.length, mBefore)
  }

  // ── mock 里的示例模板：只要求形状无关的那几件事 ──
  //    （示例数据现在可能是老形状 `{seq,time}`、也可能更新成带 slotMin/lunch 的
  //      新形状，两种都得能用。所以这里【不写死】期望值，只查契约。）
  store.zhuangli_templates = null          // 清掉，让 seed() 重新种进去
  const seeded = TS.getTemplates()
  console.log('\n  示例模板 ' + seeded.length + ' 条：' + seeded.map((t) => t.name).join(' / '))
  eq('示例模板种得进来', seeded.length > 0, true)
  pg.apply(pick(seeded[0].template_id, '2026-05-07'))
  const sc2 = getSchedules()[getSchedules().length - 1]
  const bad = sc2.slots.filter((x) => !(x.start && x.end && x.minutes > 0 && toMin(x.end) > toMin(x.start)))
  console.log('  应用第一条 → ' + dump(sc2.slots) + '  lunch=' + (sc2.lunch ? 'YES' : 'null'))
  eq('★ 示例模板应用出来的每个妆位都有起止和正时长（老形状也能捞出来）', bad.length, 0)
  eq('妆位数跟模板对得上', sc2.count, seeded[0].slots.length)
  eq('★ 妆位时长是一个真数，不是 NaN / undefined', sc2.slotMin > 0, true)
  eq('间隔也是真数', sc2.gapMin > 0, true)
  eq('日期还是选中的那天', sc2.date, '2026-05-07')
  flush()   // 这一跳也得放掉，不然会留在 timers 里，把下面「桌上干干净净」点红
  eq('示例模板应用完也照样跳进详情页', navs[navs.length - 1],
    '/pages/schedule-detail/schedule-detail?id=' + sc2.schedule_id)

  // 已删掉的模板被点到（列表还没刷新）→ 只提示，不落库、不跳转
  //   数量用【相对】的：上面每多跑一条「应用」，写死的数字就得跟着改一次，
  //   而那种红跟被测代码毫无关系。
  const nBase = getSchedules().length
  const navN = navs.length, toastN = toasts.length
  pg.apply(pick('tpl-已经不存在了', '2026-05-04'))
  eq('★ 模板已不存在 → 不落库', getSchedules().length, nBase)
  eq('不跳转', navs.length, navN)
  eq('也压根没排跳转（桌上干干净净）', timers.length, 0)
  eq('给了一句人话', toasts[toasts.length - 1], '这个模板已经没了')
  eq('确实提示了', toasts.length, toastN + 1)

  // 空模板 → 拒绝
  store.zhuangli_templates = [{ template_id: 't-empty', name: '空模板', slots: [], updated: '2026-05-01' }]
  pg.apply(pick('t-empty', '2026-05-04'))
  eq('★ 模板里没妆位 → 不落库', getSchedules().length, nBase)
  eq('不跳转', navs.length, navN)
  eq('也没排跳转', timers.length, 0)
  eq('说明原因', toasts[toasts.length - 1], '这个模板里还没有妆位')

  // ★ 回归：手机上【已经存着】的旧 seed（老格式、无 slotMin、无 lunch）
  //    光改 mock 数据救不了它 —— 解析必须兼容，且不许崩
  store.zhuangli_templates = [{
    template_id: 'tpl-old', name: '旧数据模板', updated: '2026-04-01',
    slots: [
      { seq: 1, time: '09:00 – 10:20' },
      { seq: 2, time: '10:30 – 11:50' }
    ]
  }]
  pg.apply(pick('tpl-old', '2026-05-06'))
  const old = getSchedules()[getSchedules().length - 1]
  console.log('  旧数据 → ' + old.name + ' ' + old.date + ' · slotMin=' + old.slotMin +
              ' · lunch=' + (old.lunch ? 'YES' : 'null') + ' · ' + dump(old.slots))
  eq('★ 旧格式模板照样能应用', getSchedules().length, nBase + 1)
  eq('起止捞对了', dump(old.slots), '1:09:00-10:20(80) 2:10:30-11:50(80)')
  eq('妆位时长反推出来了', old.slotMin, 80)
  eq('没有午休记录就是没有（不编）', old.lunch, null)
  flush()
  eq('跳转的还是新生成那一条', navs[navs.length - 1],
    '/pages/schedule-detail/schedule-detail?id=' + old.schedule_id)

  global.setTimeout = realSetTimeout
}

/* ══════════════════════════════════════════════════════════════════════
   ⑥ 预约单 · 批量处理 + 「标记已确认」必退回
   ══════════════════════════════════════════════════════════════════════
   为什么单独测：这一轮改的全是【状态机】—— 哪些单能勾、勾完变成什么、
   哪些必须留在原地。状态机错了不会崩，只会安静地把单子标错，
   而那意味着「已完成的单还欠着定金」或者「以为处理了 5 单实际只动了 3 单」。

   ⚠️ bookingStore 是【就地改 mock/data.js 那份 BOOKINGS】的（故意的：
      档期那边靠 status 推已预订、顾客端看的是同一批单，复制一份进 storage
      就会两边脱节）。所以这一段跑完必须把 BOOKINGS 还原回去，
      否则重跑或者后面再加的小节都会踩到被改过的数据。
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n════ ⑥ 预约单 · 批量处理 ════')

const BS = require(R('妆历小程序/utils/bookingStore.js'))
const { BATCH, batchButtonsOf, pickableIds, canPick, applyBatch } = BS

const SNAPSHOT = JSON.parse(JSON.stringify(BS.getBookings()))
function restoreBookings() {
  const list = BS.getBookings()
  list.length = 0
  SNAPSHOT.forEach((b) => list.push(JSON.parse(JSON.stringify(b))))
}
function st(id) { return BS.getBooking(id).status }
function dep(id) { return BS.getBooking(id).deposit_paid }
function byTab(key) {
  return BS.getBookings().filter((b) => {
    if (key === 'closed') return b.status === 'rejected' || b.status === 'cancelled'
    return b.status === key
  })
}

// ── A. 三个入口的配置：只出现在该出现的 Tab 上 ──
{
  const names = (key, n) => batchButtonsOf(key, n).map((x) => x.label).join(' + ')
  console.log('\n[A] 底部批量入口')
  console.log('  待处理 → ' + names('pending', 2) + ' ｜ 已确认 → ' + names('confirmed', 3))
  eq('待处理只有「一键处理」', names('pending', 2), '一键处理')
  eq('★ 已确认是「定金一键已支付」+「一键确认」，定金在前（它是前置条件）',
    names('confirmed', 3), '定金一键已支付 + 一键确认')
  eq('已完成页没有批量入口', names('done', 1), '')
  eq('已取消页没有批量入口', names('closed', 1), '')
  eq('★ 没单就不给入口（空列表底下杵两个键很奇怪）', names('pending', 0), '')
  eq('每个入口都声明了自己属于哪个 Tab',
    ['pending', 'confirm', 'deposit'].map((m) => m + '=' + BATCH[m].tab).join(' '),
    'pending=pending confirm=confirmed deposit=confirmed')
}

// ── B. 勾得上 / 勾不上 ──
{
  const confirmed = byTab('confirmed')
  console.log('\n[B] 已确认页 ' + confirmed.map((b) => b.booking_id + (b.deposit_paid ? '已付' : '未付')).join(' '))
  eq('★ 未付定金的不在「一键确认」的可选里', pickableIds(confirmed, 'confirm').join(','), 'bk-2,bk-5')
  eq('★ 但「定金一键已支付」里它必须在（不然没法批量补定金）',
    pickableIds(confirmed, 'deposit').join(','), 'bk-2,bk-4,bk-5')
  eq('待处理的单一个都不挑', pickableIds(byTab('pending'), 'pending').join(','), 'bk-1,bk-6')
  /* ⚠️ 2026-09-29 加的那道状态守卫：canPick 现在【先看状态对不对】。
     少了它，「已确认」页里那张「顾客申请取消」的单会被勾上，点执行时
     applyBatch 又按状态跳过 —— 正好撞上用户明确否掉的「静默少处理」。
     所以下面这些桩【必须带上 status】，光给 deposit_paid 是不够的。 */
  eq('canPick: 已确认 + 已付定金 → 能勾', canPick('confirm', { status: 'confirmed', deposit_paid: true }), true)
  eq('canPick: 已确认 + 未付定金 → 勾不上', canPick('confirm', { status: 'confirmed', deposit_paid: false }), false)
  eq('canPick: 模式写错了 → 一律勾不上（不猜）', canPick('nope', { status: 'confirmed', deposit_paid: true }), false)
  eq('★ canPick: 已付定金但状态不对（在等妆娘回话）→ 照样勾不上',
    canPick('confirm', { status: 'cancel_requested', deposit_paid: true }), false)
  eq('★ canPick: 已经完成的单，在「一键确认」里勾不上（不然会来回跳）',
    canPick('confirm', { status: 'done', deposit_paid: true }), false)
  eq('★ canPick: 已确认的单在「一键处理」里也勾不上（那个入口管的是待处理）',
    canPick('pending', { status: 'confirmed', deposit_paid: true }), false)
  eq('勾不上时那句话是一整句人话（要去点它才看得到）', BATCH.confirm.lockHint,
    '未付定金无法标记已完成，请确认定金是否已支付')
  eq('能勾的模式没有这句话（不给空提示留口子）', BATCH.pending.lockHint, '')
}

// ── C. 批量执行：改动几个、改成了什么 ──
{
  restoreBookings()
  eq('起点：bk-1 待处理', st('bk-1'), 'pending')
  eq('★ 待处理批量 → 已确认', applyBatch('pending', ['bk-1']), 1)
  eq('bk-1 现在是已确认', st('bk-1'), 'confirmed')

  // ⛔ 最关键的一条：未付定金的单，批量确认【不许碰】
  eq('★ 未付定金的 bk-4 在「一键确认」里被拒（返回 0）', applyBatch('confirm', ['bk-4']), 0)
  eq('★ 而且它【真的没动】', st('bk-4'), 'confirmed')
  eq('定金也还是没付', dep('bk-4'), false)

  // 已付的那些照常
  eq('已付定金的 bk-2 能批量确认', applyBatch('confirm', ['bk-2']), 1)
  eq('bk-2 变成已完成', st('bk-2'), 'done')

  // ★ 用户真实的那条路：先批量标定金，再批量确认
  eq('批量标定金：bk-4', applyBatch('deposit', ['bk-4']), 1)
  eq('定金变成已付', dep('bk-4'), true)
  eq('★ 标定金【不换状态】（它还留在已确认页）', st('bk-4'), 'confirmed')
  eq('★ 标完定金再批量确认，这下通了', applyBatch('confirm', ['bk-4']), 1)
  eq('bk-4 现在是已完成', st('bk-4'), 'done')

  // 过期的勾选：单子已经不在这个 Tab 了，批量动作不许隔着状态乱改
  eq('★ 已经不在待处理页的单，待处理批量不碰它', applyBatch('pending', ['bk-3']), 0)
  eq('bk-3 保持已完成', st('bk-3'), 'done')
  eq('模式名写错 → 一个都不动', applyBatch('nope', ['bk-1']), 0)
  eq('空勾选 → 0 单（页面据此把执行键灰掉）', applyBatch('pending', []), 0)
  eq('不存在的单号 → 跳过，不崩', applyBatch('pending', ['bk-999']), 0)

  // 一次 5 单里夹着 1 单有问题的：返回的是【真的动了几个】
  restoreBookings()
  const mixed = applyBatch('confirm', ['bk-2', 'bk-4', 'bk-5'])
  eq('★ 3 单里夹着 1 单未付定金 → 只动 2 单，并如实返回 2', mixed, 2)
  eq('页面拿这个数去说「3 单选了，动了 2 单」', mixed < 3, true)
  restoreBookings()
}

// ── D. 页面：勾选态 ──
console.log('\n[⑥-B] 预约单列表页 · 勾选态')

{
  restoreBookings()
  const navs = []
  const toasts = []
  /* 档期库：这一页要读它来画场次下拉条。
     ⚠️ id 必须写成 mock BOOKINGS 里那些单【真正挂着的】schedule_id
        （sched-demo-0502 / 0503）—— 2026-09-29 起「一单属于哪一场」
        认的是 schedule_id。写成 sched-100 那种自造 id 的话，
        所有单都会变成「哪一场都不属于」，「筛选生效」会绿着错。
     ⚠️ 三场是【故意这么挑的】，一次能把三条排序规则全验掉：
        ① 05-03 离今天 150 天，比 ② 05-02 的 151 天近 → ① 排前面
        ③ 05-09 离今天【最近】（144 天），但它一张单都没有 = 已处理完
           → 按「全处理完的沉底」它必须掉到最后，排在两个更远的后面。
           这一条正是用户要的「此场次预约单全部完成就放到最后」。 */
  const store = {
    zhuangli_schedules: [
      { schedule_id: 'sched-demo-0502', name: '示例漫展', date: '2026-05-02', slots: [] },
      { schedule_id: 'sched-demo-0503', name: '示例漫展', date: '2026-05-03', slots: [] },
      // ⚠️ 用【真形状】的 id（sched-<毫秒时间戳>）：defaultSchedId() 靠 id 末尾
      //    的数字比新旧，写 'sched-300' 的话它会被 sched-demo-0503（503）比下去。
      { schedule_id: 'sched-1790690199105', name: '花瞳漫展', date: '2026-05-09', slots: [] }
    ]
  }
  global.wx = {
    navigateTo: (o) => navs.push(o.url),
    showToast: (o) => toasts.push(o.title),
    switchTab: () => {},
    navigateBack: () => {},
    getStorageSync: (k) => store[k],
    setStorageSync: (k, v) => { store[k] = v }
  }

  let cfg = null
  global.Page = (c) => { cfg = c }
  delete require.cache[require.resolve(R('妆历小程序/pages/booking/booking.js'))]
  require(R('妆历小程序/pages/booking/booking.js'))

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
  const row = (id) => pg.data.rows.filter((r) => r.id === id)[0]
  const tap = (id) => pg.onCard({ currentTarget: { dataset: { id } } })
  const enter = (mode) => pg.enterSel({ currentTarget: { dataset: { mode } } })
  const goto = (label) => {
    const i = pg.data.tabs.map((t) => t.label).indexOf(label)
    pg.onTab({ currentTarget: { dataset: { i: i } } })
  }
  /* ⚠️ 2026-09-29 起横向滚动的 chip 条改成了【左上角下拉条 + 放大镜】，
     「挑一场」的入口从 onSched 换成 pickSched。这里留个别名，
     下面那些断言读起来还是「切到某一场」的意思。 */
  const onSched = (id) => pg.pickSched({ currentTarget: { dataset: { id } } })
  /* 搜索是【两级】的（2026-09-30）：
       typeKw  = 往输入框里打字 —— ⛔ 什么都不驱动了，就是把字存进 kwInput
                 （方案 B 之前它还负责筛面板里的场次清单，已拆掉）
       search  = 打完字按回车 / 点放大镜 —— 这一下才真的搜
     分开写是为了让「打字不搜」「提交才搜」这两件事各自能被断言到。 */
  const typeKw = (v) => pg.onKwInput({ detail: { value: v } })
  const search = (v) => { typeKw(v); pg.doSearch() }
  const last = () => toasts[toasts.length - 1]

  // 「勾不上」那句话 1 秒后要自己消失 —— 定时器收下来由测试触发，
  // 不然就要真等一秒，而且断言会跑在回调前面（「绿着错」）。
  // ⚠️ 用对象存、id 是自增的：用数组下标的话，clearTimeout 之后下标全错位。
  const timers = {}
  let timerSeq = 0
  const realSetTimeout = global.setTimeout
  const realClearTimeout = global.clearTimeout
  global.setTimeout = (fn, ms) => { const id = ++timerSeq; timers[id] = { fn, ms }; return id }
  global.clearTimeout = (id) => { delete timers[id] }
  const tick = () => {
    Object.keys(timers).forEach((id) => { const t = timers[id]; delete timers[id]; if (t) t.fn() })
  }
  const pendingTimers = () => Object.keys(timers).length

  /* ── 档期筛选条（2026-09-29 加）──────────────────────────────────
     妆娘手上有好几场漫展，几十张单混在一个列表里没法看。上面多一条筛选条：
     默认只看「当前这一场」，另有一颗「全部」看所有场次。
     ⚠️ 它和下面四个状态 Tab 是【两个维度】，不是替代关系。 */
  console.log('\n[⑥-D] 场次下拉条 + 排序 + 搜索')
  pg.onShow()
  console.log('  默认 ' + pg.data.schedId + ' ｜ ' +
              pg.data.schedChips.map((c) => c.label + (c.sub ? '(' + c.sub + ')' : '')).join(' / '))
  eq('下拉条第一项永远是「全部」', pg.data.schedChips[0].label, '全部')
  eq('它的 id 是 all', pg.data.schedChips[0].id, 'all')
  eq('后面每场档期各一项', pg.data.schedChips.length, 4)
  eq('标签写成「漫展名 · 月-日」', pg.data.schedChips[1].label, '示例漫展 · 05-03')
  eq('★ 离今天近的排前面（05-03 比 05-02 近一天）',
    pg.data.schedChips[2].label, '示例漫展 · 05-02')
  /* ★ 这一条是全段的重点：花瞳漫展 05-09 是【离今天最近】的一场
     （144 天 < 150 天），但它一张单都没有 = 已处理完 ——
     按用户定的「全部完成就放到最后」，它必须掉到两个更远的后面。 */
  eq('★ 已处理完的场次沉到最底，哪怕它离今天最近',
    pg.data.schedChips[3].label, '花瞳漫展 · 05-09')
  eq('★ 而且它标着「已处理完」，让妆娘知道为什么在下面',
    pg.data.schedChips[3].sub, '已处理完')
  eq('没处理完的场次不带这个标记', pg.data.schedChips[1].sub, '')
  eq('★ 默认选中【最新建的那一场】', pg.data.schedId, 'sched-1790690199105')
  eq('★ 默认只看见这一场的单（花瞳漫展一场都没有）', pg.data.rows.length, 0)
  eq('记进 storage，下次进来还选它', store.zhuangli_bk_sched, 'sched-1790690199105')
  eq('下拉条上显示的就是当前这一场的标签', pg.data.schedLabel, '花瞳漫展 · 05-09')
  eq('筛到一场没单的档期 → 不给批量底键', pg.data.footBtns.length, 0)

  // ── 下拉面板：开 / 关 ──
  eq('一开始面板是收着的', pg.data.schedOpen, false)
  pg.toggleSched()
  eq('点下拉条 → 面板展开', pg.data.schedOpen, true)
  eq('展开时列的是全部可选项', pg.data.schedChips.length, 4)
  eq('🔴★ 面板直接读 schedChips（那个「筛过的清单」字段已整个删掉）',
    'schedOptions' in pg.data, false)
  pg.toggleSched()
  eq('再点一下 → 收回去（同一个键开关）', pg.data.schedOpen, false)
  pg.toggleSched()
  pg.closeSched()
  eq('点面板以外 → 收起', pg.data.schedOpen, false)

  // ── 输入框【常驻在条子上】（2026-09-30 用户定的）──
  //    它不再藏在面板里：要搜直接点框打字，不用先点开面板把它找出来。
  eq('★ 条子上那个输入框平时是空的（场次名单独放左边）', pg.data.kwInput, '')
  eq('★ 它也不靠面板才存在（面板收起时照样在）', pg.data.schedOpen, false)

  onSched('sched-demo-0502')
  console.log('  切到 示例漫展 05-02 → 待处理 ' + pg.data.rows.map((r) => r.id).join(' '))
  eq('★ 只看这一场 → 待处理只剩 05-02 的 bk-1', pg.data.rows.map((r) => r.id).join(','), 'bk-1')
  eq('换成这一场，storage 跟着改', store.zhuangli_bk_sched, 'sched-demo-0502')
  eq('下拉条上的字跟着换', pg.data.schedLabel, '示例漫展 · 05-02')

  goto('已确认')
  eq('★ 同一场，已确认里只剩 bk-2', pg.data.rows.map((r) => r.id).join(','), 'bk-2')
  goto('已完成')
  eq('已完成里是 bk-3', pg.data.rows.map((r) => r.id).join(','), 'bk-3')
  goto('已取消')
  eq('这一场没有已取消的单', pg.data.rows.length, 0)
  goto('待处理')

  // 另一场是另一批单 —— 这正是用户要的「这场和其他场的不一样」
  onSched('sched-demo-0503')
  console.log('  切到 示例漫展 05-03 → 待处理 ' + pg.data.rows.map((r) => r.id).join(' '))
  eq('★ 另一场是另一批单：05-03 的待处理是 bk-6', pg.data.rows.map((r) => r.id).join(','), 'bk-6')
  goto('已确认')
  eq('已确认里是 bk-4 / bk-5 + 那张申请取消的 bk-7',
    pg.data.rows.map((r) => r.id).join(','), 'bk-4,bk-5,bk-7')
  eq('★ 「顾客申请取消」的单带红标（她还没点头，妆位还占着）',
    pg.data.rows.filter((r) => r.wantCancel).map((r) => r.id).join(','), 'bk-7')
  goto('待处理')

  // ── 搜索：打字不动列表，回车/放大镜才真的搜 ──
  console.log('\n  搜索「千夏」')
  typeKw('千夏')
  eq('★ 打字：输入框里有字了', pg.data.kwInput, '千夏')
  eq('★ 打字【还没】真的搜 —— 主列表纹丝不动', pg.data.searching, false)
  /* 🔴 2026-09-30 方案 B（用户定的）：面板（选场次）和输入框（搜人）
     【彻底拆开】。打字只往框里塞字，⛔ 不许碰面板。
     拆开之前是这样：打字会自动弹面板、还会把面板里的场次清单按键词筛掉，
     而那份清单只匹配【场次名】—— 打一个 CN 就一场都对不上，面板于是弹出
     「没有叫这个名字的展子 / CN」。🔴 那句话是假的：它宣称 CN 也查过了，
     其实一个字没查，人明明在。用户报的「过程有问题」正是它。 */
  eq('★ 打字【不】再自动弹面板（面板只管选场次）', pg.data.schedOpen, false)
  eq('★ 打字也不筛面板里的清单了（4 项原样都在）', pg.data.schedChips.length, 4)
  eq('★ 主列表这会儿还是没动（没提交就不搜）', pg.data.searching, false)

  // 🔴 钉住那句假话【真的没了】。node 里没有渲染引擎，只能读 wxml 原文钉结构。
  //    ⚠️ 读之前必须【先摘掉注释】—— 我在那儿留了一段解释，里面引用了这句话本身。
  {
    const bwRaw = require('fs').readFileSync(R('妆历小程序/pages/booking/booking.wxml'), 'utf8')
    const bw = bwRaw.replace(/<!--[\s\S]*?-->/g, '')
    eq('🔴★ 面板里那句「没有叫这个名字的展子 / CN」已经删干净（只剩 1 处）',
      bw.split('没有叫这个名字的展子 / CN').length - 1, 1)
    eq('★ 剩下的那一处在【主列表空态】里（搜不到人时才说，这话查过 CN 了、是真的）',
      /wx:if="\{\{searching\}\}"[\s\S]{0,400}?没有叫这个名字的展子 \/ CN/.test(bw), true)
    eq('★ 面板现在直接循环 schedChips（⛔ 不再有 schedOptions）',
      /wx:for="\{\{schedChips\}\}"/.test(bw), true)

    const bwss = require('fs')
      .readFileSync(R('妆历小程序/pages/booking/booking.wxss'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    eq('⛔ .sp-none 那套样式也跟着删了（不留死代码）', /\.sp-none/.test(bwss), false)
  }

  pg.doSearch()
  eq('★ 回车 / 点放大镜 → 这一下才真的搜', pg.data.searching, true)
  eq('★ 搜完面板自己收起（不收就盖住结果第一屏）', pg.data.schedOpen, false)
  eq('★ 搜索是跨场次的：待处理里是 05-02 的 bk-1（05-03 那单在已确认里）',
    pg.data.rows.map((r) => r.id).join(','), 'bk-1')
  goto('已确认')
  /* ★ 一个人在这位妆娘这里下过两单（bk-1 在 05-02、bk-7 在 05-03），
     搜 CN 要能一次全捞出来 —— 这正是用户说的「搜索用户的 cn
     找出这个用户在此妆娘这里下单记录」。 */
  eq('★ 同一个 CN 跨两场的两单都被捞出来（另一单本来不在这一场）',
    pg.data.rows.map((r) => r.id).join(','), 'bk-7')
  eq('搜出来的单带着 CN，一眼认得出是谁', pg.data.rows[0].cn, '千夏')

  search('示例漫展')
  goto('待处理')
  eq('★ 也能搜漫展名：两场的待处理一起出来',
    pg.data.rows.map((r) => r.id).join(','), 'bk-1,bk-6')
  search('  初七  ')
  goto('已确认')
  eq('★ 关键词前后有空格也认（去掉再比）', pg.data.rows.map((r) => r.id).join(','), 'bk-4')
  eq('★ 框里回写成去掉空格的那个词（框里显示什么 = 实际搜了什么）', pg.data.kwInput, '初七')
  search('DEMO_MIKU')
  eq('★ 微信号【搜不出来】—— 高风险字段不进这个入口', pg.data.rows.length, 0)

  // 搜不到 → 三种空态说法里的第一种
  search('不存在的人')
  eq('搜不到就是空列表', pg.data.rows.length, 0)
  eq('★ 空态认得出「这是搜出来的空」，不会说「客人填单后会出现」', pg.data.searching, true)

  // 把框里删空再搜 = 清空搜索（不用非得去点那颗「清空」键）
  typeKw('')
  pg.doSearch()
  eq('★ 删光再搜 = 清空搜索', pg.data.searching, false)
  goto('待处理')
  eq('清空后回到当前这一场的单', pg.data.rows.map((r) => r.id).join(','), 'bk-6')

  // 「清空」那颗键（搜索提示行右边）：两级状态必须一起清
  search('千夏')
  eq('搜索中', pg.data.searching, true)
  pg.clearKw()
  eq('★ 点「清空」→ 主列表回到按场次筛', pg.data.searching, false)
  eq('★ 输入框也一起清干净（只清一级 = 框里留着字说还在搜）', pg.data.kwInput, '')

  // 挑了场次要顺手把搜索清掉 —— 两种找法同时开着没人说得清谁优先
  search('千夏')
  onSched('sched-demo-0503')
  eq('★ 挑场次会把搜索一起清掉', pg.data.kw, '')
  eq('★ 输入框里那个词也一起清', pg.data.kwInput, '')
  eq('★ 挑完场次面板也收起来', pg.data.schedOpen, false)

  // 勾选态里换档期：⛔ 勾上的单可能根本不在新选的这一场里
  goto('已确认')
  enter('confirm')
  eq('05-03 这场勾上 1 单（bk-4 定金未付，勾不上）', pg.data.selCount, 1)
  onSched('all')
  eq('★ 换场次必须退出勾选态（不然会拿旧勾选去误伤别的场）', pg.data.sel, null)
  console.log('  切到「全部」→ 已确认 ' + pg.data.rows.map((r) => r.id).join(' '))
  eq('★「全部」= 跨场次，两场的已确认混在一起',
    pg.data.rows.map((r) => r.id).join(','), 'bk-2,bk-4,bk-5,bk-7')
  goto('待处理')
  eq('全部 · 待处理也是两场混在一起', pg.data.rows.map((r) => r.id).join(','), 'bk-1,bk-6')

  // 点已经选中的那一项 = 什么都不做（别把列表白白重建一遍）
  const before = pg.data.rows.map((r) => r.id).join(',')
  onSched('all')
  eq('点已经亮着的那一项不折腾', pg.data.rows.map((r) => r.id).join(','), before)

  console.log('\n[⑥-B] 以下都在「全部」下跑（跨两场，才够验批量）')
  console.log('  待处理 ' + pg.data.rows.map((r) => r.id).join(' ') +
              ' ｜ 底键 ' + pg.data.footBtns.map((b) => b.label).join('/'))
  eq('待处理有 2 单', pg.data.rows.map((r) => r.id).join(','), 'bk-1,bk-6')
  eq('★ 平时不显示勾选框', pg.data.sel, null)
  eq('底键是「一键处理」', pg.data.footBtns.map((b) => b.label).join(','), '一键处理')

  // 不在勾选态点卡片 → 进详情
  tap('bk-1')
  eq('★ 平时点卡片进详情', navs[navs.length - 1], '/pages/booking-detail/booking-detail?id=bk-1')

  enter('pending')
  console.log('  进勾选态 → 已选 ' + pg.data.selCount + ' / ' + pg.data.selTotal +
              '  allPicked=' + pg.data.allPicked + ' 执行键「' + pg.data.selApply + '」')
  eq('★ 进来就是全选', pg.data.selCount, 2)
  eq('分母是这个 Tab 的单数', pg.data.selTotal, 2)
  eq('全选状态下「全选」要写成「全不选」', pg.data.allPicked, true)
  eq('执行键写的是这个模式的动作名', pg.data.selApply, '标记已确认')

  tap('bk-6')
  eq('★ 取消勾选一单', pg.data.selCount, 1)
  eq('这一行 unchecked', row('bk-6').checked, false)
  eq('allPicked 跟着变 false', pg.data.allPicked, false)

  pg.toggleAll()
  eq('「全选」把它勾回来', pg.data.selCount, 2)
  pg.toggleAll()
  eq('再点一次是「全不选」', pg.data.selCount, 0)

  pg.cancelSel()
  eq('取消 → 退出勾选态', pg.data.sel, null)
  eq('取消不动任何单子', st('bk-1'), 'pending')

  // 执行
  enter('pending')
  tap('bk-6')
  pg.applySel()
  console.log('  处理完 → 待处理 ' + pg.data.rows.map((r) => r.id).join(' ') + ' ｜ ' + last())
  eq('★ 勾上的走了', st('bk-1'), 'confirmed')
  eq('★ 没勾的留在待处理', st('bk-6'), 'pending')
  eq('★ 走掉的单从这个 Tab 消失', pg.data.rows.map((r) => r.id).join(','), 'bk-6')
  eq('执行完自动退出勾选态', pg.data.sel, null)
  eq('说了「已确认 1 单」', last(), '已确认 1 单，已移入已确认')

  // ── 已确认页：未付定金的那个必须是灰的 ──
  restoreBookings()
  pg.onShow()
  goto('已确认')
  console.log('\n  已确认 ' + pg.data.rows.map((r) => r.id + (r.locked ? '(灰)' : '')).join(' ') +
              ' ｜ 底键 ' + pg.data.footBtns.map((b) => b.label).join('/'))
  /* ⚠️ 4 单不是 3 单：多出来的是 bk-7（顾客申请取消）。它【留在「已确认」里】，
     妆位也还占着 —— 妆娘还没点头。见 §⑥-C 那一段。 */
  eq('已确认 4 单', pg.data.rows.map((r) => r.id).join(','), 'bk-2,bk-4,bk-5,bk-7')
  eq('★ 那张「顾客申请取消」的带红标',
    pg.data.rows.filter((r) => r.wantCancel).map((r) => r.id).join(','), 'bk-7')
  eq('★ 底键是「定金一键已支付」+「一键确认」，定金在前',
    pg.data.footBtns.map((b) => b.label).join(','), '定金一键已支付,一键确认')
  // ⚠️ 「勾不上」只在勾选态里才有意义 —— 平时根本没有勾选框，谈不上锁不锁
  eq('平时没有「勾不上」这回事', row('bk-4').locked, false)

  enter('confirm')
  eq('★ 进了勾选态，未付定金的 bk-4 才是勾不上的', row('bk-4').locked, true)
  /* ★ 这一条盯的是一处真踩过的坑：pickableIds 曾经绕开状态守卫直接调
     cfg.canPick，于是这张「顾客申请取消」的单被【预先勾上】，点执行时
     applyBatch 又按状态跳过 —— 正是用户明确否掉的「静默少处理」。 */
  eq('★ 「顾客申请取消」的单也勾不上（它还没轮到这一步）', row('bk-7').locked, true)
  eq('★ 行里【不再】重复写「未付定金」（一屏 3 单就是 3 遍噪声）',
    'lockHint' in row('bk-4'), false)
  eq('已付的不锁', row('bk-2').locked, false)
  console.log('  进「一键确认」→ 已选 ' + pg.data.selCount + ' / ' + pg.data.selTotal)
  eq('★ 全选【只勾】勾得上的：4 单里勾 2 单', pg.data.selCount, 2)
  eq('分母还是这个 Tab 的总数（灰的那两单看得见，不藏）', pg.data.selTotal, 4)
  eq('★ 没勾上的那两单就是「未付定金」和「申请取消」', pg.data.selCount, 2)
  eq('bk-4 没被勾上', row('bk-4').checked, false)
  eq('★ allPicked 已经是 true（能勾的都勾上了）', pg.data.allPicked, true)
  eq('刚进勾选态还没那句话', pg.data.pickWarn, '')

  toasts.length = 0
  tap('bk-4')
  console.log('  点灰掉的那行 → 「' + pg.data.pickWarn + '」')
  eq('★ 点它不勾选', row('bk-4').checked, false)
  eq('★ 也不改单子', st('bk-4'), 'confirmed')
  eq('★ 不说 Toast（黑块在屏幕正中，离刚点的那行太远）', toasts.length, 0)
  eq('★ 改成浮一行红字，说清为什么、以及怎么办', pg.data.pickWarn,
    '未付定金无法标记已完成，请确认定金是否已支付')
  eq('排了 1 秒后收走', pendingTimers(), 1)
  eq('就是 1 秒', timers[1] && timers[1].ms, 1000)
  tick()
  eq('★ 1 秒后自己消失', pg.data.pickWarn, '')
  eq('桌上也空了', pendingTimers(), 0)

  // 连点两行：第一句的定时器不许把第二句提前收走
  tap('bk-4')
  const firstTimerN = pendingTimers()
  tap('bk-4')
  console.log('  连点两下 → 定时器 ' + firstTimerN + ' → ' + pendingTimers())
  eq('★ 重入先 clearTimeout，不会攒下一堆定时器', pendingTimers(), 1)
  eq('第二句还在', pg.data.pickWarn !== '', true)
  tick()
  eq('收走的是第二句', pg.data.pickWarn, '')

  // 勾上能勾的那一行时，那句红字不该还赖着
  enter('confirm')          // 全选 → bk-2 / bk-5 都是勾上的
  tap('bk-2')               // 先取消，装作要换一单
  tap('bk-4')               // 点到灰的 → 红字
  eq('红字出来了', pg.data.pickWarn !== '', true)
  tap('bk-2')               // 再勾回来
  console.log('  点了灰行再去勾能勾的行 → 「' + pg.data.pickWarn + '」 勾上=' + row('bk-2').checked)
  eq('★ 勾上能勾的那行时，红字跟着走', pg.data.pickWarn, '')
  eq('定时器也撤了（不留个空跑的一秒）', pendingTimers(), 0)
  eq('而且真的勾上了', row('bk-2').checked, true)

  pg.applySel()
  console.log('  处理完 → 已确认 ' + pg.data.rows.map((r) => r.id).join(' ') + ' ｜ ' + last())
  eq('★ 勾上的两单进已完成', st('bk-2') + '/' + st('bk-5'), 'done/done')
  eq('★ 灰的那单【原封不动】留在已确认', st('bk-4'), 'confirmed')
  // bk-7 本来就没被勾上（它在等妆娘回话），所以一直留在这一页
  eq('它还在这个 Tab 里', pg.data.rows.map((r) => r.id).join(','), 'bk-4,bk-7')

  // ── 定金一键已支付：这里是【能勾】的 ──
  enter('deposit')
  console.log('  进「定金一键已支付」→ 已选 ' + pg.data.selCount + ' / ' + pg.data.selTotal)
  eq('★ 同一个 bk-4，在「标定金」里必须勾得上（不然没法批量补定金）', pg.data.selCount, 1)
  eq('它在这不是灰的', row('bk-4').locked, false)
  eq('执行键的文案跟着换', pg.data.selApply, '标记定金已付')
  pg.applySel()
  console.log('  标完 → bk-4 定金 ' + dep('bk-4') + ' 状态 ' + st('bk-4') + ' ｜ ' + last())
  eq('★ 定金变成已付', dep('bk-4'), true)
  eq('★ 状态不变，还在已确认页', st('bk-4'), 'confirmed')
  eq('★ 还在这一页（没被搬走）', pg.data.rows.map((r) => r.id).join(','), 'bk-4,bk-7')
  eq('说了「已标记 1 单定金已付」', last(), '已标记 1 单定金已付')

  // 补完定金，原来的「一键确认」这条路就通了
  enter('confirm')
  eq('★ 补完定金后，它就能勾上了', pg.data.selCount, 1)
  pg.applySel()
  eq('★ 这下进了已完成', st('bk-4'), 'done')
  /* ★ 这一页【没空】—— 只剩 bk-7 还赖着。它不是 bug：这张单在等妆娘回话
     （同意取消 or 不同意保留），只要她没表态，它就一直在「已确认」里。 */
  eq('★ 只剩那张等回话的 bk-7 了', pg.data.rows.map((r) => r.id).join(','), 'bk-7')
  eq('★ 只要还有一张单挂着，批量入口就还在', pg.data.footBtns.length, 2)
  eq('说了「已完成 1 单」', last(), '已完成 1 单，已移入已完成')

  // ── 一个没勾就按执行 ──
  restoreBookings()
  pg.onShow()
  enter('pending')
  pg.toggleAll()   // 全不选
  toasts.length = 0
  pg.applySel()
  eq('★ 一个没勾 → 不动任何单', st('bk-1') + '/' + st('bk-6'), 'pending/pending')
  eq('并且提示一句', last(), '先勾选要处理的单')

  // ── 切 Tab / 回页面都要退出勾选态（勾选态是「当时那一屏」的，会过期）──
  restoreBookings()
  pg.onShow()
  goto('待处理')
  enter('pending')
  pg.onTab({ currentTarget: { dataset: { i: 3 } } })   // 切到「已取消」
  eq('★ 切 Tab 退出勾选态', pg.data.sel, null)
  eq('切过去了', pg.data.active, 3)
  eq('已取消页没有单，所以也不该有底键', pg.data.footBtns.length, 0)

  goto('待处理')
  enter('pending')
  pg.onShow()
  eq('★ 重新进页面也退出勾选态', pg.data.sel, null)
  eq('底键回来了', pg.data.footBtns.length, 1)

  // 离开勾选态时那句红字也要跟着走（它属于那一屏，不属于这一页）
  goto('已确认')
  enter('confirm')
  tap('bk-4')
  eq('红字出来了', pg.data.pickWarn !== '', true)
  goto('待处理')
  eq('★ 切 Tab 把红字一起带走', pg.data.pickWarn, '')
  eq('切 Tab 也撤了它的定时器', pendingTimers(), 0)

  // 取消勾选态同理
  goto('已确认')
  enter('confirm')
  tap('bk-4')
  eq('红字又出来了', pg.data.pickWarn !== '', true)
  pg.cancelSel()
  eq('★ 点「取消」也把红字带走', pg.data.pickWarn, '')
  eq('定时器也撤了', pendingTimers(), 0)

  global.setTimeout = realSetTimeout
  global.clearTimeout = realClearTimeout

  // ── 执行到一半被别人改了：如实说少处理了几单 ──
  //    （模拟：勾选态还开着，某一单已经在别处被改成已确认了）
  goto('待处理')   // 上一组把 Tab 停在「已确认」，先切回来
  enter('pending')
  eq('勾选态里确实有 2 单', Object.keys(pg.data.sel.picked).length, 2)
  BS.updateBooking('bk-6', { status: 'confirmed' })   // 模拟「勾选态还在，单子已经不在待处理了」
  toasts.length = 0
  pg.applySel()
  console.log('  勾选态过期 → ' + last())
  eq('★ 只处理了还在待处理的那一单', st('bk-1'), 'confirmed')
  eq('★ 并且如实说跳过了 1 单（⛔ 不许静默少处理）',
    last(), '已确认 1 单，已移入已确认（1 单状态已变，跳过）')
}

// ── E. 详情页：「标记已确认」必须退回 + 定金未付不能标完成 ──
console.log('\n[⑥-C] 预约单详情页')

{
  restoreBookings()
  const toasts = []
  const modals = []          // 弹过的确认框（看它说了什么）
  let modalAnswer = true     // 下一次弹出来，用户点的是「确认」还是「先不取消」
  let backs = 0
  global.wx = {
    navigateTo: () => {},
    switchTab: () => {},
    navigateBack: () => { backs++ },
    showToast: (o) => toasts.push(o.title),
    setClipboardData: () => {},
    // 「顾客取消预约」要先弹一下确认（唯一一个妆娘替顾客做决定的地方）
    showModal: (o) => {
      modals.push(o)
      o.success({ confirm: modalAnswer, cancel: !modalAnswer })
    }
  }

  let cfg = null
  global.Page = (c) => { cfg = c }
  delete require.cache[require.resolve(R('妆历小程序/pages/booking-detail/booking-detail.js'))]
  require(R('妆历小程序/pages/booking-detail/booking-detail.js'))

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
  const act = (a) => pg.mark({ currentTarget: { dataset: { act: a } } })
  const open = (id) => { pg.data = JSON.parse(JSON.stringify(cfg.data)); pg.onLoad({ id }) }
  const last = () => toasts[toasts.length - 1]

  open('bk-1')   // 待处理
  console.log('\n  打开 bk-1（待处理）→ ' + pg.data.statusText)
  eq('状态文本对', pg.data.statusText, '待处理')
  eq('一开始没在「正在退回」', pg.data.leaving, '')

  toasts.length = 0
  act('confirm')
  console.log('  点「标记已确认」→ status=' + pg.data.b.status + ' leaving=' + pg.data.leaving +
              ' 退回次数=' + backs + ' ｜ ' + last())
  eq('★ 单子真的变成已确认', st('bk-1'), 'confirmed')
  eq('★ 立刻退回列表', backs, 1)
  // ⚠️ 这一条是「不许再显示标记已完成」的可测代理：wxml 的第一分支是
  //    wx:if="{{leaving}}"，leaving 有值就轮不到 status 那个分支去画按钮。
  //    ⚠️ leaving 现在是一句【话】不是 true —— 两种情况（已确认 / 已取消）
  //       各说各的，用户才知道刚才那一下到底成了没成。
  eq('★ leaving=「已确认，正在退回…」—— wxml 第一分支挡住，这一屏【不会】出现「标记已完成」',
    pg.data.leaving, '已确认，正在退回…')
  eq('退回了', backs, 1)

  // 确认完再进来（从已确认页点开的场景）：定金没付 → 不许标完成
  open('bk-4')
  eq('bk-4 是已确认', pg.data.statusText, '已确认')
  eq('定金未付', pg.data.b.deposit_paid, false)
  toasts.length = 0
  act('done')
  console.log('  定金未付时点「标记已完成」→ ' + last())
  eq('★ 拦住了，状态没动', st('bk-4'), 'confirmed')
  eq('★ 并说了怎么办', last(), '定金未付，先去标定金')

  toasts.length = 0
  pg.toggleDeposit()
  console.log('  标定金 → ' + last())
  eq('定金变成已付', dep('bk-4'), true)
  eq('★ 这一下会解锁灰按钮，所以必须吭声', last(), '已标记定金已付')

  toasts.length = 0
  act('done')
  eq('★ 定金付了就能标完成', st('bk-4'), 'done')
  eq('说了已完成', last(), '已标记为已完成')

  open('bk-3')   // 已完成
  act('confirm')
  eq('已完成的单再去点确认也不会被拉回来', st('bk-3'), 'done')

  /* ── 顾客申请取消 → 妆娘表态（2026-09-29 改成【两步】）────────────
     用户原话：「第三个是两步」。所以：
       ① 顾客在小程序里点「申请取消」→ status = cancel_requested
          （用户端那一半还没做，测试里用 updateBooking 直接摆出这个状态，
            这正是用户端将来唯一的写法）
       ② 妆娘在详情页二选一：
            「同意取消」   → cancelled，妆位【空出来可以约给别人】
            「不同意，继续保留」→ 回到 confirmed，妆位【一直没动过】
     ⚠️ 妆位在两步之间【始终占着】：客人只是说想退，还没退成 ——
        妆娘很容易以为「申请了 = 位置空了」而口头答应给别人。
     ⚠️ 走 cancelled 不删记录（用户定的）：调研里 60% 的妆娘经常被跑单，
        删掉记录等于把唯一的凭据也删了。 */
  const S503 = { schedule_id: 'sched-demo-0503', name: '示例漫展', date: '2026-05-03' }
  const S100 = { schedule_id: 'sched-demo-0502', name: '示例漫展', date: '2026-05-02' }
  console.log('\n  [顾客申请取消] 05-03 被占的妆位：' + BS.bookedSeqsOfSchedule(S503).join(','))

  // ① 妆娘点「不同意，继续保留」—— 妆位一秒都没松过
  open('bk-7')   // 顾客已申请取消 · 05-03 第 4 位
  eq('★ 状态文本是「顾客申请取消」，不是「已取消」', pg.data.statusText, '顾客申请取消')
  eq('这一单确实在等妆娘回话', st('bk-7'), 'cancel_requested')
  eq('★ 到这一步妆位还占着（客人只是申请，还没退成）',
    BS.bookedSeqsOfSchedule(S503).join(','), '1,2,3,4')

  toasts.length = 0
  modals.length = 0
  const nb = backs
  act('rejectCancel')
  console.log('  点「不同意」→ status=' + st('bk-7') + ' 退回次数=' + (backs - nb) +
              ' ｜ ' + last())
  eq('★ 不同意 → 按回已确认（这一单原样保留）', st('bk-7'), 'confirmed')
  eq('★ 妆位从头到尾没动过', BS.bookedSeqsOfSchedule(S503).join(','), '1,2,3,4')
  eq('★ 不弹确认框（这一步可逆，客人还能再申请一次）', modals.length, 0)
  eq('★ 也不退回列表（妆娘还能接着看这一单）', backs, nb)
  eq('说清了是「保留」而不是「放人」', last(), '已保留这一单')

  // ② 客人又申请了一次，这回妆娘点「同意取消」，但先反悔
  BS.updateBooking('bk-7', { status: 'cancel_requested' })
  open('bk-7')
  toasts.length = 0
  modals.length = 0
  modalAnswer = false
  act('agreeCancel')
  console.log('  点「再想想」→ 状态=' + st('bk-7') + ' 退回次数=' + (backs - nb))
  eq('★ 先弹了个确认框（这一下真把客人的位置拿掉了，而她人不在现场）',
    modals.length, 1)
  eq('框上把后果说清楚了', modals[0].content,
    '确认后这一单移入「已取消」，妆位空出来可以约给别人。')
  eq('标题也点名是「同意顾客取消」', modals[0].title, '同意顾客取消')
  eq('★ 点「再想想」→ 状态一动没动', st('bk-7'), 'cancel_requested')
  eq('★ 也不退回', backs, nb)
  eq('也不吭声', toasts.length, 0)
  eq('妆位照样占着', BS.bookedSeqsOfSchedule(S503).join(','), '1,2,3,4')

  // ③ 再点一次，这回真同意
  toasts.length = 0
  modalAnswer = true
  act('agreeCancel')
  console.log('  点「同意取消」→ status=' + st('bk-7') + ' leaving=' + pg.data.leaving +
              ' ｜ ' + last())
  eq('★ 状态变已取消（⛔ 不是把记录删掉）', st('bk-7'), 'cancelled')
  eq('★ 立刻退回列表（理由同「标记已确认」：底栏一换键，手抖就点错）', backs, nb + 1)
  eq('★ leaving 换成「已取消，正在退回…」（不是已确认那一句）',
    pg.data.leaving, '已取消，正在退回…')
  eq('告诉妆娘妆位放回去了', last(), '已取消，妆位空出来了')
  // 05-03 上 bk-4/5/6/7 各占 1/2/3/4 位；bk-7 一撤，第 4 位必须从占位名单里消失。
  eq('★ 妆位真的空出来了，可以约给别人', BS.bookedSeqsOfSchedule(S503).join(','), '1,2,3')
  eq('★ 但这一单【还在】「已取消」里（凭据不删）',
    BS.getBookings().filter((b) => b.status === 'cancelled').map((b) => b.booking_id).join(','),
    'bk-7')

  // ④ ALLOW 挡着：只有「等妆娘回话」的单才轮到这两个动作
  open('bk-6')   // 待处理
  modals.length = 0
  act('agreeCancel')
  eq('★ 待处理的单点「同意取消」连框都不弹', modals.length, 0)
  eq('bk-6 还是待处理', st('bk-6'), 'pending')
  open('bk-5')   // 已确认（客人没申请，妆娘不该替她取消）
  modals.length = 0
  act('agreeCancel')
  eq('★ 已确认但没人申请的单，也点不动「同意取消」', modals.length, 0)
  eq('bk-5 还是已确认', st('bk-5'), 'confirmed')
  eq('它的妆位照样占着', BS.bookedSeqsOfSchedule(S503).indexOf(2) >= 0, true)
  // ⚠️ 上面那两条同时验了 done 也算「有人了」：05-02 的 bk-3 是已完成，
  //    它那个第 3 位【照样】占着 —— 做完了不等于空出来了。
  eq('★ 已完成的妆位依旧占着（做完了 ≠ 空出来了）',
    BS.bookedSeqsOfSchedule(S100).join(','), '2,1,3')
}

/* ══════════════════════════════════════════════════════════════════════
   ⑦ 预约单填写页 · CN（圈名）必填
   2026-09-29 用户加的：「顾客档案增加 cn 模块，填写档案时最先填写 cn，
   是用户的圈名。」CN 是妆娘认人的【唯一凭据】（角色名每单都不一样），
   所以它是单独一道校验、单独一句提示 —— 并进「角色名和微信号」里报的话，
   用户会以为「一并补上就行」，而不是「这个最要紧」。
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n════ ⑦ 预约单填写页 · CN 必填 ════')

{
  const navs = []
  const redirs = []
  const backs = 0
  const toasts = []
  let backsN = 0
  global.wx = {
    showToast: (o) => toasts.push(o.title),
    navigateTo: (o) => navs.push(o.url),
    redirectTo: (o) => redirs.push(o.url),
    navigateBack: () => { backsN++ },
    switchTab: (o) => navs.push(o.url)
  }
  const timers = []
  global.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length }
  const flush = () => { const t = timers.splice(0); t.forEach((x) => x.fn()) }

  let cfg = null
  global.Page = (c) => { cfg = c }
  delete require.cache[require.resolve(R('妆历小程序/pages/booking-form/booking-form.js'))]
  require(R('妆历小程序/pages/booking-form/booking-form.js'))

  const pg = {}
  for (const k in cfg) pg[k] = cfg[k]
  // setData 要支持 'form.cn' 这种路径写法 —— 表单字段全走它
  pg.setData = function (patch) {
    for (const k in patch) {
      const parts = k.split('.')
      let o = this.data
      for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]]
      o[parts[parts.length - 1]] = patch[k]
    }
  }
  const reopen = (opt) => {
    pg.data = JSON.parse(JSON.stringify(cfg.data))
    pg.onLoad(opt || {})
  }
  // 表单字段走的是同一个 onInput（data-k 决定写哪个字段）
  const type = (k, v) => pg.onInput({ currentTarget: { dataset: { k } }, detail: { value: v } })

  reopen({})
  eq('★ 顾客自填：CN 预填好（审核员一键可提交）', pg.data.form.cn, '千夏')
  eq('form 里有 cn 这个字段（不是靠 undefined 混过去）', 'cn' in pg.data.form, true)
  eq('cn 排在 form 的第一个 key（填写顺序就是先 CN）',
    Object.keys(pg.data.form)[0], 'cn')
  type('cn', '洛霞')
  eq('输入框写的是同一个字段', pg.data.form.cn, '洛霞')

  reopen({ mode: 'artist' })
  eq('★ 妆师代填：CN 不预填（线下口头约的，得她自己问清圈名）', pg.data.form.cn, '')
  eq('代填时标题也跟着换', pg.data.title, '新建预约单（代填）')

  // ① CN 空着 → 单独一句提示，别的什么都不动
  reopen({})
  type('cn', '')
  toasts.length = 0
  pg.onSubmit()
  console.log('  CN 空着就提交 → ' + toasts[0])
  eq('★ 拦住', toasts.length, 1)
  eq('★ 单独报 CN，不并进「角色名和微信号」那句', toasts[0], '请先填 CN（圈名），妆娘靠它认人')
  eq('★ 没跳走', navs.length + redirs.length, 0)
  eq('★ 也没排跳转的定时器（拦住了就是真拦住）', timers.length, 0)

  // ② CN 填了，角色名空 → 才轮到原来那句
  type('cn', '千夏')
  type('role', '')
  toasts.length = 0
  pg.onSubmit()
  eq('★ CN 有了，才轮到报角色名和微信号', toasts[0], '请填写角色名和微信号')
  eq('还是没跳走', navs.length + redirs.length, 0)

  // ③ 未成年没勾监护人 → 仍然过不去（这条老规矩不能被 CN 挤掉）
  type('role', '安琪拉')
  pg.toggleMinor()
  toasts.length = 0
  pg.onSubmit()
  eq('★ 未成年没勾监护人 → 拦住', toasts[0], '未成年需先勾选「已得到监护人允许」')
  eq('还是没跳走', navs.length + redirs.length, 0)
  pg.toggleGuardian()

  // ④ 齐了 → 提交成功，先给反馈、延后 1.8 秒再走
  toasts.length = 0
  pg.onSubmit()
  console.log('  齐了 → ' + toasts[0] + '（定时器 ' + timers.length + ' 个）')
  eq('★ 提交成功的反馈', toasts[0], '预约单已提交，化妆师会联系你')
  eq('★ 反馈还没看完就先别跳（排在定时器后面）', navs.length + redirs.length, 0)
  eq('定时器排上了', timers.length, 1)
  eq('就是 1.8 秒', timers[0].ms, 1800)
  flush()
  eq('★ 顾客填完进「我的预约」', redirs[0], '/pages/guest-bookings/guest-bookings')

  // ⑤ 代填走另一条出口
  reopen({ mode: 'artist' })
  type('cn', '洛霞')
  type('role', '花火')
  type('wechat', 'wxid_luoxia')
  toasts.length = 0
  pg.onSubmit()
  flush()
  eq('★ 妆师代填完退回妆师端', backsN, 1)
  eq('没往顾客端跑', redirs.length, 1)
}

/* ══════════════════════════════════════════════════════════════════════
   ⑧ 档期取消（2026-09-30 用户加的）
   用户原话：「已建成的档期需要添加取消按键，点击可清除此场次。若此场次下
   有用户已预约需要与用户沟通取消用户预约单，该场次没有预约单时可取消。」
   外加一条：「无预约单且已取消的场次不参与下拉菜单。」

   ⚠️ 取消走【软删除】（status = 'cancelled'），⛔ 不是把记录抹掉。
      记录留着，由 getSchedules() 那一层滤掉 —— 于是
        · 档期列表看不见它
        · 预约单的场次下拉里也没有它
      一次成立，因为两边读的是【同一个函数】。这也是第 14 条规矩
      （判定要问同一个函数）在这一次改动上的落点。
   ══════════════════════════════════════════════════════════════════════ */
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

  /* 结构断言要读的文件（node 里没有排版引擎，「按钮在哪」只能读文件钉结构）。
     ⚠️ 注释必须【先摘掉】再查 —— 下面几条要找的字符串，注释里全都出现过
     （比如 .s-cancel-hit 的注释里就写着「绝不能写成 margin-left」）。
     不摘注释的话，断言是在对着自己的说明文字下结论。 */
  const stripCss = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '')
  const stripHtml = (t) => t.replace(/<!--[\s\S]*?-->/g, '')
  const listWxss = stripCss(fs.readFileSync(R('妆历小程序/pages/schedule/schedule.wxss'), 'utf8'))
  const listWxml = stripHtml(fs.readFileSync(R('妆历小程序/pages/schedule/schedule.wxml'), 'utf8'))
  const detWxml = stripHtml(fs.readFileSync(R('妆历小程序/pages/schedule-detail/schedule-detail.wxml'), 'utf8'))
  const detJs = fs.readFileSync(R('妆历小程序/pages/schedule-detail/schedule-detail.js'), 'utf8')

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

  /* 「卡片上的签 / 框标题 / 确认键」三处必须叫同一个名字（用户原话「都改成取消场次」）。
     ⚠️ 卡片上那句是【从 wxml 里 match 出来的】，⛔ 不是在断言里抄一遍常量 ——
        抄一遍的话，哪天 wxml 把字改了，这里照样绿。 */
  const chipLabel = (listWxml.match(/class="s-cancel"[^>]*>([^<]+)</) || [])[1]
  eq('★ 卡片上那个签的文字是从 wxml 里读出来的', chipLabel, '取消场次')
  eq('★ 框标题 = 卡片上的文字 + 「？」', m.title, chipLabel + '？')
  eq('★ 确认键 = 卡片上的文字（⛔ 不是干巴巴一个「确认」）', m.confirmText, chipLabel)

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
    pgE.data.schedules.filter((c) => c.id === busyS.schedule_id)[0].booked, 0)
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
  //    （listWxss / listWxml / detWxml / detJs 都在这一段开头读好了）
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
    /class="s-meta"/.test(listWxml) && /class="s-bk"/.test(listWxml), true)

  eq('⛔ 详情页 wxml 里已经【没有】「取消这一场」的入口了',
    detWxml.indexOf('onCancelSchedule'), -1)
  /* ⚠️ 查 js 之前也要先摘注释 —— 这一段的注释里就写着「连带删掉的：data.leaving」，
     不摘的话断言是在对着注释下结论，永远红。 */
  const stripJs = (t) => t
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  eq('⛔ 详情页 js 里也没有 onCancelSchedule 了',
    stripJs(detJs).indexOf('onCancelSchedule'), -1)
  eq('⛔ 详情页也没有 data.leaving 了',
    /\bleaving\b/.test(stripJs(detJs)), false)
  eq('（详情页自己的 hideKeyboard 留着是对的 —— 那页真有输入框）',
    /wx\.hideKeyboard\(\)/.test(detJs), true)
}

restoreBookings()

console.log('\n' + (fail ? 'FAILED ' + fail + ' / ' : 'ALL PASS ') + (pass + fail) + ' assertions\n')
process.exit(fail ? 1 : 0)
