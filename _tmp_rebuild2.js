const fs = require('fs'), path = require('path'), readline = require('readline')
const P = 'C:/Users/cyyycy/.claude/projects/C--Users-cyyycy-Desktop-make-up/7e4b2391-02fd-4082-ad42-68387f364b22.jsonl'
const BOUND = 6090
const SEP = String.fromCharCode(92)          // 反斜杠，绕开 heredoc 吃转义
const norm = (fp) => path.resolve(fp).split(SEP).join('/').toLowerCase()
const short = (fp) => fp.split(SEP).join('/').split('/').slice(-2).join('/')

const ops = new Map()
const rl = readline.createInterface({ input: fs.createReadStream(P), crlfDelay: Infinity })
let n = 0
rl.on('line', (line) => {
  n++
  let o; try { o = JSON.parse(line) } catch (e) { return }
  const m = o.message; if (!m || !Array.isArray(m.content)) return
  for (const c of m.content) {
    if (c.type !== 'tool_use' || (c.name !== 'Edit' && c.name !== 'Write')) continue
    const fp = c.input && c.input.file_path; if (!fp) continue
    const k = norm(fp)
    if (!ops.has(k)) ops.set(k, { display: short(fp), list: [] })
    ops.get(k).list.push(Object.assign({ idx: n, type: c.name }, c.input))
  }
})
rl.on('close', () => {
  for (const [, { display, list }] of ops) {
    if (!list.some((o) => o.idx >= BOUND)) continue
    const before = list.filter((o) => o.idx < BOUND)
    const w = before.filter((o) => o.type === 'Write')
    console.log(display)
    console.log('   BOUND 之前 ' + before.length + ' 次，其中整体写入 ' + w.length + ' 次' +
      (w.length ? '（行 ' + w.map((x) => x.idx).join(',') + ' / 字节 ' + w.map((x) => Buffer.byteLength(x.content)).join(',') + '）' : ''))
    console.log('   BOUND 之后 ' + list.filter((o) => o.idx >= BOUND).length + ' 次')
  }
})
