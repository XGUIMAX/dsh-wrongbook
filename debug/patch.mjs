// 让纯 API 测试也能跑 MVU 卡。
//
// 用法：
//   node data/tools/mvu-api-test/patch.mjs            # 看状态
//   node data/tools/mvu-api-test/patch.mjs --apply    # 应用（幂等，自动备份）
//   node data/tools/mvu-api-test/patch.mjs --revert   # 还原
//
// 背景：宿主里有个判据决定"这张卡能不能用纯 API 测试"：
//
//   export function hasTavernScriptRuntime(chat, helperScripts) {
//     if (!chat || !chat.cardPath || !['story', 'script'].includes(chat.mode || 'story')) return false
//     return chat.mvu?.enabled === true || projectTavernHelperScripts(helperScripts).scripts.length > 0
//   }
//
// 它把两件性质不同的事并列成了同一个条件：
//
//   · 卡内的 Tavern Helper 脚本 —— 外链 import、依赖 TavernHelper API 和 DOM，**确实需要浏览器**；
//   · MVU 运行时 —— 在 lib/vendor/magvarupdate/host-build/artifact/bundle.js 里，**是宿主侧的**，
//     纯 API 环境照样跑得起来。
//
// 于是所有 MVU 卡被一并挡在门外，而它们其实只需要"卡内没脚本"就能测。
// 这个补丁只去掉前半句，保留后者 —— 有卡内脚本的仍然拒绝，那是对的。
//
// 宿主文件会被 Tavern 更新整份覆盖，所以改完要能一键还原、也能重放。
import fs from 'node:fs'
import path from 'node:path'

const TARGET = 'C:/Users/213123543/.dsh/apps/dsh-tavern/tavern-plugin/lib/domain/tavern-helper-scripts.js'
const BACKUP = TARGET + '.bak-mvu-api-test'

const ORIGINAL = `  return chat.mvu?.enabled === true || projectTavernHelperScripts(helperScripts).scripts.length > 0`
const PATCHED = `  // MVU 的运行时在宿主侧（lib/vendor/magvarupdate），纯 API 也能跑；真正需要浏览器的是
  // 卡内的 Tavern Helper 脚本。原先两者并列，把 MVU 卡一并挡掉了。
  return projectTavernHelperScripts(helperScripts).scripts.length > 0`

const args = process.argv.slice(2)
const mode = args.includes('--apply') ? 'apply' : args.includes('--revert') ? 'revert' : 'status'

if (!fs.existsSync(TARGET)) {
  console.log('找不到宿主文件：' + TARGET)
  console.log('（Tavern 可能换了目录结构，先确认它还在不在。）')
  process.exit(1)
}

const read = () => fs.readFileSync(TARGET, 'utf8')
const write = (s) => fs.writeFileSync(TARGET, s, 'utf8')

const stateOf = (text) => {
  const hasOrig = text.includes(ORIGINAL)
  const hasPatched = text.includes(PATCHED)
  if (hasOrig) return 'original'
  if (hasPatched) return 'patched'
  return 'unknown'
}

function report() {
  const text = read()
  const st = stateOf(text)
  const mtime = fs.statSync(TARGET).mtime.toLocaleString()
  console.log('宿主文件：' + TARGET)
  console.log('  修改时间：' + mtime)
  if (stateOf(fs.existsSync(BACKUP) ? fs.readFileSync(BACKUP, 'utf8') : '') === 'original') {
    console.log('  备份：' + path.basename(BACKUP) + '（原版）')
  }
  const label = { original: '未打补丁（锚点齐全，可应用）', patched: '已打补丁', unknown: '⭐ 两处锚点都没匹配上 —— 宿主可能改过这段代码，需要人工看一眼' }
  console.log('  状态：' + label[st])
  if (st === 'patched') console.log('  → MVU 卡（卡内无脚本的）现在可以进行纯 API 测试。')
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
  const text = read()
  const st = stateOf(text)
  if (st === 'patched') {
    console.log('已经是打过的状态，不动。')
    report()
    process.exit(0)
  }
  if (st === 'unknown') {
    console.log('锚点没匹配上，拒绝改 —— 先确认宿主这段代码长什么样。')
    process.exit(1)
  }
  if (!fs.existsSync(BACKUP)) {
    fs.copyFileSync(TARGET, BACKUP)
    console.log('已备份 → ' + path.basename(BACKUP))
  }
  write(text.replace(ORIGINAL, PATCHED))
  console.log('已应用。')
  report()
  console.log('')
  console.log('需要重启 DSH 才生效。')
  process.exit(0)
}

if (mode === 'revert') {
  const text = read()
  const st = stateOf(text)
  if (st === 'original') {
    console.log('本来就没打过，不动。')
    report()
    process.exit(0)
  }
  if (st === 'unknown') {
    console.log('当前状态认不出来，拒绝还原 —— 免得把宿主改得更乱。')
    process.exit(1)
  }
  if (!fs.existsSync(BACKUP)) {
    console.log('找不到备份，只能用锚点原地还原。')
    write(text.replace(PATCHED, ORIGINAL))
  } else {
    write(fs.readFileSync(BACKUP, 'utf8'))
    console.log('已从备份还原。')
  }
  report()
  process.exit(0)
}
