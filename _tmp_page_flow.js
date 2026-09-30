/* 页面层打桩测试：把 wx / Page 换成假的，把 schedule-detail 的整条交互流程走一遍。
   纯函数对不代表页面就对 —— 这一层能抓到「setData 漏字段」「dataset 取错」
   「点了之后 rows 没重算」这类只有跑起来才看得见的问题。

   ⚠️ 每个小节开头都要 reset()。上一版没 reset，第一节里某个弹窗被
      自动答成「确认」之后状态就飘了，后面每一节的硬编码期望全跟着错，
      最后炸在 reading 'start' of undefined —— 那不是代码的问题，是测试的问题。 */

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

require('./妆历小程序/pages/schedule-detail/schedule-detail.js')

const inst = {}
for (const k in cfg) inst[k] = cfg[k]
inst.setData = function (patch) { for (const k in patch) this.data[k] = patch[k] }

let pass = 0, fail = 0
function eq(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok   ' + label) }
  else { fail++; console.log('  FAIL ' + label + '\n       got  ' + g + '\n       want ' + w) }
}
function tap(key) { return { currentTarget: { dataset: { key } } } }
function del(seq) { return { currentTarget: { dataset: { seq } } } }
function dumpRows() { return inst.data.rows.map((r) => r.key + ':' + r.start + '-' + r.end + (r.booked ? 'B' : '')).join(' ') }
function dumpSlots() {
  return inst.data.s.slots.map((s) => s.seq + ':' + s.start + '-' + s.end + '(' + s.minutes + ')' + (s.booked ? 'B' : '')).join(' ')
}
function lunch() { const l = inst.data.s.lunch; return l && l.enabled ? l.start + '-' + l.end + '(' + l.min + ')' : 'OFF' }
function modalText() { return modalLog.map((m) => m.title + '|' + m.content).join(' ~ ') }

const { generateSlots } = require('./妆历小程序/utils/schedule.js')
const { addSchedule } = require('./妆历小程序/utils/scheduleStore.js')

/* 每个小节从同一块干净地基上起跑：
   3 个 80 分钟妆位 / 间隔 10 / 午休 60 分钟在第 2 个妆位后面
   → 09:00-10:20 · 10:30-11:50 · 午休 12:00-13:00 · 13:00-14:20
   name='示例漫展' 时 mock BOOKINGS 会把 seq1(confirmed) seq2(pending) 算成已预订；
   换个名字（花瞳漫展）就没有任何预订，用来测午休会动的那条路径。 */
function reset(name, date) {
  wx._store = {}
  const built = generateSlots({ startTime: '09:00', slotMin: 80, gapMin: 10, count: 3,
    lunch: { enabled: true, min: 60, afterSeq: 2 } })
  addSchedule({
    schedule_id: 'sch-1', name, date,
    startTime: '09:00', slotMin: 80, gapMin: 10, count: 3,
    lunch: built.lunch, slots: built.slots
  })
  toasts.length = 0
  modalLog.length = 0
  modalAnswers = []
  inst.data = JSON.parse(JSON.stringify(cfg.data))
  inst.onLoad({ id: 'sch-1' })
}

const BOOKED = '示例漫展', FREE = '花瞳漫展'

/* ══ A. onLoad：已预订由假预约单推导 ══════════════════════════════════ */
console.log('\n[A] onLoad · 示例漫展')
reset(BOOKED, '2026-05-02')
console.log('  slots ' + dumpSlots() + '  lunch ' + lunch())
console.log('  rows  ' + dumpRows())
eq('seq1 marked booked', inst.data.s.slots[0].booked, true)
eq('seq2 marked booked', inst.data.s.slots[1].booked, true)
eq('seq3 (status=done) NOT booked', inst.data.s.slots[2].booked, false)
eq('rows = 3 slots + lunch in place', dumpRows(),
  's1:09:00-10:20B s2:10:30-11:50B L:12:00-13:00 s3:13:00-14:20')
eq('rangeText', inst.data.rangeText, '09:00 – 14:20')

/* ══ B. 改午休【后面】的妆位：直接顺延，不弹问 ════════════════════════ */
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

/* ══ C. 午休前面改妆位、中间卡着已预订妆位 → 不弹问、午休不动 ═════════
   ★ 这是真机跑出来的那个 bug：s1 缩短，午休一度被挪到 11:20-12:20，
     正好压在已预订的 s2（10:30-11:50）头上，还一声不吭。 */
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

/* ══ D. 没有预订的档期：缩短 → 弹问，确认 = 午休起止一起提前 ═════════ */
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

/* ══ E. 同一档期：缩短但选「午休不动」 ═══════════════════════════════ */
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

/* ══ F. 延长午休前的妆位 → 只推午休【起始】，结束不动 ════════════════ */
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

/* ══ G. 延长到把午休整个挤没 → 先问，确认才取消午休 ═════════════════ */
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

