// 给 Tavern 的 iframe 补四个 helper：generate / generateRaw / injectPrompts / getCharWorldbookNames。
//
// 用法：
//   node data/tools/mvu-api-test/patch-frame-helper.mjs            # 看状态
//   node data/tools/mvu-api-test/patch-frame-helper.mjs --apply    # 应用
//   node data/tools/mvu-api-test/patch-frame-helper.mjs --revert   # 还原
//
// 背景（三层结构）：
//   卡内脚本 → window.TavernHelper.xxx
//                ↑ ③ iframe shim —— TavernHelper 的每个属性都是 getter：
//                     get: function () { return window[name] }
//                     ↑ 但属性本身来自一份 helperNames 清单，**不在清单里的名字
//                       连 getter 都没有**，TavernHelper.generate 直接 undefined
//                ↓ transport.request(method, args)
//                    → postMessage({ type: 'dsh-tavern-helper-call' })
//             ② 宿主白名单 allowedMethods（client.js，12 个 method）
//                ↓ 不在名单里静默丢弃
//             ① 实现
//
// 所以补一个 helper 可能要动两处：
//   · 名字**已在** helperNames 里（generateRaw / injectPrompts）→ 只补 window.xxx
//   · 名字**不在** helperNames 里（generate）→ 先往清单里加名字，再补 window.xxx
//
// 映射关系（宿主侧 RPC 都已存在）：
//   generate / generateRaw → generateTavernHelperRaw
//   injectPrompts          → updateTavernHelperPrompts
//   getCharWorldbookNames  → getTavernHelperWorldbook
//
// 插在哪：**必须在 `});` 之后**。
//   `const transport = modules.createTransport({ … });` 跨十几行，收尾是缩进 3 个
//   tab 的 `});`，紧接着是 `const call = function (…`。
//
//   踩过的坑：一开始写成 `INSERT + ANCHOR`，插到了 `});` **之前** —— 那个位置
//   **还在对象字面量内部**（前一行是 onEvent 函数体的 `}`，不是语句结束），于是
//   `;(function () {` 的分号成了非法 token，整个文件语法错。
//   正确写法是插在两行之间：`});` + INSERT + `const call`。
import fs from 'node:fs'

const TARGET = 'C:/Users/213123543/.dsh/apps/dsh-tavern/tavern-plugin/lib/client.js'
const BACKUP = TARGET + '.bak-frame-helper'

const LINE_END = '\t\t\t});'
const LINE_NEXT = '\t\t\tconst call = function (method, args) {'

// 清单里加名字（generate 原本不在 → TavernHelper.generate 连属性都没有）
//
// ⚠ 要改的是 **iframe 那份**清单，它在 `interactiveHelperShim` 的字符串里，
//   用紧凑格式（逗号后无空格）：
//     ["getCurrentCharacterName","getVariables",…,"updateVariablesWith","generateRaw","createChatMessages",…]
//   上一版改的 `"generateRaw", "injectPrompts",` 是**主页面**那份（逗号后有空格），
//   改完完全没作用 —— 卡内脚本读的是 iframe 的 window。**两份都要处理**。
const IFRAME_NAMES_FROM = '"updateVariablesWith","generateRaw","createChatMessages"'
const IFRAME_NAMES_TO = '"updateVariablesWith","generateRaw","generate","createChatMessages"'
const HOST_NAMES_FROM = '"generateRaw", "injectPrompts",'
const HOST_NAMES_TO = '"generateRaw", "generate", "injectPrompts",'

// iframe 里 generateRaw 已经挂好了，generate 复用它（同样的 config 形状）
const GEN_FROM = 'window.generateRaw=function(config){return call("generateTavernHelperRaw",{config:copy(config)}).then(function(result){return result.text;});};'
const FRAME_GEN_MARK = 'window.generate=function(a,b)'
const GEN_TO =
  'window.generateRaw=function(config){return call("generateTavernHelperRaw",{config:copy(config)}).then(function(result){return result.text;});};' +
  'window.generate=function(a,b){var c={};if(typeof a==="string"){c.prompt=a;if(b&&typeof b==="object")Object.assign(c,b);}' +
  'else if(a&&typeof a==="object"){Object.assign(c,a);if(b&&typeof b==="object")Object.assign(c,b);}' +
  'return window.generateRaw(c);};'

