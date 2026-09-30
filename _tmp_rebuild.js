const fs = require('fs'), path = require('path'), readline = require('readline')
const P = 'C:/Users/cyyycy/.claude/projects/C--Users-cyyycy-Desktop-make-up/7e4b2391-02fd-4082-ad42-68387f364b22.jsonl'
const BOUND = 6090            // Request N 那条用户消息所在行
const OUT = '_回退_请求M'

const ops = new Map()         // file -> [{idx,type,old_string,new_string,content,replace_all}]
const rl = readline.createInterface({ input: fs.createReadStream(P), crlfDelay: Infinity })
let n = 0
rl.on('line', (line) => {
  n++
  let o; try { o = JSON.parse(line) } catch (e) { return }
  const m = o.message; if (!m || !Array.isArray(m.content)) return
  for (const c of m.content) {
    if (c.type !== 'tool_use') continue
    if (c.name !== 'Edit' && c.name !== 'Write') continue
    const fp = c.input && c.input.file_path
    if (!fp) continue
    if (!ops.has(fp)) ops.set(fp, [])
    ops.get(fp).push(Object.assign({ idx: n, type: c.name }, c.input))
  }
})
rl.on('close', () => {
  const report = []
  for (const [fp, list] of ops) {
    if (!list.some((o) => o.idx >= BOUND)) continue          // 这条线之后没动过 → 不用管
    const tail = path.relative('C:/Users/cyyycy/Desktop/make up', fp)
    let base = null, start = -1
    for (let i = 0; i < list.length; i++) {
      if (list[i].idx >= BOUND) break
      if (list[i].type === 'Write') { base = list[i].content; start = i }
    }
    let cur, how
    if (base !== null) {
      cur = base; how = '正向回放（最后一次整体写入 + 之后的编辑）'
    } else {
      cur = fs.readFileSync(fp, 'utf8'); how = '逆向撤销（从当前文件倒着撤）'
    }
    const errs = []
    if (base !== null) {
      for (let i = start + 1; i < list.length; i++) {
        const op = list[i]
        if (op.idx >= BOUND) break
        if (op.type === 'Write') { cur = op.content; continue }
        if (cur.indexOf(op.old_string) < 0) { errs.push('找不到 old_string @' + op.idx); continue }
        cur = op.replace_all ? cur.split(op.old_string).join(op.new_string)
                             : cur.replace(op.old_string, op.new_string)
      }
    } else {
      for (let i = list.length - 1; i >= 0; i--) {
        const op = list[i]
        if (op.idx < BOUND) break
        if (op.type === 'Write') { errs.push('逆向撤销遇到整体写入，无法还原 @' + op.idx); break }
        if (cur.indexOf(op.new_string) < 0) { errs.push('找不到 new_string @' + op.idx); continue }
        cur = op.replace_all ? cur.split(op.new_string).join(op.old_string)
                             : cur.replace(op.new_string, op.old_string)
      }
    }
    const dst = path.join(OUT, tail)
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    fs.writeFileSync(dst, cur)
    report.push({ tail, how, bytes: Buffer.byteLength(cur), errs, after: list.filter((o) => o.idx >= BOUND).length })
  }
  for (const r of report) {
    console.log((r.errs.length ? '⚠️ ' : '✅ ') + r.tail)
    console.log('     ' + r.how + ' · ' + r.bytes + ' 字节 · 这之后被改过 ' + r.after + ' 次')
    r.errs.forEach((e) => console.log('     ⚠️ ' + e))
  }
})
