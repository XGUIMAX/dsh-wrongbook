// 对**真实数据**做只读一致性核对：错题库 ↔ 回流过的 skill 有没有跑偏。
//
// 用法：node verify/live.mjs
//
// 跟 host.mjs / client.mjs 不同 —— 那两个在沙盒里跑，跟真实数据无关。这个专门盯
// 真实文件，回答"上次同步之后，两边还对得上吗"。它不写任何东西。
//
// 值得常跑的理由：同步出过的三个 bug（拦腰截断、拼接粘行、示例标记变假条目）
// 全都是靠"数一数、做集合差"发现的，肉眼扫文件看不出来。
import fs from 'node:fs'
import path from 'node:path'

const DATA_ROOT =
  process.env.DSH_TAVERN_DATA || path.join(process.env.DSH_HOME || path.join(process.env.USERPROFILE || '', '.dsh'), 'profile-data', 'tavern', 'data')
const DB_FILE = path.join(DATA_ROOT, 'tools', 'wrongbook', 'data.json')
const SKILL_DIR = path.join(DATA_ROOT, 'skills')

const MARK_RE = /^<!-- wrongbook:([^|]+)\|([^|]*)\|([0-9a-f]{6,}) -->[ \t]*$/
const STATUS_LABEL = { open: '未解决', watch: '观察中', fixed: '已修复' }

if (!fs.existsSync(DB_FILE)) {
  console.log(`找不到错题库：${DB_FILE}`)
  process.exit(1)
}
const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
const cardName = (key) => (db.cards[key] && db.cards[key].name) || key

/** 按和 parseRefluxFile 一样的严格判据切条目 —— 别用裸 `### `。 */
function entriesOf(text) {
  const lines = String(text).split('\n')
  const out = []
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].startsWith('### ')) continue
    const next = lines[i + 1] || ''
    const after = lines[i + 2] || ''
    const unmarked = next.trim() === '' && after.startsWith('> 错题库回流：')
    if (!MARK_RE.test(next) && !next.startsWith('> 错题库回流：') && !unmarked) continue
    const until = (() => {
      for (let j = i + 1; j < lines.length; j += 1) {
        if (lines[j].startsWith('\n### ')) return j
      }
      return lines.length
    })()
    out.push({ title: lines[i].slice(4).trim(), marked: MARK_RE.test(next), block: lines.slice(i, until).join('\n') })
  }
  return out
}

let problems = 0
const skills = fs.existsSync(SKILL_DIR)
  ? fs.readdirSync(SKILL_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : []

if (!skills.length) console.log('（还没有自己的 skill）')

for (const name of skills) {
  const dir = path.join(SKILL_DIR, name, 'references')
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith('.md')) : []
  const refluxFiles = files.filter((n) => n.includes('回流'))
  if (!refluxFiles.length) continue

  for (const file of refluxFiles) {
    const full = path.join(dir, file)
    const text = fs.readFileSync(full, 'utf8')
    const found = entriesOf(text)
    const titles = found.map((e) => e.title)
    const unmarked = found.filter((e) => !e.marked)

    const inDb = new Set(db.entries.map((e) => e.title))
    const orphans = titles.filter((t) => !inDb.has(t))
    const missing = [...inDb].filter((t) => !titles.includes(t))

    // 状态对照：文件里写的那一行，跟错题库现在的状态是否一致
    const stale = []
    for (const entry of db.entries) {
      const hit = found.find((f) => f.title === entry.title)
      if (!hit) continue
      const meta = (hit.block.match(/^> 错题库回流：.*$/m) || [''])[0]
      const want = STATUS_LABEL[entry.status]
      if (want && meta && !meta.includes(want)) stale.push(`${entry.title}（应为「${want}」）`)
    }

    const bad = orphans.length || missing.length || stale.length
    if (bad) problems += 1
    console.log(`\n${name} / ${file}`)
    console.log(`  条目 ${found.length} 条 · 其中未认领（没有标记）${unmarked.length} 条 · 错题库 ${db.entries.length} 条`)
    if (orphans.length) console.log(`  ✗ skill 里有、错题库没有的：${orphans.join('、')}`)
    if (missing.length) console.log(`  ✗ 错题库里有、skill 里没有的：${missing.slice(0, 5).join('、')}${missing.length > 5 ? ` 等 ${missing.length} 条` : ''}`)
    if (stale.length) console.log(`  ✗ 状态没跟上：${stale.slice(0, 5).join('、')}${stale.length > 5 ? ` 等 ${stale.length} 条` : ''}`)
    if (!bad) console.log('  ✓ 标题与状态都对得上')
  }
}

console.log('')
if (db.config && db.config.autoReflux) {
  const last = db.config.autoRefluxLast || {}
  console.log(
    `自动同步：开 → ${db.config.autoReflux.skill}` +
      (last.error ? `（上次失败：${last.error}）` : `（上次 ${String(last.at || '').slice(0, 16).replace('T', ' ')}，新增 ${last.written || 0} 条）`),
  )
} else {
  console.log('自动同步：关')
}

// 分门别类数一遍，顺便让人看到错题库的整体分布
const byCard = {}
for (const e of db.entries) byCard[cardName(e.cardKey)] = (byCard[cardName(e.cardKey)] || 0) + 1
console.log(`错题库 ${db.entries.length} 条，分布：${Object.entries(byCard).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
console.log(problems ? `\n${problems} 处不一致，值得看一眼。` : '\n一切对得上。')
