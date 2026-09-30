/* 把「妆历 自测.js」里旧的 ⑧ 段整段换成 _tmp_sec8.js 的内容。
   ⚠️ 用 Write 工具写脚本、⛔ 不用 heredoc —— heredoc 会吃掉反斜杠，
      而这一段里全是正则里的 \。 */
const fs = require('fs')
const path = require('path')
const dir = __dirname
const target = path.join(dir, '妆历 自测.js')
const src = fs.readFileSync(target, 'utf8')

const startMark = "console.log('\\n════ ⑧ 档期取消（这一场没有预约单才让取消）════')"
const i = src.indexOf(startMark)
if (i < 0) { console.error('✗ 找不到 ⑧ 的起点'); process.exit(1) }

const tailMark = "\nrestoreBookings()\n\nconsole.log("
const j = src.indexOf(tailMark, i)
if (j < 0) { console.error('✗ 找不到 ⑧ 的终点'); process.exit(1) }

const sec = fs.readFileSync(path.join(dir, '_tmp_sec8.js'), 'utf8')
const out = src.slice(0, i) + sec + src.slice(j)
fs.writeFileSync(target, out)

console.log('✓ ⑧ 段已替换')
console.log('  旧段 ' + (j - i) + ' 字符 → 新段 ' + sec.length + ' 字符')
console.log('  文件总行数 ' + out.split('\n').length)
