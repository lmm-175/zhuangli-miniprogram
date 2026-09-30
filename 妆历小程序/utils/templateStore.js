/**
 * 妆师端 · 档期模板存储（M0 纯前端：写本机 storage）。
 * 首次为空时用 mock 示例填充；之后「存为模板」写入的档期会追加进来。
 * M1 换成云开发的 schedule_template 集合。
 */
const KEY = 'zhuangli_templates'
const { TEMPLATES } = require('../mock/data')
const { toMin, toHHMM } = require('./schedule')

/* 妆位时长 / 间隔推不出来时的兜底，跟新建档期页的默认值对齐 */
const FALLBACK_SLOT_MIN = 80
const FALLBACK_GAP_MIN = 10

/* 首次进入时种入示例模板，让列表有内容、也证明存储可用 */
function seed() {
  if (!wx.getStorageSync(KEY)) {
    wx.setStorageSync(KEY, TEMPLATES)
  }
}

function getTemplates() {
  seed()
  return wx.getStorageSync(KEY) || []
}

function addTemplate(t) {
  const list = getTemplates()
  list.push(t)
  wx.setStorageSync(KEY, list)
  return t
}

function removeTemplate(id) {
  const list = getTemplates().filter((x) => x.template_id !== id)
  wx.setStorageSync(KEY, list)
}

function newId() {
  return 'tpl-' + Date.now()
}

/* ══ 模板 → 一条能直接存进档期库的记录（纯函数，可以 node 断言）══════════

   为什么要有这个：「应用」不是把模板名抄进新建档期页，而是【当场生成一条
   档期】。模板里只存了名称和妆位，可详情页要的是一条完整档期 —— 起始时间、
   妆位时长、间隔、午休，缺一样排班就不对。能从妆位反推的就反推，推不出来
   的才用兜底值。

   ⚠️ 妆位有两种历史形状，都得认，不然示例模板一「应用」就是一堆空时间：
     新建模板存的：{ seq, start:'09:00', end:'10:20', minutes:80 }
     示例模板存的：{ seq, time:'09:00 – 10:20' }   ← mock/data.js，注意是带空格的短横线
   所以这里不按字段名取，直接在整串文本里捞 'HH:MM'，捞到两个就是起止。 */
function hhmmPair(s) {
  const found = String((s && (s.time || '')) || '').match(/\d{1,2}:\d{2}/g) || []
  return [found[0] || '', found[1] || '']
}

/* ══ 模板 → 一条档期 ═════════════════════════════════════════════════
   name 是【第 4 个参数】，2026-09-30 加的：应用模板时漫展名要能改。
   ⚠️ 顺序是「传进来的名字 → 模板自己的名字 → 兜底」。
      ⛔ 别反过来让模板名优先 —— 一场模板（比如「漫展双日通用」）套到不同
         漫展上，名字必须跟着这一场走，模板名只是个预填值。
   ⚠️ 传空串 / 只有空格 = 没改，回落到模板名。 */
function templateToSchedule(tpl, date, id, name) {
  const t = tpl || {}
  const picked = String(name == null ? '' : name).trim()
  const slots = (t.slots || []).map((s, i) => {
    const pair = hhmmPair(s)
    const start = s.start || pair[0] || '09:00'
    let end = s.end || pair[1] || ''
    let minutes = Number(s.minutes) || 0
    if (!minutes && end && toMin(end) > toMin(start)) minutes = toMin(end) - toMin(start)
    if (!minutes) minutes = FALLBACK_SLOT_MIN
    if (!end) end = toHHMM(toMin(start) + minutes)
    return {
      seq: i + 1,
      start: start,
      end: end,
      minutes: minutes,
      is_break: !!s.is_break,
      booked: false            // 新档期当然还没有人预订
    }
  })

  const first = slots[0] || {}
  const second = slots[1] || {}
  const gap = (first.end && second.start) ? toMin(second.start) - toMin(first.end) : 0

  return {
    schedule_id: id,
    name: picked || t.name || '未命名档期',
    date: date || '',
    startTime: first.start || '09:00',
    // 模板自己记了就用它（新建模板时会一起存），没有就从妆位反推
    slotMin: Number(t.slotMin) || Number(first.minutes) || FALLBACK_SLOT_MIN,
    gapMin: Number(t.gapMin) || (gap > 0 ? gap : FALLBACK_GAP_MIN),
    count: slots.length,
    // 老模板没有 lunch 字段。没有就是没有，不要凭空编一个出来 ——
    // 编出来会在详情页多出一行浅蓝的午休，而妆娘从没设过。
    lunch: (t.lunch && t.lunch.enabled) ? t.lunch : null,
    slots: slots
  }
}

module.exports = { getTemplates, addTemplate, removeTemplate, newId, templateToSchedule }
