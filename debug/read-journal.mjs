// 读某一局的 journal，把 MVU 初始化和变量落库情况说清楚。
// 用法：node tools/mvu-api-test/read-journal.mjs [chatId]
import fs from 'node:fs'
import path from 'node:path'

const CHATS = 'C:/Users/213123543/.dsh/profile-data/tavern/data/chats'

const chatId =
  process.argv[2] ||
  fs
    .readdirSync(CHATS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, t: fs.statSync(path.join(CHATS, d.name)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0].name

const dir = path.join(CHATS, chatId)
const jdir = path.join(dir, 'journals')
const jfile = fs
  .readdirSync(jdir)
  .filter((n) => n.endsWith('.jsonl'))
  .sort()
  .pop()

console.log('对局：' + chatId)
console.log('journal：' + jfile)
const lines = fs.readFileSync(path.join(jdir, jfile), 'utf8').split('\n').filter(Boolean)
console.log('行数：' + lines.length)
console.log('')

const sources = {}
const rows = []
for (const line of lines) {
  let j
  try {
    j = JSON.parse(line)
  } catch {
    continue
  }
  sources[j.source] = (sources[j.source] || 0) + 1
  for (const ch of j.changes || []) rows.push({ src: j.source, op: ch.op, p: ch.path, v: ch.value })
}

console.log('=== 事件流 ===')
for (const [k, v] of Object.entries(sources).sort((a, b) => b[1] - a[1])) console.log('  ' + k.padEnd(34) + '×' + v)

// 初始化状态：找 mvu.openingInitialization 下的写入
console.log('')
console.log('=== MVU 开场初始化 ===')
const init = rows.filter((r) => r.p && r.p[0] === 'mvu' && r.p[1] === 'openingInitialization')
if (!init.length) console.log('  （journal 里没有它的写入记录）')
for (const r of init) console.log('  ' + (r.p[2] || '?') + ' = ' + JSON.stringify(r.v).slice(0, 80))

// 变量落库
console.log('')
console.log('=== 变量落库（messages[N].variables[M].*）===')
const varRows = rows.filter((r) => r.p && r.p[0] === 'messages' && r.p[2] === 'variables')
const perMsg = {}
for (const r of varRows) {
  const key = `messages[${r.p[1]}].variables[${r.p[3]}]`
  perMsg[key] = perMsg[key] || new Set()
  perMsg[key].add(r.p[4] || '(整体)')
}
if (!Object.keys(perMsg).length) console.log('  （没有写入）')
for (const [k, fields] of Object.entries(perMsg)) {
  console.log('  ' + k + '  →  ' + [...fields].join(', '))
}

// stat_data 的实际内容（挑第一个有内容的）
console.log('')
console.log('=== stat_data 顶层字段 ===')
const sd = rows.find((r) => r.p && r.p.includes('stat_data') && r.v && typeof r.v === 'object')
if (!sd) {
  console.log('  （没有可读的 stat_data 对象）')
} else {
  const dump = (o, pre = '', depth = 0) => {
    for (const [k, v] of Object.entries(o)) {
      if (depth < 2 && v && typeof v === 'object' && !Array.isArray(v)) {
        console.log('  ' + pre + k + '/')
        dump(v, pre + '  ', depth + 1)
      } else {
        console.log('  ' + pre + k + ' = ' + JSON.stringify(v).slice(0, 70))
      }
    }
  }
  dump(sd.v)
}

// 脚本证据
console.log('')
console.log('=== 卡内脚本执行证据 ===')
for (const k of Object.keys(sources).filter((s) => s.startsWith('tavern-helper'))) {
  console.log('  ' + k + ' ×' + sources[k])
}
if (!Object.keys(sources).some((s) => s.startsWith('tavern-helper'))) {
  console.log('  （没有 tavern-helper.* 事件）')
}
