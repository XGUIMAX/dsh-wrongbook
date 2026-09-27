// 验证六处补丁是否经 src → build 进了 lib/client.js。
import fs from 'node:fs'

const LIB = 'C:/Users/213123543/.dsh/apps/dsh-tavern/tavern-plugin/lib/client.js'
const SRC_MAIN = 'C:/Users/213123543/.dsh/apps/dsh-tavern/tavern-plugin/src/client/main.js'
const SRC_OPEN = 'C:/Users/213123543/.dsh/apps/dsh-tavern/tavern-plugin/src/client/opening-preview.js'

const lib = fs.readFileSync(LIB, 'utf8')
const sm = fs.readFileSync(SRC_MAIN, 'utf8')
const so = fs.readFileSync(SRC_OPEN, 'utf8')

const checks = [
  // ① 用 genVia 当特征 —— `frame helpers: generate` 是旧 lib 注入的标记，build 已经清掉了
  ['① 消息 iframe 四个 helper 实现', /genVia\(config\)/, /genVia\(config\)/, sm],
  ['② iframe 清单加 generate', /"updateVariablesWith","generateRaw","generate"/, /"updateVariablesWith","generateRaw","generate"/, sm],
  ['③ iframe 挂 window.generate', /window\.generate=function\(a,b\)/, /window\.generate=function\(a,b\)/, sm],
  ['④ facade 清单加 generate', /"generateRaw", "generate", "injectPrompts"/, /"generateRaw", "generate", "injectPrompts"/, sm],
  ['⑤ facade 挂 window.generate', /helper patch \(src\)/, /helper patch \(src\)/, sm],
  ['⑥ 开场预览层加 generate 键', /generate: window\.generate/, /generate: window\.generate/, so],
  // ⑦⑧ 用 count 判据：三处包装都必须有归一化，少一处就会报"需要显式 ordered_prompts"
  ['⑦ 创意工坊域名例外（静态重写）', /cloudflare-workshop\.saugrodep\.workers\.dev\//, /cloudflare-workshop\.saugrodep\.workers\.dev\//, sm],
  ['⑧ 创意工坊域名例外（shim proxy）', /indexOf\("https:\/\/cloudflare-workshop/, /indexOf\("https:\/\/cloudflare-workshop/, sm],
  // ⑨ frame-sizing 的两行 include。缺了它整个文件不进产物 —— 实测症状是
  // createIndexedArrayApi 未定义、**整个前端崩**（不只是某个按钮坏）。
  //
  // 注意两边的判据不同：@include 在 build 时被**展开成文件内容**，所以产物里
  // 搜不到那行文本，只能搜展开后的符号；源码里则要看 include 指令在不在。
  [
    '⑨ frame-sizing 的两行 include',
    /tavernFrameSizingDeclaration/,
    /@include-domain frame-sizing\.js/,
    sm,
  ],
]

// 产物里那些"升级带进来的"符号是否真的在。缺任何一个都说明有文件没被 include 到 ——
// 构建和语法检查都抓不到这类问题（缺文件产生的是合法 JavaScript，运行到才炸）。
const LIB_SYMBOLS = [
  'createIndexedArrayApi',
  'createOrderedNumericIndex',
  'beginSessionViewRead',
  'tavernFrameSizingDeclaration',
  'normalizeFrameSizing',
]

// include 总数。宿主升级若又带来新文件却漏了 include，总数不会掉；反过来，
// 若有人拿旧备份覆盖了 main.js，总数会掉 —— 所以这是个有用的粗筛（当前 40）。
const INCLUDE_BASELINE = 40
const includeCount = (src) => (String(src).match(/^\s*\/\/\s*@include/gm) || []).length

// 三处 window.generate 包装的归一化数量。这是"改了包装但漏了几份"的唯一可靠判据 ——
// 单看某一处存在是不够的，卡读的是其中一份。
const NORM = /config\.ordered_prompts\s*=/
const normCount = (src) => (String(src).match(new RegExp(NORM.source, 'g')) || []).length

console.log('=== lib/client.js（产物）===')
let ok = 0
for (const [label, libRe, srcRe, src] of checks) {
  const inLib = libRe.test(lib)
  const inSrc = srcRe.test(src)
  if (inLib && inSrc) ok += 1
  console.log('  ' + (inLib ? '✓' : '✗') + ' ' + label + '   （src: ' + (inSrc ? '有' : '无') + '）')
}
console.log('')
console.log(ok + '/' + checks.length + ' 在产物与源码里都有')
console.log('')

console.log('=== 三处 generate 包装的归一化 ===')
const mCount = normCount(sm)
const oCount = normCount(so)
console.log('  main.js             ' + mCount + ' 处（期望 2：① 消息 iframe、⑤ facade）' + (mCount === 2 ? ' ✓' : ' ✗'))
console.log('  opening-preview.js  ' + oCount + ' 处（期望 1：⑥）' + (oCount === 1 ? ' ✓' : ' ✗'))
console.log('')

// 升级带进来的符号是否真的进了产物。缺任何一个 = 有文件没被 include 到，
// 而**构建成功、语法检查也过**（缺文件产生的是合法 JS，运行到才炸）。
console.log('=== 产物里的关键符号（含宿主升级带进来的）===')
let missing = 0
for (const name of LIB_SYMBOLS) {
  const at = lib.indexOf(name)
  if (at < 0) missing += 1
  console.log('  ' + (at >= 0 ? '✓' : '✗ 不在产物里！') + ' ' + name)
}
console.log('')

// include 总数：有人拿旧备份覆盖 main.js 时，这个数会掉（实测掉过 3 条，
// 缺 createIndexedArrayApi，整个前端崩）。所以它是个便宜且有效的粗筛。
const inc = includeCount(sm)
console.log('=== include 总数 ===')
console.log(
  '  ' + inc + ' 条（基线 ' + INCLUDE_BASELINE + '）' +
    (inc >= INCLUDE_BASELINE ? ' ✓' : ' ✗ 掉了 ' + (INCLUDE_BASELINE - inc) + ' 条 —— 可能被旧备份覆盖过'),
)
console.log('')

if (missing || inc < INCLUDE_BASELINE) {
  console.log('⚠ 有符号缺失或 include 减少 —— 这种情况构建不会报错，只在运行时表现为')
  console.log('  "xxx is not defined"，严重时整个前端崩。检查主源码是否被整体回滚过。')
  console.log('')
  process.exitCode = 1
}

// 关键：产物里不该再有"只改 lib 留下"的旧标记
console.log('=== 旧标记清理情况（只改 lib 时留下的）===')
for (const old of ['preview layer: window.generate', 'host facade: window.generate']) {
  console.log('  ' + (lib.includes(old) ? '仍存在（无害，但说明 build 没清掉旧注入）' : '已清除 ✓') + '  ' + old)
}
