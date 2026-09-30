const path = require('path')
const R = (p) => path.join(__dirname, p)

// 模拟：妆娘建了三场档期（名字/日期都不同），看四个 Tab 有没有串场
const store = {
  zhuangli_schedules: [
    { schedule_id: 'sched-100', name: '示例漫展', date: '2026-05-02', slots: [] },
    { schedule_id: 'sched-200', name: '示例漫展', date: '2026-05-03', slots: [] }
  ]
}
global.wx = {
  getStorageSync: (k) => store[k],
  setStorageSync: (k, v) => { store[k] = v },
  navigateTo: () => {}, nav: () => {}
}
let cfg = null
global.Page = (c) => { cfg = c }
require(R('妆历小程序/pages/booking/booking.js'))
const pg = {}
for (const k in cfg) pg[k] = cfg[k]
pg.data = JSON.parse(JSON.stringify(cfg.data))
pg.setData = function (patch) {
  for (const k in patch) {
    const parts = k.split('.'); let o = this.data
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]]
    o[parts[parts.length - 1]] = patch[k]
  }
}
const goto = (i) => pg.onTab({ currentTarget: { dataset: { i } } })
const sched = (id) => pg.onSched({ currentTarget: { dataset: { id } } })

pg.onShow()
console.log('chips =', pg.data.schedChips.map((c) => c.id + ':' + c.label).join(' | '))
console.log('默认 schedId =', pg.data.schedId)
for (const id of ['sched-100', 'sched-200', 'all']) {
  sched(id)
  const out = []
  for (let i = 0; i < 4; i++) { goto(i); out.push(pg.data.tabs[i].label + '=' + (pg.data.rows.map((r) => r.id).join(',') || '空')) }
  console.log(id.padEnd(10), out.join('  '))
}
