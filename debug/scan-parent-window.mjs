// 扫全库：哪些卡的脚本会去读「父窗口」的 TavernHelper，以及它们要用的名字在那一层有没有。
//
// 背景：龙娘回廊的 te() 取的是 window.parent，而宿主里五个组装点只有
// installTavernHelperFacade（父窗口那层）才是卡真正读到的。别的卡如果也用
// 同样的取法（window.parent / window.top），就会踩同一类缺口。
import fs from 'node:fs'
import path from 'node:path'

const CARDS = 'C:/Users/213123543/.dsh/profile-data/tavern/data/resources/cards'
const CLIENT = 'C:/Users/213123543/.dsh/apps/dsh-tavern/tavern-plugin/lib/client.js'

// ① 父窗口那层实际提供的名字
const src = fs.readFileSync(CLIENT, 'utf8')
const m = src.match(/const helperNames = \[([^\]]+)\]/)
const FACADE = new Set(
  m ? m[1].split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean) : [],
)
console.log('父窗口（installTavernHelperFacade）提供 ' + FACADE.size + ' 个名字：')
console.log('  ' + [...FACADE].join(', '))
console.log('')

// ② iframe 那层提供的（interactiveHelperShim 里的紧凑清单）
const fi = src.indexOf('window.TavernHelper=window.TavernHelper||{};[')
let IFRAME = new Set()
if (fi >= 0) {
  const seg = src.slice(fi, fi + 1200)
  const mm = seg.match(/\[([^\]]+)\]/)
  if (mm) IFRAME = new Set(mm[1].split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean))
}
console.log('消息 iframe 提供 ' + IFRAME.size + ' 个名字：')
console.log('  ' + [...IFRAME].join(', '))
console.log('')

// ③ 逐个卡：它怎么取 TavernHelper、用了哪些名字
const files = fs.readdirSync(CARDS).filter((n) => n.endsWith('.json'))
const report = []

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

  // 取 helper 的方式
  const how = []
  if (/window\.parent\s*&&\s*window\.parent\s*!==\s*window|window\.parent\s*\?/.test(all)) how.push('window.parent')
  if (/\bwindow\.top\b/.test(all)) how.push('window.top')
  if (/\.contentWindow\b/.test(all)) how.push('iframe.contentWindow')

  // 读到的 helper 名字（TavernHelper.x / win.TavernHelper.x / TH.x 之类统一抓 TavernHelper.<name>）
  const used = new Set()
  for (const mm of all.matchAll(/TavernHelper[?.\s]*\.\s*([a-zA-Z_$][\w$]*)/g)) used.add(mm[1])
  for (const mm of all.matchAll(/TavernHelper\.([a-zA-Z_$][\w$]*)/g)) used.add(mm[1])

  // 关心的：看起来是宿主接口的名字
  const api = [...used].filter((n) => /^(get|set|replace|create|delete|update|insert|generate|inject|uninject|substitude|event|trigger)/.test(n))

  const missingFacade = api.filter((n) => !FACADE.has(n) && !IFRAME.has(n))
  const onlyIframe = api.filter((n) => !FACADE.has(n) && IFRAME.has(n))

  if (api.length || how.length) {
    report.push({
      file: file.replace(/\.json$/, ''),
      scripts: scripts.length,
      how: [...new Set(how)],
      api,
      missingFacade,
      onlyIframe,
    })
  }
}

console.log('=== 逐个卡 ===')
for (const r of report) {
  console.log('■ ' + r.file + '（' + r.scripts + ' 个脚本）')
  console.log('   取 helper 的方式: ' + (r.how.length ? r.how.join(', ') : '（直接 window.TavernHelper / 其它）'))
  console.log('   用到的宿主接口: ' + (r.api.length ? r.api.join(', ') : '（无）'))
  if (r.missingFacade.length) {
    console.log('   ⚠ 两套都没有（真缺口）: ' + r.missingFacade.join(', '))
  }
  if (r.onlyIframe.length) {
    console.log('   ⚠ 只有消息 iframe 有、父窗口没有: ' + r.onlyIframe.join(', '))
  }
  console.log('')
}

console.log('=== 汇总 ===')
const lack = {}
const onlyF = {}
for (const r of report) {
  if (r.how.includes('window.parent') || r.how.includes('window.top')) {
    for (const n of r.missingFacade) lack[n] = (lack[n] || 0) + 1
    for (const n of r.onlyIframe) onlyF[n] = (onlyF[n] || 0) + 1
  }
}
console.log('（只统计会读父窗口的卡）')
console.log('  两套都没有: ' + (Object.keys(lack).length ? JSON.stringify(lack) : '（无）'))
console.log('  只有 iframe 有、父窗口缺: ' + (Object.keys(onlyF).length ? JSON.stringify(onlyF) : '（无）'))
