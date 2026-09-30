const fs = require('fs'), path = require('path'), readline = require('readline')
const P = 'C:/Users/cyyycy/.claude/projects/C--Users-cyyycy-Desktop-make-up/7e4b2391-02fd-4082-ad42-68387f364b22.jsonl'
const BOUND = 6090
const SEP = String.fromCharCode(92)
const short = (fp) => fp.split(SEP).join('/').split('/').slice(-2).join('/')

// 先把 tool_use(Read) 按 id 记下来，再从 tool_result 里取回内容
const reads = new Map()     // tool_use_id -> { line, file_path, offset, limit }
const out = []
const rl = readline.createInterface({ input: fs.createReadStream(P), crlfDelay: Infinity })
let n = 0
rl.on('line', (line) => {
  n++
  let o; try { o = JSON.parse(line) } catch (e) { return }
  const m = o.message; if (!m || !Array.isArray(m.content)) return
  for (const c of m.content) {
    if (c.type === 'tool_use' && c.name === 'Read' && c.input && c.input.file_path) {
      reads.set(c.id, { line: n, file_path: c.input.file_path, offset: c.input.offset, limit: c.input.limit })
    }
    if (c.type === 'tool_result' && reads.has(c.tool_use_id)) {
      const info = reads.get(c.tool_use_id)
      let text = ''
      if (typeof c.content === 'string') text = c.content
      else if (Array.isArray(c.content)) text = c.content.filter((x) => x.type === 'text').map((x) => x.text).join('\n')
      if (!/\.(js|wxml|wxss)$/.test(info.file_path)) continue
      out.push({ line: info.line, fp: short(info.file_path), offset: info.offset || 1, bytes: text.length, text })
    }
  }
})
rl.on('close', () => {
  out.sort((a, b) => a.line - b.line)
  for (const r of out) {
    console.log(String(r.line).padStart(5) + (r.line < BOUND ? '  [BOUND前]' : '  [BOUND后]') +
      '  ' + r.fp.padEnd(32) + ' offset=' + String(r.offset).padEnd(5) + ' 长度 ' + r.bytes)
  }
  console.log('---- 共 ' + out.length + ' 次读取 ----')
})
