// 把六处 helper 补丁打进 **源码**（src/），再让 build 生成 lib/。
//
// 为什么必须改 src：
//   lib/client.js 是 src/client/*.js 的编译产物，宿主有 `check:client` 比对两者
//   （package.json 里是 prepublishOnly 与所有 e2e 的前置）。只改 lib/ 会把它变成
//   "已过期"状态 —— 那正是前面六轮补丁"报告成功却不生效"的根源。
//
// 用法：
//   node debug/patch-src.mjs          # 查状态
//   node debug/patch-src.mjs --apply  # 应用
//   node debug/patch-src.mjs --revert # 还原
import fs from 'node:fs'

const BASE = 'C:/Users/213123543/.dsh/apps/dsh-tavern/tavern-plugin'
const MAIN = BASE + '/src/client/main.js'
const OPENING = BASE + '/src/client/opening-preview.js'

const MARK = 'helper patch (src)' // 六处共用的标记，用于识别与还原

// ① 消息 iframe：四个 helper 的实现 —— 必须插在 `});` **之后**（那是 createTransport 的收尾，
// 之后才是语句位置；插在它之前等于落进对象字面量内部 → Unexpected token ';'）
// ⑦⑧ 创意工坊域名例外 —— 原来单独打在 lib/client.js 上，但那样会让 `check:client`
//      永远报"已过期"（src 有补丁、lib 是 build 产物 + 注入，两者对不上）。迁进 src 后
//      lib/ 就纯粹是构建产物。
//
// 背景：Tavern 向卡片 iframe 注入静态资源代理，把任何 https:// 的 src 改写成
// `/api/dsh-tavern/static-assets?url=<encoded>`。创意工坊用「自己被加载的地址」构造
// Discord 回调（window.location.origin + pathname），被代理后拿到宿主本地地址，
// Discord 判 redirect_uri 无效、登录失败。这两处加域名例外让它保持原域名加载。
const WS_DOMAIN = 'cloudflare-workshop.saugrodep.workers.dev'

// ⑦ 静态重写函数（源码里是可读写法，带空格）
const WS_A_FROM =
  'return /^https:\\/\\//i.test(source) ? "/api/dsh-tavern/static-assets?url=" + encodeURIComponent(source) : source;'
const WS_A_TO =
  'return /^https:\\/\\//i.test(source) && source.indexOf("https://' +
  WS_DOMAIN +
  '/") !== 0 ? "/api/dsh-tavern/static-assets?url=" + encodeURIComponent(source) : source;'

// ⑧ shim 里的 proxy（在字符串里，紧凑写法）。用 String.raw 免得反斜杠层数算错。
const WS_B_FROM = String.raw`function proxy(value){var source=String(value||"");return /^https:\\/\\//i.test(source)?"/api/dsh-tavern/static-assets?url="+encodeURIComponent(source):source;}`
const WS_B_TO = String.raw`function proxy(value){var source=String(value||"");return /^https:\\/\\//i.test(source)&&source.indexOf("https://${WS_DOMAIN}/")!==0?"/api/dsh-tavern/static-assets?url="+encodeURIComponent(source):source;}`

