/**
 * 妆师端 · 排班纯函数。
 * 时间一律用「分钟整数」算，只在展示时转 'HH:MM'。全部纯函数，可以 node 断言。
 *
 * ── 三条时间规则（2026-09-29 真机调试后定的）──────────────────────────
 *  ① 改时长 = 顺延，但【顺延到第一个「已预订」妆位为止】。
 *     已预订的妆位是锚点：它自己、以及它后面所有妆位的时间都不许动 ——
 *     跟客人已经约好的时间，不能被一次排班调整悄悄改掉。
 *  ② 删妆位 / 插妆位 = 后面妆位的时间【一律不动】。
 *     删掉就留一段空档；插入只能塞进已有空档里（塞不下由页面提示，不硬挤）。
 *  ③ 午休是一段【有绝对起止】的独立区间，在列表里有自己一行（浅蓝）。
 *     改午休【前面】的妆位时：
 *       · 延长 → 只推午休的【起始】，结束不动（午休被压短；压到 0 就没了）
 *       · 缩短 → 页面先问「要不要提前午休」，确认才把起止一起提前
 *     午休的起止是绝对时间，不再从「前一个妆位结束 + 间隔」实时推导 ——
 *     所以午休前面可以留空档，这正是删除妆位之后能再插回来的前提。
 */

