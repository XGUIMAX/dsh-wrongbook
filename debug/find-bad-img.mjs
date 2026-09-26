// 从 display.capture 的 dom 里找出加载失败的 <img>：看它的 src 是谁生成的。
import fs from 'node:fs'
import path from 'node:path'

const CHATS = 'C:/Users/213123543/.dsh/profile-data/tavern/data/chats'
const chatId = process.argv[2]
if (!chatId) {
  console.log('用法：node find-bad-img.mjs <chatId>')
  process.exit(1)
}
const jdir = path.join(CHATS, chatId, 'journals')
const jfile = fs.readdirSync(jdir).filter((n) => n.endsWith('.jsonl')).sort().pop()
const lines = fs.readFileSync(path.join(jdir, jfile), 'utf8').split('\n').filter(Boolean)

const bad = new Set()
let domCount = 0
let imgTotal = 0
const samples = []

for (const line of lines) {
  let j
  try {
    j = JSON.parse(line)
  } catch {
    continue
  }
  if (j.source !== 'display.capture') continue
  for (const ch of j.changes || []) {
    const v = ch.value
    for (const f of (v && v.frames) || []) {
      for (const e of f.errors || []) {
        if (e.tag === 'IMG') bad.add(e.url || '(空)')
      }
      if (typeof f.dom === 'string') {
        domCount++
        const imgs = f.dom.match(/<img\b[^>]*>/gi) || []
        imgTotal += imgs.length
        for (const tag of imgs) {
          if (samples.length < 12) samples.push(tag.slice(0, 260))
        }
      }
    }
  }
}

console.log('对局 ' + chatId)
console.log('带 dom 的 frame：' + domCount + ' 个；dom 里 <img> 共 ' + imgTotal + ' 个')
console.log('')
console.log('=== 加载失败的图片 url ===')
if (!bad.size) console.log('  （errors 里没有 IMG）')
for (const u of bad) console.log('  ' + u)
console.log('')
console.log('=== dom 里的 <img> 样本 ===')
if (!samples.length) console.log('  （dom 里没有 <img>）')
for (const s of samples) console.log('  ' + s)

// 再找找网络请求里有没有图片类的
console.log('')
console.log('=== network 里的请求（按 host 归类）===')
const hosts = {}
for (const line of lines) {
  let j
  try {
    j = JSON.parse(line)
  } catch {
    continue
  }
  if (j.source !== 'display.capture') continue
  for (const ch of j.changes || []) {
    for (const f of (ch.value && ch.value.frames) || []) {
      for (const n of f.network || []) {
        let h = '(相对路径)'
        try {
          h = new URL(n.url).host
        } catch {}
        hosts[h] = hosts[h] || { n: 0, ok: 0, fail: 0 }
        hosts[h].n++
        if (n.status >= 200 && n.status < 400) hosts[h].ok++
        else hosts[h].fail++
      }
    }
  }
}
if (!Object.keys(hosts).length) console.log('  （没有网络请求）')
for (const [h, v] of Object.entries(hosts).sort((a, b) => b[1].n - a[1].n)) {
  console.log('  ' + h.padEnd(48) + '共 ' + v.n + ' · 成功 ' + v.ok + ' · 失败 ' + v.fail)
}