const A1_FROM = '\t\t\t});\n\t\t\tconst call = function (method, args) {'
const A1_TO =
  A1_FROM + '\n' +
  '\t\t\t// ' + MARK + ' ① 四个 helper 的实现\n' +
  '\t\t\t;(function () {\n' +
  '\t\t\t\tfunction genVia(config) { return call("generateTavernHelperRaw", { config: config }); }\n' +
  '\t\t\t\tfunction genNorm(prompt, options) {\n' +
  '\t\t\t\t\tvar config = Object.assign({}, options || {});\n' +
  '\t\t\t\t\tif (typeof prompt === "string") { if (config.prompt === undefined) config.prompt = prompt; }\n' +
  '\t\t\t\t\telse if (prompt && typeof prompt === "object") Object.assign(config, prompt);\n' +
  '\t\t\t\t\treturn config;\n' +
  '\t\t\t\t}\n' +
  '\t\t\t\tif (typeof window.generate !== "function") {\n' +
  '\t\t\t\t\twindow.generate = function (prompt, options) { return genVia(genNorm(prompt, options)); };\n' +
  '\t\t\t\t}\n' +
  '\t\t\t\tif (typeof window.generateRaw !== "function") {\n' +
  '\t\t\t\t\twindow.generateRaw = function (prompt, options) { return genVia(genNorm(prompt, options)); };\n' +
  '\t\t\t\t}\n' +
  '\t\t\t\tif (typeof window.injectPrompts !== "function") {\n' +
  '\t\t\t\t\twindow.injectPrompts = function (prompts, options) {\n' +
  '\t\t\t\t\t\treturn call("updateTavernHelperPrompts", { prompts: prompts, options: options || {} });\n' +
  '\t\t\t\t\t};\n' +
  '\t\t\t\t}\n' +
  '\t\t\t\tif (typeof window.getCharWorldbookNames !== "function") {\n' +
  '\t\t\t\t\twindow.getCharWorldbookNames = function (which) {\n' +
  '\t\t\t\t\t\treturn call("getTavernHelperWorldbook", { which: which || "current" });\n' +
  '\t\t\t\t\t};\n' +
  '\t\t\t\t}\n' +
  '\t\t\t})();'

// ②③ 消息 iframe 的 shim 字符串：清单加 generate，并挂 window.generate
const A2_FROM = '"updateVariablesWith","generateRaw","createChatMessages"'
const A2_TO = '"updateVariablesWith","generateRaw","generate","createChatMessages"'
const A3_FROM = 'window.generateRaw=function(config){return call("generateTavernHelperRaw",{config:copy(config)}).then(function(result){return result.text;});};'
const A3_TO =
  A3_FROM +
  'window.generate=function(a,b){var c={};if(typeof a==="string"){c.prompt=a;if(b&&typeof b==="object")Object.assign(c,b);}' +
  'else if(a&&typeof a==="object"){Object.assign(c,a);if(b&&typeof b==="object")Object.assign(c,b);}' +
  'return window.generateRaw(c);};'

// ④⑤ facade：清单加 generate，并在 window.TavernHelper = helper; 之后挂 window.generate
const A4_FROM = '"generateRaw", "injectPrompts",'
const A4_TO = '"generateRaw", "generate", "injectPrompts",'
const A5_FROM = '\t\t\twindow.TavernHelper = helper;'
const A5_TO =
  A5_FROM + '\n' +
  '\t\t\t// ' + MARK + ' ⑤ 父窗口那层的 window.generate（helper 的属性是 getter: () => window[name]）\n' +
  '\t\t\t;(function () {\n' +
  '\t\t\t\tif (typeof window.generate === "function") return;\n' +
  '\t\t\t\twindow.generate = function (prompt, options) {\n' +
  '\t\t\t\t\tvar config = Object.assign({}, options || {});\n' +
  '\t\t\t\t\tif (typeof prompt === "string") { if (config.prompt === undefined) config.prompt = prompt; }\n' +
  '\t\t\t\t\telse if (prompt && typeof prompt === "object") Object.assign(config, prompt);\n' +
  '\t\t\t\t\treturn call("generateTavernHelperRaw", { config: config });\n' +
  '\t\t\t\t};\n' +
  '\t\t\t})();'

// ⑥ 开场预览桥：挂 window.generate 并加进 Object.assign 的键
const A6_FROM =
  '  window.TavernHelper = Object.assign({}, original && original.helper, { generateRaw: window.generateRaw, getCharWorldbookNames: window.getCharWorldbookNames,'
const A6_TO =
  '  // ' + MARK + ' ⑥ 开场预览那层（卡经 window.parent 读的就是这里）\n' +
  '  if (typeof window.generate !== "function" && typeof window.generateRaw === "function") {\n' +
  '    window.generate = function (prompt, options) {\n' +
  '      const config = Object.assign({}, options || {});\n' +
  '      if (typeof prompt === "string") { if (config.prompt === undefined) config.prompt = prompt; }\n' +
  '      else if (prompt && typeof prompt === "object") Object.assign(config, prompt);\n' +
  '      return window.generateRaw(config);\n' +
  '    };\n' +
  '  }\n' +
  '  window.TavernHelper = Object.assign({}, original && original.helper, { generate: window.generate, generateRaw: window.generateRaw, getCharWorldbookNames: window.getCharWorldbookNames,'

