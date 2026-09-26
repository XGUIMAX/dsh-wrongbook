// 第二轮扫描：卡内脚本除了 TavernHelper.x，还会不会在"跨层的 window"上直接取宿主函数。
//
// 第一轮（scan-parent-window.mjs）只抓 `TavernHelper.x` 这种写法，会漏掉：
//   win.getVariables()      —— win 来自 window.parent / window.top / te().win
//   parent.getCharData()
//   top.substitudeMacros()
//
// 这一轮补上。关键是**剔掉卡自有的定义**，否则每个卡自己的工具函数都会报成缺口。
import fs from 'node:fs'
import path from 'node:path'

const CARDS = 'C:/Users/213123543/.dsh/profile-data/tavern/data/resources/cards'
const CLIENT = 'C:/Users/213123543/.dsh/apps/dsh-tavern/tavern-plugin/lib/client.js'

const src = fs.readFileSync(CLIENT, 'utf8')
const m = src.match(/const helperNames = \[([^\]]+)\]/)
const FACADE = new Set(m ? m[1].split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean) : [])

// 浏览器原生 / 全局，天然存在，不算缺口
const NATIVE = new Set([
  'getComputedStyle', 'getSelection', 'getElementById', 'getElementsByClassName', 'getElementsByTagName',
  'querySelector', 'querySelectorAll', 'getAttribute', 'getBoundingClientRect', 'getContext',
  'getItem', 'getTime', 'getDate', 'getFullYear', 'getHours', 'getMinutes', 'getSeconds', 'getMonth',
  'getDay', 'getMilliseconds', 'getTimezoneOffset', 'getUTCDate', 'getUTCFullYear', 'getUTCHours',
  'getUTCMinutes', 'getUTCMonth', 'getUTCDay', 'getTime', 'getRandomValues',
  'setItem', 'setAttribute', 'setTimeout', 'setInterval', 'setProperty', 'setFullYear',
  'clearTimeout', 'clearInterval',
  'createElement', 'createElementNS', 'createDocumentFragment', 'createTextNode', 'createRange',
  'deleteProperty', 'insertBefore', 'updateProperties', 'replaceChild', 'replaceAll', 'updateComplete',
])
// DOM 上常见的方法名（`el.getAttribute` 这类），按前缀粗筛掉
const DOM_LIKE = /^(getAttribute|setAttribute|getElements|querySelector|insertAdjacent|replaceChild|appendChild)/

// 找"指向另一个 window 的变量名"
//
// ⚠ 收紧过一轮：一开始把所有 `let X = …window.parent…` 的 X 都收进来，结果是
//   `e` / `n` / `r` / `t` / `o` / `i` 这些**单字母局部变量**被当成跨层窗口，
//   于是 `get` / `set` / `replace` / `delete` 这类通用方法名全报成缺口 —— 全是误报。
//   现在只收：字面名字带窗口语义的（parent/top/win/frame），或者**长于 2 个字符**的。
const NAME_HINT = /(parent|top|win|frame|host|outer|root)/i

function crossWindowVars(text) {
  const names = new Set(['parent', 'top']) // 这两个本身就是 window 别名
  const add = (n) => {
    if (!n || n.length < 3) return // 排除 e / n / r / t 这类
    if (NATIVE.has(n)) return
    if (NAME_HINT.test(n)) names.add(n)
  }
  // `{ win: X }` 解构里的 X
  for (const mm of text.matchAll(/\{\s*win\s*:\s*([a-zA-Z_$][\w$]*)/g)) add(mm[1])
  // `let X = window.parent / window.top`
  for (const mm of text.matchAll(/(?:let|var|const)\s+([a-zA-Z_$][\w$]*)\s*=\s*[^;]{0,80}window\.(?:parent|top|self|frames)\b/g)) add(mm[1])
  // `X = window.parent && … ? window.parent : window`
  for (const mm of text.matchAll(/([a-zA-Z_$][\w$]*)\s*=\s*[^;]{0,70}window\.(?:parent|top)\s*(?:&&|\|\||\?|;)/g)) add(mm[1])
  return names
}

const files = fs.readdirSync(CARDS).filter((n) => n.endsWith('.json'))
const rows = []

for (const file of files) {
  let card
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(CARDS, file), 'utf8'))
    card = raw.raw || raw
  } catch {
    continue
  }
  const d = card.data || card
  const scripts = ((d.extensions || {}).tavern_helper || {}).scripts || []
  if (!scripts.length) continue

  const all = scripts.map((s) => String(s.content || '')).join('\n')

  // 卡自有的定义（不区分哪一层，一律当自有 —— 宁可漏报成"自有"，也别把误报当缺口）
  const defined = new Set()
  for (const mm of all.matchAll(/(?:window|globalThis)\.([a-zA-Z_$][\w$]*)\s*=/g)) defined.add(mm[1])
  for (const mm of all.matchAll(/function\s+([a-zA-Z_$][\w$]*)\s*\(/g)) defined.add(mm[1])
  for (const mm of all.matchAll(/(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:function|\([^)]*\)\s*=>)/g)) defined.add(mm[1])

  const vars = crossWindowVars(all)
  const hits = new Map() // name -> via
  for (const v of vars) {
    const re = new RegExp('\\b' + v.replace(/\$/g, '\\$') + '\\.([a-zA-Z_$][\\w$]*)\\s*\\(', 'g')
    for (const mm of all.matchAll(re)) {
      const n = mm[1]
      if (!/^(get|set|replace|create|delete|update|insert|generate|inject|uninject|substitude|trigger|event)/.test(n)) continue
      if (NATIVE.has(n) || DOM_LIKE.test(n)) continue
      if (defined.has(n)) continue
      if (!hits.has(n)) hits.set(n, new Set())
      hits.get(n).add(v)
    }
  }

  if (hits.size) {
    rows.push({
      file: file.replace(/\.json$/, ''),
      vars: [...vars].filter((v) => v !== 'self' && v !== 'frames'),
      hits: [...hits.entries()].map(([n, vs]) => ({ name: n, via: [...vs], inFacade: FACADE.has(n) })),
    })
  }
}

console.log('=== 在跨层 window 上调用宿主函数的情况 ===')
if (!rows.length) console.log('  （没有卡这样做）')
for (const r of rows) {
  console.log('■ ' + r.file)
  console.log('   跨层变量: ' + r.vars.join(', '))
  for (const h of r.hits) {
    console.log('   ' + (h.inFacade ? '✓' : '⚠') + ' ' + h.name + '  （经 ' + h.via.join('/') + '）' + (h.inFacade ? '  ← 父窗口有' : '  ← 两套都缺'))
  }
  console.log('')
}

const lack = {}
for (const r of rows) for (const h of r.hits) if (!h.inFacade) lack[h.name] = (lack[h.name] || 0) + 1
console.log('=== 汇总 ===')
console.log('  父窗口没有的名字: ' + (Object.keys(lack).length ? JSON.stringify(lack) : '（无）'))
console.log('  父窗口共提供: ' + FACADE.size + ' 个名字')
