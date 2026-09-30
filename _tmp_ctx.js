const fs = require('fs'), readline = require('readline')
const P = 'C:/Users/cyyycy/.claude/projects/C--Users-cyyycy-Desktop-make-up/7e4b2391-02fd-4082-ad42-68387f364b22.jsonl'
const rl = readline.createInterface({ input: fs.createReadStream(P), crlfDelay: Infinity })
let n = 0
rl.on('line', (line) => {
  n++
  if (n < 5330 || n > 5450) return
  let o; try { o = JSON.parse(line) } catch (e) { return }
  const m = o.message; if (!m) return
  let kind = m.role, txt = ''
  if (typeof m.content === 'string') txt = m.content
  else if (Array.isArray(m.content)) {
    for (const c of m.content) {
      if (c.type === 'text') txt += c.text
      else if (c.type === 'tool_use') txt += '[TOOL ' + c.name + ' ' + ((c.input.file_path||'').split(/[\/]/).slice(-2).join('/')) + ']'
      else if (c.type === 'tool_result') txt += '[RESULT]'
    }
  }
  txt = txt.replace(/\s+/g, ' ').slice(0, 110)
  if (/用户|user/.test(kind) || txt.indexOf('已建好的展子') >= 0)
    console.log(String(n).padStart(5) + ' ' + kind.padEnd(10) + ' ' + txt)
})
