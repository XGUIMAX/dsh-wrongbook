// 把「补齐 TavernHelper.generate」直接写进龙娘回廊的卡内脚本。
//
// 为什么打进卡里：
//   宿主补丁（src/ + lib/）会被 DSH 升级覆盖，需要重打；而卡是用户自己的，
//   不会被升级碰。而且这个问题的本质就是"卡依赖了宿主没提供的接口"——
//   由卡自己补齐最合适，一次改、永久生效。
//
// 这段补丁解决两件事：
//   ① TavernHelper.generate 在父窗口那层不存在 → 补一个（委托给同层的 generateRaw）
//   ② 宿主的 generateRaw 是"显式编排"契约，只认
//        ordered_prompts / user_input / max_chat_history / should_stream /
//        should_silence / overrides / generation_id
//      —— 没有 prompt（传了报"暂不支持参数：prompt"），且 ordered_prompts 必填非空。
//      所以把 prompt 折成 user_input，再兜底 ordered_prompts: ['user_input']。
//
// 用法：
//   node debug/patch-card-generate.mjs           # 看状态
//   node debug/patch-card-generate.mjs --apply   # 写入卡
//   node debug/patch-card-generate.mjs --revert  # 移除
import fs from 'node:fs'

const CARD = 'C:/Users/213123543/.dsh/profile-data/tavern/data/resources/cards/龙娘回廊！5.3 MVU版本.json'
const SCRIPT_NAME = '助手agent_v0.15'
const MARK = '/* dsh-ensure-generate */'

const SNIPPET =
  MARK + '\n' +
  ';(function () {\n' +
  '  function ensureGenerate(w) {\n' +
  '    try {\n' +
  '      var TH = w && w.TavernHelper;\n' +
  '      if (!TH) return;\n' +
  '      // 不检查"TH.generate 是否存在"就返回 —— 宿主的 facade 会提供一个**存在但需要\n' +
  '      // 归一化**的版本（它把 prompt 直接塞进 config，宿主的显式编排契约会拒绝）。\n' +
  '      // 那种情况下存在性检查会让我们直接返回、一点忙都帮不上。\n' +
  '      // 只在"已经是我们自己补的那份"时跳过，避免重复包装。\n' +
  '      if (TH.generate && TH.generate.__dshNormalized) return;\n' +
  '      var raw = (typeof TH.generateRaw === "function" ? TH.generateRaw : null) || (typeof w.generateRaw === "function" ? w.generateRaw : null);\n' +
  '      if (!raw) return;\n' +
  '      var wrapped = function (prompt, options) {\n' +
  '        var cfg = Object.assign({}, options || {});\n' +
  '        if (typeof prompt === "string") { if (cfg.user_input === undefined) cfg.user_input = prompt; }\n' +
  '        else if (prompt && typeof prompt === "object") Object.assign(cfg, prompt);\n' +
  '        if (cfg.prompt !== undefined) { if (cfg.user_input === undefined) cfg.user_input = cfg.prompt; delete cfg.prompt; }\n' +
  '        if (!Array.isArray(cfg.ordered_prompts) || !cfg.ordered_prompts.length) cfg.ordered_prompts = ["user_input"];\n' +
  '        return raw.call(TH, cfg);\n' +
  '      };\n' +
  '      wrapped.__dshNormalized = true;\n' +
  '      TH.generate = wrapped;\n' +
  '    } catch (e) { /* 跨窗口访问失败就跳过 */ }\n' +
  '  }\n' +
  '  ensureGenerate(window);\n' +
  '  try { var p = window.parent; if (p && p !== window) ensureGenerate(p); } catch (e) {}\n' +
  '  try { var t = window.top; if (t && t !== window && t !== window.parent) ensureGenerate(t); } catch (e) {}\n' +
  '})();\n'

const args = process.argv.slice(2)
const mode = args.includes('--apply') ? 'apply' : args.includes('--revert') ? 'revert' : 'status'

const raw = JSON.parse(fs.readFileSync(CARD, 'utf8'))
const card = raw.raw || raw
const data = card.data || card
const scripts = (((data.extensions || {}).tavern_helper || {}).scripts) || []
const target = scripts.find((s) => s.name === SCRIPT_NAME)

if (!target) {
  console.log('找不到脚本：' + SCRIPT_NAME)
  console.log('现有脚本：' + scripts.map((s) => s.name).join(', '))
  process.exit(1)
}

const has = String(target.content || '').includes(MARK)
console.log('卡：' + CARD.split('/').pop())
console.log('脚本：' + SCRIPT_NAME + '（' + String(target.content || '').length + ' 字符）')
console.log('状态：' + (has ? '已写入卡内补丁' : '未写入'))
console.log('')

if (mode === 'status') {
  console.log('  --apply   写入卡')
  console.log('  --revert  移除')
  process.exit(0)
}

if (mode === 'apply') {
  if (has) {
    console.log('已经写过，不动。')
    process.exit(0)
  }
  const backup = CARD + '.bak-cardpatch'
  if (!fs.existsSync(backup)) {
    fs.copyFileSync(CARD, backup)
    console.log('已备份 → ' + backup.split('/').pop())
  }
  target.content = SNIPPET + String(target.content || '')
  fs.writeFileSync(CARD, JSON.stringify(raw, null, 2), 'utf8')
  console.log('已写入。脚本现在 ' + target.content.length + ' 字符。')
  console.log('')
  console.log('卡内补丁会跟着卡走，不受宿主升级影响。')
  process.exit(0)
}

if (mode === 'revert') {
  if (!has) {
    console.log('本来就没写，不动。')
    process.exit(0)
  }
  const backup = CARD + '.bak-cardpatch'
  if (fs.existsSync(backup)) {
    fs.copyFileSync(backup, CARD)
    console.log('已从备份还原。')
  } else {
    target.content = String(target.content || '').replace(SNIPPET, '')
    fs.writeFileSync(CARD, JSON.stringify(raw, null, 2), 'utf8')
    console.log('已按标记移除。')
  }
  process.exit(0)
}
