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
]

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

// 关键：产物里不该再有"只改 lib 留下"的旧标记
console.log('=== 旧标记清理情况（只改 lib 时留下的）===')
for (const old of ['preview layer: window.generate', 'host facade: window.generate']) {
  console.log('  ' + (lib.includes(old) ? '仍存在（无害，但说明 build 没清掉旧注入）' : '已清除 ✓') + '  ' + old)
}