const args = process.argv.slice(2)
const mode = args.includes('--apply') ? 'apply' : args.includes('--revert') ? 'revert' : 'status'

const read = (p) => fs.readFileSync(p, 'utf8')
const write = (p, s) => fs.writeFileSync(p, s, 'utf8')

function state() {
  const m = read(MAIN)
  const o = read(OPENING)
  const marks = (m.match(new RegExp(MARK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
  const oMarks = (o.match(new RegExp(MARK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
  return { mainMarks: marks, openingMarks: oMarks, total: marks + oMarks }
}

if (mode === 'status') {
  const s = state()
  console.log('源码补丁状态：main.js ' + s.mainMarks + ' 处 / opening-preview.js ' + s.openingMarks + ' 处')
  console.log('  ' + (s.mainMarks === 5 && s.openingMarks === 1 ? '已全部就位（5 + 1）' : '未完成或部分完成'))
  console.log('')
  console.log('  --apply   应用（改 src，之后需跑 pnpm build:client）')
  console.log('  --revert  还原')
  process.exit(0)
}

if (mode === 'apply') {
  let m = read(MAIN)
  let o = read(OPENING)
  const steps = []

  const sub = (text, from, to, label) => {
    if (text.includes(to)) { steps.push('  · ' + label + ' 已在，跳过'); return text }
    if (!text.includes(from)) { steps.push('  ✗ ' + label + ' 锚点没匹配上'); return null }
    steps.push('  ✓ ' + label)
    return text.replace(from, to)
  }

  m = sub(m, A1_FROM, A1_TO, '① 四个 helper 实现')
  if (m === null) { console.log(steps.join('\n')); process.exit(1) }
  m = sub(m, A2_FROM, A2_TO, '② iframe 清单加 generate')
  if (m === null) { console.log(steps.join('\n')); process.exit(1) }
  m = sub(m, A3_FROM, A3_TO, '③ iframe 挂 window.generate')
  if (m === null) { console.log(steps.join('\n')); process.exit(1) }
  m = sub(m, A4_FROM, A4_TO, '④ facade 清单加 generate')
  if (m === null) { console.log(steps.join('\n')); process.exit(1) }
  m = sub(m, A5_FROM, A5_TO, '⑤ facade 挂 window.generate')
  if (m === null) { console.log(steps.join('\n')); process.exit(1) }
  o = sub(o, A6_FROM, A6_TO, '⑥ 开场预览层挂 window.generate')
  if (o === null) { console.log(steps.join('\n')); process.exit(1) }
  m = sub(m, WS_A_FROM, WS_A_TO, '⑦ 创意工坊域名例外（静态重写函数）')
  if (m === null) { console.log(steps.join('\n')); process.exit(1) }
  m = sub(m, WS_B_FROM, WS_B_TO, '⑧ 创意工坊域名例外（shim 的 proxy）')
  if (m === null) { console.log(steps.join('\n')); process.exit(1) }

  write(MAIN, m)
  write(OPENING, o)
  console.log(steps.join('\n'))
  console.log('')
  console.log('源码已改。接下来跑：')
  console.log('  cd ' + BASE + ' && node bin/build-tavern-client.mjs')
  process.exit(0)
}

if (mode === 'revert') {
  let m = read(MAIN)
  let o = read(OPENING)
  m = m.replace(A1_TO, A1_FROM).replace(A2_TO, A2_FROM).replace(A3_TO, A3_FROM).replace(A4_TO, A4_FROM).replace(A5_TO, A5_FROM)
  o = o.replace(A6_TO, A6_FROM)
  write(MAIN, m)
  write(OPENING, o)
  console.log('已按锚点还原源码。')
  process.exit(0)
}