// 用实际插入的文字当标记，别另起一个 —— 否则脚本认不出自己打过补丁
const MARKER = 'frame helpers: generate / generateRaw / injectPrompts / getCharWorldbookNames'

const INSERT =
  '\t\t\t// 补四个卡内脚本会用、但宿主没暴露到 iframe 的 helper。\n' +
  '\t\t\t// ' + MARKER + '\n' +
  '\t\t\t// 宿主侧 RPC 已存在（generateTavernHelperRaw / updateTavernHelperPrompts /\n' +
  '\t\t\t// getTavernHelperWorldbook），这里只补 window 侧的函数，让 TavernHelper 的 getter 读到。\n' +
  '\t\t\t// generate 与 generateRaw 都映射到 generateTavernHelperRaw —— DSH 只有这一条\n' +
  '\t\t\t// 生成通道，参数形状沿用它的 config。\n' +
  '\t\t\t;(function () {\n' +
  '\t\t\t\tfunction generateVia(config) {\n' +
  '\t\t\t\t\treturn transport.request("generateTavernHelperRaw", { config: config });\n' +
  '\t\t\t\t}\n' +
  '\t\t\t\tfunction normalize(prompt, options) {\n' +
  '\t\t\t\t\tvar config = Object.assign({}, options || {});\n' +
  '\t\t\t\t\tif (typeof prompt === "string") { if (config.prompt === undefined) config.prompt = prompt; }\n' +
  '\t\t\t\t\telse if (prompt && typeof prompt === "object") Object.assign(config, prompt);\n' +
  '\t\t\t\t\treturn config;\n' +
  '\t\t\t\t}\n' +
  '\t\t\t\tif (typeof window.generate !== "function") {\n' +
  '\t\t\t\t\twindow.generate = function (prompt, options) { return generateVia(normalize(prompt, options)); };\n' +
  '\t\t\t\t}\n' +
  '\t\t\t\tif (typeof window.generateRaw !== "function") {\n' +
  '\t\t\t\t\twindow.generateRaw = function (prompt, options) { return generateVia(normalize(prompt, options)); };\n' +
  '\t\t\t\t}\n' +
  '\t\t\t\tif (typeof window.injectPrompts !== "function") {\n' +
  '\t\t\t\t\twindow.injectPrompts = function (prompts, options) {\n' +
  '\t\t\t\t\t\treturn transport.request("updateTavernHelperPrompts", { prompts: prompts, options: options || {} });\n' +
  '\t\t\t\t\t};\n' +
  '\t\t\t\t}\n' +
  '\t\t\t\tif (typeof window.getCharWorldbookNames !== "function") {\n' +
  '\t\t\t\t\twindow.getCharWorldbookNames = function (which) {\n' +
  '\t\t\t\t\t\treturn transport.request("getTavernHelperWorldbook", { which: which || "current" });\n' +
  '\t\t\t\t\t};\n' +
  '\t\t\t\t}\n' +
  '\t\t\t})();\n'

const NL = '\n'
const ORIGINAL_BLOCK = LINE_END + NL + LINE_NEXT
const PATCHED_BLOCK = LINE_END + NL + INSERT + LINE_NEXT

const args = process.argv.slice(2)
const mode = args.includes('--apply') ? 'apply' : args.includes('--revert') ? 'revert' : 'status'

if (!fs.existsSync(TARGET)) {
  console.log('找不到宿主文件：' + TARGET)
  process.exit(1)
}

const read = () => fs.readFileSync(TARGET, 'utf8')
const write = (s) => fs.writeFileSync(TARGET, s, 'utf8')

// 三处都到位才算 patched。
// 关键是 iframe 那两处 —— 卡内脚本读的是 iframe 的 window / TavernHelper，
// 主页面那份改了没用（上一版就是只改了主页面，看起来"已打补丁"实则无效）。
const stateOf = (t) => {
  const hasInsert = t.includes(MARKER)
  const hasFrameName = t.includes(IFRAME_NAMES_TO)
  const hasFrameGen = t.includes(FRAME_GEN_MARK)
  if (hasInsert && hasFrameName && hasFrameGen) return 'patched'
  if (hasInsert || hasFrameName || hasFrameGen) return 'partial'
  if (t.includes(ORIGINAL_BLOCK)) return 'original'
  return 'unknown'
}

