const fs = require('fs'), readline = require('readline')
const P = 'C:/Users/cyyycy/.claude/projects/C--Users-cyyycy-Desktop-make-up/7e4b2391-02fd-4082-ad42-68387f364b22.jsonl'
const rl = readline.createInterface({ input: fs.createReadStream(P), crlfDelay: Infinity })
let n = 0
rl.on('line', (line) => {
  n++
  let o; try { o = JSON.parse(line) } catch (e) { return }
  const m = o.message; if (!m || m.role !== 'user') return
  let txt = ''
  if (typeof m.content === 'string') txt = m.content
  else if (Array.isArray(m.content)) {
    if (m.content.some((c) => c.type === 'tool_result')) return
    txt = m.content.filter((c) => c.type === 'text').map((c) => c.text).join(' ')
  }
  if (!txt.trim()) return
  if (txt.indexOf('This session is being continued') === 0) { console.log(String(n).padStart(5) + '  ==== 上下文压缩 ===='); return }
  console.log(String(n).padStart(5) + '  ' + txt.replace(/\s+/g, ' ').slice(0, 90))
})
