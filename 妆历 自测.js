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
/* 🔴 2026-09-30（第二十处）：这里【必须】按人滤，跟页面同一个口径。
   BOOKINGS 里现在有另外两位妆娘的单（顾客端「我约过的妆娘」要求每位都有一条
   「我约过她」的记录），而页面走的是 bookingsOfArtist(getArtist().artist_id)。
   桩要是不跟着滤，这几条断言就会因为「别的妆娘的单混进来了」而红 ——
   那种红是假警报，但它掩盖的正是真问题：**妆娘端只该看见自己的单**。
   ⚠️ 妆娘端那一位是谁，从 ARTIST_PUBLIC.artist_id 取，⛔ 不写字面量 'demo' ——
      写了就没人知道这两处是一回事了。 */
const MY_ARTIST_ID = require(R('妆历小程序/mock/data.js')).ARTIST_PUBLIC.artist_id
function byTab(key) {
  return BS.bookingsOfArtist(MY_ARTIST_ID).filter((b) => {
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

  /* 🔴🔴 2026-09-30（第二十处）新增 —— 妆娘端的射程。
     BOOKINGS 里现在有另外两位妆娘的单（顾客端要的）。妆娘端选「全部」场次时
     【不按场次滤】，所以少了 bookingsOfArtist() 这一层，demo 会安静地在
     自己的列表里多看见几张别人的单 —— 不报错、不崩，只是错。
     ⚠️ 第二条是【防上面的空集自证】：要是哪天 BOOKINGS 里一张别人的单都没有了，
        上面那条会靠空数组白拿一个绿，而它保的性质当天就没了。 */
  const mineAll = [].concat(byTab('pending'), byTab('confirmed'), byTab('done'), byTab('closed'))
  eq('🔴★ 妆娘端能看见的每一张单都是她自己的（⛔ 一张别人的都没有）',
    mineAll.filter((b) => b.artist_id !== MY_ARTIST_ID).length, 0)
  eq('★ 而且库里确实存在【不是她的】单（不然上一条是空集自证，白绿）',
    BS.getBookings().filter((b) => b.artist_id !== MY_ARTIST_ID).length > 0, true)
  /* ⚠️ 这一条【按人直接数】，⛔ 不能用上面 mineAll 那几个 Tab 相加 ——
     「顾客申请取消」（cancel_requested）那一张【不属于四个 Tab 里的任何一个】
     （它留在「已确认」里等妆娘回话），加起来恒少一张。
     这不是四舍五入的小事：用 Tab 求和当总数，会让这条断言从第一天起就差 1。 */
  eq('★ 她那 7 张一张不少（按人滤没有把她自己的单也滤掉）',
    BS.bookingsOfArtist(MY_ARTIST_ID).length, 7)
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
  /* 点输入框 = 弹搜索历史。⚠️ 它和「打字」是两回事：点一下只是把框激活，
     一个字符都还没输（onFocus 里那条 `一条历史都没有就不弹` 就靠这个区分）。 */
  const focusKw = () => pg.onFocus()
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
  eq('★ 展开场次面板时，历史面板必须被关掉（两个面板同一个位置，会叠在一起）',
    pg.data.histOpen, false)
  pg.closePanels()
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
    eq('★ 那句「没有叫这个名字的展子 / CN」只给【选着「全部」】的时候看',
      /wx:if="\{\{searching && schedId !== 'all'\}\}"[\s\S]*?wx:elif="\{\{searching\}\}"[\s\S]{0,400}?没有叫这个名字的展子 \/ CN/.test(bw),
      true)
    eq('★ 面板现在直接循环 schedChips（⛔ 不再有 schedOptions）',
      /wx:for="\{\{schedChips\}\}"/.test(bw), true)

    const bwss = require('fs')
      .readFileSync(R('妆历小程序/pages/booking/booking.wxss'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    eq('⛔ .sp-none 那套样式也跟着删了（不留死代码）', /\.sp-none/.test(bwss), false)
    // 🔴「搜索中：跨全部场次」这条提示用户点名删掉（搜索不再跨场次了）
    eq('🔴★ 「搜索中：跨全部场次」那句话在 wxml 里已经删干净',
      /搜索中：跨全部场次/.test(bw), false)
    eq('⛔ 它的样式（.sb-tip*）也跟着删了，不留死代码', /\.sb-tip/.test(bwss), false)
    /* 📌 2026-09-30（第二十处）：这一套下拉【搬到 app.wxss】了 ——
       顾客端 C1 的妆位页要一条一模一样的场次筛选，两份实现就是两份真相。
       ⚠️ 这条断言的【性质一个字没变】（那个蒙层叫 .pn-mask、是两个面板
          共用的），只是它现在住 app.wxss。⛔ 不是删掉重写一条。
       🔴 后半条是这次新加的：「搬」和「抄」的区别就在这儿 ——
          搬完本页不许还留着一份，否则下一个人改哪一份都只改到一半。 */
    const awss = require('fs')
      .readFileSync(R('妆历小程序/app.wxss'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    eq('★ 蒙层改名成两个面板共用的 .pn-mask（已上提到 app.wxss）',
      /\.pn-mask\s*\{/.test(awss), true)
    eq('🔴★ 而且 booking.wxss 里【没有】第二份（搬是搬，⛔ 不是抄）',
      /\.pn-mask\s*\{/.test(bwss), false)
    eq('⛔ 老名字 .sp-mask 一个都不剩',
      /\.sp-mask/.test(bwss) || /\.sp-mask/.test(awss), false)
    /* 🔴 面板壳：原先 .sched-panel / .hist-panel 各写了一份逐字相同的声明，
       现在合成 app.wxss 的一条 .drop-panel。⛔ 两个老名字都不许再出现
       （留着的话，谁改了那份"看起来还在用"的声明都会以为生效了）。 */
    eq('🔴★ 两个面板的壳合成一条 .drop-panel（app.wxss）', /\.drop-panel\s*\{/.test(awss), true)
    eq('🔴★ 两个老名字（.sched-panel / .hist-panel）都不剩',
      /\.sched-panel\s*\{/.test(bwss) || /\.hist-panel\s*\{/.test(bwss) ||
      /\.sched-panel\s*\{/.test(awss) || /\.hist-panel\s*\{/.test(awss), false)
    /* 🔴 妆师端专有的那几件【必须还在】—— 搬家搬过头把它们也搬走的话，
       妆师端的输入框会当场裸奔（一个没高度的裸 input = 「点了没反应」的长相）。
       📌 2026-09-30：`.sb-ipw / .sb-ip / .sb-ph`（搜索框那套壳）这一轮也上提了
          —— 顾客端「我约过的妆娘」列表页要一个同款搜索框，而那一页没有 .wxss。
          所以它从这一条挪到下面「在 app.wxss 里」那一半。
          ⚠️ **判据一个字没变**：那套壳有且只有一份、且必须存在（规矩 31 ——
             性质没变，换的是实现它的机制）。
       ⚠️ 仍然留在本页的是 ✕ / 放大镜 / 历史行：
          顾客端那两页⛔ 没有搜索历史，妆位页连搜索框都没有。 */
    eq('★ ✕ + 放大镜 + 历史行都还在 booking.wxss 里',
      ['\\.sb-clr\\s*\\{', '\\.sb-find\\s*\\{', '\\.hp-item\\s*\\{']
        .filter((re) => !new RegExp(re).test(bwss)).length, 0)
    eq('★ 搜索框的壳也在（搬到了 app.wxss，列表页和妆师端共用一份）',
      /\.sb-ipw\s*\{/.test(awss), true)
    eq('🔴★ 而且 booking.wxss 里【没有】第二份（搬是搬，⛔ 不是抄）',
      /\.sb-ipw\s*\{/.test(bwss), false)
    eq('★ 输入框里的 ✕ 只有框里有字才出现',
      /wx:if="\{\{kwInput\}\}"[\s\S]{0,120}?class="sb-clr"/.test(bw), true)
    eq('★ 点输入框弹历史走的是 bindfocus', /bindfocus="onFocus"/.test(bw), true)
    eq('★ 历史框里的清空图标挂的是 clearHist（⛔ 不是清搜索那个 clearKw）',
      /class="hp-del"[^>]*bindtap="clearHist"/.test(bw), true)
    eq('★ 点一条历史挂的是 pickHist',
      /wx:for="\{\{hist\}\}"[\s\S]{0,200}?bindtap="pickHist"/.test(bw), true)
  }

  pg.doSearch()
  eq('★ 回车 / 点放大镜 → 这一下才真的搜', pg.data.searching, true)
  eq('★ 搜完面板自己收起（不收就盖住结果第一屏）', pg.data.schedOpen, false)

  /* 🔴🔴 2026-09-30 用户把搜索的【范围】反过来了。原话：
     「我希望搜 CN 时如果点击全部可以展示这个 cn 约过的预约单，如果点击
       某场次漫展只显示该场次这个 CN 的预约单，如果没有就是空的。」
     即：搜索【也】按当前场次筛，两个条件相乘。⛔ 不再是「kw 非空就跨全部场次」。
     ⚠️ 这会儿还在 sched-demo-0503（上一段切过来的）、Tab 是待处理。 */
  eq('🔴★ 搜索跟着场次走：05-03 的待处理里没有千夏的单 → 空',
    pg.data.rows.length, 0)
  goto('已确认')
  eq('★ 同一场换到已确认：她在 05-03 的那一单出来了',
    pg.data.rows.map((r) => r.id).join(','), 'bk-7')
  eq('搜出来的单带着 CN，一眼认得出是谁', pg.data.rows[0].cn, '千夏')

  /* ★ 一个人在这位妆娘这里下过两单（bk-1 在 05-02、bk-7 在 05-03）。
     「全部」+ 搜 CN = 她在这儿的全部下单记录 —— 用户要的正是这个入口。 */
  onSched('all')
  goto('待处理')
  eq('🔴★ 点「全部」+ 搜千夏 → 她还没处理的那一单（在 05-02）',
    pg.data.rows.map((r) => r.id).join(','), 'bk-1')
  eq('★ 挑场次【不再】把搜索清掉（清了就串不起「全部 / 某一场」两档）',
    pg.data.kw, '千夏')
  goto('已确认')
  eq('★ 同一个 CN 跨两场的单都还在射程内', pg.data.rows.map((r) => r.id).join(','), 'bk-7')

  search('示例漫展')
  goto('待处理')
  eq('★ 也能搜漫展名：「全部」下两场的待处理一起出来',
    pg.data.rows.map((r) => r.id).join(','), 'bk-1,bk-6')
  // 同一个词，挑一场就只剩这一场的 —— 这正是这一轮要的「相乘」
  onSched('sched-demo-0502')
  eq('🔴★ 同一个词挑 05-02 → 只剩这一场的 bk-1',
    pg.data.rows.map((r) => r.id).join(','), 'bk-1')
  onSched('sched-demo-0503')
  eq('🔴★ 换成 05-03 → 只剩这一场的 bk-6',
    pg.data.rows.map((r) => r.id).join(','), 'bk-6')

  search('  初七  ')
  goto('已确认')
  eq('★ 关键词前后有空格也认（去掉再比）', pg.data.rows.map((r) => r.id).join(','), 'bk-4')
  eq('★ 框里回写成去掉空格的那个词（框里显示什么 = 实际搜了什么）', pg.data.kwInput, '初七')
  search('DEMO_MIKU')
  eq('★ 微信号【搜不出来】—— 高风险字段不进这个入口', pg.data.rows.length, 0)

  /* 搜不到 → 空态现在分【两种】，因为它们该说的话不一样：
     选着某一场搜不到 = 只有这一场没有，别的场次可能有；
     选「全部」搜不到 = 这个人真的没在她这儿下过单。
     混成一句，「她明明下过单」的时候妆娘会以为自己白找了一场。 */
  search('不存在的人')
  eq('搜不到就是空列表', pg.data.rows.length, 0)
  eq('★ 空态认得出「这是搜出来的空」，不会说「客人填单后会出现」', pg.data.searching, true)
  onSched('all')
  eq('★「全部」下搜不到 → 才轮到那句「没有叫这个名字的展子 / CN」',
    pg.data.searching && pg.data.schedId === 'all', true)

  // 把框里删空再搜 = 清空搜索（不用非得去点那颗 ✕）
  typeKw('')
  pg.doSearch()
  eq('★ 删光再搜 = 清空搜索', pg.data.searching, false)
  goto('待处理')
  eq('清空后回到当前这一场的单（这会儿停在「全部」，两场的待处理都在）',
    pg.data.rows.map((r) => r.id).join(','), 'bk-1,bk-6')

  // 输入框里那颗 ✕：两级状态必须一起清
  search('千夏')
  eq('搜索中', pg.data.searching, true)
  eq('★ 有字的时候 ✕ 才在（wxml 上那条 wx:if 的运行时对应物）', !!pg.data.kwInput, true)
  pg.clearKw()
  eq('★ 点 ✕ → 主列表回到按场次筛', pg.data.searching, false)
  eq('★ 输入框也一起清干净（只清一级 = 框里留着字说还在搜）', pg.data.kwInput, '')
  eq('★ 而且 ✕ 一按就把框里那个字抹掉了，✕ 自己也就跟着没了', pg.data.kwInput, '')

  /* ══ 搜索历史（2026-09-30 用户要的）══════════════════════════════
     用户原话：「点击输入框会显示搜索历史，搜索历史框最多容纳十条记录，
                在搜索历史框里面有一个清空图标，点一下即可清空搜索历史。」 */
  onSched('sched-demo-0503')
  delete store.zhuangli_bk_hist          // 从零开始数
  pg.setData({ hist: [] })
  eq('★ 一条历史都没有时，点输入框【什么都不弹】（空框纯噪声）', (() => {
    focusKw()
    return pg.data.histOpen
  })(), false)

  // 显式攒一遍（⛔ 不依赖上面那段搜过什么 —— 那种断言看着绿，其实在数别的）
  search('千夏'); search('示例漫展'); search('初七')
  eq('★ 提交过的词会进历史（按搜的顺序，最近的在最前）',
    store.zhuangli_bk_hist.join(','), '初七,示例漫展,千夏')
  eq('★ 只是打字、没提交的词⛔ 不进历史（那是她还没下定的决心）', (() => {
    typeKw('别记我')
    return store.zhuangli_bk_hist.indexOf('别记我')
  })(), -1)
  focusKw()
  eq('★ 有历史了 → 点输入框弹出来', pg.data.histOpen, true)
  eq('★ 弹历史时场次面板要收起来（同一个位置，会叠在一起）', pg.data.schedOpen, false)
  eq('★ 打字（不是点框）不弹历史 —— 她已经在输了，那份清单挡着没用',
    (() => { typeKw('千'); return pg.data.histOpen })(), false)

  // 重复搜同一个词 = 把它置顶，⛔ 不是再攒一条
  pg.setData({ hist: [] })
  store.zhuangli_bk_hist = []
  search('千夏'); search('初七'); search('千夏')
  eq('🔴★ 重复的词不重复记，而是置顶到最前',
    store.zhuangli_bk_hist.join(','), '千夏,初七')
  eq('★ 去重按【小写】比，所以大小写不同也算同一个词', (() => {
    search('DEMO_MIKU'); search('demo_miku')
    return store.zhuangli_bk_hist.filter((x) => x.toLowerCase() === 'demo_miku').length
  })(), 1)
  eq('★ 但存下来的是【她最后打的那个写法】（所见即所搜）',
    store.zhuangli_bk_hist[0], 'demo_miku')

  // 上限 10 条：第 11 条进来，最老的那条被挤掉
  pg.setData({ hist: [] })
  store.zhuangli_bk_hist = []
  for (let i = 1; i <= 10; i++) search('CN' + i)
  eq('★ 攒到 10 条', store.zhuangli_bk_hist.length, 10)
  search('CN11')
  eq('🔴★ 上限就是 10 条（用户原话「最多容纳十条记录」）',
    store.zhuangli_bk_hist.length, 10)
  eq('★ 第 11 条进来，最老的那条（CN1）被从尾巴上挤掉',
    store.zhuangli_bk_hist.indexOf('CN1'), -1)
  eq('★ 新的排最前', store.zhuangli_bk_hist[0], 'CN11')
  eq('★ 第 2 老的那条还在（砍的是尾巴，不是整个清）',
    store.zhuangli_bk_hist.indexOf('CN2') >= 0, true)

  // 点一条历史 = 填进框【并立刻搜】（用户定的「直接搜」）
  eq('★ 点历史前先把词清掉，确保下面那条断言是点出来的、不是上一步剩的',
    (() => { pg.clearKw(); return pg.data.kwInput })(), '')
  pg.pickHist({ currentTarget: { dataset: { k: '千夏' } } })
  eq('★ 点一条历史 → 框里有那个词了', pg.data.kwInput, '千夏')
  eq('★ 而且【当场就搜了】（用户定的：不用再点一下放大镜）', pg.data.kw, '千夏')
  eq('★ 搜完历史面板自己收起', pg.data.histOpen, false)
  eq('★ 点历史也把它置顶（复用这个词 = 它确实是常用的）',
    store.zhuangli_bk_hist[0], '千夏')

  // 清空图标：一次点掉全部
  focusKw()
  eq('（前置）清空前历史是满的', store.zhuangli_bk_hist.length > 0, true)
  pg.clearHist()
  eq('🔴★ 点清空图标 → 历史一条不剩（用户原话「点一下即可清空」）',
    store.zhuangli_bk_hist.length, 0)
  eq('★ data 里也同步清了（不然框里还画着旧的）', pg.data.hist.length, 0)
  eq('★ 清空后历史框自己收起（都没了，还开着是个空框）', pg.data.histOpen, false)
  eq('★ 清空【不弹二次确认】—— 这是她自己手机上的搜索记录，删了不损失业务数据',
    (() => { const n = toasts.length; pg.clearHist(); return toasts.length === n })(), true)
  // ⚠️ 清历史 ⛔ 不动当前那次搜索 —— 那是两件事
  eq('★ 清历史不碰当前搜索（词还在框里、列表还筛着）',
    (() => { const before = pg.data.kw; pg.clearHist(); return pg.data.kw === before })(), true)

  // 挑完场次面板也收起来
  search('千夏')
  pg.toggleSched()
  onSched('sched-demo-0503')
  eq('★ 挑完场次面板也收起来', pg.data.schedOpen, false)
  /* 🔴 这一条就是上一轮反过来的那件事：挑场次【不清】搜索。
     清了的话「先搜 CN，再点某一场看她这一场的单」这个流程会当场断掉。 */
  eq('🔴★ 挑场次【不清】搜索，两个条件叠加（用户这一轮要的用法）',
    pg.data.kw, '千夏')
  eq('★ 输入框里那个词也留着', pg.data.kwInput, '千夏')
  pg.clearKw()   // 下面那段要干净的场次视角

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
  /* ⚠️ 2026-09-30（第十七处）：桩里**必须**有 storage。
     妆师端「代填」现在要读档期（scheduleStore 走 storage）才能列出场次下拉，
     没有 storage 就在 onLoad 里直接抛 TypeError，整段红在一个跟被测逻辑无关的地方。
     ⚠️ setStorageSync 走 JSON 往返（跟真机一致）：这样「存进去一个 mock 常量
        的引用」这类会被跨段污染的实现，在这里当场现形。 */
  const store7 = {}
  global.wx = {
    getStorageSync: (k) => (k in store7 ? JSON.parse(store7[k]) : ''),
    setStorageSync: (k, v) => { store7[k] = JSON.stringify(v) },
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
  /* 「一共往外跳了几次」—— ④ 之前那几条断言写的是 `navs.length + redirs.length`，
     它们在 ④ 之前跑所以恰好是 0。⑤ 起要对比「这次有没有多跳」，所以抽出来用差值。 */
  const outN = () => navs.length + redirs.length + backsN
  /* ⚠️ ⑦ 这一段的代填会**真的往 BOOKINGS 里 push 单子**（那是这次要验的行为本身）。
     但它跑在 ⑧⑨⑩ 前面 —— 不还原的话，后面几段读到的单子数就跟我动笔时不一样了。
     照 ⑥ 段 restoreBookings() 的做法：就地改那个数组，⛔ 不是换一个引用
     （换成新数组的话，bookingStore 里那个闭包还握着老的，后面每段都歪）。 */
  const snap7 = JSON.parse(JSON.stringify(BS.getBookings()))
  const restore7 = () => {
    const list = BS.getBookings()
    list.length = 0
    snap7.forEach((b) => list.push(JSON.parse(JSON.stringify(b))))
  }
  // 表单字段走的是同一个 onInput（data-k 决定写哪个字段）
  const type = (k, v) => pg.onInput({ currentTarget: { dataset: { k } }, detail: { value: v } })
  /* 🔴 顾客自填必须**带一个真妆位**打开 —— 这几行原先写的是 `reopen({})`，
     靠的正是那个「找不到就静默回落到 SLOTS[1]」的实现。那个回落第十七处被删掉了
     （它是妆师端代填挂错漫展的成因），于是这几条当场变红。
     ⚠️ 这恰好说明「旧版这几条断言在验什么」：它们在验一个**不存在的路径** ——
        真实入口 pages/landing/landing.js 的 pickSlot 永远会带妆位过来。
        改带妆位之后，测的才是顾客真走的那条路。
     🔴 2026-10-01（第二十处第 ⑥ 步）：写法从 `?slot_id=demo-s2` 换成
        `?schedule_id=&seq=`。**判据和意图一个字没改** ——
        这条钉的仍然是「真入口过来的那个妆位，填写页认得出来」，
        变的只是妆位身份怎么表达（`slot_id` 是那份已退役的冻结夹具才有的东西）。
     ⚠️ 用 sched-demo-0502 的第 2 位：它就是老夹具里 `demo-s2` 的对应物
        （同一个漫展、同一个时段），换上去期望的文案一个字都不用改。

     🔴🔴 2026-10-01（第二十三处）：**那个写死的「第 2 位」是个坏测试数据，
        这一轮把它换掉了。** 第 2 位正是 `bk-2`（已确认）占着的 ——
        也就是说这几条一直在拿一个**已经被预订的妆位**走「提交成功」那条路。
        在顾客提交不建单、也没有并发重查的年代它照绿不误；
        第二十三处把这两样都补上之后，它当场被拦住、整段崩在
        「定时器没排上」上。⇒ 它**从来没验过「顾客真能约上一个空位」**。
        ⚠️ 所以现在不再写死序号，而是**当场算一个空位**：
           写死的话，示例数据一动、或前面哪一段多占了一个位，
           这一段就会以「定时器没排上」的样子崩掉 —— 而崩的原因
           跟它要保的性质（提交成功要能走通）毫无关系。
        ⚠️ 前面那条 `eq` 就是给这个计算**兜底**的：真一个空位都没有时，
           它先红，而不是等到 `.seq` 上抛一个看不出所以然的 TypeError。 */
  const _s502 = getSchedules().filter((s) => s.schedule_id === 'sched-demo-0502')[0]
  const _free502 = (((_s502 || {}).slots) || [])
    .filter((x) => !x.is_break && BS.bookedSeqsOfSchedule(_s502).indexOf(x.seq) < 0)
  eq('🔴★ 测试自己先站稳：sched-demo-0502 上必须真空着一个妆位',
    _free502.length > 0, true)
  const USER_OPEN = { schedule_id: 'sched-demo-0502', seq: _free502[0].seq }
  const USER_TEXT = '示例漫展 · 第 ' + _free502[0].seq + ' 位 · ' +
    _free502[0].start + ' – ' + _free502[0].end

  reopen(USER_OPEN)
  eq('★ 顾客自填：CN 预填好（审核员一键可提交）', pg.data.form.cn, '千夏')
  eq('form 里有 cn 这个字段（不是靠 undefined 混过去）', 'cn' in pg.data.form, true)
  eq('cn 排在 form 的第一个 key（填写顺序就是先 CN）',
    Object.keys(pg.data.form)[0], 'cn')
  type('cn', '洛霞')
  eq('输入框写的是同一个字段', pg.data.form.cn, '洛霞')
  eq('★ 顾客自填：妆位是 C1 上定好的那一个，卡片上直接写出来',
    pg.data.slotText, USER_TEXT)
  eq('★ 而且没有「妆位没找到」这个标记', pg.data.slotMissing, false)

  // 顾客自填：查询串带了个不存在的妆位 → 拦住，⛔ 不是随便挑一个顶上
  reopen({ schedule_id: 'sched-不存在', seq: 2 })
  eq('🔴★ 妆位找不到 → 标记出来', pg.data.slotMissing, true)
  eq('🔴 卡片上明说「这个妆位已经不在了」', pg.data.slotText, '这个妆位已经不在了')
  toasts.length = 0
  pg.onSubmit()
  eq('🔴★ 提交也被拦住（⛔ 不落到任何一个妆位上）',
    /已经不在了/.test(toasts[0]), true)
  eq('🔴★ 而且【一张单都没生成】', BS.getBookings().length, snap7.length)

  /* 🔴★ 第二种查不到：**场次在、妆位没了**。
     这一支比上面那条更接近真事 —— 妆娘在顾客选好之后把那个妆位删了，
     顾客手上那个链接还是旧的。⚠️ 判据不变（查不到就出声）；
     加这一条是因为 (schedule_id, seq) 是两个字段，只验「场次不存在」
     等于只验了一半的路（`seq` 对不上时走的是同一支，但没人钉过）。 */
  reopen({ schedule_id: 'sched-demo-0502', seq: 99 })
  eq('🔴★ 场次在、序号不在 → 同样是「已经不在了」', pg.data.slotMissing, true)
  eq('🔴 而且没有落到任何别的妆位上',
    pg.data.slotText, '这个妆位已经不在了')

  reopen({ mode: 'artist' })
  eq('★ 妆师代填：CN 不预填（线下口头约的，得她自己问清圈名）', pg.data.form.cn, '')
  eq('代填时标题也跟着换', pg.data.title, '新建预约单（代填）')

  // ① CN 空着 → 单独一句提示，别的什么都不动
  reopen(USER_OPEN)
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
  /* 🔴 2026-10-01（第二十一处第二轮）：「我的预约」升成 tab 页之后，
     这一跳**从 redirectTo 换成 switchTab** —— 用 redirectTo 跳 tab 页是
     **静默失败**（顾客提交完停在原地，以为没提交上，一个字都不报）。
     ⚠️ 桩里 switchTab 记进 `navs`、redirectTo 记进 `redirs`，
        所以下面两条一起来：**落在 navs 里** + **redirs 是空的**。 */
  eq('★ 顾客填完进「我的预约」（走 switchTab —— 那一页现在是 tab 页）',
    navs[0], '/pages/guest-bookings/guest-bookings')
  eq('🔴★ 而且没有再顺手 redirectTo 一次（那条路在 tab 页上是静默失败）',
    redirs.length, 0)

  /* ══ 🔴🔴 2026-10-01（第二十三处）：顾客提交**真建了一张单** ══════════
     用户原话：「约完了这个妆位还可以再约，也没有变灰」。
     根因 = `addBooking` 整块被包在 `mode === 'artist'` 里，顾客那一边
     提交只弹了一句 toast。C1 那一行的被占判据 `bookedSeqsOfSchedule()`
     读的就是这个数组 —— 没有单，那个位永远「可约」，能被反复约走。
     ⚠️ 两问**缺一不可**：①位子真占上了 ②同一个位子再约一次**约不走**。
        只写 ① 的话，「建了单但不查重」照样绿。 */
  const _afterSubmit = BS.getBookings().length
  const _gNew = BS.getBookings()[_afterSubmit - 1]
  eq('🔴★ 顾客提交 → 真建了一张单（原先一条记录都没有）',
    _afterSubmit, snap7.length + 1)
  eq('🔴★ 而且是「我的单」：created_by 必须是 user（改一个字，他刚提交的单' +
     '当场从自己列表里消失）', _gNew.created_by, 'user')
  eq('🔴★ 那个妆位当场被占上（C1 那一行的灰底 +「已被预订」读的就是它）',
    BS.bookedSeqsOfSchedule(_s502).indexOf(USER_OPEN.seq) >= 0, true)

  const _beforeAgain = BS.getBookings().length
  toasts.length = 0
  pg.onSubmit()
  eq('🔴★ 同一个妆位再约一次 → 拦住（用户原话「约完了还可以再约」）',
    /刚被约走了/.test(toasts[0]), true)
  eq('🔴★ 而且【没有再建第二张单】', BS.getBookings().length, _beforeAgain)
  eq('★ 卡片上也跟着改成「已经被预订了」',
    pg.data.slotText, '这个妆位已经被预订了')

  /* 🔴 规矩 39：这个入口的参数里带了「是哪一位」⇒ 测试至少要喂两位。
     单挂错人**一个字都不报** —— 阿黎那页下的单记到 demo 名下，
     顾客端「我约过的妆娘」会凭空多出一个他没约过的人。 */
  const _mt = ((((require(R('妆历小程序/utils/artistStore.js'))
    .scheduleById('sched-mian-0701') || {}).slots) || []))
    .filter((x) => !x.is_break && x.seq !== 1)[0]
  reopen({ schedule_id: 'sched-mian-0701', seq: _mt.seq, artist_id: 'demo-mian' })
  pg.onSubmit()
  eq('🔴★ 在别人（demo-mian）的页面上约 → 单子挂她名下，⛔ 不是兜底成 demo',
    BS.getBookings()[BS.getBookings().length - 1].artist_id, 'demo-mian')
  /* ⚠️ 这一单也排了个 1.8 秒后跳「我的预约」的定时器 —— 不放掉的话，
     它会留在 timers 里，害 ⑤ 段那条「代填完退回妆师端」多数出一个。 */
  flush()

  /* ══════════════════════════════════════════════════════════════════
     ⑤ 妆师端「代填」（2026-09-30 第十七处大改）

     🔴 这一整块修的是一个**真 bug**：原先 onLoad 里是
          `SLOTS.filter(...)[0] || SLOTS[1]`
        妆师端进来**不带 slot_id**（booking.js 的 goNewArtistForm 只传
        `?mode=artist`）→ 静默回落到 `SLOTS[1]`，那是**顾客端 C1 落地页的
        示例妆位**（漫展名写死「示例漫展」）。结果：妆娘线下谈好一单，
        代填出来的单挂在一场她根本不存在的漫展上，而且一点提示都没有。

     ⚠️ 旧版的 ⑤ 只有三行：填完 cn/role/wechat 直接 onSubmit 就期望退回。
        现在**选不出妆位就提交不了** —— 那正是这次要验的事，所以整块重写。
     ⚠️ 用一场**自己新建的**档期来跑通的路径：mock 里那两场示例档期
        （sched-demo-0502 / 0503）的妆位基本都被示例单占着，拿它们跑不出
        「有妆位可选」那条路（顺带：这正好拿来验 C3 空态）。
        📌 2026-09-30（第二十处）更正：这句话原先写的是「**已经全被** 7 张
           示例单占满了」—— 只有 0503 是。0502 这一轮加到 5 个妆位
           （顾客端 C1 的默认场次，不能一个空位都没有）。
     ══════════════════════════════════════════════════════════════════ */
  const SS = require(R('妆历小程序/utils/scheduleStore.js'))
  const genSlots = S.generateSlots

  /* 🔴🔴 2026-09-30（第二十处）新增 —— 进 ⑤ 之前先把预约单还原。
     上面几段（顾客取消 / 妆娘同意 / 批量处理）会**就地改** BOOKINGS 的状态，
     而且不是每一段都收干净了：跑完 ⑤-B 时 bk-1 已经是 confirmed、
     bk-4 是 done、bk-7 是 cancelled。
     ⚠️ 这不是「为了绿而还原」—— ⑤ 下面的前提就是「示例档期的妆位是满的」，
        不还原的话那个前提是假的，而断言只会以「某一场的下拉里多了一项」
        这种看不出所以然的方式变红。⛔ 别删这一行，也别改成换一场档期。
     ⚠️ 用 ⑥ 段那个 restoreBookings()：它是**就地改**数组（`list.length = 0`
        再 push），⛔ 不是换一个引用 —— 换引用的话 bookingStore 里那个闭包
        还握着老的，后面每段都歪（⑥ 段那段注释原话）。 */
  restoreBookings()

  // ⑤-A 代填不预选任何妆位
  reopen({ mode: 'artist' })
  eq('★ 代填：CN 不预填（线下口头约的，得她自己问清圈名）', pg.data.form.cn, '')
  eq('★ 代填时标题也跟着换', pg.data.title, '新建预约单（代填）')
  eq('🔴 代填【不预选任何妆位】—— 哪一场只有她知道，替她选就是又一次替她做决定',
    pg.data.pickedSched, '')
  eq('★ 卡片上先写「请选择场次」', pg.data.pickedSched ? 'x' : '请先选场次', '请先选场次')
  eq('★ 场次下拉里没有「全部」这一项（预约单必须落在具体一场上）',
    pg.data.schedOptions.filter((o) => o.value === 'all').length, 0)
  eq('★ 下拉里的场次名带日期（同一个漫展分两天，光看名字分不出来）',
    /· \d\d-\d\d$/.test(pg.data.schedOptions[0].label), true)

  // ⑤-B 没选妆位就提交 → 三道闸逐个出声，且一张单都不生成
  type('cn', '洛霞')
  type('role', '花火')
  type('wechat', 'wxid_luoxia')
  const nBefore5 = BS.getBookings().length
  const outBefore5 = outN()
  toasts.length = 0
  pg.onSubmit()
  eq('🔴 没选场次就提交 → 拦住', toasts[0], '先选一场档期')
  eq('🔴★ 而且【一张单都没生成】（不是「先提交了再提示」）',
    BS.getBookings().length, nBefore5)
  eq('★ 也没往外跳', outN(), outBefore5)

  /* ⑤-C 选一场【妆位全被占满】的档期 → C3 空态必须说清是「满了」
     🔴 2026-09-30（第二十处）：这一条从 sched-demo-0502 改用 sched-demo-0503。
        原因：0502 被加到了 5 个妆位（它同时是【顾客端 C1 的默认场次】，
        3 个位全占满的话提审截图 ② 上一个妆位都点不到）。
        ⇒ 用 0503（4 个位被 bk-4/5/6/7 占满）之后**判据一个字没改**，
          emptyReasonOf 一样落到「这一场的妆位都约满了」。
        ⚠️ 别把这条删了 —— 它保的是「约满」这个状态**真的还会有**，
           不是「0502 永远满着」。

     🔴🔴 而且它逼出了一个**真问题**：这一条第一次改完是红的，因为跑到这里时
        bk-7 已经被上面「同意取消」那段改成了 cancelled ⇒ 0503 的第 4 位也空着。
        「示例数据是排满的」这件事**从来就不成立** —— 它只是碰巧在旧断言下
        看不出来（旧断言用的是 0502，而 bk-1/2/3 那三张的 status 恰好没被动过）。
        ⇒ 修法是先把预约单**还原成初始快照**再验（见 ⑤-A 上面那行
          restoreBookings()），⛔ 不是换一场「碰巧还是满的」的档期。
          靠别段残留状态凑出来的前提，迟早会静默失效。 */
  const idxOf = (id) => pg.data.schedOptions.findIndex((x) => x.value === id)
  pg.pickSched({ detail: { value: idxOf('sched-demo-0503') } })
  eq('★ 这一场 4 个妆位全被示例单占着 → 下拉里一个都没有',
    pg.data.slotOptions.length, 0)
  eq('🔴★ 空态说的是「这一场的妆位都约满了」，⛔ 不是笼统的「没有可选的妆位」',
    pg.data.slotEmptyText, '这一场的妆位都约满了')
  toasts.length = 0
  pg.onSubmit()
  eq('★ 这时候提交 → 报的是「再选一个妆位」', toasts[0], '再选一个妆位')

  // ⑤-D 新建一场空档期 → 妆位出现在下拉里，文案跟 mock 逐字一致
  const g7 = genSlots({ startTime: '09:00', slotMin: 80, gapMin: 10, count: 2,
                        lunch: { enabled: false } })
  SS.addSchedule({
    schedule_id: 'sched-t7', name: '测试漫展', date: '2026-06-01',
    startTime: '09:00', slotMin: 80, gapMin: 10, count: 2,
    lunch: g7.lunch, slots: g7.slots
  })
  reopen({ mode: 'artist' })
  type('cn', '洛霞')
  type('role', '花火')
  type('wechat', 'wxid_luoxia')
  pg.pickSched({ detail: { value: idxOf('sched-t7') } })
  eq('★ 新档期两个妆位都空着 → 都出现在下拉里', pg.data.slotOptions.length, 2)
  eq('★ 下拉里那行文案 = 「第 N 位 · 时段」',
    pg.data.slotOptions[0].label, '第 1 位 · 09:00 – 10:20')
  /* 🔴 分隔符必须跟 mock 里那 7 张单【逐字一致】。booking-detail 是把这个
     字符串直接印出来的，两边用不同的字符就会在同一屏上出现两种写法，
     而那种差异没人会当成 bug 报上来。 */
  eq('🔴★ 妆位时段的分隔符跟 mock 里那 7 张单逐字一致（都是 U+2013）',
    pg.data.slotOptions[1].label.indexOf(BS.getBooking('bk-1').slot_time) > 0, true)

  // ⑤-E 选齐 → 真生成一张单、真占上这个妆位
  pg.pickSlot({ detail: { value: 0 } })
  eq('★ 选了第 1 位', pg.data.pickedSeq, 1)
  toasts.length = 0
  const outBefore5e = outN()
  pg.onSubmit()
  eq('🔴★ 反馈不是「化妆师会联系你」那句 —— 代填时她自己就是化妆师',
    toasts[0], '代填的预约单已生成，妆位已占上')
  flush()
  eq('★ 代填完退回妆师端', backsN, outBefore5e - navs.length - redirs.length + 1)

  const made = BS.getBookings().filter((b) => b.schedule_id === 'sched-t7')[0]
  eq('🔴★ 单真生成了（不是只弹个 toast）', !!made, true)
  eq('🔴 状态直接是【已确认】（线下谈好的，不是待处理）', made.status, 'confirmed')
  eq('🔴 created_by 是 artist —— ⛔ 不会跑到顾客的「我的预约」里',
    made.created_by, 'artist')
  eq('🔴 妆位身份 = (schedule_id, seq)，slot_id 留空串',
    made.schedule_id + '/' + made.seq + '/' + made.slot_id, 'sched-t7/1/')
  eq('★ 落的是这一场的名字和日期', made.event + ' ' + made.date, '测试漫展 2026-06-01')
  eq('★ slot_time 就是这一格的时段', made.slot_time, '09:00 – 10:20')
  eq('★ CN / 角色名 / 微信号 都带过来了',
    made.cn + '/' + made.role + '/' + made.wechat, '洛霞/花火/wxid_luoxia')
  /* 🔴 钉的是**当前真实取值**，不是「应该是什么」。
     代码里那句注释一度写着「预选（建模感 / 浓系）」，而 `items[0]` 实际取到的是
     **自然感 / 淡系** —— 那句话是错的，已改正。⛔ 别把这里的期望改回
     「建模感 浓系」去迁就那句注释；真要改预选值，先改代码再改这里。
     ⚠️ 这一条同时证明了「勾选态 → 落库字段」这条链路真的通了。 */
  eq('★ 妆感多选也带过来了（预选那两项 —— 自然感 / 淡系）',
    made.styles.join(' '), '自然感 淡系')
  eq('★ 眼型 / 肤质也带过来了', made.eye.join(' ') + '|' + made.skin.join(' '),
    '双眼皮 肿眼泡|油皮 敏感肌')
  eq('★ 性别取的是勾上的那个', made.gender, '女')
  eq('🔴 定金默认 0 / 未付 —— ¥0 是「没谈定金」的诚实表示，⛔ 不许瞎填一个 50',
    made.deposit_amount + '/' + made.deposit_paid, '0/false')
  /* 🔴 键的形状必须跟 mock 里那 7 张单【逐字一致】：详情页会读
     extra / note / phone / styles，缺了就是 undefined 渲染成空白，
     而那种空白在真机上跟「她没填」长得一模一样。 */
  eq('🔴★ 新建单的键跟 mock 里那 7 张单【逐字一致】（缺一个就是 undefined）',
    Object.keys(made).sort().join(','),
    Object.keys(BS.getBooking('bk-1')).sort().join(','))
  eq('🔴★ 而且 created_at 是「2026-05-01 20:14」那种写法，⛔ 不是 ISO 串',
    /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(made.created_at), true)

  // ⑤-F 建完单，妆位当场就被算作「被占」
  const t7 = SS.getSchedule('sched-t7')
  eq('🔴★ 这个妆位立刻算「被占」—— 不会出现「建了单、妆位却还显示空闲」',
    BS.bookedSeqsOfSchedule(t7).indexOf(1) >= 0, true)
  eq('🔴 档期卡片上「N 人已预约」也跟着变 1（走的是同一个 blockingBookings）',
    BS.blockingBookings(t7).length, 1)

  // ⑤-G 提交那一刻妆位刚被约走（并发重查 → 拦住 + 就地重算下拉）
  reopen({ mode: 'artist' })
  type('cn', '洛霞')
  type('role', '花火')
  type('wechat', 'wxid_luoxia')
  pg.pickSched({ detail: { value: idxOf('sched-t7') } })
  eq('★ 刚才占掉的第 1 位已经从下拉里消失了', pg.data.slotOptions.length, 1)
  eq('★ 只剩第 2 位', pg.data.slotOptions[0].value, 2)
  pg.pickSlot({ detail: { value: 0 } })
  // 模拟并发：她还在填表，这个妆位被别处的一张单占走了
  BS.addBooking(BS.buildBooking({
    schedule_id: 'sched-t7', seq: 2, event: '测试漫展', date: '2026-06-01',
    slot_time: '10:30 – 11:50', created_by: 'user', status: 'pending'
  }))
  const nBefore5g = BS.getBookings().length
  toasts.length = 0
  pg.onSubmit()
  eq('🔴★ 提交时【重查一遍】→ 拦住', toasts[0], '这个妆位刚被约走了，换一个')
  eq('🔴 而且要【就地重算下拉】—— 不然她再点一次还是同一句话，看着像按钮坏了',
    pg.data.slotOptions.length, 0)
  eq('★ 说的还是「都约满了」这一种空', pg.data.slotEmptyText, '这一场的妆位都约满了')
  eq('★ 上一格的选择被清掉', pg.data.pickedSeq, 0)
  eq('★ 而且【没有多生成单】', BS.getBookings().length, nBefore5g)

  /* ⑤-H 这一场在别处被取消（软删除）→ 拦住 + 清空场次选择
     ⚠️ 必须用**另一场新档期**（sched-t8）：sched-t7 到这一步两个妆位
        已经被 ⑤-E 和 ⑤-G 占满了，`pickSlot` 选不出东西，
        `pickedSeq` 会是 0 → 会被「再选一个妆位」那道闸先拦住，
        根本走不到「这一场已经不在了」这一支（那是**测试自己的坑**，
        不是代码的问题 —— 但它会让人误以为 D2 没实现）。 */
  const g8 = genSlots({ startTime: '09:00', slotMin: 80, gapMin: 10, count: 2,
                        lunch: { enabled: false } })
  SS.addSchedule({
    schedule_id: 'sched-t8', name: '测试漫展二', date: '2026-06-02',
    startTime: '09:00', slotMin: 80, gapMin: 10, count: 2,
    lunch: g8.lunch, slots: g8.slots
  })
  reopen({ mode: 'artist' })
  type('cn', '洛霞')
  type('role', '花火')
  type('wechat', 'wxid_luoxia')
  pg.pickSched({ detail: { value: idxOf('sched-t8') } })
  pg.pickSlot({ detail: { value: 0 } })
  eq('（前置）sched-t8 的妆位选上了', pg.data.pickedSeq, 1)
  SS.cancelSchedule('sched-t8')
  toasts.length = 0
  pg.onSubmit()
  eq('🔴★ 提交时这一场已经被取消了 → 拦住', toasts[0], '这一场已经不在了，换一场')
  eq('★ 场次选择被清空（⛔ 不留一个指向已取消档期的残留选择）',
    pg.data.pickedSched, '')
  eq('★ 妆位选择也清空', pg.data.pickedSeq, 0)
  eq('★ 下拉也清空（⛔ 不留一个指向已取消档期的妆位列表）',
    pg.data.slotOptions.length, 0)

  // ⑤-I 一场档期都没有 → 引导卡 + 真落点
  reopen({ mode: 'artist' })
  store7['zhuangli_schedules'] = JSON.stringify([])
  SS.rawList()                       // 让 seed 判据看到 key 已存在（空数组也要保留）
  reopen({ mode: 'artist' })
  eq('🔴 一场档期都没建过 → 走引导卡', pg.data.noSchedule, true)
  eq('★ 这时候提交 → 出声，⛔ 不是静默什么都不发生',
    (toasts.length = 0, pg.onSubmit(), toasts[0]), '你还没有建过档期，先去「档期」建一场')
  toasts.length = 0
  navs.length = 0
  pg.goSchedule()
  eq('🔴★ 引导卡上那个键是【真落点】（switchTab 到档期页），⛔ 不是弹个 toast 了事',
    navs[0], '/pages/schedule/schedule')

  restore7()
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

/* ══════════════════════════════════════════════════════════════════════
   ⑨ 「我的资料」页 + 设置页删掉重复的那一行「我的资料」
      （段头原先是「我的资料 / 我的作品」两页 —— 作品页已在第十五处删除）
   ══════════════════════════════════════════════════════════════════════ */
/* ⚠️ 这一次**不是 bug，是缺功能** —— 用户报的是「点了没反应」，追问之后
   他自己描述清楚了：「有提示，但不跳页面」。所以这两行原先是**有响应**的
   （各弹一句 toast），只是没有落点页。⛔ 别照着「点了没反应」去查事件绑定、
      查 catchtap、查 hideKeyboard —— 那三轮的坑不在这一处。
   📌 教训：听到「点了没反应」**先追问「别的键也点得动吗 / 结果变成了什么」**，
      问清楚能省掉一整轮瞎猜（README 第 26 条）。

   🔴 第十五处把「我的作品」**整个板块删了**（页面 + 「我的」页那一行 + 全部引用），
      所以下面 A/B/C/E 里凡是提作品页的断言**已经全部拆掉**，换成了
      「它确实不存在了」的反向断言（见 A/B/C/G/I）—— ⛔ 别把它们加回来。 */
console.log('\n════ ⑨ 我的资料页 + 设置页去重（作品页已删）════')
{
  const fs = require('fs')
  const stripHtml = (t) => t.replace(/<!--[\s\S]*?-->/g, '')
  const stripJs = (t) => t
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')

  const navs = []
  let toastsN = 0
  /* ⚠️ 2026-09-30（第十七处）：资料页从只读改成可编辑之后，这一页要经
     artistStore 读/写 storage —— 桩里**必须**有 storage，否则 onShow 一调
     就抛异常，整段红在一个跟被测逻辑无关的地方。
     ⚠️ setStorageSync 走 JSON 往返（跟真机一致）：这样「存进去一个
        mock/data.js 的常量引用」这种会被跨段污染的实现，在这里当场现形。 */
  const store9 = {}
  global.wx = {
    getStorageSync: (k) => (k in store9 ? JSON.parse(store9[k]) : ''),
    setStorageSync: (k, v) => { store9[k] = JSON.stringify(v) },
    navigateTo: (o) => navs.push(o.url),
    navigateBack: () => {},
    switchTab: () => {},
    showToast: () => { toastsN++ },
    showModal: () => {}
  }

  /* ⚠️ 必须【在 wx 桩装好之后】才 require artistStore：它模块级不碰 storage，
     但下面那几条断言要读它的常量（AVATAR_COLORS），顺手拿一份。
     ⚠️ ⑩ 段开头会 delete require.cache 再重新 require，所以这份缓存不会串段。 */
  const AS9 = require(R('妆历小程序/utils/artistStore.js'))

  const loadPage = (p) => {
    let cfg = null
    global.Page = (c) => { cfg = c }
    delete require.cache[require.resolve(R('妆历小程序/' + p))]
    require(R('妆历小程序/' + p))
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

  // ── A. 「我的」页那一行，现在跳得动了；作品那一行则整个没了 ──
  const mine = loadPage('pages/mine/mine.js')
  const tBefore = toastsN
  mine.goProfile()
  eq('★「我的资料」跳页了（落点是 /pages/my-profile/my-profile）',
    navs[navs.length - 1], '/pages/my-profile/my-profile')
  eq('★ 而且【不再】弹 toast 顶替（这是本次修的病本身）', toastsN, tBefore)
  eq('★「我的」页一共只跳了一次（作品那行已删，⛔ 不是漏点）', navs.length, 1)
  eq('⛔ goWorks 处理函数已从 mine.js 删干净（⛔ 不留死代码）',
    /\bgoWorks\b/.test(stripJs(fs.readFileSync(R('妆历小程序/pages/mine/mine.js'), 'utf8'))), false)

  // ── B. 资料页在 app.json 里注册过（没注册 = 跳过去白屏）；作品页则注销干净 ──
  const appJson = JSON.parse(fs.readFileSync(R('妆历小程序/app.json'), 'utf8'))
  eq('★ my-profile 已注册',
    appJson.pages.indexOf('pages/my-profile/my-profile') >= 0, true)
  eq('🔴 my-works 已从 app.json 注销（第十五处：整块删掉）',
    appJson.pages.indexOf('pages/my-works/my-works'), -1)
  /* ⚠️ 这一条是**页数账本**，每次加减页都要跟着改：15 → 14（第十五处删了作品页）
     → **16**（第十七处加了 style-edit / intro-edit）→ **17**（第十九处加了 feedback）
     → **18**（第二十处加了 artist-list）
     → **18**（第二十一处：删 guest-home、加 guest-mine，一进一出**还是 18**）。
     ⛔ 不是「改到能过就行」—— 它存在的意义是「有人顺手加了一页却没想清楚」时当场红。
     📌 第二十一处那两个数**必须一起动**，所以「还是 18」这句话本身就是断言：
        只删不加（17）或者只加不删（19）都会红。 */
  eq('🔴 app.json 的 pages 是 18 项（第二十一处删 guest-home + 加 guest-mine，一进一出）',
    appJson.pages.length, 18)
  /* 🔴 2026-10-01（第二十一处）：tabBar 从原生 3 项变成了**自定义的 6 项** ——
     妆师端 3 格 + 约妆端 3 格，两个角色共用 app.json 里唯一的那个 tabBar，
     所以清单是并集，由 custom-tab-bar 按角色挑一排画。
     ⚠️ 完整的核对（和 utils/tabbar.js 两份清单逐项比序）在 ⑩ 的 AC 段，
        这里只钉「它确实变成了 6 项、而且 custom 打开了」——
        少了 `custom: true` 的话微信会按原生画**全部 6 格**，
        也就是妆娘会在自己的档期页底下看见「我约过的妆娘」。 */
  eq('🔴★ tabBar 是自定义的 6 项（3 妆师 + 3 约妆）', appJson.tabBar.list.length, 6)
  eq('🔴★ 而且 custom 打开了（关掉的话原生会把 6 格全画出来）',
    appJson.tabBar.custom, true)
  eq('★ 跳的路径确实都在 pages 里（拼错了就是白屏）',
    navs.every((u) => appJson.pages.indexOf(u.slice(1)) >= 0), true)

  // ── C. 资料页能加载且带「‹ 返回」（不然进去出不来）；作品页文件已不存在 ──
  const prof = loadPage('pages/my-profile/my-profile.js')
  /* ⚠️ 必须真的走一遍 onShow 再断言：这一页的 data.artist 初值是个
     「能渲染的空壳」（真数据在 onShow 里从 storage 灌）。不调 onShow 就断言，
     等于对着一个手写字面量下结论 —— 那种断言永远绿，也永远没用。 */
  prof.onShow()
  const profWxml = stripHtml(fs.readFileSync(R('妆历小程序/pages/my-profile/my-profile.wxml'), 'utf8'))
  eq('★ 资料页标题是「我的资料」且带返回',
    /<nav-bar title="我的资料" back="\{\{true\}\}"/.test(profWxml), true)
  eq('★ 资料页有 .js/.wxml（不是只有空目录）', prof && typeof prof === 'object', true)
  eq('🔴 作品页目录已整个删掉（连 .js/.wxml 一起）',
    fs.existsSync(R('妆历小程序/pages/my-works')), false)

  // ── D. 🔴 资料页绝不能带出微信号 ──
  /* 这一页展示的就是「客人能看到的信息」，最容易顺手把微信号也列进去。
     判据放在**源码**上：它连 ARTIST_CONTACT 都不许 require。
     ⚠️ 查之前必须摘注释 —— 那个文件的注释里就写着 ARTIST_CONTACT 和 wechat_id
        （正是为了警告后来者别加），不摘注释等于对着自己的警告下结论，永远红。 */
  const profJs = stripJs(fs.readFileSync(R('妆历小程序/pages/my-profile/my-profile.js'), 'utf8'))
  eq('🔴★ 资料页源码里没有 ARTIST_CONTACT', /ARTIST_CONTACT/.test(profJs), false)
  eq('🔴★ 也没有 wechat_id / contact.js',
    /wechat_id|contact\.js/.test(profJs), false)
  eq('🔴★ 数据对象里没有 wechat_id 这个键', 'wechat_id' in prof.data.artist, false)
  /* 🔴 仍然是【7 个键，没有第 8 个】—— 第十九处只是把第 7 个键由
     `initial`（昵称首字）换成 `avatar_color`（颜色令牌），键数一个字没变。
     ⚠️ 这条断言的价值不在数字上，在**白名单**上：这一页展示的就是客人能看到
        的那几项，多一个键就是漏了别的字段（尤其 wechat_id）。 */
  eq('★ 上这一页的就是公开那几项（昵称 / 城市 / 风格 / 简介 / 头像底色）—— 多了就是漏了别的字段',
    Object.keys(prof.data.artist).sort().join(','),
    'artist_id,avatar_color,city,intro,nickname,style_tags,style_text')
  eq('★ 头像底色是个画得出来的令牌', AS9.AVATAR_COLORS.indexOf(prof.data.artist.avatar_color) >= 0, true)
  /* ⚠️ 两处冗余也不能漂：`introLen` 是「简介那一行只报字数」的数据源，
     必须跟 store 里那份对得上（一处算、一处用，⛔ 不是各算一遍）。 */
  eq('★ 简介字数跟正文对得上（这一行只报字数，⛔ 不渲染正文）',
    prof.data.introLen, prof.data.artist.intro.length)

  // ── E. 资料页从【只读】改成【可编辑】之后：键要真的按得动 ──
  /* 🔴 上一版这里是反向断言「整页没有任何 bindtap」，理由是只读页不可能
     「点了没反应」。现在整段反过来了 —— 但**精神没变**：
     不能只是「有 bindtap」，必须**每个 bindtap 都有同名处理函数**。
     只断言个数的话，一个 bindtap="goIntroo" 的拼写错误照样绿，而真机点下去
     什么都不发生 —— 正是这个项目被坑过四轮的那句话。 */
  const taps9 = (profWxml.match(/bindtap="([^"]+)"/g) || [])
    .map((s) => s.replace(/bindtap="([^"]+)"/, '$1'))
  eq('🔴 资料页【恰好 4 个可点的键】（昵称 / 常住城市 / 接妆风格 / 简介）',
    taps9.length, 4)
  eq('🔴 四个 bindtap 全是不同的处理函数（⛔ 没有两份指向同一个）',
    taps9.slice().sort().join(','), 'editCity,editNickname,goIntro,goStyle')
  eq('🔴★ 每一个 bindtap 在 .js 里都有同名函数（拼错了就是「点了没反应」）',
    taps9.filter((n) => typeof prof[n] !== 'function'), [])
  /* ⛔ 头那张卡片不许有手势：头像是整块冻结的（等 M0 过审），
     给它 bindtap 就是假承诺 —— 点下去只能弹一句「还没做」。 */
  eq('⛔ 头像卡片没有 bindtap（头像是冻结的，不许给假承诺）',
    /class="card tight row"[^>]*bindtap/.test(profWxml), false)

  const redline10 = /开发中|敬请期待|即将上线/
  eq('⛔ 资料页没有「开发中」那类承诺（红线 10）', redline10.test(profWxml), false)

  // ── F. 设置页那行重复的「我的资料」删干净了 ──
  const setWxml = stripHtml(fs.readFileSync(R('妆历小程序/pages/settings/settings.wxml'), 'utf8'))
  const setJs = stripJs(fs.readFileSync(R('妆历小程序/pages/settings/settings.js'), 'utf8'))
  eq('★ 设置页里不再有「我的资料」四个字', setWxml.indexOf('我的资料'), -1)
  eq('★ goProfile 处理函数也删了（⛔ 不留没用的死代码）', /\bgoProfile\b/.test(setJs), false)
  eq('★ 设置页那两组里只剩 2 行', (setWxml.match(/class="cell"/g) || []).length, 2)
  eq('★ 提审必需的「用户隐私保护指引」入口还在', setWxml.indexOf('openPrivacy') > 0, true)

  // ── G. 「我的」页那一处是唯一入口；作品那一行不留痕迹 ──
  const mineWxml = stripHtml(fs.readFileSync(R('妆历小程序/pages/mine/mine.wxml'), 'utf8'))
  eq('★「我的资料」只留在「我的」页（用户原话：只在我的页面留）',
    (mineWxml.match(/我的资料/g) || []).length, 1)
  eq('🔴 第十五处：「我的作品」四个字已从「我的」页消失',
    mineWxml.indexOf('我的作品'), -1)
  /* ⚠️ 这是【行数账本】，每次动「我的」页的行都要跟着改：
     5 行（最早）→ 4 行（第十五处删「我的作品」）→ **3 行**（第十九处删
     「我的资料」那一行：它合进头像卡片了，同时新增「问题反馈」，所以 4 − 1 = 3）。
     ⚠️ 光钉数字不够 —— 删错一行、加错一行，数字照样对得上。
        所以下面连着钉子把这三行【分别是谁】也钉死（顺序就是屏幕上的顺序）。 */
  eq('🔴「我的」页正好 3 行可点 cell', (mineWxml.match(/class="cell"/g) || []).length, 3)
  eq('🔴 这三行分别是：设置 / 问题反馈 / 切换身份（「我的资料」已合进卡片）',
    (mineWxml.match(/class="cl">([^<]+)</g) || [])
      .map((s) => s.replace(/class="cl">/, '').replace('<', '')).join(','),
    '设置,问题反馈,切换身份')

  // ── H. toast.js 里那条 NO_WORK 成了死常量，已删 ──
  const toastJs = stripJs(fs.readFileSync(R('妆历小程序/utils/toast.js'), 'utf8'))
  eq('★ NO_WORK 这条已经没人用了，从 toast.js 删掉',
    /NO_WORK/.test(toastJs), false)

  // ── I. 第十五处：全项目不许再留任何指向已删页面的落点 ──
  /* 🔴 这是「删干净」的兜底：页面删了却还留着一句 navigateTo('/pages/my-works/…')，
     点下去就是白屏，而**这种洞自测不打桩真机就发现不了** —— 必须在这里钉死。
     只查会写落点的那三个文件（app.json / mine.js / mine.wxml），不全文扫。 */
  const goto2 = ['妆历小程序/app.json', '妆历小程序/pages/mine/mine.js', '妆历小程序/pages/mine/mine.wxml']
    .map((p) => stripHtml(fs.readFileSync(R(p), 'utf8'))).join('\n')
  eq('🔴 全项目没有任何落点还指向 pages/my-works（页面 + 入口都已删）',
    /pages\/my-works/.test(goto2), false)
}

/* ══════════════════════════════════════════════════════════════════════
   ⑩ 我的资料可编辑 + 接妆风格 + 简介 + 代填（2026-09-30 第十七处）

   用户原话：
     「我的资料里面接妆风格改成可选择的，现在这版选不了 常驻城市可以打字输入。
       昵称可以打字输入。再加一行简介，点击可以输入200字以内内容，
       预约界面的代填，代填的妆位可以选择已建好的漫展」

   这一段的重点是【纯函数】和【源码级】两条线 ——
   因为 utils/artistStore.js 的设计就是把「校验 / 派生」全挪进纯函数里，
   页面只负责调它 + 播报结果。纯函数能直接喂，不用打桩 wx；
   而页面行为那部分（弹框、跳页）靠**源码级断言**钉结构，比打桩更抗漂。
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n════ ⑩ 资料可编辑 · 风格 · 简介 · 代填 ════')
{
  const fs = require('fs')
  const stripHtml = (t) => t.replace(/<!--[\s\S]*?-->/g, '')
  const stripJs = (t) => t
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')

  // artistStore 要 wx（读 storage），先给个内存桩再 require
  const store10 = {}
  global.wx = {
    getStorageSync: (k) => (k in store10 ? JSON.parse(store10[k]) : ''),
    setStorageSync: (k, v) => { store10[k] = JSON.stringify(v) },
    showToast: () => {},
    showModal: () => {}
  }
  delete require.cache[require.resolve(R('妆历小程序/utils/artistStore.js'))]
  const AS = require(R('妆历小程序/utils/artistStore.js'))
  const { ARTIST_PUBLIC, STYLE_GROUPS } = require(R('妆历小程序/mock/data.js'))

  // ── A. 纯函数：风格标签 ──────────────────────────────────────────────
  eq('🔴 总词表就是 STYLE_GROUPS 摊平（16 个，⛔ 不另抄一份）',
    AS.ALL_TAGS.length, 16)
  eq('★ 词表内容和 STYLE_GROUPS 完全一致',
    AS.ALL_TAGS.join('|'),
    STYLE_GROUPS.reduce((a, g) => a.concat(g.items), []).join('|'))
  /* 🔴 规矩 16：手写的那份 seed 必须等于纯函数的产物。
     一旦有人改了 buildStyleText 的排序规则、或者手改了 ARTIST_PUBLIC.style_text，
     这条当场红 —— 否则那个不一致只会在真机上表现为「接妆风格那格字变了」，
     而且没人会意识到那是 bug。
     ⚠️ 这条**真的响过一次**：seed 原先手写的是「建模感 / 浓系 / 展妆」（点选顺序），
        而词表顺序是 妆感质感(建模感) → 场合(展妆) → 浓度(浓系)。修的是 seed。 */
  eq('🔴★ 规矩 16：手写 seed 的 style_text === buildStyleText(style_tags)',
    AS.buildStyleText(ARTIST_PUBLIC.style_tags), ARTIST_PUBLIC.style_text)
  eq('★ 分隔符就是「空格 斜杠 空格」', AS.STYLE_SEP, ' / ')
  /* 🔴 按【词表顺序】排，⛔ 不是点击顺序 —— 同一组标签换个点击次序就换一段文案的话，
     分享页上的字会莫名其妙地变，而她什么都没改。
     ⚠️ 故意把入参写成「倒着的」：浓系(第10) 自然感(第1) 展妆(第7)。 */
  eq('🔴★ 按词表顺序排，⛔ 不是点击顺序（入参顺序完全打乱）',
    AS.buildStyleText(['浓系', '自然感', '展妆']), '自然感 / 展妆 / 浓系')
  eq('★ 去重', AS.buildStyleText(['展妆', '展妆', '自然感']), '自然感 / 展妆')
  eq('★ 空数组不炸、返回空串', AS.buildStyleText([]), '')
  eq('★ 喂 undefined 也不炸', AS.buildStyleText(undefined), '')
  /* 📌 第十八处：自填词就是「词表外的词」，它现在是**正常数据**了，
     所以这条断言的措辞从「不该有，但不能崩」改成「其余按入参顺序排在预设词后面」。
     ⚠️ 行为一个字没变（显式拼接取代了原来靠 sort 稳定性的写法）。 */
  eq('★ 预设词在前、其余按入参顺序跟在后',
    AS.buildStyleText(['没这个词', '展妆']), '展妆 / 没这个词')
  eq('★ 两个词表外的词，按入参顺序（⛔ 不重排）',
    AS.buildStyleText(['乙词', '展妆', '甲词']), '展妆 / 乙词 / 甲词')

  // 反推（只用来兜底不完整的旧数据）
  eq('★ 反推：一句话拆回标签',
    AS.splitStyleText('建模感 / 浓系 / 展妆').join('|'), '建模感|浓系|展妆')
  /* 🔴 往返是【对规整后的顺序】成立的，⛔ 不是对入参顺序 ——
     入参顺序本来就该被丢掉（那正是上面那条断言在保的东西）。
     写反了的话这两条会互相打架，而看不出谁对。 */
  eq('🔴★ split(build(tags)) 回来的是【规整后】的顺序（入参是反的）',
    AS.splitStyleText(AS.buildStyleText(['展妆', '自然感'])).join('|'), '自然感|展妆')
  eq('★ build 对任意字符串幂等（⛔ 它和 split 不是严格互逆，只钉这一条）',
    AS.buildStyleText(AS.splitStyleText('浓系  /  展妆')),
    AS.buildStyleText(AS.splitStyleText(AS.buildStyleText(AS.splitStyleText('浓系  /  展妆')))))

  /* ── B. 纯函数：头像颜色令牌 / 勾选态 / 点选 ─────────────────────────
     📌 2026-09-30（第十九处）：头像位从「昵称首字」改成「人像标识 + 自选底色」，
        于是 `initialOf` 整个换成 `avatarColorOf`。
        🔴 换掉之后【不再有任何函数去吃昵称】—— 这一条顺带消灭了一个真 bug：
           头像位原先渲染 `nickname.slice(0, 1)`，而那会把 emoji（代理对）
           劈成半个字符，真机上拍到的现象是「一个菱形里面一个问号」。
           现在头像画的是和昵称无关的一张脸，这类输入问题从根上没有了。
        ⚠️ `initialOf` 这一轮是【删掉】不是【改个名留着】：自测里有一条
           「全项目不再出现 initial / initialOf」的反向断言钉着（见下面 D 段）。 */
  eq('★ 令牌闭集：正好 6 个颜色', AS.AVATAR_COLORS.join(','),
    'rose,blue,green,amber,plum,slate')
  eq('★ 默认色是第一位（调色板第一颗 = 没选过的人看到的颜色）',
    AS.AVATAR_COLOR_DEFAULT, AS.AVATAR_COLORS[0])
  eq('★ 认识的令牌原样放行', AS.avatarColorOf('slate'), 'slate')
  eq('🔴★ 认不出的令牌回落默认色（⛔ 不许透出去）',
    AS.avatarColorOf('chartreuse'), AS.AVATAR_COLOR_DEFAULT)
  /* 🔴 下面这几条钉的是【兜底是个全函数】：任何输入都要变成一个画得出来的颜色。
     ⛔ 别把「认识就返回、不认识就返回空」当成更严格 —— 返回空 = 一个透明底的头像
     （白脑袋白肩膀贴在白卡片上 = 什么都没画），而且屏幕上不会有一句话解释。 */
  eq('★ 空串兜底', AS.avatarColorOf(''), AS.AVATAR_COLOR_DEFAULT)
  eq('★ 全是空格也兜底（先 trim 再比）', AS.avatarColorOf('  '), AS.AVATAR_COLOR_DEFAULT)
  eq('★ 喂 undefined 也兜底', AS.avatarColorOf(undefined), AS.AVATAR_COLOR_DEFAULT)
  eq('★ 喂 null 也兜底', AS.avatarColorOf(null), AS.AVATAR_COLOR_DEFAULT)
  eq('★ 喂数字也兜底（storage 被手改过的那种）', AS.avatarColorOf(7), AS.AVATAR_COLOR_DEFAULT)
  eq('★ 带空格的合法令牌能吃进来（先 trim 再比）', AS.avatarColorOf(' rose '), 'rose')
  /* 🔴 大小写【不】宽容：令牌是我们自己写在调色板上的，'Rose' 只可能来自
     手改的 storage 或别的调用方。按原样认它 = 颜色域从 6 个变成 12 个，
     而 CSS 那边只有 `.c-rose`（'.c-Rose' 选不中 → 透明底头像）。
     ⚠️ 这条是【故意的】，⛔ 别"顺手"改成大小写不敏感。 */
  eq('🔴★ 令牌大小写不宽容（认不出来就回落，因为 CSS 类名是区分大小写的）',
    AS.avatarColorOf('Rose'), AS.AVATAR_COLOR_DEFAULT)

  /* 📌 第十八处：`toStyleOptions(picked)` → `toStyleView(presets, custom)`。
     新签名一次给出**勾选态 + 扁平并集**（旧版页面上要自己再算一份 picked，
     两处算同一个东西，迟早有一处先烂掉）。下面这几条的具体期望值原样不变。 */
  const viewB = AS.toStyleView(['展妆'], [])
  const opts = viewB.groups
  eq('★ 勾选态：5 组', opts.length, 5)
  eq('★ 只有已存的那个词是勾上的',
    opts.reduce((a, g) => a + g.items.filter((i) => i.on).length, 0), 1)
  eq('★ 勾上的是展妆',
    opts.reduce((a, g) => a.concat(g.items.filter((i) => i.on).map((i) => i.name)), []).join(','),
    '展妆')
  eq('🔴★ 一次调用同时给出扁平并集 picked（⛔ 页面不许自己再算一份）',
    viewB.picked.join(','), '展妆')
  eq('★ 没有自填词时，每组的 custom 都是空的',
    opts.filter((g) => g.custom.length).length, 0)
  /* ⛔ 唯一一处「已存标签 → 勾选态」的映射。页面再自己 map 一遍的话，
     两次实现迟早有一次先烂掉，而且是静默烂。 */
  eq('🔴★ toggleTag 不改入参（纯函数，返回新数组）',
    (() => { const a = ['展妆']; AS.toggleTag(a, '浓系'); return a.join(',') })(), '展妆')
  eq('★ 点没勾上的 → 加上', AS.toggleTag(['展妆'], '浓系').join(','), '展妆,浓系')
  eq('★ 点已勾上的 → 去掉', AS.toggleTag(['展妆', '浓系'], '展妆').join(','), '浓系')

  // ── C. 校验：一处实现，各自一句 ─────────────────────────────────────
  eq('★ 昵称空 → 拦住', AS.validateNickname('  ').ok, false)
  eq('★ 昵称空的话术', AS.validateNickname('').error, '昵称不能空着')
  eq('★ 昵称 13 个字 → 拦住', AS.validateNickname('一'.repeat(13)).ok, false)
  eq('★ 昵称 12 个字 → 放行', AS.validateNickname('一'.repeat(12)).ok, true)
  eq('★ 昵称前后空格会被 trim 掉', AS.validateNickname('  阿黎  ').value, '阿黎')
  eq('★ 城市空 → 拦住', AS.validateCity('').error, '常驻城市不能空着')
  eq('★ 城市 13 个字 → 拦住', AS.validateCity('一'.repeat(13)).ok, false)
  /* 简介【允许空】—— 它就是选填的。上面昵称/城市都拦空，这里不拦，
     这个差别是【故意】的，所以要有断言把它钉住，免得后来者「统一」掉。 */
  eq('🔴 简介允许空（它是选填的，⛔ 不要跟昵称/城市一起拦）',
    AS.validateIntro('').ok, true)
  eq('★ 简介 200 字 → 放行', AS.validateIntro('一'.repeat(200)).ok, true)
  eq('🔴 简介 201 字 → 拦住', AS.validateIntro('一'.repeat(201)).ok, false)
  eq('🔴★ 超长的话术带【实际字数】（不然她不知道要删多少）',
    AS.validateIntro('一'.repeat(201)).error, '简介最多 200 字，现在 201 字')
  eq('★ 简介中间的回车保留（她分的段不能被吃掉）',
    AS.validateIntro('第一段\n\n第二段').value, '第一段\n\n第二段')
  eq('★ 简介首尾的空白 trim 掉（留着会让 landing 的 wx:if 对纯空白成立）',
    AS.validateIntro('\n  正文  \n').value, '正文')
  /* 📌 第十八处：`validateStyleTags(arr)` → `validateStyles(presets, custom)`。
     ⚠️ 期望值一个都没变 —— 尤其下面那条「词表外的词要拦住」：
        它现在防的是【写坏了的数据 / 别的调用方】，⛔ 不是防页面
        （妆娘的自填词走的是另一条通道，根本不会进这个入参）。 */
  eq('★ 风格一个没选 → 拦住', AS.validateStyles([], []).ok, false)
  eq('★ 风格一个没选的话术', AS.validateStyles([], []).error,
    '至少选一个接妆风格，客人靠它知道你能接什么妆')
  eq('🔴 预设通道里的词表外词 → 拦住（⛔ 不放进 storage）',
    AS.validateStyles(['展妆', '自创词'], []).ok, false)
  eq('★ 拦住的话术里点名是哪个词',
    AS.validateStyles(['展妆', '自创词'], []).error, '「自创词」不在可选风格里，请从上面选')

  // ── D. 🔴 白名单：这一层永远没有 wechat_id ──────────────────────────
  /* ⚠️ 第十九处换的是第 7 个键【叫什么】（initial → avatar_color），
     键数仍然是 7 —— 这一条是白名单断言，⛔ 不是「改到能过就行」：
     加一个键就是往外多送一个字段（这条链上翻车就是 wechat_id 那种事）。 */
  eq('★ getArtist() 的键就是那 7 个', Object.keys(AS.getArtist()).sort().join(','),
    'artist_id,avatar_color,city,intro,nickname,style_tags,style_text')
  eq('🔴★ 输出里没有 wechat_id 这个键', 'wechat_id' in AS.getArtist(), false)
  /* 播种之后，任何 patch 里带进来的 wechat_id 都必须被【静默丢掉】
     （不是报错，是不落库）—— 这是「资料页不许夹带微信号」在代码层的落点。 */
  const saved1 = AS.saveArtist({ nickname: '阿黎', wechat_id: 'demo_makeup' })
  eq('★ 改名成功', saved1.ok, true)
  eq('🔴★ patch 里夹带的 wechat_id 被丢掉了', 'wechat_id' in saved1.artist, false)
  eq('🔴★ storage 里也搜不到那个值',
    JSON.stringify(store10['zhuangli_artist']).indexOf('demo_makeup'), -1)
  eq('🔴★ getArtist() 输出里也搜不到',
    JSON.stringify(AS.getArtist()).indexOf('demo_makeup'), -1)

  /* ── D2. getArtistById —— 顾客端按 id 取人（2026-09-30 第二十处新增）─────
     🔴 这一段保的是【顾客端唯一该走的取资料入口】。它坏掉不会报错：
        列表里那一行只会显示成一个空白人（没名字、没颜色），
        而那种空白在真机上跟「这个人没填资料」长得一模一样。
     ⚠️ 它和上面 D 段是同一条白名单性质的两个入口（规矩 11）——
        新入口要是漏了 getArtist() 那套消毒，这里必须红。 */
  const { ARTIST_DIRECTORY, ARTIST_CONTACT } = require(R('妆历小程序/mock/data.js'))
  const ARTIST_CONTACT_IDS = ARTIST_CONTACT.map((c) => c.artist_id)
  const CT = require(R('妆历小程序/utils/contact.js'))
  const DIR_KEY = 'artist_id,avatar_color,city,intro,nickname,style_tags,style_text'

  eq('★ 不传 id → 就是当前这位（页面少传参数时不该崩）',
    JSON.stringify(AS.getArtistById()), JSON.stringify(AS.getArtist()))
  eq('★ 传 null / 空串也一样',
    JSON.stringify(AS.getArtistById(null)) + JSON.stringify(AS.getArtistById('')),
    JSON.stringify(AS.getArtist()) + JSON.stringify(AS.getArtist()))
  /* 🔴 这一条是整个函数的重点：demo 是【妆娘端那一位】，她的资料会被改。
     走目录里那份快照的话，妆娘改完昵称，顾客端纹丝不动 —— 不报错。 */
  AS.saveArtist({ city: '测试城' })
  eq('★ 妆娘改过城市之后，getArtist() 里是新的', AS.getArtist().city, '测试城')
  eq('🔴★ getArtistById(\'demo\') 跟着 storage 走（⛔ 不是目录里那份快照）',
    AS.getArtistById('demo').city, '测试城')
  eq('★ 而目录里 demo 那一条仍然是「上海」（证明上一条真的在比两样东西，⛔ 不是自证）',
    ARTIST_DIRECTORY.filter((e) => e.artist_id === 'demo')[0].city, '上海')

  /* 🔴 目录里每一位都要解析得出来，而且长得是那 7 个键。
     用循环而不是一条条写死：以后加第 4 位妆娘，这一段自动覆盖。 */
  eq('★ 目录里恰好 3 位（预置的就是 3 位）', ARTIST_DIRECTORY.length, 3)
  ARTIST_DIRECTORY.forEach((e) => {
    const a = AS.getArtistById(e.artist_id)
    eq('★ ' + e.artist_id + ' 解析出来的键恰好是那 7 个',
      Object.keys(a).sort().join(','), DIR_KEY)
    eq('🔴★ ' + e.artist_id + ' 的输出里没有 wechat_id',
      'wechat_id' in a || JSON.stringify(a).indexOf('_makeup') >= 0, false)
    eq('★ ' + e.artist_id + ' 的名字取到了（⛔ 不是回落成空白人）',
      a.nickname.length > 0, true)
    eq('★ ' + e.artist_id + ' 的头像色是闭集里的令牌（⛔ 不是 undefined）',
      AS.AVATAR_COLORS.indexOf(a.avatar_color) >= 0, true)
  })
  /* 🔴 规矩 16 扩到目录：手写在那 3 条里的 style_text，
     必须等于 buildStyleText(自己的 style_tags)。改了排序规则或手改了文案，当场红。 */
  eq('🔴★ 规矩 16：目录里每一条的 style_text === buildStyleText(style_tags)',
    ARTIST_DIRECTORY.filter((e) => AS.buildStyleText(e.style_tags) !== e.style_text)
      .map((e) => e.artist_id), [])
  /* 🔴 另外两位的风格词【必须各有各的】：三条一模一样的话，
     「换一位妆娘进去，风格跟着换」这件事在界面上根本看不出来，
     而那正是「妆位页跟着认人」要证明的东西。 */
  eq('★ 3 位的接妆风格各不相同（不然「认人」在界面上看不出来）',
    ARTIST_DIRECTORY.map((e) => e.style_text).filter((x, i, arr) => arr.indexOf(x) === i).length, 3)
  /* 查不到 → 落到 demo。⛔ 不是 null、不是半个对象 —— 页面拿到 null
     会渲染出一张空白人卡，那种空白跟「她没填资料」长得一模一样。 */
  eq('🔴★ 传一个不存在的 id → 回落到 demo（⛔ 不是 null、不是空白人）',
    AS.getArtistById('demo-查无此人').nickname, AS.getArtist().nickname)
  eq('🔴★ 回落出来的仍然是一个【完整的】7 键对象',
    Object.keys(AS.getArtistById('demo-查无此人')).sort().join(','), DIR_KEY)

  /* ── D3. contact：3 位各一条，仍然只有这一个出口 ─────────────────────
     ⚠️ 原先这里一条断言都没有（只有一条「资料页不许 require contact.js」）。
        妆娘变成 3 位之后，少一条记录的后果是「在阿黎的页面上找不到联系方式」，
        而界面上只是那一行不出现 —— 不报错。 */
  eq('★ 3 位妆娘各有一条联系方式', ARTIST_CONTACT_IDS.length, 3)
  eq('★ 名单和目录对得上（⛔ 一个都不能少）',
    ARTIST_CONTACT_IDS.slice().sort().join(','),
    ARTIST_DIRECTORY.map((e) => e.artist_id).sort().join(','))
  eq('★ demo 的微信号取得到', CT.getContact('demo').wechat_id, 'demo_makeup')
  eq('★ 小满的也取得到（⛔ 不是只认第一位）',
    CT.getContact('demo-mian').wechat_id, 'demo_mian_makeup')
  eq('★ 阿黎的也取得到', CT.getContact('demo-ali').wechat_id, 'demo_ali_makeup')
  eq('🔴★ 不传 / 传查不到的 → 空对象（C1 上整行不渲染）',
    JSON.stringify(CT.getContact()) + JSON.stringify(CT.getContact('demo-不存在')),
    '{}{}')
  /* 🔴 任何一位的资料里都不许有她的微信号 —— 三位都查一遍，
     ⛔ 不是只查 demo 那一位就完事。 */
  eq('🔴★ 整个目录序列化之后搜不到任何一个微信号',
    ['demo_makeup', 'demo_mian_makeup', 'demo_ali_makeup']
      .filter((w) => JSON.stringify(ARTIST_DIRECTORY).indexOf(w) >= 0), [])

  /* ── D4. schedulesOfArtist + 「默认那一场至少 2 个空妆位」 ───────────
     2026-10-01（第二十处第 ③④ 步）。

     🔴 这一段是**那条换过判据的断言的新家**（原来是 ⑨ 段的
        「pages/landing 不许 require bookingStore」）。规矩 31 说清了：
        换机制、换判据，⛔ 不是把断言删掉 —— 它保的性质一个字没变：
        **「C1 上永远有点得动的妆位」**。
        提审截图 ② 上唯一可点的东西就是「选这个妆位」，一个空位都没有
        = 那张截图作废、顾客路径当场断掉。
        原先靠 mock 里写死的 `SLOTS.busy`（两个 false）实现；夹具退役之后
        换成这里这条：**每一位妆娘、离今天最近的那一场，至少还有 2 个空妆位。**

     ⚠️ 门槛是 2 不是 1：留一个空位等于「刚好够截图」——
        示例单的状态被谁动一下（比如把 bk-1 从 pending 改成 rejected）
        就掉到 1 甚至 0，而屏幕上不会报任何错。这条断言就是那个守门人。
     ⚠️ 「每一位」而不是只验 demo：顾客能从「我约过的妆娘」点进三位中的任意一位，
        只有 demo 有得选等于另外两条路径是坏的。 */
  restoreBookings()   // ⚠️ 先还原：⑥⑦⑧ 三段会真的往 BOOKINGS 里塞单
  const DIR_IDS = require(R('妆历小程序/mock/data.js')).ARTIST_DIRECTORY
    .map((e) => e.artist_id)
  eq('🔴★ 每一位妆娘都取得到场次（⛔ 不是只有 demo 有）',
    DIR_IDS.filter((id) => !AS.schedulesOfArtist(id).length), [])
  eq('🔴★ 每一位都有【今天及以后】的场次（全过期的话顾客点进来是空的）',
    DIR_IDS.filter((id) => !AS.schedulesOfArtist(id).some((s) => S.isTodayOrLater(s.date))), [])
  /* 「默认那一场」= 离今天最近的那一场 —— 和 landing.js 的 liveSchedulesOf()
     同一个判据（升序取第 0 个）。⚠️ 这儿是**重写了一遍排序**，不是调页面那个
     私有函数：页面那个没 export，而且这条断言的意图是「独立地算一次，
     跟页面比」—— 调它自己就成了拿自己证明自己。 */
  const defaultSchedOf = (id) => AS.schedulesOfArtist(id)
    .filter((s) => S.isTodayOrLater(s.date))
    .sort((a, b) => S.awayFromToday(a.date) - S.awayFromToday(b.date))[0]
  const freeOf = (s) => {
    const taken = BS.bookedSeqsOfSchedule(s)
    return (s.slots || []).filter((x) => !x.is_break && taken.indexOf(x.seq) < 0).length
  }
  console.log('  默认场次的空妆位：' +
    DIR_IDS.map((id) => id + '=' + freeOf(defaultSchedOf(id))).join('  '))
  eq('🔴★ 每位妆娘的默认场次都【至少还有 2 个空妆位】（提审截图 ② 点得动的唯一保证）',
    DIR_IDS.filter((id) => freeOf(defaultSchedOf(id)) < 2), [])
  /* 🔴 两位/三位的场次必须【同名不同日】—— 光看名字分不出来的那天，
     就是「场次筛选」存在的理由；一场一人一场的演示数据是演示不出它的。 */
  eq('🔴★ 每一位都至少有 2 场（↓ 场次筛选条才有的可选）',
    DIR_IDS.filter((id) => AS.schedulesOfArtist(id).length < 2), [])
  eq('🔴★ 每一位的场次都是【同名不同日】（光看名字分不出是哪天）',
    DIR_IDS.filter((id) => {
      const dates = AS.schedulesOfArtist(id).map((s) => s.date)
      return dates.filter((d, i, a) => a.indexOf(d) === i).length !== dates.length
    }), [])
  /* ⛔ 已取消的场次不许出现在顾客端（判据只有一条，数据源有两个）。 */
  eq('🔴★ 已取消的场次不进顾客端（demo 走 scheduleStore 那一层已经滤了）',
    AS.schedulesOfArtist('demo').filter((s) => s.status === 'cancelled'), [])

  // ── E. 派生字段：style_text 只算不存；avatar_color 是【存了但不派生】 ──
  const saved2 = AS.saveArtist({ style_tags: ['展妆', '古风妆'] })
  eq('★ 改了 style_tags，style_text 当场跟着变',
    saved2.artist.style_text, '展妆 / 古风妆')
  eq('🔴★ style_text 【没有】落进 storage（派生字段落库就是第二份真相）',
    'style_text' in JSON.parse(store10['zhuangli_artist']), false)
  /* 🔴 `initial` 这一条是【反面】的：它必须连【名字】都不存在了。
     第十九处把头像位的字整个换成颜色，于是 initial 既不该落库、
     也不该在 getArtist() 的输出里；而自测里继续断言它"没落库"是弱断言 ——
     它对着一个压根不存在的概念下结论，永远绿。所以改成查【所有】键。 */
  eq('🔴★ initial 这个字段整个不存在了（既不落库也不在输出里）',
    Object.keys(JSON.parse(store10['zhuangli_artist'])).concat(Object.keys(AS.getArtist()))
      .filter((k) => k === 'initial'), [])
  eq('★ 存的就那 7 个键（第十九处多了 avatar_color）',
    Object.keys(JSON.parse(store10['zhuangli_artist'])).sort().join(','),
    'artist_id,avatar_color,city,intro,nickname,style_custom,style_tags')
  eq('🔴★ 头像底色【真的落库了】（它是数据不是派生值，下一帧还得读回来）',
    JSON.parse(store10['zhuangli_artist']).avatar_color, 'rose')
  eq('★ 改了昵称，头像底色不受影响（⛔ 头像已经和昵称无关了）',
    AS.saveArtist({ nickname: '洛霞' }).artist.avatar_color, 'rose')
  /* 🔴🔴 这一条钉的是 §3.5 那个形状的坑（第十九处的翻版）：
     `next` 是逐字段重建的，漏接 avatar_color 的后果不是报错，是【静默抹掉】——
     她换完色，接着改一次昵称，头像就悄悄回到默认色。
     ⚠️ 顺序很重要：先换色，再改昵称，最后才读 —— 复现的正是她真会走的动作序列。 */
  eq('🔴★ 换过色之后再改昵称，颜色【一个字没变】',
    (() => {
      AS.saveArtist({ avatar_color: 'plum' })
      return [AS.saveArtist({ nickname: '洛霞' }).artist.avatar_color,
        AS.saveArtist({ city: '北京' }).artist.city].join(',')
    })(), 'plum,北京')
  eq('★ 存的令牌永远在闭集里（手改过的 storage 也过一道消毒）',
    (() => {
      store10['zhuangli_artist'] = JSON.stringify({
        artist_id: 'demo', nickname: '阿黎', city: '上海', intro: '',
        style_tags: ['展妆'], style_custom: [], avatar_color: 'chartreuse'
      })
      return AS.getArtist().avatar_color
    })(), 'rose')
  eq('★ 消毒是【写入也在】做的（不是只读的时候修一下）',
    (() => {
      AS.saveArtist({ avatar_color: 'chartreuse' })
      return JSON.parse(store10['zhuangli_artist']).avatar_color
    })(), 'rose')

  // ── F. 校验不过时【一次都不写】 ─────────────────────────────────────
  const before10 = store10['zhuangli_artist']
  const badSave = AS.saveArtist({ nickname: '   ' })
  eq('🔴★ 昵称空 → 返回失败', badSave.ok, false)
  eq('🔴★ 而且【一个字都没写进 storage】（不是「先存了再回滚」）',
    store10['zhuangli_artist'], before10)
  eq('🔴 简介超长也不写', AS.saveArtist({ intro: '一'.repeat(201) }).ok, false)
  eq('🔴 风格空也不写', AS.saveArtist({ style_tags: [] }).ok, false)
  eq('★ 一次都没写成功，storage 还是上一版',
    store10['zhuangli_artist'], before10)

  // ── G. 规矩 9：老 storage 只有 style_text、没有 style_tags 时的兜底 ─
  store10['zhuangli_artist'] = JSON.stringify({
    artist_id: 'demo', nickname: '旧数据', city: '上海',
    style_text: '建模感 / 浓系 / 展妆', intro: ''
  })
  /* 📌 第十八处改了这条的期望值：读模型里的 style_tags 现在是
     **并集**（allStyleWords 的产物），所以它跟 style_text 同口径 ——
     都是词表顺序。⛔ 不是"顺手改到能过"：这正是让
     `style_text === buildStyleText(style_tags)` 结构性成立的那一步
     （见下面 V 段那条断言）。三个词一个没少，只是排序统一了。 */
  eq('🔴★ 老数据缺 style_tags → 从 style_text 反推回来（⛔ 不显示成空的）',
    AS.getArtist().style_tags.join(','), '建模感,展妆,浓系')
  /* ⚠️ 反推回来之后**再过一遍派生**，所以展示顺序会被规整成词表顺序。
     这不是 bug —— 三个词一个没少，只是排序统一了。 */
  eq('🔴★ 反推之后展示顺序被规整成词表顺序（三个词一个没少）',
    AS.getArtist().style_text, '建模感 / 展妆 / 浓系')
  store10['zhuangli_artist'] = JSON.stringify({
    artist_id: 'demo', nickname: '旧数据', city: '上海',
    style_text: '建模感 / 自创老词 / 展妆', intro: ''
  })
  eq('🔴★ 老数据里有词表外的词 → 滤掉（⛔ 不让它上分享页）',
    AS.getArtist().style_tags.join(','), '建模感,展妆')

  // ── H. 播种判据是「storage 里没有这个 key」──────────────────────────
  delete store10['zhuangli_artist']
  const seeded = AS.getArtist()
  eq('★ 从没存过 → 种下 mock 那份',
    seeded.nickname + '/' + seeded.city, '示例/上海')
  eq('★ 种下的 style_text 就是 mock 里那句', seeded.style_text, ARTIST_PUBLIC.style_text)
  eq('★ 播种后 storage 里有这个 key 了', 'zhuangli_artist' in store10, true)
  /* ⚠️ 判据必须是「key 不存在」而不是「值看起来是空的」——
     下面这步把她改成一个**内容不同**的记录再读，不能被重新播种盖掉。 */
  AS.saveArtist({ nickname: '改过' })
  eq('🔴★ 已经存过就不重播（改了昵称不会被 mock 盖回去）',
    AS.getArtist().nickname, '改过')
  store10['zhuangli_artist'] = JSON.stringify({
    artist_id: 'demo', nickname: '', city: '', style_tags: [], style_custom: [], intro: ''
  })
  eq('🔴★ 也不靠「值看着空」判 —— 空记录也照样读出来、不重播',
    AS.getArtist().nickname, '')

  // ── I. 🔴 源码级：那个静默回落 `SLOTS[1]` 必须真的没了 ──────────────
  const bfJs = stripJs(fs.readFileSync(R('妆历小程序/pages/booking-form/booking-form.js'), 'utf8'))
  /* 🔴 这一条就是本次修的那个真 bug 的**墓碑**：
     原先 `SLOTS.filter(...)[0] || SLOTS[1]` 让妆师端代填静默落到
     顾客端 C1 的示例妆位上（漫展名写死「示例漫展」），一声不吭。
     改回去 = 这个 bug 原样复活，所以这里钉死。 */
  eq('🔴★ booking-form.js 里不再有 `|| SLOTS[1]` 那个静默回落',
    /\|\|\s*SLOTS\[1\]/.test(bfJs), false)
  /* 规矩 14：判定「这个妆位还能不能选」和「提交时放不放行」必须问同一个函数。 */
  eq('🔴★ 妆位能不能选 → 走 bookingStore 的 bookedSeqsOfSchedule',
    /bookedSeqsOfSchedule/.test(bfJs), true)
  eq('🔴★ 这一页里没有手写的状态枚举（那些散在页面里就迟早对不上）',
    /status\s*===\s*'(pending|confirmed|done|cancel_requested)'/.test(bfJs), false)
  eq('🔴 而且是【从 bookingStore require 进来的】，⛔ 不是本地自己算一份',
    /bookedSeqsOfSchedule[\s\S]{0,200}require\(.\.\.\/\.\.\/utils\/bookingStore.\)/.test(bfJs) ||
    /require\(.\.\.\/\.\.\/utils\/bookingStore.\)[\s\S]{0,300}bookedSeqsOfSchedule/.test(bfJs),
    true)
  eq('★ 代填真的会建单（调 addBooking）', /addBooking\(/.test(bfJs), true)
  eq('🔴★ 用的是 buildBooking（键的形状在 store 里统一，⛔ 不在页面里手拼一个对象）',
    /buildBooking\(/.test(bfJs), true)
  /* 🔴 2026-10-01（第二十一处第二轮）：落点一个字没动（还是「我的预约」），
     但**跳法变了** —— 那一页升成 tab 页，`redirectTo` 在那上面是**静默失败**
     （顾客提交完停在原地，以为没提交上）。⇒ 所以这里钉的是
     「落点还在」+「用的是 switchTab」，两条**缺一不可**。 */
  eq('★ 顾客自填那一条出口还在（落点仍是「我的预约」）',
    /guest-bookings\/guest-bookings/.test(bfJs), true)
  eq('🔴★ 而且它是 switchTab 过去的（tab 页用 redirectTo 会静默失败）',
    /switchTab\(\{\s*url:\s*['"]\/pages\/guest-bookings\/guest-bookings['"]/.test(bfJs), true)

  // ── J. 🔴 规矩 27：同一份来源喂两个端 —— 不许再有第二处直接 require ──
  /* 这次把 4 个消费者从 ARTIST_PUBLIC 换成了 artistStore.getArtist()，
     迁移时真正踩到的坑是 pages/guest-bookings 自己 require 了 BOOKINGS
     （绕开了 bookingStore 那一整层）。所以这两条要钉在**文件级**上。 */
  /* 📌 2026-09-30（第二十处）：第 4 个消费者是「我约过的妆娘」列表页 ——
     它显示的正是妆娘的昵称 / 城市 / 头像令牌，所以它同样必须经过 artistStore。
     ⚠️ 少写它一条的代价：「妆娘改了资料、顾客端这一页不变」那个 bug 从这一页
        回来，而且同样不报错（这一页是顾客**每次切回来都会看**的一页）。
     🔴 2026-10-01（第二十一处）：第四个从**约妆首页**换成了它 —— 首页整页退役
        （它的两段内容分成两个 tab），名单是**换人**，⛔ 不是少了一个。
        ⚠️ 所以下面那句「4 个消费者」的数不是被"放宽"了，是「显示妆娘公开资料
           的页面」本来就是这 4 个：landing / mine / my-profile / artist-list。
           新的 pages/guest-mine 一个字都不显示妆娘资料，⛔ 别顺手加进来。 */
  const consumers10 = ['pages/landing/landing.js', 'pages/mine/mine.js',
                       'pages/my-profile/my-profile.js',
                       'pages/artist-list/artist-list.js']
  eq('🔴★ 4 个消费者都不再直接 require ARTIST_PUBLIC',
    consumers10.filter((p) =>
      /require\([^)]*mock\/data[^)]*\)[\s\S]{0,80}ARTIST_PUBLIC/.test(
        fs.readFileSync(R('妆历小程序/' + p), 'utf8'))), [])
  /* 🔴 正向：它必须【经过】artistStore —— 自己 getArtist()，
     或者经过 utils/myArtists.js（那一层自己走 getArtistById）。
     ⚠️ 这里认两种走法，⛔ 不是把判据放宽了：list 页要的是**一份聚合成多行的记录**，
        资料本身它一行都不该自己去取 —— 它经过的那一层同样住在 utils/ 里，
        同样只有一份（规矩 11）。⛔ 别把 artist-list 从这条里踢出去。 */
  eq('★ 而且都改成走 artistStore 了（自己 getArtist，或经 myArtists 那一层）',
    consumers10.filter((p) => {
      const s = fs.readFileSync(R('妆历小程序/' + p), 'utf8')
      return !/getArtist/.test(s) && !/require\([^)]*myArtists[^)]*\)/.test(s)
    }), [])
  /* ⚠️ 必须【摘掉注释再查】—— guest-bookings.js 的注释里原样引着那句
     `require('../../mock/data').BOOKINGS` 用来讲这次为什么改（第五处栽在
     同类陷阱上：README 第 21 条那条「查前先摘注释」）。 */
  const gbPlain10 = stripJs(fs.readFileSync(R('妆历小程序/pages/guest-bookings/guest-bookings.js'), 'utf8'))
  eq('🔴★ 顾客端「我的预约」也不再直接 require BOOKINGS（规矩 11 的那处真违规）',
    /require\([^)]*mock\/data[^)]*\)/.test(gbPlain10), false)
  eq('★ 它现在是走 getBookings() 的', /getBookings\(\)/.test(gbPlain10), true)
  /* 🔴 bookingStore 里【只允许 load() 碰 import 进来那份 BOOKINGS】。
     别的函数再直读一次，就是「妆师端和顾客端读两份不同的单」那类静默不一致的入口。 */
  const bsPlain10 = stripJs(fs.readFileSync(R('妆历小程序/utils/bookingStore.js'), 'utf8'))
  eq('🔴★ bookingStore 里一共只提 BOOKINGS 两次：import 那一行 + load() 里那一行',
    (bsPlain10.match(/\bBOOKINGS\b/g) || []).length, 2)
  /* ⛔ 真正要防的是「把它当值用」（BOOKINGS.filter / BOOKINGS[0] / BOOKINGS.push…）——
     只要没人这么写，读入口就唯一。 */
  eq('🔴★ 而且没有一处把它当值直接用（⛔ 不许 BOOKINGS.filter / BOOKINGS[0]）',
    /BOOKINGS\s*[.\[]/.test(bsPlain10), false)
  /* 🔴 这一轮【故意没做 storage 化】（文件头写着两条理由：只持久化新增的单
     会造成「重启后新的还在、原来的改动全没了」这种更难解释的不对称；
     自测 ⑥ 的 restoreBookings() 会变成静默失效的兜底）。
     所以这里钉的是「要么全持久化、要么全内存」—— ⛔ 不许做一半。 */
  eq('🔴★ bookingStore 完全不碰 storage（本轮有意为之，⛔ 别当漏了去补一半）',
    /setStorageSync|getStorageSync/.test(bsPlain10), false)
  /* ⚠️ 返回的是**数组本身**不是副本 —— updateBooking / addBooking 都是原地改，
     复制一份出去的话「代填建了单、妆位却还显示空闲」当场复活。 */
  eq('🔴★ getBookings() 直接返回那一份（⛔ 不复制 —— 原地改才传得出去）',
    /function getBookings\(\) \{\s*return BOOKINGS\s*\}/.test(bsPlain10), true)
  eq('★ addBooking 走 getBookings()（⛔ 不直接用 BOOKINGS.push）',
    /getBookings\(\)\.push\(rec\)/.test(bsPlain10), true)
  /* 🔴🔴 2026-10-01（第二十处）：这一条**翻了个面**（原先是「不许 require」）。
     ⚠️ 规矩 31：换机制、换判据，⛔ 不是把断言删掉 —— 它保的那个性质一个字没变：
        「C1 上永远有点得动的妆位」，而且妆位状态**只有一处口径**。
        当初用「冻结夹具（SLOTS.busy 写死两个 false）」实现那个性质；
        第二十处改成真数据之后，夹具退役，保证换成
        「**默认那一场至少 2 个空妆位**」（数据层那条断言在 ⑩ 段）。
     🔴 所以这条现在钉的是**相反的东西**：landing 必须从 bookingStore 取
        「哪些妆位被占了」，⛔ 不许在这一页自己判 —— `done` 也算占
        （第十五处定死的口径）就住在 BOOKED_STATUS 里，重写一份迟早漏掉它。
     ⚠️ 别再翻回去：夹具已经删了（mock/data.js 里那段退役说明写着原因）。 */
  const landJs10 = stripJs(fs.readFileSync(R('妆历小程序/pages/landing/landing.js'), 'utf8'))
  eq('🔴★ pages/landing 【必须】require bookingStore（妆位状态只认一处口径）',
    /bookingStore/.test(landJs10), true)
  eq('🔴★ 而且调的是 bookedSeqsOfSchedule()，⛔ 不是另写一份「什么算被占」',
    /bookedSeqsOfSchedule/.test(landJs10), true)
  eq('🔴★ landing 里⛔ 不许出现 BOOKED_STATUS / 手写的状态枚举',
    /BOOKED_STATUS|status\s*===\s*'(pending|confirmed|done)'/.test(landJs10), false)
  /* ⚠️ 同时钉住反向：那份夹具的字段名不许再回到这一页 ——
     它一回来就说明有人把数据源换回了写死的那份。 */
  eq('🔴★ landing 里不再有 slot_id / SLOTS（夹具退役，妆位身份 = (schedule_id, seq)）',
    /slot_id|SLOTS\b/.test(landJs10), false)

  // ── K. 🔴 新加的两个页面：注册 + 落点 + 形状 ─────────────────────────
  const appJson10 = JSON.parse(fs.readFileSync(R('妆历小程序/app.json'), 'utf8'))
  eq('★ style-edit 注册了', appJson10.pages.indexOf('pages/style-edit/style-edit') >= 0, true)
  eq('★ intro-edit 注册了', appJson10.pages.indexOf('pages/intro-edit/intro-edit') >= 0, true)
  eq('★ 两个新页都只有 .js/.wxml（样式进 app.wxss，照 settings 的形状）',
    ['style-edit', 'intro-edit'].filter((p) =>
      !fs.existsSync(R('妆历小程序/pages/' + p + '/' + p + '.js')) ||
      !fs.existsSync(R('妆历小程序/pages/' + p + '/' + p + '.wxml'))), [])
  eq('★ 两个新页都没有自己的 .wxss',
    ['style-edit', 'intro-edit'].filter((p) =>
      fs.existsSync(R('妆历小程序/pages/' + p + '/' + p + '.wxss'))), [])

  /* 🔴 落点必须真的在 app.json 里 —— 拼错了在真机上就是白屏，
     而自测不打桩是发现不了的。这里扫全项目所有 navigateTo 的字面量。 */
  const allJs10 = ['pages/my-profile/my-profile.js', 'pages/style-edit/style-edit.js',
                   'pages/intro-edit/intro-edit.js', 'pages/booking-form/booking-form.js']
    .map((p) => fs.readFileSync(R('妆历小程序/' + p), 'utf8')).join('\n')
  const urls10 = (allJs10.match(/url:\s*'(\/pages\/[^'?]+)/g) || [])
    .map((s) => s.replace(/url:\s*'\/?/, ''))
  eq('🔴★ 这些页面里每一个跳转落点都在 app.json 的 pages 里（拼错了就是白屏）',
    urls10.filter((u) => appJson10.pages.indexOf(u) < 0), [])
  eq('★ 而且落点确实含新加那两页（不是空跑）',
    ['pages/style-edit/style-edit', 'pages/intro-edit/intro-edit']
      .filter((u) => urls10.indexOf(u) < 0), [])

  // ── L. 🔴 规矩 20：这两个新页都不许调 hideKeyboard ──────────────────
  const hip10 = ['pages/my-profile/my-profile.js', 'pages/style-edit/style-edit.js',
                 'pages/intro-edit/intro-edit.js']
  eq('🔴★ 资料页 / 风格页 / 简介页：hideKeyboard 一次都没调（README 第 20 条）',
    hip10.filter((p) => /hideKeyboard/.test(
      stripJs(fs.readFileSync(R('妆历小程序/' + p), 'utf8')))), [])

  // ── M. 简介页：textarea 的硬约束 ────────────────────────────────────
  const introWxml = stripHtml(fs.readFileSync(R('妆历小程序/pages/intro-edit/intro-edit.wxml'), 'utf8'))
  const introJs = stripJs(fs.readFileSync(R('妆历小程序/pages/intro-edit/intro-edit.js'), 'utf8'))
  /* ⚠️ textarea 的 `maxlength` 默认是 **140**，⛔ 不是 200 —— 不显式写就
     静默卡在 140 字，而计数器还写着 /200，看着像计数器坏了。 */
  eq('🔴★ <textarea> 显式带了 maxlength（默认只有 140，不写就静默卡住）',
    /<textarea[\s\S]*?maxlength="\{\{max\}\}"/.test(introWxml), true)
  eq('★ 而且 maxlength 绑的就是 INTRO_MAX 那个常量',
    /INTRO_MAX/.test(introJs) && /max:\s*INTRO_MAX/.test(introJs), true)
  eq('★ 计数器用的是 .length（跟 validateIntro 同一个单位，⛔ 不换成码点数）',
    /len:\s*v\.length/.test(introJs), true)
  eq('🔴★ 「保存」放【导航栏右侧】，⛔ 不放底部 —— 键盘从底部升起会盖住 footbar',
    /slot="right"[\s\S]{0,120}onSave/.test(introWxml), true)
  eq('🔴★ 这一页【没有】底部 fixed 操作栏', /footbar/.test(introWxml), false)
  eq('★ 保存失败时不退出（退出等于把刚写的 200 字一起丢掉）',
    /if\s*\(!r\.ok\)[\s\S]{0,160}return/.test(introJs), true)
  eq('🔴 保存成功后【立刻】navigateBack，⛔ 不套 setTimeout',
    /setTimeout/.test(introJs), false)
  eq('★ 这一页也是「零 bindtap 拼错」的安全形状：两个键都有同名函数',
    (introWxml.match(/bindtap="([^"]+)"/g) || [])
      .map((s) => s.replace(/bindtap="([^"]+)"/, '$1'))
      .filter((n) => !new RegExp('\\b' + n + '\\b\\s*[:(]').test(introJs)), [])

  // ── N. 风格页：词表只有一处来源 ─────────────────────────────────────
  const styleJs = stripJs(fs.readFileSync(R('妆历小程序/pages/style-edit/style-edit.js'), 'utf8'))
  const styleWxml = stripHtml(fs.readFileSync(R('妆历小程序/pages/style-edit/style-edit.wxml'), 'utf8'))
  /* ⛔ 页面里不许出现第二个 16 项词表：mock 改了这里不跟着变，而且是**静默**不变。 */
  eq('🔴★ 风格页里没有第二个词表（一个字面量的词都不许有）',
    ['自然感', '建模感', '古早感', '混血感', '超精妆', '蕾系', '成男妆', '古风妆', '韩妆']
      .filter((w) => styleJs.indexOf(w) >= 0 || styleWxml.indexOf(w) >= 0), [])
  eq('★ 它从 artistStore 拿勾选态和点选',
    /toStyleView/.test(styleJs) && /toggleTag/.test(styleJs), true)
  /* ⚠️ 这一条要的是「两个风格通道一起交给 saveArtist，页面自己不校验」。
     🔴 先切出那次调用的正文再断言，⛔ 不再用「`saveArtist({` 之后 N 个字符内
        必须出现 style_custom 和 `}`」这种窄正则 —— 它已经被页面的换行坑过两次
        （一次 60、一次 20，都是窗口差几个字符，看着像页面写错）。 */
  const saveCall10 = styleJs.slice(styleJs.indexOf('saveArtist({'),
    styleJs.indexOf('})', styleJs.indexOf('saveArtist({')) + 2)
  eq('🔴★ 校验不预判、不自己拼话术（规矩 11：一处实现）',
    /style_tags/.test(saveCall10) && /style_custom/.test(saveCall10) &&
    /r\.error/.test(styleJs), true)
  eq('★ 一个词都没选 → 不保存、不退出（store 返回失败就只出声）',
    /if\s*\(!r\.ok\)[\s\S]{0,120}return/.test(styleJs), true)

  // ── O. 资料页：四个键的**落点**都对 ────────────────────────────────
  const profJs10 = stripJs(fs.readFileSync(R('妆历小程序/pages/my-profile/my-profile.js'), 'utf8'))
  /* 弹框那两个键必须走 editable:true 的 showModal，而 content 就是当前值
     （editable 模式下 content 是输入框**初值**，传提示语就变成预填提示语了）。 */
  eq('🔴★ 昵称/城市用 editable 弹框改，而且 content 传的是当前值',
    /editable:\s*true/.test(profJs10) && /content:\s*cur/.test(profJs10), true)
  eq('🔴★ 弹框按钮写动作（保存/返回），⛔ 不用「确定/取消」',
    /confirmText:\s*'保存'/.test(profJs10) && /cancelText:\s*'返回'/.test(profJs10), true)
  /* 规矩 22：弹框根本没打开也要出声，不然就是「点了行、什么都没发生」。 */
  eq('🔴★ 弹框 fail 分支会出声（⛔ 不静默）',
    /fail:[\s\S]{0,200}showToast/.test(profJs10), true)
  eq('★ 点「返回」刻意不出声（那不是失败，是改主意）—— 这一条写进注释了',
    /改主意/.test(fs.readFileSync(R('妆历小程序/pages/my-profile/my-profile.js'), 'utf8')), true)
  /* ⚠️ 保存后不退回：她多半还要接着改下一项。 */
  eq('★ 保存后【不】navigateBack（还要接着改下一项）',
    /navigateBack/.test(profJs10), false)
  eq('★ 成功后重读一遍 storage（而不是信 saveArtist 的返回值）',
    /refresh\(\)/.test(profJs10), true)
  eq('🔴★ 重读放在 onShow（从子页返回时 onLoad 不会重跑）',
    /onShow[\s\S]{0,80}refresh\(\)/.test(profJs10), true)
  /* 🔴 上一版这里是反向断言「整页没有任何 bindtap」。现在反过来了，
     但**精神不变**：每个键都要有着落。页面级的「每个 bindtap 都有同名函数」
     那条断言在 ⑨-E，这里补的是「4 个键的落点分类」。 */
  eq('🔴 资料页四行 = 两个弹框 + 两个整页',
    ['editNickname', 'editCity', 'goStyle', 'goIntro']
      .filter((n) => !new RegExp(n + '\\s*:').test(profJs10)), [])

  // ── P. 🔴 简介在顾客端的落点 ───────────────────────────────────────
  const landWxml10 = stripHtml(fs.readFileSync(R('妆历小程序/pages/landing/landing.wxml'), 'utf8'))
  eq('🔴★ C1 落地上有简介这一段', /artist\.intro/.test(landWxml10), true)
  eq('★ 没写就整段不出现（⛔ 不留一个空标题）',
    /wx:if="\{\{artist\.intro\}\}"/.test(landWxml10), true)
  /* 🔴 位置：简介必须在【妆位表下面】。C1 的头等大事是「选这个妆位」，
     200 字摆上去会把它挤到首屏外。 */
  eq('🔴★ 简介排在妆位表【后面】（⛔ 不能插在妆位表和预期说明条中间）',
    landWxml10.indexOf('可约妆位') < landWxml10.indexOf('artist.intro'), true)
  /* ⛔ 不做行数截断：截断了顾客再也看不到全文，而全站没有第二个地方能看。 */
  eq('🔴★ C1 的简介【不做】行数截断（截断 = 假承诺）',
    /line-clamp/.test(fs.readFileSync(R('妆历小程序/app.wxss'), 'utf8')) === false ||
    !/intro[^}]*line-clamp/.test(fs.readFileSync(R('妆历小程序/app.wxss'), 'utf8')), true)
  eq('★ 换行保留（她分的段落不能被吃掉）',
    /\.intro\{[^}]*white-space:pre-wrap/.test(fs.readFileSync(R('妆历小程序/app.wxss'), 'utf8')),
    true)

  // ── P2. 🔴 妆面样片【已经不在了】（第二十处 · 用户决定 D8）────────────
  /* ⚠️ 这三条是【反向断言】：它们钉的不是「做了什么」，是「**不许再回来**」。
     🔴 判据（为什么删）：个人主体没有「社交-笔记 / 社区」类目，用户上传的
        图片给别人看正落在平台驳回原话那条线上 —— 第十五处为同一件事
        删掉了整个「我的作品」板块。⛔ 所以这不是「这一轮先不做」，
        是**做不了**；哪天有人想把样片加回 C1，这三条会红着拦住他。
     ⚠️ 它们是**整文件扫**（⛔ 不是只看 landing.wxml）：`.work-grid`/`.work`
        全项目就这一个消费者（第十五处删作品页之后就归零了），
        所以样式类名本身也得一起钉死，否则下一个人在别处写一份同样会红。 */
  eq('🔴★ C1 的「妆面样片」整块【已删】（⛔ 不许再长回来）',
    /妆面样片|占位图/.test(landWxml10), false)
  eq('🔴★ 全项目没有 `.work-grid` / `.work` 的消费者',
    (() => {
      const hits = []
      /* 扫全部 wxml：⛔ 不用「只扫 landing」那种写法 —— 这条要能抓住
         「在别的页面又开一个图片位」这种情况。 */
      const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
        const p = dir + '/' + d.name
        if (d.isDirectory()) walk(p)
        else if (/\.wxml$/.test(d.name)) {
          const t = stripHtml(fs.readFileSync(p, 'utf8'))
          if (/\bwork-grid\b|\bclass="work\b/.test(t)) hits.push(p)
        }
      })
      walk(R('妆历小程序/pages'))
      return hits
    })(), [])
  eq('🔴★ `app.wxss` 里的 `.work-grid` / `.work` 样式【已删】（⛔ 不留半截）',
    /\.work-grid\s*\{|\.work\s*\{/.test(fs.readFileSync(R('妆历小程序/app.wxss'), 'utf8')),
    false)
  /* ⛔ 「我的」Tab 那张卡片刻意不显示简介：那是她自己的页头，塞 200 字会撑开。 */
  eq('🔴★「我的」页那张卡片【不】显示简介（那是她自己的页头）',
    /artist\.intro/.test(stripHtml(fs.readFileSync(R('妆历小程序/pages/mine/mine.wxml'), 'utf8'))),
    false)
  /* 🔴 三处写死的「示」必须都没了 —— 改了昵称头像首字不跟着变，是同一个病。
     📌 2026-09-30（第十九处）：头像位从「昵称首字」改成「人像标识 + 令牌底色」
        之后，这一段**换了判据但保住了精神**：
        · 原先查的是「`.ava` 里不许有写死的字」；
        · 现在查的是「全项目每个 `.ava` 都必须带一个颜色令牌、而且都是空的」——
          空是结构性要求（人像是 `::before/::after` 画的，⛔ 里面不许再放内容，
          放了就是一个字压在人像上）。
        ⚠️ 这一段的另一个价值：它是**全项目扫一遍**的，将来谁在新页面里加一个
          `<view class="ava">`（漏了令牌 = 兜底色能画出来，但换色换不到它），
          这条会红。 */
  /* 📌 2026-09-30（第二十处）：名单里进了「我约过的妆娘」列表页、
     **移出了约妆首页** —— 走的是同一个人的同一份数据，一个进一个出。
     ⚠️ 它那一行用的是 `wx:for-item="artist"`，就是为了让头像那行写成
        `c-{{artist.avatar_color}}` —— 和别处**逐字一样**，
        于是下面三条断言一条都不用放宽（判据没变，也没漏掉新那一页）。 */
  const avaOwners = ['pages/landing/landing.wxml',
    'pages/mine/mine.wxml', 'pages/my-profile/my-profile.wxml',
    'pages/artist-list/artist-list.wxml']
  const avaTags = avaOwners.reduce((acc, p) => {
    /* ⚠️ 正则末尾那个 `(\s*</view>)?` 是可选的【闭合标签】——
       标签里**有内容**时它匹配不上，于是捕获到的那一段就不以 `</view>` 结尾。
       这就是下面「每一处都是空标签」那条的判据（⛔ 别改成查 `>` 后面一个字符：
       那种写法要能看见标签【外面】，而 match 的结果已经在 `>` 上截断了）。 */
    const hits = stripHtml(fs.readFileSync(R('妆历小程序/' + p), 'utf8'))
      .match(/<view class="[^"]*\bava\b[^"]*"[^>]*>(\s*<\/view>)?/g) || []
    return acc.concat(hits.map((h) => p + ' → ' + h))
  }, [])
  eq('★ 4 个消费者里恰好 4 处头像（每页一处，⛔ 没有多于一处）', avaTags.length, 4)
  /* 🔴 2026-10-01（第二十一处）：这一条原先是「约妆首页一处头像都没有」
     （首页那会儿还在，它代表的是「一份记录」而不是某一位妆娘）。
     现在**连那个页面都没有了** —— 用户原话「用户端预约过的妆娘是一个页面，
     我的是一个页面，不要放在同一个页面里面」，于是约妆端有了两个 tab，
     首页整页退役。按规矩 31（判据变了要换，⛔ 不是删）这里换成一句反向断言，
     要保的性质仍然是「**约妆端没有一个『首页代表某一位妆娘』的地方**」：
     少了这一条，将来谁把 guest-home 加回来（或者又做一页『推荐妆娘』）
     都不会红，而那正是红线 1 的形状（README §3.7）。 */
  eq('🔴★ 约妆首页（pages/guest-home）整块退役了（⛔ 别加回来：它代表"某一位"）',
    fs.existsSync(R('妆历小程序/pages/guest-home')), false)
  eq('🔴★ 每一处头像都带颜色令牌（漏了 = 换色换不到它）',
    avaTags.filter((h) => !/c-\{\{artist\.avatar_color\}\}/.test(h)), [])
  eq('🔴★ 每一处头像内都是空的（人像是 ::before/::after 画的，⛔ 不许再放字）',
    avaTags.filter((h) => !/<\/view>$/.test(h)), [])
  /* 🔴 令牌只走 class，⛔ 不许有人图省事写成内联样式
     （`style="background:{{…}}"` = 让数据直接当样式用，等于把颜色域开放了）。 */
  const avaWxmlAll = avaOwners.map((p) => stripHtml(fs.readFileSync(R('妆历小程序/' + p), 'utf8'))).join('\n')
  eq('🔴★ 头像底色【只走 class】，没有一处写成内联 background',
    /style="[^"]*background/.test(avaWxmlAll), false)
  /* 🔴 令牌名字【不许】散在 wxml 里（散着写就没法保证它跟 CSS 那份对得上）。 */
  eq('🔴★ wxml 里不出现任何字面量令牌（一律 {{artist.avatar_color}} / {{item}}）',
    AS.AVATAR_COLORS.filter((t) => new RegExp('c-' + t + '\\b').test(avaWxmlAll)), [])
  eq('★ C1 的导航栏标题也跟着昵称走（原先写死「示例的妆位」）',
    /title="\{\{artist\.nickname\}\}的妆位"/.test(landWxml10), true)

  // ── Q. 🔴 规矩 23：写回用【未过滤的】列表 ─────────────────────────
  const ssStore10 = stripJs(fs.readFileSync(R('妆历小程序/utils/scheduleStore.js'), 'utf8'))
  eq('🔴★ addSchedule / updateSchedule / cancelSchedule 都用 rawList() 当底稿',
    ['addSchedule', 'updateSchedule', 'cancelSchedule']
      .filter((n) => !new RegExp(n + '[\\s\\S]{0,300}?rawList\\(\\)').test(ssStore10)), [])
  eq('🔴★ 而且没有一处拿 getSchedules() 当写回底稿',
    /getSchedules\(\)[^\n]{0,40}\n[^\n]{0,40}setStorageSync/.test(ssStore10), false)

  // ── R. app.json 的页数账本 ─────────────────────────────────────────
  eq('🔴 页数是 18（= 14 + 风格页 + 简介页 + 反馈页 + 我约过的妆娘；第二十一处删 guest-home 加 guest-mine 抵消），加页要主动改这一条',
    appJson10.pages.length, 18)
  eq('★ 而且没有重复注册',
    appJson10.pages.length, new Set(appJson10.pages).size)

  // ── S. 红线 10：新加的话术里不许有「开发中」那类承诺 ────────────────
  const red10_10 = /开发中|敬请期待|即将上线|暂不支持/
  const newCopy10 = [
    fs.readFileSync(R('妆历小程序/pages/style-edit/style-edit.wxml'), 'utf8'),
    fs.readFileSync(R('妆历小程序/pages/intro-edit/intro-edit.wxml'), 'utf8'),
    fs.readFileSync(R('妆历小程序/pages/booking-form/booking-form.wxml'), 'utf8'),
    fs.readFileSync(R('妆历小程序/utils/toast.js'), 'utf8')
  ].join('\n')
  eq('⛔ 新加的文案里没有「开发中」那类承诺（红线 10）',
    red10_10.test(newCopy10.replace(/\/\*[\s\S]*?\*\//g, '')), false)

  // ── T. 妆师端代填不许把金额说出来（顾客端红线 2 的邻接面）────────────
  eq('🔴★ 代填生成的单定金默认 0（¥0 = 没谈定金，⛔ 不许瞎填一个 50）',
    /deposit_amount:\s*Number\(p\.deposit_amount\)\s*\|\|\s*0/.test(
      stripJs(fs.readFileSync(R('妆历小程序/utils/bookingStore.js'), 'utf8'))), true)

  /* ══════════════════════════════════════════════════════════════════
     U/V/W 第十八处（2026-09-30）· 接妆风格可自填

     用户原话：
       「接妆风格除了我列出的那些选项，妆面质感，场合，浓度 题材 其他
         妆娘可以自填选项，你只给了选项，用不着顾客搜，顾客搜不着就搜不着吧」
     后半句是【豁免】也是【明确的不做】：
       ⛔ 不许给顾客端加按风格搜索/筛选去"补上"这个洞。
     ══════════════════════════════════════════════════════════════════ */
  const custom = (names, group, on) => [{
    group: group || '浓度',
    items: (names instanceof Array ? names : [names]).map((n) => ({ name: n, on: on !== false }))
  }]
  const seed6 = () => {
    store10['zhuangli_artist'] = JSON.stringify({
      artist_id: 'demo', nickname: '示例', city: '上海',
      style_tags: ['建模感', '浓系', '展妆'], style_custom: [], intro: ''
    })
  }

  // ── U. 自填词：一颗词的闸 ───────────────────────────────────────────
  eq('★ 上限常量：6 个 / 每个 10 字', AS.CUSTOM_MAX + '/' + AS.CUSTOM_MAX_LEN, '6/10')
  eq('🔴★ 兜底组名是 STYLE_GROUPS 里的一个【真组名】（⛔ 归到一个不存在的组）',
    STYLE_GROUPS.filter((g) => g.group === AS.GROUP_FALLBACK).length, 1)
  eq('★ A1 空词 → 拦住', AS.validateCustomWord('').ok, false)
  eq('★ A1 纯空格 → 拦住，且话术是「先打个词再加进来」',
    AS.validateCustomWord('   ').error, '先打个词再加进来')
  eq('🔴★ A2 含「/」→ 拦住（它是分隔符，会被反推拆成两个词 = 静默损坏）',
    AS.validateCustomWord('cos/古风').error, '风格词里不能用「/」，它是分隔符')
  eq('★ A3 正好 10 字 → 放行', AS.validateCustomWord('一二三四五六七八九十').ok, true)
  eq('★ A3 11 字 → 拦住', AS.validateCustomWord('一二三四五六七八九十甲').ok, false)
  eq('🔴★ A3 话术带【实际字数】和那个词（不然她不知道该删几个字）',
    AS.validateCustomWord('一二三四五六七八九十甲').error,
    '一个风格词最多 10 个字，「一二三四五六七八九十甲」有 11 个字')
  /* 🔴 两个占位符的填充顺序：先 N 后 X。反过来的话，她打的词里只要有一个
     大写 N，第二个 replace 会把她词里那个 N 换成数字。 */
  eq('🔴★ A3 占位符顺序：先 N 后 X（词里带 N 也不会被吃掉）',
    AS.validateCustomWord('NANA' + '妆'.repeat(7)).error,
    '一个风格词最多 10 个字，「NANA' + '妆'.repeat(7) + '」有 11 个字')
  eq('★ A4 打的正是预设词 → 拦住', AS.validateCustomWord('展妆').ok, false)
  eq('🔴★ A4 的话【给出一条出路】（词就在屏幕上，直接点它）',
    AS.validateCustomWord('展妆').error, '「展妆」已经是下面的选项了，直接点它就行')
  eq('★ A4 先 trim 再比（「  展妆  」照样撞预设词）',
    AS.validateCustomWord('  展妆  ').ok, false)
  eq('★ A5 和另一颗自填词重名 → 拦住',
    AS.validateCustomTag('特效妆', custom('特效妆', '题材')).ok, false)
  eq('🔴★ A5 的话和 A4 的话【必须是不同的两句】'
    + '（撞预设＝去点它；撞自填＝去改那颗 ✕。混成一句就把出路说丢了）',
    AS.validateCustomTag('特效妆', custom('特效妆', '题材')).error
      !== AS.validateCustomWord('展妆').error, true)
  eq('🔴★ A5 重名【按大小写不敏感】比（「COS妆」撞「cos妆」）',
    AS.validateCustomTag('COS妆', custom('cos妆', '题材')).ok, false)
  eq('🔴★ A5 跨组也算重名（「浓度」里的词，在「题材」组里再加一次要拦住）',
    AS.validateCustomTag('特效妆', custom('特效妆', '浓度')).ok, false)
  eq('★ 加进去的是 trim 后的【原写法】（⛔ 不擅自改成小写）',
    AS.addCustomTag([], '题材', '  COS妆  ').custom[0].items[0].name, 'COS妆')

  // ── U2. 加 / 删 / 勾选 ─────────────────────────────────────────────
  const add1 = AS.addCustomTag([], '浓度', '特效妆')
  eq('★ 加进空列表 → ok', add1.ok, true)
  eq('★ 落在点名的那一组里', add1.custom[0].group, '浓度')
  eq('★ 新词默认【选中】（她刚打完，就是要用它）', add1.custom[0].items[0].on, true)
  const add2 = AS.addCustomTag(add1.custom, '浓度', '舞台妆')
  eq('★ 同一组连加两颗 → 一条组里两颗',
    add2.custom.length + '/' + add2.custom[0].items.length, '1/2')
  eq('★ 往另一组加 → 多一条组',
    AS.addCustomTag(add2.custom, '题材', '古风定制').custom.length, 2)
  eq('🔴 加的时候不 mutate 入参', add1.custom[0].items.length, 1)
  eq('🔴★ 删掉某组最后一颗 → 那一组【整条去掉】（⛔ 不留空壳组）',
    AS.removeCustomTag(add2.custom, '舞台妆').length, 1)
  eq('★ 删掉唯一一颗 → 一条都不剩',
    AS.removeCustomTag(add1.custom, '特效妆').length, 0)
  eq('★ 删除也按大小写不敏感比（删得掉）',
    AS.removeCustomTag(custom('COS妆', '题材'), 'cos妆').length, 0)
  eq('🔴★ toggleCustomTag 不 mutate 入参',
    (() => { const src = add1.custom; AS.toggleCustomTag(src, '特效妆'); return src[0].items[0].on })(),
    true)
  eq('★ toggleCustomTag 只翻那一颗（⛔ 不是删）',
    AS.toggleCustomTag(add1.custom, '特效妆')[0].items[0].on, false)
  eq('★ 再点一次翻回来',
    AS.toggleCustomTag(AS.toggleCustomTag(add1.custom, '特效妆'), '特效妆')[0].items[0].on, true)
  /* ⚠️ 六颗词要写成数组，⛔ 不是 custom('ABCDEF') —— 那个 helper 把字符串
     当成【一颗】词（「ABCDEF」是一颗 6 字的词），满员测试会整个测空。 */
  const SIX = ['甲妆', '乙妆', '丙妆', '丁妆', '戊妆', '己妆']
  const full6 = custom(SIX, '浓度')
  eq('★ 六颗词铺好了', AS.customWords(full6).length, 6)
  eq('🔴★ A6 第 7 个 → 拦住', AS.addCustomTag(full6, '浓度', '庚妆').ok, false)
  eq('★ A6 的话术', AS.addCustomTag(full6, '浓度', '庚妆').error,
    '自填词最多 6 个，先删一个再加')
  eq('🔴 名额把「没选中的」也算进去（删一个才能加，跟她选没选无关）',
    AS.addCustomTag(custom(SIX, '浓度', false), '浓度', '庚妆').ok, false)
  eq('★ 但 5 颗时还能加（第 6 颗放行）',
    AS.addCustomTag(custom(SIX.slice(0, 5), '浓度'), '浓度', '庚妆').ok, true)

  // ── U3. 并集 / 消毒 / 视图 ─────────────────────────────────────────
  eq('★ 并集 = 预设（按词表序）++ 自填（按组序）',
    AS.allStyleWords(['浓系', '自然感'], add2.custom).join(','),
    '自然感,浓系,特效妆,舞台妆')
  /* 🔴 顺序必须是【数据的函数】，⛔ 不是添加历史的函数：
     同一批词，先加 A 后加 B 和先加 B 后加 A，必须得到同一句 style_text
     —— 否则同一组标签换个点选次序，分享页上的字就变了，而她什么都没改。 */
  const o1 = AS.addCustomTag(AS.addCustomTag([], '浓度', '甲妆').custom, '题材', '乙妆').custom
  const o2 = AS.addCustomTag(AS.addCustomTag([], '题材', '乙妆').custom, '浓度', '甲妆').custom
  eq('🔴★ 两种添加顺序 → 同一句 style_text（文字只由数据决定）',
    AS.buildStyleText(AS.allStyleWords([], o1)) === AS.buildStyleText(AS.allStyleWords([], o2)),
    true)
  eq('★ 没选中的自填词【不进】并集（⛔ 没选用的词不上一页公开的分享页）',
    AS.allStyleWords([], custom('甲妆', '浓度', false)).length, 0)
  eq('★ normalize：trim 掉首尾空白',
    AS.normalizeCustom([{ group: '浓度', items: [{ name: '  甲妆 ', on: true }] }])[0].items[0].name,
    '甲妆')
  eq('★ normalize：纯空白的词丢掉（画出来会是一个空 chip）',
    AS.normalizeCustom([{ group: '浓度', items: [{ name: '   ', on: true }] }]).length, 0)
  eq('🔴★ normalize：认不出的组名归兜底组'
    + '（⛔ 不静默丢 —— 丢了她再也删不掉它，而它还在分享页上、还占着名额）',
    AS.normalizeCustom([{ group: '早就没有的组', items: [{ name: '甲妆', on: true }] }])[0].group,
    AS.GROUP_FALLBACK)
  eq('★ normalize：同一个词只留第一颗（按小写比）',
    AS.normalizeCustom([{ group: '浓度', items: [{ name: 'A妆', on: true }, { name: 'a妆', on: false }] }])[0].items.length,
    1)
  eq('★ normalize：同名的两组并成一条',
    AS.normalizeCustom([{ group: '浓度', items: [{ name: '甲', on: true }] },
                        { group: '浓度', items: [{ name: '乙', on: true }] }]).length, 1)
  /* ⚠️ 这里跟方案书写的不同：方案说「截到上限」，实现改成【不截断】。
     理由：截断是【静默丢数据】—— 手改过的 storage 里真有第 7 颗的话，
     截掉它 = 她再也删不掉它，而它还挂在分享页上。surfacing 出来更好：
     她看得见、删得掉，保存时由 validateStyles 拦并告诉她删一个。 */
  eq('🔴★ normalize 【不】按上限截断（第 7 颗要让她看得见、删得掉）',
    AS.normalizeCustom(custom(SIX.concat(['庚妆']), '浓度'))[0].items.length, 7)
  eq('★ 视图：自填词挂在对的那一组',
    AS.toStyleView(['展妆'], add2.custom).groups.filter((g) => g.custom.length).map((g) => g.group).join(','),
    '浓度')
  eq('🔴 视图：认不出组名的自填词也归兜底组（界面上看得见）',
    AS.toStyleView([], [{ group: '没了', items: [{ name: '甲妆', on: true }] }])
      .groups.filter((g) => g.custom.length)[0].group, AS.GROUP_FALLBACK)

  // ── U4. validateStyles：两个通道一起判 ─────────────────────────────
  eq('★ 预设空 + 自填空 → STYLE_NONE（原样那句话）',
    AS.validateStyles([], []).error, '至少选一个接妆风格，客人靠它知道你能接什么妆')
  /* 🔴🔴 这一条是本次设计的核心回归：老设计里「至少一个」只看 style_tags，
     于是「她撤掉所有预设词、只留自填词」会被误报成"一个都没选"——
     她屏幕上那颗词明明亮着。判据必须是【并集】。 */
  eq('🔴★ 预设空但有一颗【选中的】自填词 → 必须放行（⛔ 判据是并集不是 style_tags）',
    AS.validateStyles([], custom('特效妆', '浓度')).ok, true)
  eq('★ 只有一颗【没选中的】自填词 → 还是拦住（并集是空的）',
    AS.validateStyles([], custom('特效妆', '浓度', false)).ok, false)
  eq('🔴★ 第 7 颗自填词 → 拦住（写入点也拦，⛔ 不是只在"添加"时拦）',
    AS.validateStyles(['展妆'], custom(SIX.concat(['庚妆']), '浓度')).ok, false)
  eq('★ 正好 6 颗 → 放行', AS.validateStyles(['展妆'], custom(SIX, '浓度')).ok, true)
  eq('★ 而且正好 6 颗时【不会自己撞自己】'
    + '（上限判在"添加"和"写入"两处，⛔ 不是塞进单颗词的闸里 ——'
    + '塞进去的话，校验第 6 颗时它会跟已满的名单撞上）',
    AS.validateStyles([], custom(SIX, '浓度')).ok, true)
  eq('🔴 手改过的数据里混进一颗含「/」的 → 写入点也拦',
    AS.validateStyles(['展妆'], custom('a/b', '浓度')).ok, false)
  eq('★ 校验通过时返回的是【消毒后】的两份',
    AS.validateStyles(['展妆'], custom(' 甲妆 ', '没了')).custom[0].group + '/'
      + AS.validateStyles(['展妆'], custom(' 甲妆 ', '没了')).custom[0].items[0].name,
    AS.GROUP_FALLBACK + '/甲妆')

  // ── V. saveArtist：两个风格通道一起写、别的字段不许碰它们 ───────────
  seed6()
  const sv1 = AS.saveArtist({ style_custom: custom('特效妆', '题材') })
  eq('★ 只写自填通道：预设一个没少',
    sv1.artist.style_text, '建模感 / 展妆 / 浓系 / 特效妆')
  eq('🔴★ 含自填词时 style_text === buildStyleText(style_tags)（规矩 16）',
    sv1.artist.style_text, AS.buildStyleText(sv1.artist.style_tags))
  eq('★ style_custom 真的落库了',
    JSON.parse(store10['zhuangli_artist']).style_custom[0].items[0].name, '特效妆')
  eq('★ 派生字段仍然不落库（style_text 不在 storage 里）',
    'style_text' in JSON.parse(store10['zhuangli_artist']), false)
  /* 🔴🔴 本轮最危险的一格：next 是【逐字段重建】的，漏接一个新字段就是
     「改一次昵称＝她的自填词全没了」，而屏幕上弹的是「已保存」。 */
  const customBefore = JSON.stringify(JSON.parse(store10['zhuangli_artist']).style_custom)
  AS.saveArtist({ nickname: '阿黎' })
  eq('🔴★ 改昵称之后自填词一个字没变（⛔ 不是「改一次昵称＝自填词全没」）',
    JSON.stringify(JSON.parse(store10['zhuangli_artist']).style_custom), customBefore)
  eq('★ 而且它还挂在分享页上', AS.getArtist().style_text.indexOf('特效妆') >= 0, true)
  AS.saveArtist({ city: '北京' })
  eq('★ 改城市也一样（自填词一个字没变）',
    JSON.stringify(JSON.parse(store10['zhuangli_artist']).style_custom), customBefore)
  AS.saveArtist({ intro: '写点东西' })
  eq('★ 改简介也一样', AS.getArtist().style_text, '建模感 / 展妆 / 浓系 / 特效妆')
  /* 🔴🔴 老设计的静默 bug 就栽在这一步：兜底判据原来是「style_tags 是空的」
     而不是「形状不对」，于是这里会去读一个从不落库的 r.style_text（永远 undefined）
     → 返回空 → 她的自填词从分享页上消失。 */
  const sv2 = AS.saveArtist({ style_tags: [] })
  eq('🔴★ 撤掉所有预设词、只留自填词 → 放行（并集不是空的）', sv2.ok, true)
  eq('🔴★ 而且那颗自填词【还在】分享页上（这就是那个静默 bug 的回归断言）',
    sv2.artist.style_text, '特效妆')
  /* ⚠️ 判据要读【storage】，⛔ 不是读 sv2.artist.style_tags —— 后者是
     getArtist() 的展示读模型，那里的 style_tags 是【并集】（= 那颗自填词），
     读它会得出"通道没闭合"的假结论。 */
  eq('🔴 预设通道是【闭合】的：清空之后落库的 style_tags 就是空的，⛔ 不装自填词',
    JSON.parse(store10['zhuangli_artist']).style_tags.length, 0)
  eq('🔴 再把自填也清空 → 拦住（并集空了）',
    AS.saveArtist({ style_custom: [] }).ok, false)
  eq('🔴 拦住时一次都没写（那颗词还在）', AS.getArtist().style_text, '特效妆')
  eq('★ patch 里夹带了垃圾组名 → 归兜底组落库，⛔ 不丢',
    AS.saveArtist({ style_custom: [{ group: '没了', items: [{ name: '甲妆', on: true }] }] })
      .artist.style_text.indexOf('甲妆') >= 0, true)

  // ── V2. getStyleState：编辑页的读模型 ──────────────────────────────
  seed6()
  eq('★ getStyleState：预设就是那三个', AS.getStyleState().presets.join(','), '建模感,浓系,展妆')
  eq('★ getStyleState：自填是空的', AS.getStyleState().custom.length, 0)
  store10['zhuangli_artist'] = JSON.stringify({
    artist_id: 'demo', nickname: '示例', city: '上海',
    style_tags: ['展妆', '自创老词'],
    style_custom: [{ group: '没了', items: [{ name: ' 甲妆 ', on: true }] }],
    intro: ''
  })
  eq('🔴 getStyleState：预设通道的词表外词继续滤掉（⛔ 不搬进自填通道）',
    AS.getStyleState().presets.join(','), '展妆')
  eq('🔴★ getStyleState：认不出的组名归兜底组（她看得见、删得掉）',
    AS.getStyleState().custom[0].group, AS.GROUP_FALLBACK)
  eq('★ getStyleState：自填词的首尾空白 trim 掉了',
    AS.getStyleState().custom[0].items[0].name, '甲妆')
  eq('🔴★ getArtist() 里【没有】style_custom 这个键'
    + '（展示读模型 / 编辑读模型不许混，规矩 16 钉着 7 个键）',
    'style_custom' in AS.getArtist(), false)
  eq('★ 手写的 seed 里 style_custom 是空数组（demo 不自填，提审截图别多出东西）',
    Array.isArray(ARTIST_PUBLIC.style_custom) && ARTIST_PUBLIC.style_custom.length, 0)

  // ── W. 🔴 style-edit 页面级（这一页原先一条页面级测试都没有）────────
  const toasts10 = []
  const back10 = { n: 0 }
  global.wx.showToast = (o) => toasts10.push(o.title)
  global.wx.navigateBack = () => { back10.n++ }
  const loadPage10 = (p) => {
    let cfg = null
    global.Page = (c) => { cfg = c }
    delete require.cache[require.resolve(R('妆历小程序/' + p))]
    require(R('妆历小程序/' + p))
    const pg = {}
    for (const k in cfg) pg[k] = cfg[k]
    /* ⚠️ `cfg.data || {}` 那个兜底是给「一页压根没有 data」用的
       （pages/guest-mine 就是 —— 它两行都是纯跳转，没有任何要渲染的状态）。
       少了它，JSON.stringify(undefined) 回来是 undefined，JSON.parse 当场抛，
       而报错信息是 `"undefined" is not valid JSON` —— 指不到真正的文件。 */
    pg.data = JSON.parse(JSON.stringify(cfg.data || {}))
    pg.setData = function (patch) { for (const k in patch) this.data[k] = patch[k] }
    return pg
  }
  const ev10 = (ds) => ({ currentTarget: { dataset: ds } })
  /* 话术一律从 toast.js 里取，⛔ 不在断言里手抄字符串 ——
     手抄的话，某天改了文案，断言会跟着"改经文"，而它本来该红。 */
  const TOAST10 = require(R('妆历小程序/utils/toast.js')).TOAST

  seed6()
  const sp = loadPage10('pages/style-edit/style-edit.js')
  sp.onLoad()
  eq('★ 进来就是 5 组', sp.data.groups.length, 5)
  eq('★ 勾选态跟 storage 一致（并集，按词表序）', sp.data.picked.join(','), '建模感,展妆,浓系')
  eq('★ 一开始没有输入框开着', sp.data.openGroup, '')

  sp.openAdd(ev10({ group: '题材' }))
  eq('★ 点「＋ 自定义」→ 那一组的输入框开了', sp.data.openGroup, '题材')
  sp.onDraft({ detail: { value: '特效妆' } })
  eq('★ 打字只更草稿', sp.data.draft, '特效妆')
  toasts10.length = 0
  sp.onAdd()
  eq('🔴★ 添加成功 → 落进那一组',
    sp.data.groups.filter((g) => g.custom.length).map((g) => g.group).join(','), '题材')
  eq('★ 添加成功 → 它是选中的', sp.data.picked.join(','), '建模感,展妆,浓系,特效妆')
  eq('🔴★ 添加成功 → 清空草稿 + 收起输入框（键盘跟着落下，底部那颗「保存」才点得到）',
    sp.data.draft + '/' + sp.data.openGroup, '/')
  eq('★ 添加成功不出声（结果就在屏幕上，多一句 toast 反而吵）', toasts10.length, 0)

  /* 点自填词的本体＝勾选，⛔ 不是删（用户当天改过一次的口径）。 */
  sp.onToggleCustom(ev10({ name: '特效妆' }))
  eq('🔴★ 点自填词本体 → 只是取消勾选，⛔ 词还在',
    sp.data.groups.filter((g) => g.custom.length).length + '/' + sp.data.picked.length, '1/3')
  eq('★ 而它也不在并集里了（没选用的词不上分享页）',
    sp.data.picked.indexOf('特效妆'), -1)
  sp.onToggleCustom(ev10({ name: '特效妆' }))
  eq('★ 再点一次 → 又选中了', sp.data.picked.indexOf('特效妆') >= 0, true)

  /* 点 ✕＝删。 */
  sp.onDelCustom(ev10({ name: '特效妆' }))
  eq('🔴★ 点 ✕ → 词没了', sp.data.picked.indexOf('特效妆'), -1)
  eq('★ 那一组空了就整条不出现（⛔ 不留一个空的分组标题）',
    sp.data.groups.filter((g) => g.custom.length).length, 0)
  eq('★ 删完不出声（她按的就是写着 ✕ 的键，意图没有歧义）', toasts10.length, 0)

  /* 🔴 两条草稿护栏：保存 / 换组。共用同一句话。 */
  sp.openAdd(ev10({ group: '浓度' }))
  sp.onDraft({ detail: { value: '没加完的词' } })
  toasts10.length = 0
  back10.n = 0
  const storeBefore10 = store10['zhuangli_artist']
  sp.onSave()
  eq('🔴★ 有草稿时点保存 → 拦住出声', toasts10.length, 1)
  eq('★ 那句话点是哪一组的框', toasts10[0], '「浓度」那个框里还有没加进来的词，先点「添加」或「丢掉」')
  eq('🔴★ 而且【一次 storage 都没写】（⛔ 不许先存了再说）',
    store10['zhuangli_artist'], storeBefore10)
  eq('🔴★ 也不退出这一页（那等于把框里的字一起丢了）', back10.n, 0)
  toasts10.length = 0
  sp.openAdd(ev10({ group: '题材' }))
  eq('🔴★ 有草稿时换组 → 同样拦住出声（和上面【同一句话】）',
    toasts10.length + '/' + sp.data.openGroup, '1/浓度')
  eq('★ 点「丢掉」→ 干净收起（静默：键名就是意图）',
    (() => { toasts10.length = 0; sp.dropDraft(); return sp.data.draft + '/' + sp.data.openGroup + '/' + toasts10.length })(),
    '//0')

  /* 空草稿点「添加」→ 出声（⛔ 不是静默什么都不做，那是"点了没反应"的变体）。
     ⚠️ 上面那颗「丢掉」真把词丢了、也把框收掉了，所以先重开这一组 ——
        空着框点「添加」正是要测的那条路。 */
  sp.openAdd(ev10({ group: '浓度' }))
  toasts10.length = 0
  sp.onAdd()
  eq('★ 空草稿点「添加」→ 出声，⛔ 不是静默', toasts10.join(','), '先打个词再加进来')
  eq('★ 而且它也不把输入框收起来（她还得接着打）', sp.data.openGroup, '浓度')

  /* 正常保存：落库 + 出声 + 退回资料页。
     ⚠️ ⛔ 这里【不许】再调一次 openAdd —— 框此刻正开着（上一句刚开），
        再点一下是【收起】（openAdd 是开关），草稿会落到兜底组里去。 */
  sp.onDraft({ detail: { value: '没加完的词' } })
  sp.onAdd()
  eq('★ 加完这一颗，输入框又收起来了', sp.data.openGroup, '')
  toasts10.length = 0
  sp.onSave()
  eq('🔴★ 保存成功 → 退回资料页（那一页的 onShow 会重读 storage）', back10.n, 1)
  eq('★ 落库的是并集', AS.getArtist().style_text, '建模感 / 展妆 / 浓系 / 没加完的词')
  eq('★ getStyleState 读回来的自填词挂在刚才那一组',
    AS.getStyleState().custom[0].group, '浓度')

  // ── W2. style-edit 的源码级硬约束 ──────────────────────────────────
  eq('🔴★ ✕ 挂的是 catchtap，⛔ 不是 bindtap（父节点也在监听，bindtap 会冒泡成"又勾选又删"）',
    /class="cx"[\s\S]{0,80}catchtap="onDelCustom"/.test(styleWxml), true)
  eq('🔴★ 预设词那一支里【没有】✕ 节点（系统设定的词不能删）',
    /wx:for="\{\{g\.items\}\}"[\s\S]*?wx:for="\{\{g\.custom\}\}"/.test(styleWxml) &&
    !/cx/.test(styleWxml.slice(styleWxml.indexOf('g.items'), styleWxml.indexOf('g.custom'))), true)
  eq('🔴★ 输入框【不带】maxlength（这一页没有计数器，加了就是静默截断）',
    /<input[^>]*addip[^>]*\/>/.test(styleWxml) &&
    !/<input[^>]*maxlength/.test(styleWxml), true)
  eq('★ 键盘上的「完成」＝添加（⛔ 不许让它什么都不做）',
    /bindconfirm="onAdd"/.test(styleWxml), true)
  eq('🔴★ 这一页的 setData 只有一处（paint）—— 没有哪条分支能把视图留在旧值上',
    (styleJs.match(/setData\(/g) || []).length, 1)
  eq('🔴★ 而 toStyleView 也只被调一次（就在 paint 里）',
    (styleJs.match(/toStyleView\(/g) || []).length, 1)
  eq('🔴★ onSave 里的草稿检查【排在 saveArtist 之前】',
    styleJs.indexOf('draftBlocked') < styleJs.indexOf('saveArtist('), true)
  eq('🔴 每个 bindtap / catchtap 都有同名处理函数'
    + '（拼错一个就是"点了没反应"，这个项目被坑过四轮）',
    (styleWxml.match(/(?:bind|catch)tap="([^"]+)"/g) || [])
      .map((s) => s.replace(/(?:bind|catch)tap="([^"]+)"/, '$1'))
      .filter((n) => !new RegExp('\\b' + n + '\\b\\s*:').test(styleJs)), [])
  eq('★ 页面里不出现字面量的「其他」（兜底组名住在 store 里）',
    styleJs.indexOf('其他') >= 0 || styleWxml.indexOf('其他') >= 0, false)
  /* 🔴 Request O 第二轮把 hover-stop-propagation 从全项目删掉了
     （「换来的只是观感」），这一轮新加的键也不许把它带回来。 */
  eq('🔴★ 全项目不再出现 hover-stop-propagation',
    ['pages/style-edit/style-edit.wxml', 'pages/mine/mine.wxml']
      .filter((p) => /hover-stop-propagation/.test(
        fs.readFileSync(R('妆历小程序/' + p), 'utf8'))), [])
  /* 🔴 顾客端【不加】按风格搜索/筛选 —— 用户明确说了「顾客搜不着就搜不着吧」。
     这一条钉的是"别去补上"：landing（C1）的源码里不许出现风格词表的用法。 */
  eq('🔴★ 顾客端 C1 仍然不许按风格词筛人（用户明确不要，⛔ 不是漏了）',
    /STYLE_GROUPS|style_tags/.test(
      stripJs(fs.readFileSync(R('妆历小程序/pages/landing/landing.js'), 'utf8'))), false)
  /* 规矩 27：同一份来源喂两个端 —— booking-form 也在用 STYLE_GROUPS，
     但那是【顾客端的目标妆感】，⛔ 不含妆娘的自填词。这里有断言钉死它
     仍然只 require 预设词表、不去读妆娘的 storage。

     🔴 2026-10-01（第二十二处）：判据从「这个文件里不许出现 artistStore 这个词」
        改成「不许读妆娘的**资料**」。为什么必须换（规矩 31：改机制，⛔ 不是删断言）：
        第二十二处顾客那一支要按 schedule_id 找**任意一位**妆娘的档期
        ⇒ 它现在**正当**地 require 了 artistStore 的 `scheduleById`。
        旧判据是拿"引了哪个模块"当"读没读资料"的替身，替身在那一刻失效了。
        ⚠️ 要保的性质一个字没变：妆娘自填的风格词⛔ 不上顾客这一屏
           （用户 2026-09-30 定的「顾客搜不着就搜不着吧」）。
        ⚠️ 而它**确实**要读档期 —— 那是另一个东西（档期 ≠ 资料），
           下面 AB2 那 14 次走查就是它的看门人。 */
  eq('🔴★ booking-form（顾客端妆感 chips）不读妆娘资料（那些自填词不上顾客那一屏）',
    /getStyleState|style_custom|getArtist\(|getArtistById|ARTIST_PUBLIC|style_text/.test(
      stripJs(fs.readFileSync(R('妆历小程序/pages/booking-form/booking-form.js'), 'utf8'))), false)
  eq('★ 非平凡：它确实读了档期（不然上一条是"这个文件什么都没干"式的空断言）',
    /scheduleById/.test(stripJs(fs.readFileSync(
      R('妆历小程序/pages/booking-form/booking-form.js'), 'utf8'))), true)

  /* ════════════════════════════════════════════════════════════════════
     X. 第十九处 · 头像（人像标识 + 自选底色）

     用户原话：「我测试了一遍，输入中文显示第一个字，输入英文显示首字母，
               输入表情符号显示一个菱形里面有问号，我觉得头像可以直接使用
               人像标识，妆师点一下头像可以选头像颜色」
     🔴 那句「菱形里面一个问号」是个**真 bug**：头像位原先渲染
        `nickname.slice(0, 1)`，而 emoji 是代理对，slice 会把它劈成半个字符。
        换成「和昵称无关的一张脸」之后，这类输入问题从根上没有了 ——
        这是"改设计顺手消灭一类 bug"的典型，⛔ 别只当成换了个样式。
     ════════════════════════════════════════════════════════════════════ */
  const wxssSrc = fs.readFileSync(R('妆历小程序/app.wxss'), 'utf8')

  /* 颜色令牌 ↔ CSS 规则【双向】比。少一条规则 = 那颗色点画出来是透明底
     （白脑袋白肩膀贴在白卡片上 = 什么都没画）；多一条规则 = 死样式。 */
  const cssTokens = (wxssSrc.match(/\.c-([a-z]+)\s*\{/g) || [])
    .map((s) => s.replace(/\.c-([a-z]+)\s*\{/, '$1')).sort()
  eq('🔴★ 每一个颜色令牌在 app.wxss 里都有规则（少一条 = 画出来是透明底）',
    AS.AVATAR_COLORS.slice().sort().join(','), cssTokens.join(','))
  eq('🔴★ 也没有多余的 .c-* 死样式（多一条 = 有人加了令牌没登记）',
    cssTokens.filter((t) => AS.AVATAR_COLORS.indexOf(t) < 0), [])

  /* 🔴 兜底背景和默认色那条规则必须【逐字一样】。
     它们是同一个渐变、刻意写了两遍（兜底那份挡的是「某个 wxml 漏了 c-」），
     而写两遍的东西迟早分家 —— 这条断言就是那个"迟早"的拦截网。 */
  const bgOf = (sel) => {
    const m = wxssSrc.match(new RegExp(sel.replace(/\./g, '\\.') + '\\{([^}]*)\\}'))
    const g = m ? m[1].match(/background:([^;}]+)/) : null
    return g ? g[1].trim() : ''
  }
  eq('🔴★ `.ava` 的兜底背景 === `.c-' + AS.AVATAR_COLOR_DEFAULT + '` 的背景（写了两遍，就不会分家）',
    bgOf('.ava'), bgOf('.ava.c-' + AS.AVATAR_COLOR_DEFAULT))
  eq('★ 兜底那条确实是个背景（不是比空字符串空对空）', bgOf('.ava').length > 10, true)

  /* 人像是纯 CSS 画的：⛔ 没有第二个实现（没有图片、没有字体、没有组件）。 */
  eq('🔴★ `.ava` 有 overflow:hidden（肩膀是故意画到圆外的，靠它裁成圆弧）',
    /\.ava\{[^}]*overflow:hidden/.test(wxssSrc), true)
  eq('🔴★ 人像就是 ::before（脑袋）+ ::after（肩膀）两笔，没有别的实现',
    /\.ava::before\{[^}]*border-radius:50%/.test(wxssSrc) &&
    /\.ava::after\{[^}]*border-radius:50% 50% 0 0/.test(wxssSrc), true)
  eq('🔴★ 全项目没有为头像引进任何图片资源（零 UGC、零审核风险）',
    /\.ava[^{]*\{[^}]*url\(/.test(wxssSrc), false)

  /* ── X2. 「我的」页：卡片合并 + 换色 + 删关于妆历 + 新增反馈 ── */
  const mineWxml19 = stripHtml(fs.readFileSync(R('妆历小程序/pages/mine/mine.wxml'), 'utf8'))
  const mineJs19 = stripJs(fs.readFileSync(R('妆历小程序/pages/mine/mine.js'), 'utf8'))
  const setWxml19 = stripHtml(fs.readFileSync(R('妆历小程序/pages/settings/settings.wxml'), 'utf8'))
  const setJs19 = stripJs(fs.readFileSync(R('妆历小程序/pages/settings/settings.js'), 'utf8'))

  /* 🔴 整张卡是「我的资料」的入口。⛔ 不许改成「只有框的右边能点」——
     那样框里会留出一大片「看着像按钮、点下去是卡片」的空白，
     正是这个项目栽过三轮的形状（README 第 21 条 / Request N·O）。 */
  eq('🔴★ 整张资料卡就是「我的资料」的入口（⛔ 不是只有右边一小块）',
    /class="card tight row"[^>]*bindtap="goProfile"/.test(mineWxml19), true)
  /* 🔴 头像是卡里唯一的子键 ⇒ 必须 catchtap。用 bindtap 会冒泡成
     「又进资料页又开调色板」——两个动作同时发生，而且**都不会报错**。 */
  eq('🔴★ 头像用 catchtap（父卡片是 bindtap，用 bindtap 会冒泡成两个动作一起发生）',
    /class="ava sm c-\{\{artist\.avatar_color\}\}"\s+catchtap="toggleColors"/.test(mineWxml19), true)
  eq('🔴★ 卡里除了头像没有第二个手势（再加一个就是上面那条的翻版）',
    (mineWxml19.match(/class="card tight row"[\s\S]*?<\/view>\s*<\/view>/) || [''])[0]
      .match(/(?:bind|catch)tap="/g).length, 2)
  eq('★ 卡片右侧带「›」（下面每一行 cell 都有，卡片不带就不像能点）',
    /class="cr">›<\/text>/.test(mineWxml19), true)

  /* 调色板：6 颗色点，每颗都是【小号头像】（同一个 .ava + 同一个令牌类），
     ⛔ 不是另写一套背景色 —— 色值只有一份。 */
  eq('🔴★ 调色板用 wx:for 铺 AVATAR_COLORS（⛔ 不手抄 6 个色点）',
    /wx:for="\{\{colors\}\}"[\s\S]{0,200}?data-token="\{\{item\}\}"/.test(mineWxml19), true)
  eq('🔴★ 色点就是小号头像（挂 .ava + .c-{{item}}），⛔ 没有第二套背景色',
    /class="ava pal-dot c-\{\{item\}\}/.test(mineWxml19), true)
  eq('★ 当前色那颗带 .on（她一眼看得出现在是哪个）',
    /\{\{item === artist\.avatar_color \? 'on' : ''\}\}/.test(mineWxml19), true)

  eq('🔴★「关于妆历」已从「我的」页删掉（用户原话：设置里面有，不需要重复出现）',
    mineWxml19.indexOf('关于妆历'), -1)
  eq('🔴★ goAbout 也一起删了（⛔ 不留没用的死代码）', /\bgoAbout\b/.test(mineJs19), false)
  eq('★ 但设置页那一行【还在】—— 删的是重复入口，⛔ 不是删功能',
    setWxml19.indexOf('关于妆历') > 0 && /\bgoAbout\b/.test(setJs19), true)
  eq('★「关于妆历」全项目只剩设置页这一处入口',
    ['pages/mine/mine.wxml', 'pages/settings/settings.wxml']
      .filter((p) => stripHtml(fs.readFileSync(R('妆历小程序/' + p), 'utf8')).indexOf('关于妆历') >= 0)
      .join(','), 'pages/settings/settings.wxml')

  eq('🔴★「问题反馈」这一行跳得动（⛔ 不是弹一句 toast 顶替）',
    /class="cell"[^>]*bindtap="goFeedback"/.test(mineWxml19) &&
    /navigateTo\(\{ url: '\/pages\/feedback\/feedback' \}\)/.test(mineJs19), true)

  // ── X3. 「我的」页的页面级行为（打桩 wx + Page）──
  const toasts10b = toasts10
  const minePage = loadPage10('pages/mine/mine.js')
  minePage.onShow()
  eq('★「我的」页 onShow 灌的是 getArtist()（⛔ 不是手写的）',
    minePage.data.artist.nickname, AS.getArtist().nickname)
  eq('🔴★ 头像底色从 storage 来', minePage.data.artist.avatar_color, AS.getArtist().avatar_color)
  eq('★ 调色板的 6 颗色点来自 store 常量（⛔ 页面不自己列）',
    minePage.data.colors.join(','), AS.AVATAR_COLORS.join(','))
  eq('★ 进页面时调色板是收着的', minePage.data.colorsOpen, false)
  minePage.toggleColors()
  eq('★ 点头像 → 展开', minePage.data.colorsOpen, true)
  minePage.toggleColors()
  eq('★ 再点一下 → 收起（它是个开关，⛔ 不是"打开"）', minePage.data.colorsOpen, false)

  // 换色：真落库 + 卡片当场变色 + 面板不收起（她要挨个试）
  toasts10.length = 0
  minePage.toggleColors()
  minePage.pickColor(ev10({ token: 'plum' }))
  eq('🔴★ 换色【当场落库】（一次点击一次写入，没有第二个要提交的字段）',
    JSON.parse(store10['zhuangli_artist']).avatar_color, 'plum')
  eq('★ 卡片头像跟着变色', minePage.data.artist.avatar_color, 'plum')
  eq('★ 选完不收起面板（6 颗色点就在眼前，她要挨个试）', minePage.data.colorsOpen, true)
  eq('★ 成功时【不出声】（变色本身就是证据，连点 6 下弹 6 个 toast 是噪声）',
    toasts10.length, 0)
  /* 🔴🔴 这一条钉的是最阴的一种失败：setStorageSync 静默失败。
     不重新读一遍 storage 的话，页面会显示新色、storage 里还是旧色，
     下次进来又变回去 —— 而中间没有任何信号。 */
  toasts10.length = 0
  const realSet = global.wx.setStorageSync
  global.wx.setStorageSync = () => {}   // 假装写进去了，其实没写
  minePage.pickColor(ev10({ token: 'blue' }))
  eq('🔴★ storage 静默失败时【必须出声】（⛔ 不许"点了颜色、什么都没变、也没一句话"）',
    toasts10.join(','), TOAST10.SAVE_FAILED)
  eq('★ 而且卡片不会谎报成蓝色（页面只画 storage 里真有的那个）',
    minePage.data.artist.avatar_color, 'plum')
  global.wx.setStorageSync = realSet
  // 复位，免得影响后面的断言
  AS.saveArtist({ avatar_color: 'rose' })
  minePage.onShow()

  /* ── Y. 第十九处 · 问题反馈（第一条真的会写云端的通道）── */
  const FB = require(R('妆历小程序/utils/feedbackStore.js'))
  const Cloud = require(R('妆历小程序/utils/cloud.js'))

  // Y1. 纯函数校验
  eq('★ 空的拦住', FB.validateFeedback('').ok, false)
  eq('★ 全是空格的也拦住（先 trim）', FB.validateFeedback('   \n  ').ok, false)
  eq('★ 喂 undefined 也拦住', FB.validateFeedback(undefined).ok, false)
  eq('★ 拦住时的话是 store 给的（⛔ 页面不自己拼）',
    FB.validateFeedback('').error, TOAST10.FEEDBACK_EMPTY)
  eq('★ 正常的一句话放行', FB.validateFeedback('午休那行我总选错').ok, true)
  eq('🔴★ 首尾空白 trim 掉（⛔ 不让开发者收到一条全是空白的反馈）',
    FB.validateFeedback('  有内容  ').value, '有内容')
  eq('★ 中间的空行【保留】（那是她分的段，不是噪声）',
    FB.validateFeedback('第一段\n\n第二段').value, '第一段\n\n第二段')
  eq('★ 正好 500 字放行', FB.validateFeedback('一'.repeat(FB.FEEDBACK_MAX)).ok, true)
  eq('★ 501 字拦住', FB.validateFeedback('一'.repeat(FB.FEEDBACK_MAX + 1)).ok, false)
  eq('★ 超长的话术里点了字数（N 被填成真实值）',
    FB.validateFeedback('一'.repeat(501)).error.indexOf('501') > 0, true)

  // Y2. 上限只有一个来源（wxml 的 maxlength 和计数器都绑它）
  const fbWxml = stripHtml(fs.readFileSync(R('妆历小程序/pages/feedback/feedback.wxml'), 'utf8'))
  const fbJs = stripJs(fs.readFileSync(R('妆历小程序/pages/feedback/feedback.js'), 'utf8'))
  eq('🔴★ textarea 的 maxlength 绑的是 {{max}}（⛔ 不是字面量 —— 有计数器的地方才敢用 maxlength）',
    /<textarea[^>]*maxlength="\{\{max\}\}"/.test(fbWxml), true)
  eq('🔴★ 页面上不出现第二个字体上限数字',
    /500/.test(fbWxml) || /500/.test(fbJs), false)
  eq('★ 计数器读的也是同一个 max',
    /\{\{max\}\}/.test(fbWxml) && /max: FEEDBACK_MAX/.test(fbJs), true)

  /* 🔴 「确认反馈」在【导航栏右侧】，⛔ 不在底部 .footbar ——
     下面的 textarea 一聚焦，键盘从底部升起来，正好压住 .footbar。
     这是「点了没反应」的第 5 种长相（intro-edit 的注释里写了完整理由）。 */
  eq('🔴★「确认反馈」在导航栏右侧（⛔ 不被键盘盖住的底部条）',
    /slot="right"[\s\S]{0,120}确认反馈/.test(fbWxml) && fbWxml.indexOf('footbar'), -1)
  eq('★ 按钮文案就是用户说的那四个字', fbWxml.indexOf('确认反馈') > 0, true)
  eq('🔴 ⛔ 全页没有 wx.hideKeyboard()（规矩 20：这一页真有键盘，最容易顺手加上）',
    /hideKeyboard/.test(fbJs), false)
  eq('🔴 每个 bindtap 都有同名处理函数（拼错了就是"点了没反应"）',
    (fbWxml.match(/bindtap="([^"]+)"/g) || [])
      .map((s) => s.replace(/bindtap="([^"]+)"/, '$1'))
      .filter((n) => !new RegExp('\\b' + n + '\\b\\s*:').test(fbJs)), [])
  eq('★ feedback 页只有 .js + .wxml（样式全在 app.wxss，同 settings / intro-edit）',
    fs.readdirSync(R('妆历小程序/pages/feedback')).sort().join(','), 'feedback.js,feedback.wxml')

  /* 🔴🔴 云环境【配没配】两种状态都必须绿，而且两种状态各自只有一种正确答案：
     配了 = 真的 .add() 一次；没配 = 一次都不发 + 当场出声。
     ⚠️ 这不是"分支测试的偷懒"—— 它钉的正是「环境配没配都不能静默」。
        用户把环境 ID 填上之后，这一段的期望值会自动翻到另一半，仍然在保同一件事。 */
  const fbCalls = []
  /* ⚠️ 这个桩的 add() 返回一个**同步 thenable**（.then 当场回调），
     于是整套自测仍然是直线脚本，⛔ 不用把整段改成 async（改了整个文件的
     收尾汇总就会跑在断言之前）。代价：它不检验"真的等到了" —— 那件事由
     wx.cloud 自己保证，不在我们这一层。 */
  const cloudStub = (mode) => (mode === 'ok'
    ? { then: (ok) => { ok({ _id: 'x' }); return { catch: () => {} } } }
    : { then: () => ({ catch: (bad) => { bad({}) } }) })
  global.wx.cloud = {
    init: () => {},
    database: () => ({
      collection: (name) => ({
        add: (o) => { fbCalls.push({ name: name, data: o.data }); return cloudStub('ok') }
      }),
      serverDate: () => 'SERVER_DATE'
    })
  }
  const cfgNow = Cloud.isConfigured()
  eq('★ CLOUD_ENV 是空的还是填好的，isConfigured 都给一个布尔（⛔ 不靠侧面猜）',
    typeof cfgNow, 'boolean')

  const errBak = console.error
  console.error = () => {}   // 没配环境时那条给开发者看的 error，别混进自测输出
  let fbRes = null
  FB.submitFeedback('午休那行我总选错', (r) => { fbRes = r })
  console.error = errBak
  if (cfgNow) {
    eq('🔴★ 云环境配好了 → 真的往 feedback 集合 .add() 了一次', fbCalls.length, 1)
    eq('★ 写入的是 feedback 集合（⛔ 不是别的集合名）', fbCalls[0].name, 'feedback')
    eq('★ 只写正文 + 服务端时间（⛔ 不收集任何联系方式）',
      Object.keys(fbCalls[0].data).sort().join(','), 'created_at,text')
    eq('🔴★ 时间用的是服务端时间（⛔ 不是设备时间 —— 那可以被用户改）',
      fbCalls[0].data.created_at, 'SERVER_DATE')
    eq('★ 发出去了 → ok', fbRes.ok, true)
  } else {
    eq('🔴★ 云环境没配 → 【一次都没发】(⛔ 不许假装成功)', fbCalls.length, 0)
    eq('🔴★ 而且当场返回失败 + 一句话（⛔ 不是"按了确认、什么都没发生"）',
      fbRes.ok, false)
    eq('★ 那句话是 toast.js 里那句（⛔ 不现场拼）', fbRes.error, TOAST10.FEEDBACK_FAILED)
  }
  // 校验不过时【连云都不碰】—— 判据在 store，不依赖页面
  fbCalls.length = 0
  FB.submitFeedback('   ', (r) => { fbRes = r })
  eq('🔴★ 空反馈不碰云端（校验在 store 里，⛔ 不靠页面拦）', fbCalls.length, 0)
  eq('★ 空反馈返回的是校验那句话', fbRes.error, TOAST10.FEEDBACK_EMPTY)

  // Y3. 云端写入失败 → 出声（⛔ 不静默）
  if (cfgNow) {
    const okDb = global.wx.cloud.database
    global.wx.cloud.database = () => ({
      collection: () => ({ add: () => cloudStub('fail') }),
      serverDate: () => 'SERVER_DATE'
    })
    let failRes = null
    FB.submitFeedback('有内容', (r) => { failRes = r })
    eq('🔴★ 云端写失败 → ok:false（⛔ 不静默吞掉）', failRes.ok, false)
    eq('★ 失败也是 toast.js 里那句话', failRes.error, TOAST10.FEEDBACK_FAILED)
    global.wx.cloud.database = okDb
  }

  // Y4. 反馈页的页面级行为
  /* ⚠️ back10 是【跨小节共用】的计数器（style-edit 那边已经用过一次），
     这里必须清零再断 —— 不清的话「也不退页」会被上一节的 1 顶掉，
     看着像失败、其实是脏数据。 */
  back10.n = 0
  const fbPage = loadPage10('pages/feedback/feedback.js')
  eq('★ 页面的 max 就是 store 的上限（一处实现）', fbPage.data.max, FB.FEEDBACK_MAX)
  eq('★ 一进来文本框是空的、不发送', fbPage.data.text + '/' + fbPage.data.sending, '/false')
  fbPage.onInput({ detail: { value: '午休那一行' } })
  eq('★ 打字时计数器跟着走', fbPage.data.len, 5)

  toasts10.length = 0
  let loadings = 0
  const realLoading = global.wx.showLoading
  global.wx.showLoading = () => { loadings++ }
  global.wx.hideLoading = () => {}
  fbCalls.length = 0
  fbPage.data.text = '   '
  fbPage.onSubmit()
  eq('🔴★ 空着点「确认反馈」→ 出声（⛔ 不是静默）',
    toasts10.join(','), TOAST10.FEEDBACK_EMPTY)
  eq('★ 而且连 loading 都不弹（为一次误触闪一下"正在发送"看着像网络问题）', loadings, 0)
  eq('★ 也不碰云端', fbCalls.length, 0)
  eq('★ 也不退页（她就站在原页，字还在）', back10.n, 0)

  /* 🔴 连点两下只发一条：守卫要在【发送途中】才起作用 ——
     所以这一条必须让 add 一直不返回（挂起），否则第一次早就完成了。 */
  global.wx.cloud.database = () => ({
    collection: () => ({ add: () => { fbCalls.push({ name: 'feedback', data: {} }); return { then: () => ({ catch: () => {} }) } } }),
    serverDate: () => 'SERVER_DATE'
  })
  fbCalls.length = 0
  loadings = 0
  fbPage.data.text = '有内容'
  fbPage.data.sending = false
  fbPage.onSubmit()
  fbPage.onSubmit()
  fbPage.onSubmit()
  eq('🔴★ 发送途中连点三下 → 只发一条（⛔ 不靠"页面没反应"挡手指）',
    fbCalls.length, cfgNow ? 1 : 0)
  eq('★ 每次真的进发送都会弹「正在发送」（她看得见在发生什么）', loadings >= 1, true)
  /* ⚠️ 「只弹了一次 loading」这一条只在【第一下还挂在途中】时成立：
     没配环境时第一下当场就返回失败了（sending 被复位），后两下各自再走一遍
     —— **那是对的行为**，不是守卫失灵。所以这一条按状态分。 */
  if (cfgNow) eq('★ 发送途中那两下连 loading 都没弹（守卫真的挡住了）', loadings, 1)
  eq('★ 而且加了 mask（这段时间她点不动页面，比"点了没反应"诚实）',
    /mask: true/.test(fbJs), true)

  // 成功那条路：发出去 → 退回上一页
  fbPage.data.sending = false
  back10.n = 0
  toasts10.length = 0
  global.wx.cloud.database = () => ({
    collection: () => ({ add: (o) => { fbCalls.push({ name: 'feedback', data: o.data }); return cloudStub('ok') } }),
    serverDate: () => 'SERVER_DATE'
  })
  fbPage.data.text = '有内容'
  if (cfgNow) {
    fbPage.onSubmit()
    eq('🔴★ 发成功 → 退回「我的」页（那一页的 onShow 会重读）', back10.n, 1)
    eq('★ 而且出了声（TOAST.FEEDBACK_SENT）', toasts10.join(','), TOAST10.FEEDBACK_SENT)
    eq('★ 复位了 sending（她要是再进来一次不该被上一轮的守卫卡住）',
      fbPage.data.sending, false)
  } else {
    // 没配环境：同样的动作必须【不退页 + 出声】，把字留在原地
    fbPage.onSubmit()
    eq('🔴★ 没配环境时【不退页】（退了等于把她刚打的一段话一起丢掉）', back10.n, 0)
    eq('★ 而且出声说没发出去', toasts10.join(','), TOAST10.FEEDBACK_FAILED)
    eq('★ 文本框里的字还在', fbPage.data.text, '有内容')
  }
  global.wx.showLoading = realLoading

  /* ── Z. 云开发的配置面（这一块是给"别把密钥写进去"兜底的）── */
  const cloudSrc = fs.readFileSync(R('妆历小程序/utils/cloud.js'), 'utf8')
  /* 🔴 查源码之前【必须先摘注释】—— 这一条我自己又栽了一次：
     cloud.js 的注释里就写着「⛔ 别在这里写 AppSecret」，那是**警告**，
     不摘注释等于对着自己的警告下结论，永远红。
     （同 ⑨ 段 ARTIST_CONTACT 那条的教训，规矩 27 旁边的老话。） */
  eq('🔴★ cloud.js 里⛔ 没有任何密钥字样（这个文件会进代码仓库 + 可被解包）',
    /secret|Secret|api_key|apiKey|privateKey/.test(stripJs(cloudSrc)), false)
  /* ⚠️ 判据是「别处不许**定义**它」，⛔ 不是「别处不许**提到**它」——
     feedbackStore 的那句 console.error 里就写着 CLOUD_ENV（那是给出错的人
     指路的话），把它也算成"第二处"就变成了一句假断言。 */
  eq('★ 环境 ID 只在这一个文件里定义（⛔ 别处不许再 const 一份）',
    stripJs(cloudSrc).indexOf('const CLOUD_ENV') >= 0 &&
    ['pages/feedback/feedback.js', 'app.js', 'utils/feedbackStore.js']
      .filter((p) => /(const|let|var)\s+CLOUD_ENV/.test(
        stripJs(fs.readFileSync(R('妆历小程序/' + p), 'utf8'))))
      .join(','), '')
  eq('🔴★ app.js 里【没有】写死环境 ID 字面量（它在 cloud.js 一处持有）',
    /env:\s*'/.test(stripJs(fs.readFileSync(R('妆历小程序/app.js'), 'utf8'))), false)

  const appJson19 = JSON.parse(fs.readFileSync(R('妆历小程序/app.json'), 'utf8'))
  eq('🔴 app.json 的 pages 是 18 项（第二十一处删 guest-home + 加 guest-mine，一进一出）',
    appJson19.pages.length, 18)
  eq('★ feedback 页已注册（没注册 = 跳过去白屏）',
    appJson19.pages.indexOf('pages/feedback/feedback') >= 0, true)
  eq('🔴★ 约妆端 tab 1 已注册（没注册 = 底部条点过去白屏）',
    appJson19.pages.indexOf('pages/artist-list/artist-list') >= 0, true)
  eq('🔴★ 约妆端 tab 2 已注册（同上）',
    appJson19.pages.indexOf('pages/guest-mine/guest-mine') >= 0, true)
  /* ⚠️ 新页只有 .js + .wxml —— 样式全在 app.wxss（照 settings / feedback 的先例）。 */
  eq('🔴★ artist-list 页只有 .js + .wxml（样式全在 app.wxss）',
    fs.readdirSync(R('妆历小程序/pages/artist-list')).sort().join(','),
    'artist-list.js,artist-list.wxml')

  /* ════════════════════════════════════════════════════════════════════
     AA. 「我约过的妆娘」这一层（第二十处第 ①②步）
     ════════════════════════════════════════════════════════════════════
     🔴 这一整块在第二十处之前**一条断言的落点都没有** —— `utils/myArtists.js`
        和 `pages/artist-list/` 都是新文件，但它们要保的那条性质
        （**列表长度 = 我自己约过几个人**）是全项目最容易被"顺手"改坏的一条：
        改坏的方向只有一个 —— 读 ARTIST_DIRECTORY ⇒ 那就是一份**人肉目录**，
        红线 1（README §3.7）。改了不会报错、页面还更好看，所以必须钉死。

     ⚠️ 下面每一条都用 `rows.length` / `rows[0]` 现算，⛔ 不写死「3 位」之外的
        名字和城市：写死的话，某天有人动了一次示例数据，断言会跟着"改经文"，
        而它本来该红。写死的只有**行数**这一个数 —— 因为"演示数据自洽"这件事
        本身就是要钉的（3 位妆娘、每位都有一条"我约过她"的单）。 */
  restoreBookings()   // ⚠️ 上面的代填测试会往 BOOKINGS 里塞单，先还原
  const MY = require(R('妆历小程序/utils/myArtists.js'))
  const myRows = MY.listMyArtists()
  eq('🔴★ 列表长度 = 我自己约过几个人（3 位；⛔ 不是"目录里有几个人"）',
    myRows.length, 3)
  /* 🔴 这是这一块的**核心断言**（规矩 36）：列表里每一位，都要有一条
     `created_by === 'user'` 的单撑着她。⛔ 一个都少不得 ——
     演示数据里出现一个"没约过却在列表上"的人，就是把这一页演示成了目录。 */
  eq('🔴★ 每一位都真的有「我约过她」的单（⛔ 演示数据也不许出现没约过的人）',
    myRows.filter((r) =>
      !MY.myBookings().some((b) => (b.artist_id || 'demo') === r.id)), [])
  /* ⚠️ 反向也钉一下：行数必须**正好等于**「我那些单里去重后的妆娘数」——
     正向那条只能抓住"多出来的人"，抓不住"少了一个人"
     （比如某个兜底把 artist_id 读丢了，两组人并成一组）。 */
  eq('★ 反过来也不许少：行数 === 我那些单里去重后的妆娘数（同一份判据算出来的）',
    myRows.length, (() => {
      const seen = {}
      MY.myBookings().forEach((b) => { seen[b.artist_id || 'demo'] = 1 })
      return Object.keys(seen).length
    })())
  /* 🔴 2026-10-01（第二十一处）：这里原先有两条断言钉着 `myArtistsBrief()`
     —— 「首页那张卡说的人数 === 列表行数」「首页说最近约的是 X ⇒ 列表第一行就是 X」。
     首页整页退役、那张卡连同 `myArtistsBrief()` 一起删了，所以**断言也跟着走**
     （规矩 31：判据的载体消失了，就换成钉「它确实不在了」，
     ⛔ 不是把断言删掉了事 —— 删掉的话，将来谁把 myArtistsBrief 加回来、
     再在别处显示一个"共约过 N 位"的概览，就永远没人红）。
     ⚠️ 这里换个**反向断言**：那个函数必须已经不存在了。 */
  eq('🔴★ myArtistsBrief 已随约妆首页一起删掉（⛔ 不留死代码、⛔ 别再加回来）',
    typeof MY.myArtistsBrief, 'undefined')
  eq('★ 而且它导出的那份清单里也没有它（⛔ 不是只从函数体里删了）',
    Object.keys(MY).filter((k) => k === 'myArtistsBrief'), [])
  /* 排序本身也独立算一次来比（⛔ 不是调 byRecent —— 那是拿自己证明自己）。 */
  eq('★ 最近下过单的那位排第一',
    myRows[0].id, (() => {
      const bs = MY.myBookings().slice().sort((a, b) =>
        String(a.created_at || '') < String(b.created_at || '') ? 1 : -1)
      return bs[0].artist_id || 'demo'
    })())
  /* 每行的「约过几次」也得是真的次数 —— 数错了不会报错，
     只会在页面上安静地写一个「约过 2 次」。 */
  eq('★ 每行的「约过几次」= 那一行对应的真单数',
    myRows.filter((r) =>
      r.count !== MY.myBookings().filter((b) => (b.artist_id || 'demo') === r.id).length), [])
  /* 🔴 头像令牌必须跟着行一起出来，而且字段名是 `avatar_color`（⛔ 不是 `color`）。
     这一页要写成 `c-{{artist.avatar_color}}`，和另外四处**逐字一样** ——
     名不对的话 `.c-*` 选不中 ⇒ 一个透明底的头像贴在白卡片上，
     屏幕上一句话都不解释（第十九处那类静默渲染失败）。 */
  eq('🔴★ 每一行都带着头像颜色令牌（⛔ 字段名必须是 avatar_color）',
    myRows.filter((r) => !r.avatar_color).length, 0)
  /* lastText：缺字段的**直接不占位**，⛔ 不许把 undefined 落到页面上。 */
  eq('🔴★ 缺 event / date / status 时不留占位符（⛔ 不是「undefined · 2026-05-02」）',
    MY.lastText({ event: '青蓝漫展', date: '', status: '' }), '青蓝漫展')
  eq('★ 全缺 → 空串（这一行就只剩昵称，比写一串 undefined 诚实）', MY.lastText({}), '')
  eq('★ 喂 null 也不炸', MY.lastText(null), '')

  /* ── 搜索判据：只认昵称 / 城市 ───────────────────────────────────── */
  eq('★ 按昵称搜得到', MY.matchArtist(myRows[0], myRows[0].nickname), true)
  eq('★ 按城市搜得到', MY.matchArtist(myRows[0], myRows[0].city), true)
  eq('★ 大小写不敏感 + 前后空格不敏感',
    MY.matchArtist({ nickname: 'Ali', city: '上海' }, '  aLi '), true)
  eq('★ 空词放行（没筛 = 全都要）', MY.matchArtist(myRows[0], ''), true)
  eq('★ 喂 undefined 也放行（⛔ 不是把整页筛空）', MY.matchArtist(myRows[0], undefined), true)
  /* 🔴 这一条是**故意的**：风格词搜不到人。
     「按风格筛人」那个功能是被明确砍掉的（第十九处），搜索的语义是
     「我记得她叫什么 / 她在哪个城市」。两件事混进一个框里，顾客打一个
     「古风」会得到一份她解释不了的名单。⛔ 别"顺手"把 style_text 也加进去。 */
  eq('🔴★ ⛔ 不搜风格词（搜索语义是"她叫什么/在哪儿"，不是"筛人"）',
    MY.matchArtist({ nickname: '阿黎', city: '上海', style_text: '古风妆' }, '古风'), false)

  /* ── 列表页（pages/artist-list）页面级 ────────────────────────────── */
  const nav10 = []
  global.wx.navigateTo = (o) => nav10.push(o.url)
  const al = loadPage10('pages/artist-list/artist-list.js')
  al.onShow()
  eq('★ 进来就列出我约过的妆娘', al.data.rows.length, myRows.length)
  eq('★ 一开始没有搜索框（先让她看见人，⛔ 不是先给她一个空框）', al.data.open, false)
  eq('★ 一开始不是"筛过"的状态（否则空态说的是答非所问的那句）',
    al.data.searching, false)
  eq('★ 标题来自 myArtists（⛔ 这一页不自己写一遍）', al.data.title, MY.TITLE)
  al.toggleSearch()
  eq('★ 点「搜索」→ 框开了', al.data.open, true)
  al.onKwInput({ detail: { value: myRows[0].nickname } })
  eq('★ 打字即筛（⛔ 没有回车、没有放大镜、没有两级状态）',
    al.data.rows.length >= 1, true)
  eq('★ 筛过之后 searching = true（空态才分得清「没有」和「筛没了」）',
    al.data.searching, true)
  al.onKwInput({ detail: { value: '绝不可能存在的词xyz' } })
  /* 🔴 这一条钉的是**空态的两支**：搜不到的时候说「换个词」，
     ⛔ 不许说「你还没约过妆娘」—— 她明明约过，只是这个词没对上，
     那句话会让她以为记录丢了（规矩 25：结论必须和当前范围同口径）。 */
  eq('🔴★ 搜不到 → 行空了、但 searching 还是 true（空态得说「换个词」）',
    al.data.rows.length + '/' + al.data.searching, '0/true')
  /* 🔴 收起搜索框**必须把词一起清掉**。只收框不清词的后果是
     「列表里只有一位，而屏幕上没有任何地方写着为什么」——
     顾客会以为数据丢了（看得见的列表必须能被看得见的状态解释）。 */
  al.toggleSearch()
  eq('🔴★ 收起搜索框一定把词清掉（⛔ 不留一个看不见的筛选）',
    al.data.open + '/' + al.data.kw, 'false/')
  eq('★ 收起后列表回到全部（不是只剩上次筛出来的那几行）',
    al.data.rows.length, myRows.length)
  nav10.length = 0
  al.goArtist(ev10({ id: 'demo-mian' }))
  /* ⚠️ 判据是**跳去 landing + 带上 artist_id**，⛔ 不是"跳去某个妆娘主页"——
     第二十处定的：没有第二个妆娘主页，C1 复用（规矩 11 / 37）。 */
  eq('★ 点一行 → 那位妆娘的妆位页（复用 C1，带 artist_id）',
    nav10.join(','), '/pages/landing/landing?artist_id=demo-mian')

  /* ════════════════════════════════════════════════════════════════════
     AB. 妆位页（pages/landing）页面级 —— 第二十处第 ③④⑥ 步
     ════════════════════════════════════════════════════════════════════
     🔴 这一页在第二十处之前同样**一条页面级断言都没有**（只有源码级那几条）。
        它现在是提审截图 ② 的落点，也是顾客端唯一一条"能真的走到底"的路，
        所以这一步把它的行为整个钉一遍：认人 / 默认场次 / **排序** / 换场次 / 跳转。

     ⚠️ 下面是**示例数据的算术**，改动示例数据前先读这里：
        · sched-demo-0502（demo 的默认场）5 个妆位：seq 1/2/3 被 bk-2/bk-1/bk-3
          占着，**seq 4/5 空着**；午休 12:00–13:00 跟在 seq 2 后面。
        · sched-demo-0503（第二场）4 个妆位被 bk-4/5/6/7 占满（"约满了"那个状态）。
        · sched-mian-0701 3 个妆位只有 seq 1 被占；sched-ali-0801 只有 seq 2 被占。 */
  const D10 = require(R('妆历小程序/mock/data.js'))
  const landDemo = loadPage10('pages/landing/landing.js')
  landDemo.onLoad({ artist_id: 'demo' })
  landDemo.onShow()
  eq('★ 认人：读的是这一位妆娘的公开资料（⛔ 不是写死的 demo 那一份）',
    landDemo.data.artist.nickname, AS.getArtistById('demo').nickname)
  /* ⛔ 微信号⛔ 不在 artist 里 —— 它只能从 contact 那个字段来（唯一出口）。 */
  eq('🔴★ 妆娘的公开资料里⛔ 没有微信号（它只能走 contact）',
    'wechat_id' in landDemo.data.artist, false)
  eq('★ 下拉里有 2 场', landDemo.data.schedList.length, 2)
  eq('🔴★ 默认选中【离今天最近】的那一场（顾客进来就该看见最近能约的）',
    landDemo.data.schedId, 'sched-demo-0502')
  /* ⚠️ 日期只写「月-日」—— 带年份会让每一项都长到撑不住；
     但日期**必须带着**，因为同一场漫展分两天，光看名字分不出来（下拉存在的理由）。 */
  eq('★ 下拉条上写着「漫展名 · 月-日」（光看名字分不出是哪天）',
    landDemo.data.schedLabel, '示例漫展 · ' + D10.SCHEDULES[0].date.slice(5))
  eq('★ 下拉里每一项都带得出「N 个妆位可约」',
    landDemo.data.schedList.filter((c) => !c.sub).length, 0)
  eq('★ 下拉里那两场同名不同日（⛔ 演示数据得有这个形状，筛选条才演示得出来）',
    landDemo.data.schedList.map((c) => c.label).join('|'),
    '示例漫展 · ' + D10.SCHEDULES[0].date.slice(5) + '|示例漫展 · ' + D10.SCHEDULES[1].date.slice(5))
  /* ⚠️ 两场时小标题只说「可约妆位」—— 哪一场由上面那条条子说，
     不然同一个名字在一屏里出现两遍。 */
  eq('★ 有两场时小标题只说「可约妆位」（⛔ 不把场次名重复两遍）',
    landDemo.data.secTitle, '可约妆位')

  /* ── 排序：可约 → 午休 → 已约（🔴 2026-10-01 顾客当场三选一定的）─────
     🔴 这一组断言是**这一轮最重要的一条**：方案里那三条要求
        （「午休不参与排序」+「不进被占那一段」+「还在原位」）在示例数据上
        互相打架，是当场问他、画三种排法给他看才定下来的。
        ⛔ 别按着方案的原文改回去 —— 方案那一处是错的，这里才是准的。 */
  const landKinds = (p) => p.data.rows
    .map((r) => (r.type === 'lunch' ? 'L' : (r.booked ? 'B' : 'F'))).join('')
  eq('🔴★ 段序 = 可约 → 午休 → 已约（示例数据的准确形状）', landKinds(landDemo), 'FFLBBB')
  eq('★ 可约那一段按开始时间从早到晚', landDemo.data.rows
    .filter((r) => r.type === 'slot' && !r.booked).map((r) => r.seq).join(','), '4,5')
  eq('★ 已约那一段也按开始时间从早到晚', landDemo.data.rows
    .filter((r) => r.type === 'slot' && r.booked).map((r) => r.seq).join(','), '1,2,3')
  const landLi = landDemo.data.rows.findIndex((r) => r.type === 'lunch')
  eq('🔴★ 午休夹在两段【中间】（既不在头也不在尾）',
    landLi > 0 && landLi < landDemo.data.rows.length - 1, true)
  /* 🔴 下面这两条是这一组里**真正防"改回按时间排"的闩**。
     ⚠️ 上面写的那个"位置 === 可约行数"是个**弱断言**，别改回去：
        按时间排时这张表是 `已约、已约、午休、已约、可约、可约`，
        午休恰好也落在第 2 位 —— 和"可约行数 2"凑巧相等，
        于是那条断言**在错误实现下照样绿**（突变测试逮到过它一次）。
     判据换成"它的上下两行分别是什么"之后，按时间排那一版当场红：
        那一版午休上面是**已约**的、下面是**已约**的。 */
  eq('🔴★ 它上面一行是可约的（⛔ 不是已约 —— 按时间排的版本这里会是已约）',
    landDemo.data.rows[landLi - 1].booked, false)
  eq('🔴★ 它下面一行是已约的（它就是这两段之间的那条分隔条）',
    landDemo.data.rows[landLi + 1].booked, true)
  /* ⚠️ 午休行自带时长（档期生成时算好的 `min`）—— 漏了就是一行
     「午休 12:00 – 13:00 · undefined 分钟」。 */
  eq('🔴★ 午休行带着时长（⛔ 不是 undefined 分钟）',
    /^\d+$/.test(String(landDemo.data.rows[landLi].minutes)), true)
  /* ⚠️ 「可约」和「已约」的判据必须同源：条子上的「N 个妆位可约」
     和表里真能点的行数要对得上，否则会出现「条子写 3 个可约、点进去 2 行能点」。 */
  eq('🔴★ 条子上的「N 个妆位可约」=== 表里可约的行数（⛔ 不许各算一遍）',
    landDemo.data.schedList[0].sub,
    landDemo.data.rows.filter((r) => r.type === 'slot' && !r.booked).length + ' 个妆位可约')

  /* ── 换场次：⚠️ 这一场是【被约满】的那一场（free = 0）───────────────
     ⚠️ 用它来验两件事：① 表当场重画；② 一个可约的都没有时，
        段序退化成「午休 → 已约」（午休排在头是**对的**，因为没有可约段）。 */
  landDemo.pickSched(ev10({ id: 'sched-demo-0503' }))
  eq('★ 选另一场 → 面板收起（不收起就盖在妆位表上，还得再点一下）',
    landDemo.data.schedOpen, false)
  eq('★ 选另一场 → 妆位表当场重画', landKinds(landDemo), 'LBBBB')
  eq('★ 换了场次，条子上的字跟着换',
    landDemo.data.schedLabel, '示例漫展 · ' + D10.SCHEDULES[1].date.slice(5))
  /* 🔴 约满那一场的空态/提示得说实话（⛔ 不是"这个妆娘没有妆位"——
     她有，只是这一场满了，这两句话对顾客是两件事）。 */
  eq('🔴★ 一场约满时条子上直说「已约满」（⛔ 不是「0 个妆位可约」）',
    landDemo.data.schedList.filter((c) => c.id === 'sched-demo-0503')[0].sub, '已约满')

  /* ── 换妆娘：这一页是【任意一位】的，⛔ 不是 demo 一个人的分享页 ────── */
  const landMian = loadPage10('pages/landing/landing.js')
  landMian.onLoad({ artist_id: 'demo-mian' })
  landMian.onShow()
  eq('🔴★ 换一位妆娘 → 资料跟着换（⛔ 不是永远渲染 demo）',
    landMian.data.artist.nickname, AS.getArtistById('demo-mian').nickname)
  eq('★ 换一位妆娘 → 她的场次跟着换（⛔ 不串成别人的）',
    landMian.data.schedList.map((c) => c.id).join(','), 'sched-mian-0701,sched-mian-0702')
  eq('★ 换一位妆娘 → 默认那一场是她的（离今天最近）',
    landMian.data.schedId, 'sched-mian-0701')
  eq('★ 她的场次里只有 seq 1 被占（bk-8，演示数据自洽）', landKinds(landMian), 'FFLB')
  /* ⚠️ 只有一场时，筛选条整个不显示（只剩一项的下拉等于没得选，白占一行），
     于是小标题必须自己把场次名带上，不然顾客不知道这是哪一天。 */
  const landAli = loadPage10('pages/landing/landing.js')
  landAli.onLoad({ artist_id: 'demo-ali' })
  landAli.onShow()
  eq('★ 星轨展那两场 → 段序也对（只有 seq 2 被占）', landKinds(landAli), 'FFLB')

  /* ── 跳转：妆位的身份是 (schedule_id, seq) ─────────────────────────── */
  nav10.length = 0
  landDemo.pickSlot(ev10({ sid: 'sched-demo-0503', seq: 3 }))
  /* 🔴 这一条和填写页那边是**一对**（⑦ 段的 USER_OPEN）。查询串的字段名
     写错一个字，后果不是报错 —— 是每一位顾客都被告诉
     「这个妆位已经不在了」（出声了，但那句话是假的）。 */
  /* 🔴 2026-10-01（第二十三处）：查询串里多了 `&artist_id=` ——
     填写页提交时要拿它建单（少了它，填单页会兜底成 'demo'，
     在别人页面上下单、单子记到 demo 名下）。⛔ 三个字段缺一不可。 */
  eq('🔴★ 点「选这个妆位」→ 查询串是 ?schedule_id=&seq=&artist_id=（⛔ 不是 slot_id）',
    nav10.join(','),
    '/pages/booking-form/booking-form?schedule_id=sched-demo-0503&seq=3&artist_id=demo')
  eq('★ 而且 landDemo 上⛔ 没有再挂一个 slot_id 的写法',
    /slot_id/.test(stripJs(fs.readFileSync(R('妆历小程序/pages/landing/landing.js'), 'utf8'))), false)

  /* ── 源码级：这一页【没有输入框】，所以⛔ 一句 hideKeyboard 都不许有 ──
     🔴 README 第 20 条：判据不是"习惯性先收键盘"，而是
        「**这一页此刻有没有可能开着键盘**」。这一页从头到尾没有一个输入框，
        收键盘只可能打断当前触摸序列（Request N 那个"点了没反应"就是这么来的）。
        ⚠️ 所以这条是**这一页专属**的，⛔ 别照抄到 artist-list 上去 ——
           那一页真有输入框（收起搜索时要它是对的）。 */
  eq('🔴★ 妆位页没有输入框，所以⛔ 一句 hideKeyboard 都没有（README 第 20 条）',
    /hideKeyboard/.test(stripJs(fs.readFileSync(R('妆历小程序/pages/landing/landing.js'), 'utf8'))), false)
  eq('🔴★ 同理 wxml 里也没有 <input> / <textarea>（有的话上面那条就失效了）',
    /<(input|textarea)\b/.test(stripHtml(fs.readFileSync(R('妆历小程序/pages/landing/landing.wxml'), 'utf8'))), false)
  /* ⚠️ 「这一页是谁的」只能来自 onLoad 的查询串 —— 判据是**存在**
     `options.artist_id` 这个读取，⛔ 不是"别处不许出现 'demo' 字面量"：
     缺省仍是 demo 是**故意留的**（提审备注那条老路径 + 所有老分享卡片），
     它写在 onLoad 里、和 `options.artist_id ||` 挨着。 */
  eq('🔴★ 认人只认查询串里的 artist_id（缺省 demo 是故意留的兜底）',
    /options\.artist_id/.test(landJs10), true)
  /* ⚠️ 数据源必须是【顾客端那一层】—— `schedulesOfArtist` 按 artist_id 分人，
     ⛔ 不是 `getSchedules()`（那是妆师端自己的档期，读到别人头上就是串场）。 */
  eq('🔴★ 场次走 schedulesOfArtist(artist_id)（⛔ 不是妆师端那份 getSchedules()）',
    /schedulesOfArtist/.test(landJs10), true)
  eq('★ wxml 里的妆位按钮用的就是 (schedule_id, seq) 这两个 data-*',
    /data-sid="\{\{schedId\}\}"[\s\S]{0,120}data-seq="\{\{item\.seq\}\}"/.test(landWxml10), true)

  /* ════════════════════════════════════════════════════════════════════
     AB2. C1 → 填写页：**整条顾客路径**（第二十二处）

     🔴 这一块是补一个**真 bug 的洞**。用户原话：
        「点击选这个妆位，进入选择页面会出现这个妆位已经不在了」
     真根因：`pages/booking-form` 顾客那一支拿 `scheduleStore.getSchedule()`
     找场次 —— 那**只看 storage**，而顾客可能是**任意一位**妆娘的页面，
     另外两位的场次住在只读夹具 `SCHEDULES_OTHER` 里、从不落 storage。
     ⇒ 她们每一场、每一个妆位，点进去都是「这个妆位已经不在了」。

     🔴 **为什么原来的自测一条都没红**：⑦ 段那边的用例全是
        `{ schedule_id: 'sched-demo-0502' }` —— 那是 storage 里那场，
        走的正好是唯一能通的那条路。**测试数据只覆盖了一个角色，
        就等于没验过"任意一位妆娘"这件事**（第二十处把 C1 从"demo 一个人的
        分享页"改成"任意一位的妆位页"，而断言没跟着跨角色）。

     ⚠️ 判据刻意**不写死**场次名/时段：期望值就是 C1 那一行自己画出来的东西
        （漫展名从下拉项的 label 上切、序号和时段从那一行上取）。
        写死字面量的话，改示例数据时这条会红，而它红的原因跟它要保的性质无关
        （"两页说的是不是同一个妆位"）—— 那是假红，久了就没人信这一条了。 */
  const AB2_ARTISTS = ['demo', 'demo-mian', 'demo-ali']
  const qOf = (url) => {
    const q = {}
    String(url).split('?')[1].split('&').forEach((kv) => {
      const i = kv.indexOf('=')
      q[kv.slice(0, i)] = kv.slice(i + 1)
    })
    return q
  }
  /* 把 C1 上某一个妆位的按钮**真按一次**，把那串查询串原样喂给填写页。
     ⛔ 不走捷径（不自己拼 url、不直接调 onLoad 传对象）—— 那样就绕开了
     pickSlot 里 URL 拼串那一环，而写错字段名的后果正是这一处 bug 的形状。 */
  const walkOne = (land, seq) => {
    nav10.length = 0
    land.pickSlot(ev10({ sid: land.data.schedId, seq }))
    const url = nav10[0]
    const bf = loadPage10('pages/booking-form/booking-form.js')
    bf.onLoad(qOf(url))
    return { url, bf }
  }
  const AB2_BAD = []
  let ab2Tried = 0
  AB2_ARTISTS.forEach((aid) => {
    const lp = loadPage10('pages/landing/landing.js')
    lp.onLoad({ artist_id: aid })
    lp.onShow()
    lp.data.schedList.forEach((c) => {
      lp.pickSched(ev10({ id: c.id }))
      /* ⚠️ 场次名从**这一页自己的下拉项**上切，⛔ 不是从 scheduleById 拿 ——
         拿被测函数算期望值 = 拿自己证明自己（AB 段那条老规矩）。 */
      const nm = String(c.label).split(' · ')[0]
      lp.data.rows
        .filter((r) => r.type === 'slot' && !r.booked)
        .forEach((r) => {
          const { url, bf } = walkOne(lp, r.seq)
          ab2Tried++
          if (bf.data.slotMissing) {
            AB2_BAD.push(aid + '/' + c.id + '/seq' + r.seq + ' 说「已经不在了」')
          } else if (bf.data.slotText !== nm + ' · 第 ' + r.seq + ' 位 · ' + r.start + ' – ' + r.end) {
            AB2_BAD.push(aid + '/' + c.id + '/seq' + r.seq + ' 文案对不上：' + bf.data.slotText)
          }
          /* 🔴 2026-10-01（第二十三处）：查询串里必须带 `artist_id`，
             而且**必须就是这一页那一位** —— 光看「有没有这个字段」不够：
             pickSlot 里写成别的常量（或漏传）时，顾客在阿黎那页下的单
             会挂到 demo 名下，而这个错**在这条路上一个字都不报**。 */
          if (!/\?schedule_id=[^&]+&seq=\d+&artist_id=[^&]+$/.test(url)) {
            AB2_BAD.push('查询串形状不对：' + url)
          } else if (url.split('artist_id=')[1] !== aid) {
            AB2_BAD.push('带错人了（这一页是 ' + aid + '）：' + url)
          }
        })
    })
  })
  /* 14 = 示例数据的算术（改示例数据先读这里）：
     demo  0502 空 4/5 → 2，0503 满 → 0；
     mian  0701 空 2/3（seq1 被 bk-8 占）→ 2，0702 全空 → 4；
     ali   0801 空 1/3（seq2 被占）→ 2，0802 全空 → 4。 */
  eq('🔴★ 非平凡：三位妆娘 × 每一场 × 每一个可约妆位都真走了一遍（⛔ 不是空断言）',
    ab2Tried, 14)
  eq('🔴★ 每一个「选这个妆位」点进去，都真的落在那个妆位上（⛔ 一个都不许说「已经不在了」）',
    AB2_BAD, [])

  /* ── 取消掉的东西：C1 上一个都不出现（用户 2026-10-01 定的）────────────
     ⚠️ 这一段会**改 storage 和只读夹具**，所以先留快照、跑完还原 ——
        不还原的话，后面几段读到的档期就跟我动笔时不是同一份了
        （⑥ 段 restoreBookings() 那条老规矩：就地改、再放回去）。 */
  const hadSched = 'zhuangli_schedules' in store10
  const schedSnap = store10['zhuangli_schedules']
  const restoreSched = () => {
    if (hadSched) store10['zhuangli_schedules'] = schedSnap
    else delete store10['zhuangli_schedules']
  }
  const otherSnap = D10.SCHEDULES_OTHER.map((s) => s.status)
  const restoreOther = () => {
    D10.SCHEDULES_OTHER.forEach((s, i) => {
      if (otherSnap[i] === undefined) delete s.status
      else s.status = otherSnap[i]
    })
  }
  const SS10 = require(R('妆历小程序/utils/scheduleStore.js'))

  /* ① storage 里那一场（demo 自己取消的）：下拉里没有它、旧链接进来如实说"不在了" */
  SS10.cancelSchedule('sched-demo-0502')
  const landCancel = loadPage10('pages/landing/landing.js')
  landCancel.onLoad({ artist_id: 'demo' })
  landCancel.onShow()
  eq('🔴★ 取消掉的场次从下拉里整个消失（不是灰掉、更不是写一句「已取消」）',
    landCancel.data.schedList.filter((c) => c.id === 'sched-demo-0502').length, 0)
  eq('★ 而且当场换到还开着的那一场（⛔ 不是留一张空表）',
    landCancel.data.schedId, 'sched-demo-0503')
  const cancelledForm = loadPage10('pages/booking-form/booking-form.js')
  cancelledForm.onLoad({ schedule_id: 'sched-demo-0502', seq: 4 })
  eq('🔴★ 旧链接进来 → 如实说「已经不在了」（这一句在这里是**对的**，别把它删了）',
    cancelledForm.data.slotMissing, true)
  restoreSched()

  /* ② 只读夹具里那一场（另外两位妆娘）：同一件事，数据源不同，判据必须一样 */
  D10.SCHEDULES_OTHER.filter((s) => s.schedule_id === 'sched-mian-0701')[0].status = 'cancelled'
  eq('★ 非平凡：那一场确实被标成 cancelled 了（⛔ 不是标错了对象）',
    AS.schedulesOfArtist('demo-mian').filter((s) => s.schedule_id === 'sched-mian-0701').length, 0)
  const formOther = loadPage10('pages/booking-form/booking-form.js')
  formOther.onLoad({ schedule_id: 'sched-mian-0701', seq: 2 })
  eq('🔴★ 夹具里已取消的那一场，同样查不到（两个数据源，同一条判据）',
    formOther.data.slotMissing, true)
  restoreOther()
  eq('★ 还原之后它又查得到了（上面那条不是靠"夹具被我改坏了"凑出来的）',
    !!AS.scheduleById('sched-mian-0701'), true)

  /* ── 妆师端「代填」⛔ 不许跟着一起放宽 ──────────────────────────────
     🔴 并集是【给顾客的】。代填要是也能选到夹具里那些场次，就是再造一次
        第十七处那个 bug（单子挂在一场她根本不存在的漫展上）。
        判据 = 代填的场次下拉里只有她 storage 里那几场。 */
  const fillForm = loadPage10('pages/booking-form/booking-form.js')
  fillForm.onLoad({ mode: 'artist' })
  eq('🔴★ 代填的场次下拉只认她自己 storage 里那几场（⛔ 不是那个并集）',
    fillForm.data.schedOptions.filter((o) =>
      AS.schedulesOfArtist('demo-mian').some((s) => s.schedule_id === o.value)).length, 0)
  eq('★ 非平凡：她自己的场次确实在（否则上一条是空断言）',
    fillForm.data.schedOptions.length > 0, true)

  /* ── 源码级：顾客那一支用的就是 scheduleById ─────────────────────── */
  /* ⚠️ 这一条和上面那 12 次走查是**一对**：走查证明行为对，
     这一条把"为什么对"钉在文件上（谁把它改回 getSchedule 都会红）。 */
  eq('🔴★ 顾客那一支找场次走 artistStore.scheduleById（⛔ 不是只看 storage 的 getSchedule）',
    /const s = scheduleById\(options\.schedule_id/.test(bfJs), true)

  /* ── 妆位的两种状态：可约 / 已被预订（用户 2026-10-01 点名的说法）──── */
  /* 🔴 原来那颗灰棋子和它上面那行小字**都**写「已约」/「已被约」——
     同一个意思在一行里出现两遍，而且顾客要的说法是「已被预订」。 */
  eq('🔴★ 被预订那一行灰棋子写「已被预订」',
    /class="btn xs dis">已被预订</.test(landWxml10), true)
  eq('🔴★ 而且「已约」「已被约」这两个词在 C1 上一个都不剩（规矩 25）',
    /已被约|>已约</.test(landWxml10), false)
  eq('★ 小字「可约」只给可约的行（被占的行由那颗棋子一个人说完）',
    /wx:if="\{\{!item\.booked\}\}"[^>]*>可约</.test(landWxml10), true)

  /* ════════════════════════════════════════════════════════════════════
     AC. 底部 tabBar：两个角色共用一条条子（第二十一处 + 第二轮）
     ════════════════════════════════════════════════════════════════════
     🔴 起因：用户原话「用户端预约过的妆娘是一个页面，我的是一个页面，
        不要放在同一个页面里面」。而小程序**全局只有一个 tabBar**，
        妆师端已经用掉了 3 格 ⇒ 只能改成 `"custom": true` + `custom-tab-bar/`，
        由组件按当前角色决定画 3 格还是 2 格。
     📌 第二轮（同日）：约妆端也从 2 格变 3 格 ——「我的预约」从「我的」的
        下一层**升成 tab 2**，设置页改成**两个角色共用**。⚠️ 升格这件事
        **每一条连带伤都是静默的**，所以这一块随之长了 20 条，见下面的 4/4.5 两节。

     ⚠️ 这一块钉的全是**会静默出错**的那一类 —— 它们的共同点是
        「屏幕上不报任何错，只是看起来有点不对」，正是这个项目最怕的形状：
        · 自定义 tabBar 微信**不会**替页面扣底部高度 ⇒ 少一个 `tabbed` 类，
          页面最后一行被压在条子底下；
        · 跳 tab 页必须 `switchTab`，用 `redirectTo` **或 `navigateTo`**
          都是**静默失败**（人卡在原地，没有 toast、没有报错）；
        · `app.json` 的清单和 `utils/tabbar.js` 的清单是同一件事的两半，
          只改一边 ⇒ 画出来的格子和点得动的格子不是同一个；
        · 安全区只补一边 ⇒ iPhone 上要么盖住一条、要么空出一条。 */

  /* ── 1. 自定义 tabBar 的四件套 ─────────────────────────────────────── */
  eq('🔴★ custom-tab-bar 四件套齐全（少 index.js = 整条底部导航不见了）',
    fs.readdirSync(R('妆历小程序/custom-tab-bar')).sort().join(','),
    'index.js,index.json,index.wxml,index.wxss')
  eq('🔴★ index.json 声明成组件（少了它微信不会把它挂到 tabBar 位置上）',
    JSON.parse(fs.readFileSync(R('妆历小程序/custom-tab-bar/index.json'), 'utf8')).component, true)

  /* ── 2. 两份清单必须逐项一致 ──────────────────────────────────────── */
  const TB = require(R('妆历小程序/utils/tabbar.js'))
  const appJsonTab = appJson10.tabBar
  const unionTab = []
  ;['artist', 'guest'].forEach((r) => TB.TABS[r].forEach((t) => unionTab.push(t)))
  eq('🔴★ app.json 的 tabBar.list === utils/tabbar.js 两份清单的并集（同序同文案）',
    unionTab.map((t) => t.path + ' ' + t.text).join('|'),
    appJsonTab.list.map((t) => '/' + t.pagePath + ' ' + t.text).join('|'))
  eq('🔴★ 而且每一格都在 app.json 的 pages 里（pagePath 拼错 = 启动就报错）',
    appJsonTab.list.filter((t) => appJson10.pages.indexOf(t.pagePath) < 0), [])

  /* ── 3. 两个角色各几格、兜底往哪边倒 ───────────────────────────────── */
  eq('★ 妆师端 3 格（档期 / 预约单 / 我的）',
    TB.TABS.artist.map((t) => t.text).join(' / '), '档期 / 预约单 / 我的')
  eq('🔴★ 约妆端 3 格（我约过的妆娘 / 我的预约 / 我的）',
    TB.TABS.guest.map((t) => t.text).join(' / '), '我约过的妆娘 / 我的预约 / 我的')
  /* ⚠️ 第 1 格的字和「我约过的妆娘」这一层的 TITLE 必须是同一句（规矩 11 / 25）：
     两处各写一遍的代价是顾客发现标题换了个说法，怀疑是不是同一个地方。 */
  eq('🔴★ 约妆端第 1 格的字 === myArtists.TITLE（⛔ 不许各写各的）',
    TB.TABS.guest[0].text, require(R('妆历小程序/utils/myArtists.js')).TITLE)
  /* 🔴 角色认不出来时按【约妆端】画 —— 方向必须是安全的那一边：
     倒向妆师端的话，一个刚进来的人会看见妆娘的入口（档期 / 预约单），
     而那是她自己的私人班表。 */
  eq('🔴★ 角色认不出来时画约妆端那一排（⛔ 不是妆师端——那是她的私人班表）',
    TB.tabsOf('').map((t) => t.text).join('/'), '我约过的妆娘/我的预约/我的')
  eq('★ 拼错 / 大写的角色名同样退回约妆端', TB.tabsOf('ARTIST').length, 3)
  eq('★ 妆师端照旧 3 格', TB.tabsOf('artist').length, 3)

  /* ── 4. 全项目扫一遍：跳 tab 页只能 switchTab ────────────────────────
     🔴 这一块里最值钱的那几条。`wx.redirectTo` / `wx.navigateTo` 跳到 tabBar
        页都会**直接失败**，而这个项目已经在「点了没反应」上栽过四轮
        （README 第 20/21/22/26 条）—— 那四轮的病各不相同，这一种又是新的：
        **静默**失败，连 toast 都没有。
        反向那条同样重要：`switchTab` 跳**非** tab 页也失败。
     📌 2026-10-01 第二轮：「我的预约」升成 tab 页时，**真逮到两处**
        （`pages/landing/` 那个按钮是 `navigateTo`、`pages/booking-form/`
        提交完那一跳是 `redirectTo`）—— 而原来这一块**只扫 redirectTo**，
        C1 那一处是靠人工 grep 才发现的。⇒ 这次把 `navigateTo` 也纳进来：
        「跳 tab 页用错 API」这件事，三个 API 里有两个是错的，就得三个都扫。 */
  const projFiles = (ext) => {
    const out = []
    const walk = (d) => {
      fs.readdirSync(R('妆历小程序/' + d)).forEach((n) => {
        if (n === 'node_modules' || n.charAt(0) === '.') return
        const rel = d ? d + '/' + n : n
        if (fs.statSync(R('妆历小程序/' + rel)).isDirectory()) walk(rel)
        else if (new RegExp('\\' + ext + '$').test(n)) out.push(rel)
      })
    }
    walk('')
    return out
  }
  const targetsOf = (src, api) => {
    const re = new RegExp('wx\\.' + api + '\\(\\{\\s*url:\\s*[\'"]([^\'"]+)[\'"]', 'g')
    const out = []
    let m
    while ((m = re.exec(src)) !== null) out.push(m[1])
    return out
  }
  const tabPaths = appJsonTab.list.map((t) => '/' + t.pagePath)
  const redirectsAll = []
  const switchAll = []
  const navToAll = []
  projFiles('.js').forEach((rel) => {
    /* ⚠️ 扫的是**摘掉注释之后**的源码：这个项目里到处是
       「⛔ 别写回 redirectTo」这种说明性注释，扫原文的话，
       哪天有人在注释里举个反例就会被当成真违规 —— 那是假报警，
       而假报警会让人开始不信任这一条。被执行到的调用才算数。 */
    const src = stripJs(fs.readFileSync(R('妆历小程序/' + rel), 'utf8'))
    targetsOf(src, 'redirectTo').forEach((u) => redirectsAll.push({ f: rel, u }))
    targetsOf(src, 'switchTab').forEach((u) => switchAll.push({ f: rel, u }))
    targetsOf(src, 'navigateTo').forEach((u) => navToAll.push({ f: rel, u }))
  })
  eq('🔴★ 没有一处用 redirectTo 跳 tab 页（静默失败：人卡在原地、一个字不报）',
    redirectsAll.filter((x) => tabPaths.indexOf(x.u) >= 0).map((x) => x.f + ' → ' + x.u), [])
  /* 🔴 2026-10-01 第二轮新加：`navigateTo` 跳 tab 页也是**静默失败**，和
     redirectTo 一模一样。原来这一块只扫 redirectTo，C1 上那一处
     （`pages/landing/landing.js` 的「我的预约」，navigateTo）是人工 grep
     才发现的 —— 靠人眼发现的检查项不算检查项。 */
  eq('🔴★ 也没有一处用 navigateTo 跳 tab 页（和 redirectTo 一样静默，一样要扫）',
    navToAll.filter((x) => tabPaths.indexOf(x.u) >= 0).map((x) => x.f + ' → ' + x.u), [])
  eq('🔴★ 也没有一处用 switchTab 跳非 tab 页（同样静默失败）',
    switchAll.filter((x) => tabPaths.indexOf(x.u) < 0).map((x) => x.f + ' → ' + x.u), [])
  /* ⚠️ 上面三条要是扫描本身没扫到东西，就永远是绿的 —— 下面钉住扫描有效。
     📌 原先这里是「redirectsAll.length >= 1」，第二轮把全项目最后两处
        redirectTo 改成 switchTab 之后，这条**因为项目里一个 redirectTo 都不剩
        了而变红**。⚠️ 注意它红得是对的、但红的原因不对：病不在被检代码，
        在**这条守卫自己**——它把「扫到了几个」当成了「扫得对不对」。
     ⇒ 换成【给扫描器喂一段合成的源码】：三个 API 各来一次，能不能认出来。
        这比数个数硬：以后就算某类调用真的一个不剩，扫描器的能力照样被验着，
        ⛔ 不会出现「这类的守卫悄悄退役了」。
        非平凡性（不是对着空数组断言）改由 switchAll/navToAll 的数量守 ——
        这两类**一定**还有（tab 页之间跳、普通页之间跳，各有若干）。 */
  const scannerProbe =
    "wx.redirectTo({ url: '/pages/a/a' })\n" +
    "wx.switchTab({ url: '/pages/b/b' })\n" +
    "wx.navigateTo({ url: '/pages/c/c' })\n"
  eq('★ 扫描器自检：三种跳转 API 各喂一条，三个都认得出来（否则上面三条全是空断言）',
    ['redirectTo', 'switchTab', 'navigateTo'].map((a) => targetsOf(scannerProbe, a).join(',')).join(' | '),
    '/pages/a/a | /pages/b/b | /pages/c/c')
  /* 注释里的反面例子不算违规。⚠️ 这条得**两支都断言**（规矩 35）：
     只断「摘了注释之后是空的」的话，把扫描器整个写成「永远返回空」
     也是绿的 —— 所以底下同时钉住「不摘注释的话它确实认得出来」，
     证明这段探针本身是有效的，不是一段扫不出东西的哑文本。 */
  const commentProbe = "// wx.redirectTo({ url: '/x' })\n/* wx.switchTab({ url: '/y' }) */\n"
  eq('★ 注释里举的反例不算违规（扫描前先摘注释）',
    targetsOf(stripJs(commentProbe), 'redirectTo').concat(targetsOf(stripJs(commentProbe), 'switchTab')),
    [])
  eq('★ 而同一段探针不摘注释时是认得出的（否则上一条是空断言）',
    targetsOf(commentProbe, 'redirectTo').join(','), '/x')
  eq('★ 非平凡：switchTab 和 navigateTo 全项目都确实扫到了若干处',
    switchAll.length >= 5 && navToAll.length >= 5, true)

  /* ── 5. 6 个 tab 页的「两件套」必须同时做到 ────────────────────────── */
  const tabPagePaths = tabPaths.map((p) => p.slice(1))
  eq('🔴★ 6 个 tab 页的 onShow 都调了 syncTabBar（少一个 = 切过去那一格不亮）',
    tabPagePaths.filter((p) =>
      !/syncTabBar\(this\)/.test(fs.readFileSync(R('妆历小程序/' + p + '.js'), 'utf8'))), [])
  eq('🔴★ 6 个 tab 页的根容器都带 tabbed 类（少了 = 最后一行被条子盖住，不报错）',
    tabPagePaths.filter((p) =>
      !/<view class="app tabbed">/.test(fs.readFileSync(R('妆历小程序/' + p + '.wxml'), 'utf8'))), [])
  eq('🔴★ 而且【只有】这 6 页带 tabbed（别的页带上就是白多出一截空底）',
    projFiles('.wxml')
      .filter((f) => /class="app tabbed"/.test(fs.readFileSync(R('妆历小程序/' + f), 'utf8')))
      .sort(),
    tabPagePaths.map((p) => p + '.wxml').sort())
  /* 🔴 第二十一处第二轮：「我的预约」从「我的」的**下一层升成 tab 页**，
     两个连带都得钉住 —— 它们全都是「不报错的错」：
     ① tab 页⛔ 不许有返回箭头（页面上根本没有「上一页」）；
     ② 那一页原先的入口（「我的」页那一行）**必须删掉**，否则同一个落点两个入口。 */
  eq('🔴★ 「我的预约」现在是 tab 页了（第 2 格）',
    tabPaths.indexOf('/pages/guest-bookings/guest-bookings') >= 0, true)
  eq('🔴★ 而 tab 页上没有返回箭头（它自己那一页的 nav-bar 不许带 back）',
    /back="\{\{true\}\}"/.test(
      fs.readFileSync(R('妆历小程序/pages/guest-bookings/guest-bookings.wxml'), 'utf8')), false)
  eq('🔴★ 「我的」页里【不再有】「我的预约」那一行（升成 tab 之后它就是第二处入口）',
    /goMyBookings/.test(
      fs.readFileSync(R('妆历小程序/pages/guest-mine/guest-mine.wxml'), 'utf8')), false)
  eq('★ 同一个函数在 js 里也删干净了（⛔ 不留死代码）',
    /goMyBookings/.test(
      stripJs(fs.readFileSync(R('妆历小程序/pages/guest-mine/guest-mine.js'), 'utf8'))), false)
  /* 🔴 升格最狠的一处：C1 上那个「我的预约」按钮原来是 navigateTo ——
     tab 页上 navigateTo / redirectTo 都是**静默失败**，而那是落地页上
     唯一一个按钮（§9.4 #7）。 */
  eq('🔴★ C1 的「我的预约」也是 switchTab 过去的（navigateTo 同样是静默失败）',
    /switchTab\(\{\s*url:\s*['"]\/pages\/guest-bookings\/guest-bookings['"]/.test(
      stripJs(fs.readFileSync(R('妆历小程序/pages/landing/landing.js'), 'utf8'))), true)

  /* ── 4.5 project.config.json 的编译入口 ─────────────────────────────
     🔴 这个文件里有个和上面同一类的坑：编译入口写错 pathName，
        在开发者工具里**点了就白屏**，而且**没有任何报错**（那个页面不存在），
        人只会以为「这页崩了」。
     ⚠️ 2026-10-01 第二轮：「我的预约」升成 tab 页，顺手给它加了一个入口 ——
        加的时候两条都得顾：入口指向的页得真在 app.json 里，
        而且序号得跟着改（原来那个「我的（tab 2）」现在叫「tab 3」）。 */
  const projCfg = JSON.parse(fs.readFileSync(R('妆历小程序/project.config.json'), 'utf8'))
  const compileList = projCfg.condition.miniprogram.list
  eq('🔴★ 6 个编译入口（第二十一处第二轮：「我的预约」也加了一个）',
    compileList.length, 6)
  eq('🔴★ 每一个入口都指向 app.json 里真实存在的页（指错＝工具里点了白屏，还不报错）',
    compileList.filter((c) => appJson10.pages.indexOf(c.pathName) < 0).map((c) => c.name + ' → ' + c.pathName),
    [])
  eq('🔴★ 而且名字里的 tab 序号和 tabBar 里的位置对得上（⛔ 不是"改了一半"）',
    compileList.filter((c) => /^约妆端 · /.test(c.name))
      /* ⚠️ 按名字里写的序号排，再和 tabbar.js 那一份**逐项比** ——
         比「序号对不对」更狠：名字、顺序、落点三样一起钉住了。
         ⛔ 别拿 app.json 的全局下标来比：那是 6 格连排，约妆端是从第 4 格起的，
            名字里的「tab 1」说的是**约妆端自己那一排**的第 1 格（第一版就是这么写错的）。 */
      .sort((a, b) => Number(a.name.match(/（tab (\d)）/)[1]) - Number(b.name.match(/（tab (\d)）/)[1]))
      .map((c) => c.name.match(/（tab (\d)）/)[1] + ':' +
        c.name.replace(/^约妆端 · /, '').replace(/（tab \d）$/, '') + '→' + c.pathName),
    TB.TABS.guest.map((t, i) => (i + 1) + ':' + t.text + '→' + t.path.slice(1)))

  /* ── 6. 高度只有一处；两边补的是同一个数 ─────────────────────────── */
  const appWxssTab = fs.readFileSync(R('妆历小程序/app.wxss'), 'utf8')
  const tbWxssTab = fs.readFileSync(R('妆历小程序/custom-tab-bar/index.wxss'), 'utf8')
  eq('🔴★ --tabh 定义在 page 上（50px；⛔ 不是 rpx —— 它顶替的是原生那条固定高度的）',
    /--tabh:50px/.test(appWxssTab), true)
  eq('🔴★ tab 页的底部留白读的就是 --tabh（⛔ 不是另写一个数）',
    /\.app\.tabbed\{[\s\S]{0,220}padding-bottom:var\(--tabh\)/.test(appWxssTab), true)
  eq('🔴★ 条子自己的高度也读 --tabh（各写一个数的结局是盖住一截或者空出一截）',
    /height:var\(--tabh/.test(tbWxssTab), true)
  eq('★ 组件里是 var()，⛔ 不是第二份定义',
    /--tabh\s*:/.test(tbWxssTab), false)
  eq('🔴★ 全项目只有这两个文件提到 --tabh',
    projFiles('.wxss')
      .filter((f) => /--tabh/.test(fs.readFileSync(R('妆历小程序/' + f), 'utf8'))).sort(),
    ['app.wxss', 'custom-tab-bar/index.wxss'])
  /* 🔴 iPhone 那条小黑条：条子和页面留白【必须都补】。
     只补条子 → 它变高、页面留白没变 → 盖住最后一行；
     只补页面 → 页面多留一截、条子矮一截 → 底下空一条白。 */
  eq('🔴★ 安全区两边都补（只补一边在 iPhone 上要么盖一条要么空一条）',
    /env\(safe-area-inset-bottom\)/.test(appWxssTab) &&
    /env\(safe-area-inset-bottom\)/.test(tbWxssTab), true)

  /* ── 7. 组件的行为：按角色给格子、按路由认选中格、点当前格不跳 ──────── */
  let compCfg = null
  global.Component = (c) => { compCfg = c }
  delete require.cache[require.resolve(R('妆历小程序/custom-tab-bar/index.js'))]
  require(R('妆历小程序/custom-tab-bar/index.js'))
  const mkBar = () => {
    const b = { data: JSON.parse(JSON.stringify(compCfg.data)) }
    for (const k in compCfg.methods) b[k] = compCfg.methods[k]
    b.setData = function (patch) { for (const k in patch) this.data[k] = patch[k] }
    return b
  }
  const appStubOld = global.getApp
  const roleOf = (r) => { global.getApp = () => ({ getRole: () => r }) }
  let routeStack = []
  global.getCurrentPages = () => routeStack

  roleOf('artist')
  routeStack = [{ route: 'pages/schedule/schedule' }]
  const barA = mkBar()
  barA.sync()
  eq('★ 妆师端：画 3 格', barA.data.items.length, 3)
  eq('🔴★ 而且点亮的是【档期】那一格（按路由认，⛔ 不是靠页面报序号）',
    barA.data.selected, 0)

  roleOf('guest')
  routeStack = [{ route: 'pages/guest-mine/guest-mine' }]
  const barG = mkBar()
  barG.sync()
  eq('🔴★ 约妆端：画 3 格', barG.data.items.length, 3)
  eq('★ 而且点亮第 3 格「我的」', barG.data.selected, 2)
  /* 🔴 第二十一处第二轮新加的那一格：路由是「我的预约」时要亮第 2 格。
     这条顺带钉住「按路由认」这件事在**中间那一格**上也成立
     （只测第 0 格和第 2 格的话，一个「永远点亮首尾」的实现也能全绿）。 */
  routeStack = [{ route: 'pages/guest-bookings/guest-bookings' }]
  barG.sync()
  eq('🔴★ 站在「我的预约」那一页时点亮的是第 2 格（中间那一格也认得住）',
    barG.data.selected, 1)
  routeStack = [{ route: 'pages/guest-mine/guest-mine' }]
  barG.sync()

  /* 🔴 角色会变（「我的」页里那条「切换身份」）—— 下一次 sync 必须当场换排。
     缓存住的话，切完身份底部还是旧那一排，而屏幕上没有任何提示。 */
  roleOf('artist')
  routeStack = [{ route: 'pages/artist-list/artist-list' }]
  barG.sync()
  eq('🔴★ 切身份后立刻换成妆师端那一排（⛔ 不是缓存住第一次那一排）',
    barG.data.items.map((t) => t.text).join('/'), '档期/预约单/我的')
  /* ⚠️ 这时路由（artist-list）在这一排里一个都对不上 —— 那是「角色刚切、
     页面还没换」中间那一刻。**不猜一个**：保持原来点亮的那一格。
     猜第 0 格的话，那一瞬间底部会亮着「档期」，而屏幕上根本不是档期页。 */
  eq('🔴★ 路由对不上时不乱点一格（保持原样，⛔ 不是硬选第 0 格）',
    barG.data.selected, 2)

  const switched = []
  global.wx.switchTab = (o) => switched.push(o.url)
  barA.data.selected = 1
  barA.onTap({ currentTarget: { dataset: { path: '/pages/mine/mine' } } })
  eq('★ 点别的一格 → switchTab 过去', switched.join(','), '/pages/mine/mine')
  switched.length = 0
  barA.onTap({ currentTarget: { dataset: { path: barA.data.items[1].path } } })
  eq('🔴★ 点当前这一格 → 什么都不做（⛔ 不 switchTab 自己：页面会白闪一下）',
    switched.length, 0)

  /* ── 8. syncTabBar 这一层的兜底不出声是对的（README 第 34 条）──────── */
  let tbThrew = ''
  try { TB.syncTabBar({}) } catch (e) { tbThrew = String(e) }
  eq('★ 页面没有 getTabBar 时不炸（那是原生 tabBar 的情形，没东西要修，所以不出声）',
    tbThrew, '')
  try { TB.syncTabBar(null) } catch (e) { tbThrew = String(e) }
  eq('★ 喂 null 也不炸', tbThrew, '')
  const forwarded = []
  TB.syncTabBar({ getTabBar: () => ({ sync: () => forwarded.push(1) }) })
  eq('🔴★ 页面有 getTabBar 时确实转发给了组件（不然这一层等于没接上）',
    forwarded.length, 1)
  global.getApp = appStubOld

  /* ── 9. 约妆端第 3 格（pages/guest-mine）────────────────────────────
     🔴 第二十一处第二轮：用户说「「我的」里面只有切换身份 反馈 设置」
        ⇒ 三行，而且**真的都跳得动**（第十四处那两行「有响应、但不跳页面」
        就是这个项目栽过的地方，README 第 14 / 26 条）。 */
  const gm = loadPage10('pages/guest-mine/guest-mine.js')
  nav10.length = 0
  gm.onShow()
  eq('★ 进「我的」不自动跳走（没有多余的 navigateTo）', nav10.length, 0)
  gm.switchRole()
  gm.goFeedback()
  gm.goSettings()
  eq('🔴★ 三行都【真的】跳得动（第十四处那种"有响应、但不跳页面"⛔ 不许回来）',
    nav10.join(' | '),
    '/pages/role-select/role-select | /pages/feedback/feedback | /pages/settings/settings')
  eq('★ 而且「我的预约」那一行真的是删了（⛔ 不是留着两个入口）',
    typeof gm.goMyBookings, 'undefined')
  /* ⚠️ 反馈页和设置页在妆师端是**同一个落点**（规矩 11：一个东西一处实现）。
     两边各跳各的页，就是「同一个功能有两个入口、两处各修各的 bug」的开头。 */
  eq('🔴★ 反馈 / 设置这两行跳的就是妆师端那两页（⛔ 不是给顾客另做的两页）',
    nav10[1] + ' | ' + nav10[2],
    '/pages/feedback/feedback | /pages/settings/settings')
  eq('★ 而且这两页在 app.json 里只有一份（没有给顾客另建的第二份）',
    appJson10.pages.filter((p) => /feedback|settings/.test(p)).sort(),
    ['pages/feedback/feedback', 'pages/settings/settings'])
  eq('🔴★ 约妆端 tab 1 的导航栏没有返回箭头（tab 页没有"上一页"这回事）',
    /back="\{\{true\}\}"/.test(
      fs.readFileSync(R('妆历小程序/pages/artist-list/artist-list.wxml'), 'utf8')), false)
  /* 🔴 约妆端两条老路径都得跟着换到 tab 1 —— 它们原来指向已退役的 guest-home，
     写回 redirectTo 的话是**静默**失败（人卡在角色选择页 / 空态页，一个字不报）。 */
  eq('🔴★ 角色选择「我是约妆」→ switchTab 到约妆端 tab 1',
    /chooseGuest[\s\S]{0,400}switchTab[\s\S]{0,80}artist-list/.test(
      stripJs(fs.readFileSync(R('妆历小程序/pages/role-select/role-select.js'), 'utf8'))), true)
  eq('★ 返回兜底（导航栏 / 我的预约空态）也都指向 tab 1',
    ['components/nav/nav.js', 'pages/guest-bookings/guest-bookings.js']
      .filter((p) => !/switchTab[\s\S]{0,80}artist-list/.test(
        fs.readFileSync(R('妆历小程序/' + p), 'utf8'))), [])

  /* ── 10. 共用的设置页：微信号那个开关**只对妆娘画**（第二十一处第二轮）────
     🔴 用户原话「设置和妆娘端一模一样」+「**顾客没有展示微信号的开关，
        顾客不展示**」⇒ 一个文件、两副面孔：顶上那块按当前角色决定画不画。
     ⚠️ 为什么必须钉：这一块走错**不报任何错** —— 顾客那边只是多出一个
        拨了也没意义的开关（她没有分享页），而顾客这边少画一个最坏也只是
        少一个开关。⇒ **倒向"不画"是安全的那一边**，三条断言就是这个意思。 */
  const settingsWxml = fs.readFileSync(R('妆历小程序/pages/settings/settings.wxml'), 'utf8')
  const loadSettings = (role) => {
    const prevApp = global.getApp
    const prevPage = global.Page
    global.getApp = () => ({ getRole: () => role })
    let cfgS = null
    global.Page = (c) => { cfgS = c }
    delete require.cache[require.resolve(R('妆历小程序/pages/settings/settings.js'))]
    require(R('妆历小程序/pages/settings/settings.js'))
    const pgS = {}
    for (const k in cfgS) pgS[k] = cfgS[k]
    pgS.data = JSON.parse(JSON.stringify(cfgS.data || {}))
    pgS.setData = function (patch) { for (const k in patch) this.data[k] = patch[k] }
    global.getApp = prevApp
    global.Page = prevPage
    return pgS
  }
  eq('🔴★ 妆娘进来：画那个「展示微信号」开关', loadSettings('artist').data.isArtist, true)
  eq('🔴★ 顾客进来：不画（⛔ 不是"画了但灰着"—— 那一行对顾客根本不存在）',
    loadSettings('guest').data.isArtist, false)
  eq('🔴★ 角色认不出来时也不画（倒向"画出来"就是把妆娘的东西摆给顾客看）',
    loadSettings('').data.isArtist, false)
  eq('🔴★ 而 wxml 上那一整块真的是被 isArtist 包着的（⛔ 不是只算了不画）',
    /wx:if="\{\{isArtist\}\}"[\s\S]{0,120}sw-row/.test(settingsWxml), true)
  eq('★ 两个角色共用这一页（全项目只有一个 wxml 有那个开关）',
    projFiles('.wxml')
      .filter((f) => /sw-row/.test(fs.readFileSync(R('妆历小程序/' + f), 'utf8'))).sort(),
    ['pages/settings/settings.wxml'])
  /* ⚠️ isArtist 的兜底方向也要钉：getApp() 取不到时必须是 `false`。
     写反成 `!== 'guest'` 之类的话，一个顾客在 App 还没起来的那一刻
     会看见妆娘的开关 —— 而这一条**不会报错**。 */
  {
    const prevApp2 = global.getApp
    global.getApp = () => { throw new Error('App 还没起来') }
    let threw = ''
    let v = null
    try {
      delete require.cache[require.resolve(R('妆历小程序/pages/settings/settings.js'))]
      let cfgT = null
      const prevPage2 = global.Page
      global.Page = (c) => { cfgT = c }
      require(R('妆历小程序/pages/settings/settings.js'))
      global.Page = prevPage2
      v = cfgT.data.isArtist
    } catch (e) { threw = String(e) }
    global.getApp = prevApp2
    eq('🔴★ getApp() 炸了也不传染（整页要起得来）', threw, '')
    eq('🔴★ 而且那一瞬间默认【不画】（⛔ 不是默认画出来）', v, false)
  }
}

restoreBookings()

console.log('\n' + (fail ? 'FAILED ' + fail + ' / ' : 'ALL PASS ') + (pass + fail) + ' assertions\n')
process.exit(fail ? 1 : 0)
