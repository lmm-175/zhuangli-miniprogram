const fs = require('fs'), readline = require('readline')
const P = 'C:/Users/cyyycy/.claude/projects/C--Users-cyyycy-Desktop-make-up/7e4b2391-02fd-4082-ad42-68387f364b22.jsonl'
const rl = readline.createInterface({ input: fs.createReadStream(P), crlfDelay: Infinity })
let n = 0
rl.on('line', (line) => {
  n++
  let o
  try { o = JSON.parse(line) } catch (e) { return }
  const msg = o.message
  if (!msg || !Array.isArray(msg.content)) return
  for (const c of msg.content) {
    if (c.type !== 'tool_use') continue
    if (c.name !== 'Edit' && c.name !== 'Write' && c.name !== 'NotebookEdit') continue
    const fp = (c.input && (c.input.file_path || c.input.notebook_path)) || ''
    if (!/schedule/i.test(fp)) continue
    const base = fp.split(/[\/]/).slice(-2).join('/')
    const oldS = c.input.old_string || ''
    const first = oldS.split('\n').find((l) => l.trim()) || ''
    console.log(String(n).padStart(6) + '  ' + (o.timestamp || '').slice(11, 19) + '  ' + c.name.padEnd(5) + ' ' + base.padEnd(28) + ' | ' + first.trim().slice(0, 78))
  }
})
rl.on('close', () => console.log('---- total lines: ' + n + ' ----'))
