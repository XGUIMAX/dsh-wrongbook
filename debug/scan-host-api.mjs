// 扫全库卡内脚本对宿主 helper 的调用，找出"脚本要用、但宿主没提供"的。
//
// 已知宿主有两套：
//   主页面（lib/client.js）—— 完整，几十个
//   iframe（lib/domain/tavern-helper-context.js）—— 裁剪过，只有消息/变量那几个
// 卡内脚本跑在 iframe 里，所以判据以 iframe 那套为准。
import fs from 'node:fs'
import path from 'node:path'

const CARDS = 'C:/Users/213123543/.dsh/profile-data/tavern/data/resources/cards'

// iframe 那套实际提供的（2026-09-26 从 tavern-helper-context.js 读出来的）
const IFRAME_HELPERS = new Set([
  'createChatMessages',
  'getSession',
  'replaceTavernHelperMessages',
  'replaceTavernHelperVariables',
  'setChatMessages',
])

// 宿主"有什么"的全局清单（含主页面实现），用于区分"完全没实现"和"没注入到 iframe"
const HOST_GLOBAL = new Set([
  'generateRaw', 'injectPrompts', 'uninjectPrompts', 'getScriptId', 'getScriptName', 'getScriptInfo',
  'replaceScriptInfo', 'getScriptButtons', 'replaceScriptButtons', 'updateScriptButtonsWith',
  'appendInexistentScriptButtons', 'getButtonEvent', 'getCharData', 'getCurrentCharacterName',
  'getCurrentMessageId', 'getLastMessageId', 'getChatMessages', 'setChatMessages', 'createChatMessages',
  'getVariables', 'getAllVariables', 'replaceVariables', 'insertOrAssignVariables', 'insertVariables',
  'updateVariablesWith', 'deleteVariable', 'getTavernRegexes', 'replaceTavernRegexes',
  'updateTavernRegexesWith', 'importRawTavernRegex', 'replaceWorldbook', 'createWorldbookEntries',
  'deleteWorldbookEntries', 'setLorebookEntries', 'createLorebookEntries', 'deleteLorebookEntries',
  'getLorebooks', 'getWorldbookNames', 'getCharWorldbookNames', 'getWorldbook', 'getLorebookEntries',
  'getCharLorebooks', 'getCurrentCharPrimaryLorebook', 'getLorebookSettings', 'setLorebookSettings',
  'updateWorldbookWith', 'getTavernHelperVersion', 'substitudeMacros', 'eventOn', 'eventOnce', 'eventOff',
  'eventEmit', 'eventMakeFirst', 'eventMakeLast', 'eventOnButton', 'getModelList',
])

// 只认这几个前缀，避免把普通方法名当宿主 API
const API_RE = /\b(?:window|globalThis|parent\.window)\.([a-zA-Z_$][\w$]*)\s*(?:\(|\?\.\()/g
const TH_RE = /\bTavernHelper\.([a-zA-Z_$][\w$]*)\s*(?:\(|\?\.\()/g

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

  const used = new Map() // name -> Set(scriptName)
  for (const s of scripts) {
    const t = String(s.content || '')
    for (const m of [...t.matchAll(API_RE), ...t.matchAll(TH_RE)]) {
      const name = m[1]
      if (!used.has(name)) used.set(name, new Set())
      used.get(name).add(s.name)
    }
  }

  const missingInFrame = []
  const notImplemented = []
  for (const [name, inScripts] of used) {
    if (!/^(get|set|replace|create|delete|update|insert|generate|inject|uninject|substitude|event|import)/.test(name)) continue
    if (IFRAME_HELPERS.has(name)) continue
    if (HOST_GLOBAL.has(name)) missingInFrame.push({ name, scripts: [...inScripts] })
    else notImplemented.push({ name, scripts: [...inScripts] })
  }

  if (missingInFrame.length || notImplemented.length) {
    report.push({ file: file.replace(/\.json$/, ''), scripts: scripts.length, missingInFrame, notImplemented })
  }
}

console.log('扫了 ' + files.length + ' 张卡。用到了"脚本要用但环境可能给不出"的 API 的：')
console.log('')
if (!report.length) {
  console.log('  （一张都没有）')
}
for (const r of report) {
  console.log('■ ' + r.file + '（' + r.scripts + ' 个脚本）')
  if (r.missingInFrame.length) {
    console.log('   ⚠ 宿主有实现、但没注入到 iframe（脚本多半会失败）：')
    for (const m of r.missingInFrame) {
      console.log('       ' + m.name.padEnd(30) + '← ' + m.scripts.slice(0, 2).join(' / '))
    }
  }
  if (r.notImplemented.length) {
    console.log('   ❌ 宿主两套都没有（需要补实现）：')
    for (const m of r.notImplemented) {
      console.log('       ' + m.name.padEnd(30) + '← ' + m.scripts.slice(0, 2).join(' / '))
    }
  }
  console.log('')
}

// 汇总：出现次数最多的缺失项
const tallyFrame = {}
const tallyNone = {}
for (const r of report) {
  for (const m of r.missingInFrame) tallyFrame[m.name] = (tallyFrame[m.name] || 0) + 1
  for (const m of r.notImplemented) tallyNone[m.name] = (tallyNone[m.name] || 0) + 1
}
console.log('=== 汇总：有多少张卡踩到 ===')
console.log('  没注入到 iframe 的：')
for (const [k, v] of Object.entries(tallyFrame).sort((a, b) => b[1] - a[1])) console.log('    ' + k.padEnd(30) + v + ' 张卡')
if (!Object.keys(tallyFrame).length) console.log('    （无）')
console.log('  两套都没有的：')
for (const [k, v] of Object.entries(tallyNone).sort((a, b) => b[1] - a[1])) console.log('    ' + k.padEnd(30) + v + ' 张卡')
if (!Object.keys(tallyNone).length) console.log('    （无）')
