/**
 * 把 6 个文件还原到「Request M 收工、Request N 还没动手」的那一刻。
 *
 * 两条路，因为记录里能拿到的证据不一样：
 *   A. schedule.js —— 边界之后有一次【整体重写】（Request N 那次），倒着撤会撞上它、
 *      拿不到重写前的内容。改用我当时的【读取结果】当底稿（记录里存着原文）。
 *   B. 其余 5 个 —— 边界之后只有【编辑】，直接从当前文件倒着撤。
 *
 * ⛔ 只写进 _回退_请求M/ 暂存目录，不动现有文件。确认无误再覆盖。
 */
const fs = require('fs'), path = require('path'), readline = require('readline')
const P = 'C:/Users/cyyycy/.claude/projects/C--Users-cyyycy-Desktop-make-up/7e4b2391-02fd-4082-ad42-68387f364b22.jsonl'
const ROOT = 'C:/Users/cyyycy/Desktop/make up'
const OUT = path.join(ROOT, '_回退_请求M')
const BOUND = 6090
const SEP = String.fromCharCode(92)
const norm = (fp) => path.resolve(fp).split(SEP).join('/').toLowerCase()

// 底稿：行号 -> 目标相对路径（用记录里读到的原文）
const BASE_FROM_READ = { 5234: '妆历小程序/pages/schedule/schedule.js' }

const ops = new Map()          // key -> [{idx,type,...}]
const readBase = new Map()     // key -> text
const readReq = []             // 待取回内容的 read 请求
const byId = new Map()

const rl = readline.createInterface({ input: fs.createReadStream(P), crlfDelay: Infinity })
let n = 0
rl.on('line', (line) => {
  n++
  let o; try { o = JSON.parse(line) } catch (e) { return }
  const m = o.message; if (!m || !Array.isArray(m.content)) return
  for (const c of m.content) {
    if (c.type === 'tool_use' && (c.name === 'Edit' || c.name === 'Write') && c.input && c.input.file_path) {
      const k = norm(c.input.file_path)
      if (!ops.has(k)) ops.set(k, { display: c.input.file_path, list: [] })
      ops.get(k).list.push(Object.assign({ idx: n, type: c.name }, c.input))
    }
    if (c.type === 'tool_use' && c.name === 'Read' && BASE_FROM_READ[n] && c.input && c.input.file_path) {
      byId.set(c.id, n)
    }
    if (c.type === 'tool_result' && byId.has(c.tool_use_id)) {
      const ln = byId.get(c.tool_use_id)
      let text = ''
      if (typeof c.content === 'string') text = c.content
      else if (Array.isArray(c.content)) text = c.content.filter((x) => x.type === 'text').map((x) => x.text).join('\n')
      // 去掉 Read 输出的「行号 + 制表符」前缀
      const body = text.split('\n').map((l) => l.replace(/^\s*\d+\t/, '')).join('\n')
      readBase.set(BASE_FROM_READ[ln], body)
    }
  }
})
rl.on('close', () => {
  const targets = new Set()
  for (const [, { display, list }] of ops) {
    if (list.some((o) => o.idx >= BOUND)) targets.add(norm(display))
  }
  for (const [, { display, list }] of ops) {
    const k = norm(display)
    if (!targets.has(k)) continue
    const tail = path.relative(ROOT, list[0].file_path.split(SEP).join('/'))
    const rel = tail.split(SEP).join('/')
    // 只碰小程序代码，外加根目录的自测脚本（它是跟着代码走的，不一起退会整片飘红）
    const isApp = /妆历小程序[\\/](pages|utils|components)[\\/]/.test(list[0].file_path)
    const isSelfTest = /妆历 自测\.js$/.test(list[0].file_path)
    if (!isApp && !isSelfTest) continue

    const post = list.filter((o) => o.idx >= BOUND)
    const writes = post.filter((o) => o.type === 'Write')
    let cur, how, errs = []

    if (writes.length) {
      // A 路：必须靠读取结果当底稿
      const base = readBase.get(rel)
      if (base == null) { console.log('❌ ' + rel + ' —— 边界后有整体重写，但记录里没找到可用的原文'); return }
      cur = base; how = '取自当时的读取原文（行 ' + 5234 + '）'
    } else {
      // B 路：从当前文件倒着撤
      cur = fs.readFileSync(list[0].file_path, 'utf8'); how = '从当前文件倒着撤回'
      for (let i = post.length - 1; i >= 0; i--) {
        const op = post[i]
        if (cur.indexOf(op.new_string) < 0) { errs.push('找不到 new_string @' + op.idx); continue }
        cur = op.replace_all ? cur.split(op.new_string).join(op.old_string)
                             : cur.replace(op.new_string, op.old_string)
      }
    }
    const dst = path.join(OUT, rel)
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    fs.writeFileSync(dst, cur)
    console.log((errs.length ? '⚠️ ' : '✅ ') + rel)
    console.log('     ' + how + ' · ' + Buffer.byteLength(cur) + ' 字节 · 边界后改动 ' + post.length + ' 次')
    errs.forEach((e) => console.log('     ⚠️ ' + e))
  }
})
