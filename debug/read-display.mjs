// 展开某一局的 display.capture：看界面渲染出来的是什么。
// 用来回答"界面类脚本到底跑没跑" —— helper 事件数对这类脚本不作数。
import fs from 'node:fs'
import path from 'node:path'

const CHATS = 'C:/Users/213123543/.dsh/profile-data/tavern/data/chats'
const chatId = process.argv[2]
if (!chatId) {
  console.log('用法：node read-display.mjs <chatId>')
  process.exit(1)
}
const jdir = path.join(CHATS, chatId, 'journals')
const jfile = fs.readdirSync(jdir).filter((n) => n.endsWith('.jsonl')).sort().pop()
const lines = fs.readFileSync(path.join(jdir, jfile), 'utf8').split('\n').filter(Boolean)

console.log('对局 ' + chatId + ' · journal ' + jfile + '（' + lines.length + ' 行）')
console.log('')

let idx = 0
for (const line of lines) {
  let j
  try {
    j = JSON.parse(line)
  } catch {
    continue
  }
  if (j.source !== 'display.capture') continue
  idx += 1
  console.log('── display.capture #' + idx + '  rev ' + j.revision + ' ──')
  for (const ch of j.changes || []) {
    const p = (ch.path || []).join('.')
    if (p.startsWith('messages')) {
      // 消息数组：逐个看它的 displayText / text / mvu 字段
      const arr = Array.isArray(ch.value) ? ch.value : null
      if (arr) {
        console.log('   messages 共 ' + arr.length + ' 条')
        arr.forEach((m, i) => {
          const role = m.role || '?'
          const disp = typeof m.displayText === 'string' ? m.displayText : ''
          const txt = typeof m.text === 'string' ? m.text : ''
          const proj = typeof m.projectionText === 'string' ? m.projectionText : ''
          console.log(
            `     [${i}] ${role}  displayText=${disp.length}  text=${txt.length}  projectionText=${proj.length}` +
              (m.greeting ? '  (开场)' : '') +
              (m.mvu ? '  mvu=' + JSON.stringify(Object.keys(m.mvu)) : ''),
          )
          const sample = (disp || proj || txt).slice(0, 220).replace(/\n/g, ' ⏎ ')
          if (sample) console.log('         ' + sample)
        })
      } else if (ch.value && typeof ch.value === 'object') {
        console.log('   ' + p + ' = ' + JSON.stringify(ch.value).slice(0, 150))
      }
    } else {
      console.log('   ' + ch.op + ' ' + p + ' = ' + JSON.stringify(ch.value).slice(0, 90))
    }
  }
  console.log('')
}
console.log('共 ' + idx + ' 条 display.capture')
