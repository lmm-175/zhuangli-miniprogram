const fs = require('fs'), readline = require('readline')
const P = 'C:/Users/cyyycy/.claude/projects/C--Users-cyyycy-Desktop-make-up/7e4b2391-02fd-4082-ad42-68387f364b22.jsonl'
const rl = readline.createInterface({ input: fs.createReadStream(P), crlfDelay: Infinity })
let n = 0
const hits = []
rl.on('line', (line) => {
  n++
  if (line.indexOf('已建好的展子') >= 0 || line.indexOf('取消这一场') >= 0) hits.push(n)
})
rl.on('close', () => { console.log('用户 Request N 那条消息出现在行：', hits.join(', ')) })
