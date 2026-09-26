// 全库扫：MU 卡里"后台协议已新增、但旧的正文协议条目还在启用"的情况。
//
// 判据：
//   有 [mvu_update]状态更新规则（= DSH 后台提交模式）
//   → 所有要求"在正文里输出 <UpdateVariable> / JSONPatch"的条目都该停用
//
// 旧协议条目的识别特征（任一命中）：
//   名字含 output_format / 变量输出格式 / 变量输出规则
//   内容含 <UpdateVariable> 或 JSON Patch (RFC 6902)
import fs from 'node:fs'
import path from 'node:path'

const CARDS = 'C:/Users/213123543/.dsh/profile-data/tavern/data/resources/cards'

const files = fs.readdirSync(CARDS).filter((n) => n.endsWith('.json'))
const problems = []
const ok = []
const skipped = []

for (const file of files) {
  let card
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(CARDS, file), 'utf8'))
    card = raw.raw || raw
  } catch {
    continue
  }
  const d = card.data || card
  const entries = ((d.character_book || {}).entries) || []
  if (!entries.length) continue

  const byName = (re) => entries.filter((e) => re.test(e.comment || ''))
  const stateRule = byName(/状态更新规则/)
  const hasStateRule = stateRule.some((e) => e.enabled !== false)

  if (!hasStateRule) {
    skipped.push({ file, why: '没有启用的「状态更新规则」（不是 DSH 后台模式，旧协议本来就该启用）' })
    continue
  }

  // 有状态更新规则 → 找还启用着的旧协议条目
  const legacy = entries.filter((e) => {
    if (e.enabled === false) return false
    const name = e.comment || ''
    const body = String(e.content || '')
    const nameHit = /output_format|变量输出格式|变量输出规则/i.test(name)
    const bodyHit = /<UpdateVariable>/.test(body) || /JSON\s*Patch\s*\(RFC\s*6902\)/i.test(body)
    return nameHit || bodyHit
  })

  if (legacy.length) {
    problems.push({
      file,
      legacy: legacy.map((e) => ({ name: e.comment || '', len: String(e.content || '').length, constant: !!e.constant })),
    })
  } else {
    ok.push({ file, ruleLen: stateRule.map((e) => String(e.content || '').length).join('/') })
  }
}

console.log('=== 有「状态更新规则」但仍启用着旧正文协议的卡（需要处理）===')
if (!problems.length) console.log('  （无）')
for (const p of problems) {
  console.log('■ ' + p.file.replace(/\.json$/, ''))
  for (const e of p.legacy) {
    console.log('    【启用】' + (e.constant ? ' 常数' : '     ') + '  ' + e.name.slice(0, 56) + '  (' + e.len + ' 字)')
  }
  console.log('')
}

console.log('=== 启用了「状态更新规则」且旧协议已正确停用的卡 ===')
if (!ok.length) console.log('  （无）')
for (const o of ok) console.log('  ✓ ' + o.file.replace(/\.json$/, '') + '   （状态更新规则 ' + o.ruleLen + ' 字）')
console.log('')

console.log('=== 不适用（没有启用的「状态更新规则」）===')
for (const s of skipped) console.log('  - ' + s.file.replace(/\.json$/, '') + '  ← ' + s.why)
