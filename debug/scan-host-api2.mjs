// 精筛：把"卡自己定义的内部函数"从宿主 API 缺口里剔掉。
//
// 判据：脚本里如果出现 `window.xxx = ` 或 `function xxx(` 或 `window.xxx=`
// 这种定义，那它是卡自己的函数，不算宿主缺口。
import fs from 'node:fs'
import path from 'node:path'

const CARDS = 'C:/Users/213123543/.dsh/profile-data/tavern/data/resources/cards'

// 浏览器原生，天然存在，不算宿主缺口
const NATIVE = new Set([
  'getComputedStyle', 'fetch', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'requestAnimationFrame', 'postMessage', 'addEventListener', 'removeEventListener',
  'getSelection', 'matchMedia', 'open', 'close', 'alert', 'confirm', 'prompt',
])

const IFRAME_HELPERS = new Set([
  'createChatMessages', 'getSession', 'replaceTavernHelperMessages', 'replaceTavernHelperVariables', 'setChatMessages',
])

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

const API_RE = /\b(?:window|globalThis|parent\.window)\.([a-zA-Z_$][\w$]*)\s*(?:\(|\?\.\()/g
const TH_RE = /\bTavernHelper\.([a-zA-Z_$][\w$]*)\s*(?:\(|\?\.\()/g

const files = fs.readdirSync(CARDS).filter((n) => n.endsWith('.json'))
const summary = { frame: {}, none: {}, selfDefined: {} }

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

  const defined = new Set()
  for (const m of all.matchAll(/(?:window|globalThis)\.([a-zA-Z_$][\w$]*)\s*=/g)) defined.add(m[1])
  for (const m of all.matchAll(/function\s+([a-zA-Z_$][\w$]*)\s*\(/g)) defined.add(m[1])
  for (const m of all.matchAll(/const\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:function|\([^)]*\)\s*=>)/g)) defined.add(m[1])

  const used = new Set()
  for (const m of [...all.matchAll(API_RE), ...all.matchAll(TH_RE)]) used.add(m[1])

  for (const name of used) {
    if (!/^(get|set|replace|create|delete|update|insert|generate|inject|uninject|substitude|event|import)/.test(name)) continue
    if (NATIVE.has(name) || IFRAME_HELPERS.has(name)) continue
    if (defined.has(name)) {
      summary.selfDefined[name] = (summary.selfDefined[name] || 0) + 1
      continue
    }
    if (HOST_GLOBAL.has(name)) summary.frame[name] = (summary.frame[name] || 0) + 1
    else summary.none[name] = (summary.none[name] || 0) + 1
  }
}

const show = (title, obj, note) => {
  console.log('=== ' + title + ' ===')
  const rows = Object.entries(obj).sort((a, b) => b[1] - a[1])
  if (!rows.length) console.log('  （无）')
  for (const [k, v] of rows) console.log('  ' + k.padEnd(30) + v + (note || ''))
  console.log('')
}

console.log('（数字是"多少张卡用到"）')
console.log('')
show('A. 宿主有实现、但没注入到 iframe —— 要补转发', summary.frame, ' 张卡')
show('B. 宿主两套都没有 —— 要补实现或让脚本降级', summary.none, ' 张卡')
show('C. 卡自己的内部函数 —— 不是缺口，已剔除', summary.selfDefined, ' 张卡')