function toMin(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
function toHHMM(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m
}

/**
 * 生成妆位时段表。
 * config = { startTime, slotMin, gapMin, count, lunch:{enabled,min,afterSeq} }
 * 午休语义：第 afterSeq 个妆位结束 → +间隔 → 午休开始 → 午休结束
 *          午休结束后的第一个妆位【直接】从午休结束时间开始（不再加间隔）
 *          后续妆位之间保留 gapMin 间隔
 * 返回 { slots, lunch }。每个妆位带 booked:false —— M1 由真实预约单写成 true。
 */
function generateSlots(config) {
  const c = config || {}
  const start = toMin(c.startTime || '09:00')
  const slotMin = Number(c.slotMin) || 80
  const gapMin = Number(c.gapMin) || 10
  const count = Number(c.count) || 3
  const lunchOn = c.lunch && c.lunch.enabled
  const lunchMin = Number((c.lunch && c.lunch.min) || 0)
  const afterSeq = Number((c.lunch && c.lunch.afterSeq) || 0)

  const slots = []
  let lunch = null
  let t = start
  for (let i = 1; i <= count; i++) {
    const s = t
    const e = t + slotMin
    slots.push({ seq: i, start: toHHMM(s), end: toHHMM(e), minutes: slotMin, is_break: false, booked: false })
    t = e + gapMin
    if (lunchOn && i === afterSeq) {
      const ls = t
      const le = t + lunchMin
      lunch = { enabled: true, afterSeq, min: lunchMin, start: toHHMM(ls), end: toHHMM(le) }
      t = le
    }
  }
  return { slots, lunch }
}

function cloneSlots(slots) {
  return (slots || []).map((s) => ({ ...s }))
}
function cloneLunch(lunch) {
  return lunch ? { ...lunch } : null
}

/**
 * 从第 fromIdx 个妆位（0 基）开始往后重排时间，遇到【已预订】妆位立刻停。
 * 锚点自己、以及它之后的妆位全部保持原样 —— 这是规则 ①。
 * startMin 是第 fromIdx 个妆位该开始的时间。
 * 返回 true 表示撞上了锚点（前面挤到跟已预订妆位重叠了），页面要如实提示。
 */
function reflow(arr, fromIdx, startMin, gap, lunch) {
  let t = Number(startMin)
  for (let i = fromIdx; i < arr.length; i++) {
    if (arr[i].booked) {
      // 锚点：时间原样不动。但可能已经被前面挤到重叠 —— 别装作没事。
      let earliest = t
      if (lunch && lunch.enabled && i === lunch.afterSeq) {
        earliest = Math.max(earliest, toMin(lunch.end))
      }
      return earliest > toMin(arr[i].start)
    }
    // 午休正好夹在 i-1 和 i 之间 → 这个妆位从午休结束开始
    if (lunch && lunch.enabled && i === lunch.afterSeq) {
      t = Math.max(t, toMin(lunch.end))
    }
    arr[i].start = toHHMM(t)
    arr[i].end = toHHMM(t + arr[i].minutes)
    t = toMin(arr[i].end) + gap
  }
  return false
}

/**
 * 改某个妆位的时长（规则 ①）。
 * lunchMode —— 只有「改的是午休前面的妆位」时才起作用：
 *   'squeeze' 延长 → 只推午休起始，结束不动（午休被压短）
 *   'follow'  缩短且用户选了「提前午休」→ 午休起止一起提前
 *   'pin'     用户选了「午休不动」/ 改的是午休之后的妆位 → 午休原样
 * 返回 { slots, lunch, collision, lunchRemoved }
 */
function shiftSlot(slots, seq, newMinutes, gapMin, lunch, lunchMode) {
  const arr = cloneSlots(slots)
  let nl = cloneLunch(lunch)
  const idx = Number(seq) - 1
  if (idx < 0 || idx >= arr.length) return { slots: arr, lunch: nl, collision: false, lunchRemoved: false }
  const m = Number(newMinutes)
  if (!(m > 0)) return { slots: arr, lunch: nl, collision: false, lunchRemoved: false }

  const gap = Number(gapMin) || 10
  const delta = m - arr[idx].minutes

  arr[idx].minutes = m
  arr[idx].end = toHHMM(toMin(arr[idx].start) + m)

  // ── 午休怎么动 ──
  // ⚠️ 如果「被改的妆位」和「午休」之间卡着一个已预订妆位，那顺延到它就得停，
  //    午休前面那些妆位根本没动 —— 午休也就【不能】跟着动，
  //    否则午休会一头挪到已预订妆位的头上（真机跑出来的）。
  let blockedBeforeLunch = false
  if (nl && nl.enabled) {
    for (let j = idx + 1; j <= nl.afterSeq - 1; j++) {
      if (arr[j] && arr[j].booked) { blockedBeforeLunch = true; break }
    }
  }

  let lunchRemoved = false
  if (nl && nl.enabled && delta !== 0 && !blockedBeforeLunch && Number(seq) <= nl.afterSeq) {
    const mode = lunchMode || (delta > 0 ? 'squeeze' : 'follow')
    if (mode === 'squeeze') {
      const ls = toMin(nl.start) + delta
      const le = toMin(nl.end)
      if (ls >= le) {
        // 午休被压到 0 了：不留下一个 0 分钟的假午休，直接取消。页面会告诉用户。
        nl = { enabled: false, min: 0, afterSeq: nl.afterSeq, start: nl.start, end: nl.end }
        lunchRemoved = true
      } else {
        nl.start = toHHMM(ls)
        nl.end = toHHMM(le)
        nl.min = le - ls
      }
    } else if (mode === 'follow') {
      nl.start = toHHMM(toMin(nl.start) + delta)
      nl.end = toHHMM(toMin(nl.end) + delta)
    }
    // 'pin'：什么都不做
  }

  // ── 后面顺延（撞上已预订妆位就停）──
  const from = idx + 1
  const collision = from < arr.length
    ? reflow(arr, from, toMin(arr[idx].end) + gap, gap, nl)
    : false
  return { slots: arr, lunch: nl, collision, lunchRemoved }
}

/**
 * 改第 seq 个妆位时，午休还能不能跟着动。
 * 「被改的妆位」和「午休」之间隔着已预订妆位 → 顺延到它就得停，
 * 午休前面那些妆位没动，午休也就不能动（否则会挪到已预订妆位头上）。
 * 页面用它决定：缩短时到底要不要弹那句「要提前午休吗」——
 * 弹了却办不到，比不弹更糟。
 */
function lunchMovable(slots, seq, lunch) {
  if (!lunch || !lunch.enabled) return false
  if (Number(seq) > lunch.afterSeq) return false
  const arr = slots || []
  for (let j = Number(seq); j <= lunch.afterSeq - 1; j++) {
    if (arr[j] && arr[j].booked) return false
  }
  return true
}

/**
 * 改午休：起点 + 时长（规则 ③）。
 * 结束 = 起点 + 时长；午休后面的妆位跟着午休结束顺延，同样撞到已预订妆位就停。
 * 返回 { slots, lunch, collision }
 */
function adjustLunch(slots, lunch, newStartMin, newMinutes, gapMin) {
  const arr = cloneSlots(slots)
  if (!lunch || !lunch.enabled) return { slots: arr, lunch: cloneLunch(lunch), collision: false }
  const m = Number(newMinutes)
  const ls = Number(newStartMin)
  if (!(m > 0) || !(ls >= 0)) return { slots: arr, lunch: cloneLunch(lunch), collision: false }

  const gap = Number(gapMin) || 10
  const nl = { enabled: true, afterSeq: lunch.afterSeq, min: m, start: toHHMM(ls), end: toHHMM(ls + m) }
  const from = nl.afterSeq                       // 午休后第一个妆位 = 0 基索引 afterSeq
  const collision = from < arr.length ? reflow(arr, from, ls + m, gap, nl) : false
  return { slots: arr, lunch: nl, collision }
}

/**
 * 取消午休（规则 ②）：只把午休这一段拿掉，【后面妆位的时间一律不动】。
 * 中间会留下一段空档 —— 空档正是之后还能把妆位插回来的地方。
 */
function removeLunch(lunch) {
  return lunch ? { enabled: false, min: lunch.min, afterSeq: lunch.afterSeq } : null
}

/**
 * 删除妆位（规则 ②）：只拿掉这一个，【后面妆位的时间一律不动】。
 * 序号顺次重排（1..N-1）；时间留出空档，可以由「＋」再插回来。
 * 午休跟在被删妆位后面 → afterSeq 前移；午休【前面】没妆位了就取消。
 * ⚠️ 午休【后面】没妆位时【保留】—— 详情页没有「再加一个午休」的入口，
 *    删掉就找不回来了；尾随的午休下面照样有「＋」，可以再插妆位回来。
 * 返回 { slots, lunch, lunchRemoved }
 */
function removeSlot(slots, seq, lunch) {
  const arr = cloneSlots(slots)
  let nl = cloneLunch(lunch)
  const idx = Number(seq) - 1
  if (idx < 0 || idx >= arr.length) return { slots: arr, lunch: nl, lunchRemoved: false }

  arr.splice(idx, 1)
  arr.forEach((s, i) => { s.seq = i + 1 })

  let lunchRemoved = false
  if (nl && nl.enabled) {
    if (Number(seq) <= nl.afterSeq) nl.afterSeq -= 1
    // 午休前面得有妆位，否则它没有「跟在谁后面」可言 → 只能取消。
    // 后面没有妆位则保留（尾随午休），见上面函数头的说明。
    if (nl.afterSeq < 1) {
      nl = { enabled: false, min: nl.min, afterSeq: nl.afterSeq }
      lunchRemoved = true
    }
  }
  return { slots: arr, lunch: nl, lunchRemoved }
}

/**
 * 插入妆位（规则 ②）：插到【第 afterSeq 个妆位之后】（afterSeq = 0 插到最前）。
 * 后面妆位的时间一律不动 —— 所以调用方必须先算好空档；塞不下就别调用这个函数。
 * startMin 是新妆位的开始时间（分钟）。
 * afterSeq 传午休前一个妆位的序号 = 插在午休后面。
 *
 * lunchAfter：「新妆位要挡在午休【前面】」。
 * ⚠️ 这个参数不能省，光看 afterSeq 分不清 —— 「＋」在午休【前一个妆位】下面
 *    和「＋」在午休【那一行】下面，afterSeq 是同一个数，但一个要插在午休前、
 *    一个要插在午休后。判错了行序就会反过来（午休 12:00 排在一个 10:30 的
 *    妆位前面），列表看着就是坏的。
 * 返回 { slots, lunch }
 */
function insertSlot(slots, afterSeq, startMin, minutes, lunch, lunchAfter) {
  const arr = cloneSlots(slots)
  const nl = cloneLunch(lunch)
  const idx = Math.max(0, Math.min(Number(afterSeq) || 0, arr.length))
  const m = Number(minutes) || 0
  const st = Number(startMin) || 0

  arr.splice(idx, 0, {
    seq: idx + 1, start: toHHMM(st), end: toHHMM(st + m),
    minutes: m, is_break: false, booked: false
  })
  arr.forEach((s, i) => { s.seq = i + 1 })

  // 新妆位落在午休前面（插在更靠前的妆位后面，或者正好插在午休前那个妆位后面）
  // → 午休往后挪一格，仍然跟在它原来跟的那个妆位后面。
  if (nl && nl.enabled && (idx < nl.afterSeq || (lunchAfter && idx === nl.afterSeq))) {
    nl.afterSeq += 1
  }
  return { slots: arr, lunch: nl }
}

/**
 * 把某些序号标成「已预订」。
 * M0：由 mock 假预约单推导（见页面里 bookedSeqsOf）；M1：slots.booked 字段直接带出来。
 */
function markBooked(slots, seqs) {
  const set = {}
  ;(seqs || []).forEach((n) => { set[Number(n)] = true })
  return cloneSlots(slots).map((s) => ({ ...s, booked: !!set[s.seq] }))
}

/**
 * 详情页的行视图：把午休插成【独立一行】，夹在它跟的那个妆位后面。
 * 每行带 nextStart（下一行的开始时间，'' = 后面没有了）——
 * 插入妆位要用它算「这一行下面还剩多少空档」。
 */
function buildRows(slots, lunch) {
  const arr = (slots || []).slice()
  const out = []
  for (let i = 0; i < arr.length; i++) {
    const s = arr[i]
    out.push({
      key: 's' + s.seq, type: 'slot', seq: s.seq, start: s.start, end: s.end,
      minutes: s.minutes, booked: !!s.booked, nextStart: ''
    })
    if (lunch && lunch.enabled && s.seq === lunch.afterSeq) {
      out.push({
        key: 'L', type: 'lunch', seq: '', start: lunch.start, end: lunch.end,
        minutes: lunch.min, booked: false, nextStart: ''
      })
    }
  }
  for (let i = 0; i < out.length - 1; i++) out[i].nextStart = out[i + 1].start
  return out
}

/**
 * 兼容旧调用：把午休起止作为注释附在午休前那个妆位行上（新建档期页的预览还在用）。
 * 详情页已经改成 buildRows 的独立午休行。
 */
function buildSlotsView(slots, lunch, gapMin) {
  const gap = Number(gapMin) || 10
  return (slots || []).map((s) => {
    const v = { ...s }
    if (lunch && lunch.enabled && s.seq === lunch.afterSeq) {
      const ls = toMin(s.end) + gap
      const le = ls + lunch.min
      v.lunchAfter = '后接午休 ' + toHHMM(ls) + ' – ' + toHHMM(le)
    } else {
      v.lunchAfter = ''
    }
    return v
  })
}

function scheduleRange(slots) {
  if (!slots || !slots.length) return ''
  return slots[0].start + ' – ' + slots[slots.length - 1].end
}

/* ══ 日期差（2026-09-30 第二十处：从 pages/booking/booking.js 抽到这儿）══
   🔴 抽出来的理由：妆娘端要「按离今天多近排场次」，顾客端要「只列今天及以后」
      —— 同一件事（这一天离今天多远）两个端各算一遍的话，
      某天有人改了其中一处的「今天」怎么取，两边的排序就会悄悄分成两套，
      而且**两个端各自看都挺合理**，没有一处会报错。

   ⚠️ 手算，⛔ 不 new Date('2026-05-02')：各平台对短横线格式的解析并不一致
      （有的按 UTC、有的按本地），而这里只要一个能相减的数。
   ⚠️ 全部按【本地日】取整（setHours 那一步在 todayNum 里）。 */
function dayNum(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''))
  if (!m) return null
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000
}

function todayNum() {
  const d = new Date()
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000
}

/* 这场的日期离今天有多远（绝对值）。没日期 / 日期写坏了 → 排到最后。 */
function awayFromToday(date) {
  const v = dayNum(date)
  return v === null ? Number.MAX_SAFE_INTEGER : Math.abs(v - todayNum())
}

/* 是不是「今天及以后」。
   🔴 认不出日期时返回 **true**（留着），⛔ 不是 false ——
      筛掉一个妆娘自己建的场次必须是「它确实过期了」，
      不是「我读不懂它的日期」。后者悄悄藏起来的话，
      她建了一场、顾客端一场都看不到，而且谁都不报错。 */
function isTodayOrLater(date) {
  const v = dayNum(date)
  if (v === null) return true
  return v >= todayNum()
}

module.exports = {
  toMin, toHHMM, generateSlots, buildSlotsView, buildRows, markBooked,
  shiftSlot, lunchMovable, adjustLunch, removeLunch, removeSlot, insertSlot,
  scheduleRange,
  dayNum, todayNum, awayFromToday, isTodayOrLater
}