/* ══ H. 「＋」只塞进空档：紧挨着就拒绝 ═══════════════════════════════ */
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

/* ══ I. 「＋」在最后一行下面 → 追加，撤销可回滚 ═══════════════════════ */
console.log('\n[I] ＋ 在 s3 下面 → 追加 30 分钟；点取消回滚')
reset(FREE, '2026-05-03')
inst.onInsert(tap('s3'))
console.log('  slots ' + dumpSlots())
eq('appended 30 min after 14:20', inst.data.s.slots[3].start + '-' + inst.data.s.slots[3].end, '14:30-15:00')
eq('editor opened on the new row', inst.data.editingKey, 's4')
eq('justInserted flag on', inst.data.justInserted, true)
toasts.length = 0
inst.cancelEdit()
console.log('  slots ' + dumpSlots())
eq('insert rolled back', dumpSlots(), '1:09:00-10:20(80) 2:10:30-11:50(80) 3:13:00-14:20(80)')
eq('撤销 toast', toasts[0], '已撤销插入')

/* ══ J. 删一个妆位腾出空档 → ＋ 把它插回去，后面时间一律不动 ═════════ */
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
eq('inserted into the gap (10:30–12:00 → 30 min)', inst.data.s.slots[1].start + '-' + inst.data.s.slots[1].end, '10:30-11:00')
eq('the old s2 kept its time', inst.data.s.slots[2].start + '-' + inst.data.s.slots[2].end, '13:00-14:20')
eq('lunch afterSeq pushed back to 2', inst.data.s.lunch.afterSeq, 2)
eq('★ 行序仍按时间排：新妆位在午休【前面】', dumpRows(),
  's1:09:00-10:20 s2:10:30-11:00 L:12:00-13:00 s3:13:00-14:20')
eq('editor opened on the inserted row', inst.data.editingKey, 's2')
inst.cancelEdit()
eq('rollback also restores the lunch position', dumpRows(), 's1:09:00-10:20 L:12:00-13:00 s2:13:00-14:20')

/* ══ K. 删已预订的妆位：确认框要提醒 ═════════════════════════════════ */
console.log('\n[K] 删 s2（已预订）')
reset(BOOKED, '2026-05-02')
modalAnswers = [true]
inst.cancelSlot(del(2))
console.log('  slots ' + dumpSlots())
eq('★ 确认框里提醒了「已经有客人预订」', /已经有客人预订/.test(modalText()), true)
eq('remaining times untouched', dumpSlots(), '1:09:00-10:20(80)B 2:13:00-14:20(80)')
eq('seq1 still booked', inst.data.s.slots[0].booked, true)

/* ══ L. 只剩一个妆位时不许再删 ═══════════════════════════════════════ */
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

/* ══ M. 取消午休：后面妆位时间一律不动 ═══════════════════════════════ */
console.log('\n[M] 取消午休')
reset(BOOKED, '2026-05-02')
modalAnswers = [true]
inst.cancelLunch()
console.log('  rows ' + dumpRows() + '  lunch ' + lunch())
eq('lunch row gone', inst.data.rows.some((r) => r.type === 'lunch'), false)
eq('lunch off', lunch(), 'OFF')
eq('no slot time changed', dumpSlots(), '1:09:00-10:20(80)B 2:10:30-11:50(80)B 3:13:00-14:20(80)')
eq('rows keys', dumpRows().split(' ').map((x) => x.split(':')[0]).join(','), 's1,s2,s3')
eq('toast', toasts[0], '午休已取消')

/* ══ N. 改午休：起点 + 时长 ══════════════════════════════════════════ */
console.log('\n[N] 改午休 12:00–13:00（60 分）→ 13:00 起、45 分')
reset(BOOKED, '2026-05-02')
inst.onEdit(tap('L'))
eq('editStart prefilled', inst.data.editStart, '12:00')
eq('editMin prefilled', inst.data.editMin, '60')
inst.onEditStart({ detail: { value: '13:00' } })
inst.onEditInput({ detail: { value: '45' } })
inst.confirmLunch()
console.log('  slots ' + dumpSlots() + '  lunch ' + lunch())
eq('lunch moved & resized', lunch(), '13:00-13:45(45)')
eq('slot3 follows the new lunch end', inst.data.s.slots[2].start + '-' + inst.data.s.slots[2].end, '13:45-15:05')
eq('slots before the lunch untouched',
  inst.data.s.slots[0].start + '|' + inst.data.s.slots[1].start, '09:00|10:30')
eq('editing closed', inst.data.editingKey, '')
eq('no collision', toasts[0], '午休已改，后面时段已顺延')

console.log('\n' + (fail ? 'FAILED ' + fail + ' / ' : 'ALL PASS ') + (pass + fail) + ' assertions\n')
process.exit(fail ? 1 : 0)