function report() {
  const st = stateOf(read())
  const label = {
    original: '未打补丁（锚点齐全，可应用）',
    patched: '已打补丁',
    partial: '⚠ 只打了一半（宿主升级可能覆盖了其中一处）',
    unknown: '⭐ 锚点没匹配上，宿主可能改过这段',
  }
  console.log('目标：' + TARGET)
  console.log('  状态：' + label[st])
  if (st === 'patched') console.log('  → iframe 侧已补 generate / generateRaw / injectPrompts / getCharWorldbookNames。')
  return st
}

if (mode === 'status') {
  report()
  console.log('')
  console.log('  --apply   应用')
  console.log('  --revert  还原')
  process.exit(0)
}

if (mode === 'apply') {
  let t = read()
  const st = stateOf(t)
  if (st === 'patched') {
    console.log('已经打过，不动。')
    report()
    process.exit(0)
  }
  if (st === 'unknown') {
    console.log('锚点没匹配上，拒绝改 —— 先确认宿主这段长什么样。')
    process.exit(1)
  }
  if (!fs.existsSync(BACKUP)) {
    fs.copyFileSync(TARGET, BACKUP)
    console.log('已备份 → ' + BACKUP.split('/').pop())
  }

  // ① iframe 的 helper 实现（四个函数，挂在 transport 之后）
  if (!t.includes(MARKER)) {
    if (!t.includes(ORIGINAL_BLOCK)) {
      console.log('① 插入点锚点没匹配上，拒绝改。')
      process.exit(1)
    }
    t = t.replace(ORIGINAL_BLOCK, PATCHED_BLOCK)
    console.log('  ① 已插入四个 helper 的实现')
  } else {
    console.log('  ① 实现已在，跳过')
  }

  // ② iframe 的 TavernHelper 清单加 "generate" —— 这处才是卡内脚本读到的
  if (!t.includes(IFRAME_NAMES_TO)) {
    if (!t.includes(IFRAME_NAMES_FROM)) {
      console.log('② iframe 清单锚点没匹配上，拒绝改。')
      process.exit(1)
    }
    t = t.replace(IFRAME_NAMES_FROM, IFRAME_NAMES_TO)
    console.log('  ② 已把 generate 加进 iframe 的 TavernHelper 清单')
  } else {
    console.log('  ② iframe 清单已在，跳过')
  }

  // ③ iframe 里挂 window.generate（复用已挂好的 generateRaw）
  if (!t.includes(FRAME_GEN_MARK)) {
    if (!t.includes(GEN_FROM)) {
      console.log('③ iframe generateRaw 锚点没匹配上，拒绝改。')
      process.exit(1)
    }
    t = t.replace(GEN_FROM, GEN_TO)
    console.log('  ③ 已挂上 iframe 的 window.generate')
  } else {
    console.log('  ③ window.generate 已在，跳过')
  }

  // ④ 主页面那份清单也补上（不改变 iframe 行为，但保持一致）
  if (!t.includes(HOST_NAMES_TO)) {
    if (t.includes(HOST_NAMES_FROM)) {
      t = t.replace(HOST_NAMES_FROM, HOST_NAMES_TO)
      console.log('  ④ 主页面清单也补了 generate（一致起见）')
    } else {
      console.log('  ④ 主页面清单锚点没匹配上，跳过（不影响 iframe）')
    }
  } else {
    console.log('  ④ 主页面清单已在，跳过')
  }

  write(t)
  console.log('已应用。')
  report()
  console.log('')
  console.log('需要重启 DSH 才生效。')
  process.exit(0)
}

if (mode === 'revert') {
  let t = read()
  const st = stateOf(t)
  if (st === 'original') {
    console.log('本来就没打过，不动。')
    process.exit(0)
  }
  if (fs.existsSync(BACKUP)) {
    write(fs.readFileSync(BACKUP, 'utf8'))
    console.log('已从备份还原。')
  } else {
    if (t.includes(MARKER)) t = t.replace(PATCHED_BLOCK, ORIGINAL_BLOCK)
    if (t.includes(NAMES_TO)) t = t.replace(NAMES_TO, NAMES_FROM)
    write(t)
    console.log('已按锚点原地还原。')
  }
  report()
  process.exit(0)
}
