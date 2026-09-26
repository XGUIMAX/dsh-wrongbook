// 扫全库卡内脚本对宿主 helper 的调用，找出"脚本要用、但环境给不出"的。
//
// 判据分三类（修正版）：
//   A. 宿主有实现、但没注入到 iframe  → 补转发
//   B. 宿主两套都没有                 → 补实现，或让脚本走降级分支
//   C. 脚本自己 window.x = 定义的      → 剔掉，不是缺口
//
// 修正的关键（上一版漏报了龙娘回廊的 TavernHelper.generate）：
//   · `TavernHelper.x` 是**宿主转发接口** —— 宿主那个 helper 对象的 getter 是
//     `return window[x]`，所以卡里有没有同名函数与它无关，一律按宿主接口判。
//   · `window.x` 才可能是卡自己的定义。
//   上一版没区分这两者，导致卡里恰好有个同名局部函数时被误判成"卡自有"。
import fs from 'node:fs'
import path from 'node:path'

const CARDS = 'C:/Users/213123543/.dsh/profile-data/tavern/data/resources/cards'

// 浏览器原生，天然存在
const NATIVE = new Set([
  'getComputedStyle', 'fetch', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'requestAnimationFrame', 'postMessage', 'addEventListener', 'removeEventListener',
  'getSelection', 'matchMedia', 'open', 'close', 'alert', 'confirm', 'prompt',
  'btoa', 'atob', 'structuredClone', 'queueMicrotask',
])

// iframe 那套实际提供的（lib/domain/tavern-helper-context.js）
const IFRAME_HELPERS = new Set([
  'createChatMessages', 'getSession', 'replaceTavernHelperMessages', 'replaceTavernHelperVariables', 'setChatMessages',
])

// 宿主主页面提供的（lib/client.js 的 helperNames）
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
  'eventEmit', 'eventMakeFirst', 'eventMakeLast', 'eventOnButton',
  // SillyTavern 原生全局，DSH 未实现 —— 归这里，标记为"需要补实现"
  'generate', 'generateQuietPrompt', 'generateRawPrompt',
])

// 按"引用"匹配，不按"调用"匹配。
//
// 这是上一版漏掉龙娘回廊的 TavernHelper.generate 的原因：那张卡写的是
//   typeof TavernHelper.generate === 'function'
// —— 用来判断 API 在不在，后面不跟括号，按调用的正则扫不到。
// 而"专查某个 API 存不存在"的代码，恰恰是最需要被扫出来的。
// 宁可多报（后面有白名单压），不能漏报。
const API_RE = /\b(?:window|globalThis|parent\.window)\.([a-zA-Z_$][\w$]*)\b/g
const TH_RE = /\bTavernHelper\.([a-zA-Z_$][\w$]*)\b/g

const files = fs.readdirSync(CARDS).filter((n) => n.endsWith('.json'))
const frame = {}
const none = {}
const selfDefined = {}
const detail = {}

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

  // 只收集 window.x 的自有定义（TavernHelper.x 不算卡自有）
  const defined = new Set()
  for (const m of all.matchAll(/(?:window|globalThis)\.([a-zA-Z_$][\w$]*)\s*=/g)) defined.add(m[1])
  for (const m of all.matchAll(/function\s+([a-zA-Z_$][\w$]*)\s*\(/g)) defined.add(m[1])

  // 分开收集：window 调用 与 TavernHelper 调用
  const viaWindow = new Set()
  const viaHelper = new Set()
  for (const m of all.matchAll(API_RE)) viaWindow.add(m[1])
  for (const m of all.matchAll(TH_RE)) viaHelper.add(m[1])

  const looksLikeApi = (n) => /^(get|set|replace|create|delete|update|insert|generate|inject|uninject|substitude|event|import)/.test(n)

  const seen = new Set()
  const record = (name, via) => {
    if (!looksLikeApi(name) || NATIVE.has(name) || IFRAME_HELPERS.has(name)) return
    // TavernHelper.x 一律按宿主接口判；window.x 才看卡里有没有定义
    if (via === 'window' && defined.has(name)) {
      selfDefined[name] = selfDefined[name] || new Set()
      selfDefined[name].add(file)
      return
    }
    if (seen.has(name)) return
    seen.add(name)
    const bucket = HOST_GLOBAL.has(name) ? frame : none
    bucket[name] = bucket[name] || new Set()
    bucket[name].add(file)
    detail[name] = detail[name] || new Set()
    detail[name].add(file.replace(/\.json$/, ''))
  }
  for (const n of viaHelper) record(n, 'helper')
  for (const n of viaWindow) record(n, 'window')
}

const show = (title, obj, note) => {
  console.log('=== ' + title + ' ===')
  const rows = Object.entries(obj).sort((a, b) => b[1].size - a[1].size)
  if (!rows.length) console.log('  （无）')
  for (const [k, set] of rows) {
    console.log('  ' + k.padEnd(30) + set.size + ' 张卡' + (note || ''))
    for (const f of set) console.log('        - ' + f.replace(/\.json$/, ''))
  }
  console.log('')
}

console.log('扫了 ' + files.length + ' 张卡')
console.log('')
show('A. 宿主有实现、但没注入到 iframe —— 要补转发', frame)
show('B. 宿主两套都没有 / SillyTavern 原生未实现 —— 要补实现或让脚本降级', none)
show('C. 卡自己的 window 定义 —— 不是缺口，已剔除', selfDefined)
