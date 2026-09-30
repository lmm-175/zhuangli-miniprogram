const S = require('./妆历小程序/utils/schedule.js')
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

// ── 范围文案 ──
eq('range', scheduleRange(base.slots), '09:00 – 14:20')

console.log('\n' + (fail ? 'FAILED ' + fail + ' / ' : 'ALL PASS ') + (pass + fail) + ' assertions\n')
process.exit(fail ? 1 : 0)
