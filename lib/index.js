/**
 * dsh-wrongbook — Host half.
 *
 * 错题库按人物卡分类记录调试中踩过的坑，并给调试流程一个确定的检索顺序：
 * 先查出问题那张卡自己的错题库，再跨卡查询。
 *
 * 数据落在 Tavern 自己的数据根下（`<dataRoot>/tools/wrongbook`），不在程序安装目录里，
 * 所以 desktop 更新覆盖不到它。浏览器半边（./client.js）通过下面三条路由读写：
 *
 *   GET  /dsh-wrongbook/state    全量状态：卡片分类、条目、自检记录、备份
 *   GET  /dsh-wrongbook/avatar   卡片头像（?card=<key>）
 *   POST /dsh-wrongbook/action   全部写操作与自检
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)

/** apply 时记下的 Host Context，用来解析可执行文件的真实路径。 */
let pluginCtx = null

export const name = 'dsh-wrongbook'

/**
 * 声明的服务会被注入成 `ctx.tools` / `ctx.systemPrompt`。
 *
 * 少了这行，`ctx.get('tools')` 拿不到东西，工具注册会静默跳过 ——
 * 面板照常工作（它走 HTTP 路由），但模型侧一个工具都看不到，归档自然落空。
 */
export const inject = ['tools', 'systemPrompt']

/**
 * 写进 system prompt 的一段。
 *
 * 只注册工具不够：工具列表里多几个名字，模型不会因此去用它们。真发生过一次 ——
 * 让 Agent 归档时，它把错题写进了 `materials/错题库.md`，因为它只知道那儿。
 * 所以这里把「什么时候查、什么时候归档、归档完回报一句」明确写下来。
 *
 * 第 2 条是后加的：转 MVU 之后那个「副本比原版少了什么」的对照最容易漏，
 * 而漏掉的往往是作者自带的功能脚本 —— 它们被转换清空后不会自己回来，
 * 界面和逻辑静悄悄地少一块，卡看起来却一切正常。
 */
const WRONGBOOK_PROMPT = [
  '【错题库】本机装了 dsh-wrongbook，错题的唯一归档位置是它（面板入口：设置 → 错题库）。',
  '工具三个：`wrongbook_lookup` 查、`wrongbook_record` 归档、`wrongbook_update` 补写。',
  '',
  '**下面这些场景动手前都要先过一遍错题库**：',
  '',
  '1. 调试人物卡 —— `card` 填卡名。',
  '2. **转 MVU 版，以及转换后做「副本比原版少了什么」的差异对照。** 这一步最容易漏，漏掉的往往是作者自带的功能脚本：它们被转换清空之后不会自己回来，界面和逻辑静悄悄地少一块，卡看起来却一切正常。开查之前先在错题库里找「差异判定 / 脚本补回」—— 那里有四类差异的分法（预期移除 / 改名保留 / 有意停用 / 真缺失）和现成的对比工具。',
  '3. 排查 DSH / Tavern / 插件自身的问题 —— `card` 填「卡片更新器」「Tavern 本体」这类主题名。',
  '',
  '查的顺序是固定的：`wrongbook_lookup { card: "<卡名或主题>" }` 返回「① 本分类 → ② 其它错题 → ③ 跨卡查询」三段，前一段优先看。',
  '',
  '解决之后归档：`wrongbook_record { card, title, symptom, cause, fix, scope, tags }`，现象、根因、证据、处理、防坑都写进去。分类名不认识会自动建。库里已有同一条就用 `wrongbook_update { id, status, cause, fix }` 补根因或标记已修复。',
  '',
  '**归档完必须在回复里回报**：写明「已归档到错题库」＋分类名和条目标题。用户靠这句话确认归档真的发生了。',
  '',
  '不要再把错题写进 md 文件：`materials/错题库.md`、技能里的 `references/` 都已经迁走，写进去等于没归档 —— 面板查不到，下次调试也检索不到。',
].join('\n')

/* ------------------------------------------------------------ locations */

const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
/** Tavern 数据根。DSH_TAVERN_DATA 优先，方便换 root 时不动代码。 */
const TAVERN_DATA =
  process.env.DSH_TAVERN_DATA || path.join(DSH_HOME, 'profile-data', 'tavern', 'data')
const RES_DIR = path.join(TAVERN_DATA, 'resources')
const CARD_DIR = path.join(RES_DIR, 'cards')
/** Tavern 保存的未改动原版卡，卡图也放在它旁边。 */
const ORIGINALS_DIR = path.join(TAVERN_DATA, 'originals', 'cards')
const DATA_DIR = path.join(TAVERN_DATA, 'tools', 'wrongbook')
const DB_FILE = path.join(DATA_DIR, 'data.json')
const SELF_FILE = path.join(DATA_DIR, 'selfcheck.json')
const BACKUP_DIR_DEFAULT = path.join(DATA_DIR, 'backups')
/**
 * 当前生效的备份目录。默认在数据目录旁边，也可以在面板上改到别处
 * （换盘、放到同步盘里之类）。改完只影响之后写入的备份，旧目录里已有的不搬。
 */
let BACKUP_DIR = BACKUP_DIR_DEFAULT

/** 包根目录：`<root>/lib/index.js`，所以是本文件的上一层。 */
const PLUGIN_DIR = (() => {
  try {
    return path.dirname(path.dirname(fileURLToPath(import.meta.url)))
  } catch {
    return ''
  }
})()

const FALLBACK_VERSION = '1.0.0'
const MAX_BACKUPS = 60
/** 跨卡通用问题的落点；没有对应卡的条目都归到这里。 */
const GENERAL_KEY = '__general__'
/** 自检要盯的插件自身文件，指纹就是这几项串起来的哈希。 */
const SELF_FILES = ['package.json', 'lib/index.js', 'client.js']
const SCOPES = ['卡片', 'MVU', '世界书', '正则', '脚本', '前端UI', '预设', '工具链', '其他']
const STATUSES = ['open', 'watch', 'fixed']

/* ------------------------------------------------------------- helpers */

function log(...args) {
  try {
    console.log('[dsh-wrongbook]', ...args)
  } catch {
    /* 日志失败不该影响主流程 */
  }
}

function exists(p) {
  try {
    return fs.existsSync(p)
  } catch {
    return false
  }
}

function ensureDir(p) {
  try {
    fs.mkdirSync(p, { recursive: true })
  } catch (e) {
    log('ensureDir failed:', p, e && e.message)
  }
}

function readJson(file, fallback) {
  try {
    if (!exists(file)) return fallback
    const text = fs.readFileSync(file, 'utf8')
    if (!text.trim()) return fallback
    return JSON.parse(text)
  } catch (e) {
    log('readJson failed:', file, e && e.message)
    return fallback
  }
}

/** 先写临时文件再改名，避免半截 JSON 覆盖掉上一份好的。 */
function writeJsonAtomic(file, value) {
  const tmp = `${file}.tmp-${process.pid}`
  const body = JSON.stringify(value, null, 2)
  fs.writeFileSync(tmp, body, 'utf8')
  fs.renameSync(tmp, file)
}

function nowIso() {
  return new Date().toISOString()
}

function str(value) {
  return value === undefined || value === null ? '' : String(value)
}

function uid() {
  return `e_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function sha256File(file) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  } catch {
    return ''
  }
}

function splitTags(value) {
  if (Array.isArray(value)) {
    return value.map(str).map((s) => s.trim()).filter(Boolean).slice(0, 12)
  }
  return str(value)
    .split(/[,，、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12)
}

/* ---------------------------------------------------------------- store */

function emptyDb() {
  return { version: 1, updatedAt: '', cards: {}, entries: [] }
}

let db = emptyDb()

function loadDb() {
  const raw = readJson(DB_FILE, null)
  if (!raw || typeof raw !== 'object') {
    db = emptyDb()
    return
  }
  db = {
    version: 1,
    updatedAt: str(raw.updatedAt),
    cards: raw.cards && typeof raw.cards === 'object' ? raw.cards : {},
    entries: Array.isArray(raw.entries) ? raw.entries.map((e) => normalizeEntry(e, e && e.cardKey)) : [],
    config: raw.config && typeof raw.config === 'object' ? raw.config : { remoteUrl: '' },
  }
  lastWritten = JSON.stringify(db, null, 2)
}

/** 上一次真正落到盘上的内容，用来挡掉重复写和它带来的成串备份。 */
let lastWritten = null

function saveDb(reason) {
  try {
    db.updatedAt = nowIso()
    const body = JSON.stringify(db, null, 2)
    if (body === lastWritten) return false
    if (exists(DB_FILE)) backupDb(reason || 'save')
    writeJsonAtomic(DB_FILE, db)
    lastWritten = body
    return true
  } catch (e) {
    log('saveDb failed:', e && e.message)
    throw e
  }
}

/**
 * 备份文件名长这样：`<毫秒>__<起因>__data.json`。
 *
 * 自定义备份目录里可能同时躺着别人的 JSON（用户挑了一个通用备份文件夹）。
 * 保留策略是会删东西的，所以「是不是本插件写的」必须先按名字认出来，
 * 否则一次自动清理就会连别人的文件一起带走。
 */
const BACKUP_NAME_RE = /^\d{10,}__[A-Za-z0-9_-]*__data\.json$/

function isBackupName(name) {
  return BACKUP_NAME_RE.test(str(name))
}

function backupDb(reason) {
  ensureDir(BACKUP_DIR)
  try {
    const safe = str(reason || 'save').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 40)
    const stamp = Date.now()
    // 同一毫秒里连着写两次会撞名，而撞名是静默覆盖 —— 一份备份就这么没了。
    // 撞上就加序号，文件名形状不变，`isBackupName` 与列表解析都还认得。
    let dest = path.join(BACKUP_DIR, `${stamp}__${safe}__data.json`)
    for (let n = 2; exists(dest); n += 1) {
      dest = path.join(BACKUP_DIR, `${stamp}__${safe}-${n}__data.json`)
    }
    fs.copyFileSync(DB_FILE, dest)
    pruneBackups()
  } catch (e) {
    log('backupDb failed:', e && e.message)
  }
}

/** 备份条目数的缓存：按键是「文件名:大小:修改时间」，任一变了就重新数。 */
const backupMeta = new Map()

function countBackupEntries(full, name, size, mtime) {
  const key = `${name}:${size}:${mtime}`
  if (backupMeta.has(key)) return backupMeta.get(key)
  let entries = -1
  try {
    const raw = JSON.parse(fs.readFileSync(full, 'utf8'))
    entries = Array.isArray(raw && raw.entries) ? raw.entries.length : -1
  } catch {
    entries = -1
  }
  if (backupMeta.size > 400) backupMeta.clear()
  backupMeta.set(key, entries)
  return entries
}

/**
 * 备份列表，最新的在前。
 *
 * 带上条目数：还原之前要能看出这份备份是"当时只有几条"还是"和现在差不多"，
 * 只看时间的话，一份刚写出来的空备份和一份内容完整的备份长得一样。
 */
function listBackups() {
  if (!exists(BACKUP_DIR)) return []
  try {
    return fs
      .readdirSync(BACKUP_DIR)
      .filter(isBackupName)
      .map((n) => {
        const full = path.join(BACKUP_DIR, n)
        let st = null
        try {
          st = fs.statSync(full)
        } catch {
          /* 文件刚被删掉 */
        }
        if (!st) return null
        const [stamp, reason] = n.split('__')
        return {
          file: n,
          at: Number(stamp) || st.mtimeMs,
          reason: str(reason).replace(/-/g, ' '),
          bytes: st.size,
          entries: countBackupEntries(full, n, st.size, st.mtimeMs),
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.at - a.at)
      .slice(0, 200)
  } catch {
    return []
  }
}

function pruneBackups() {
  try {
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter(isBackupName)
      .map((n) => ({ n, t: Number(n.split('__')[0]) || 0 }))
      .sort((a, b) => b.t - a.t)
    for (const extra of files.slice(MAX_BACKUPS)) {
      try {
        fs.unlinkSync(path.join(BACKUP_DIR, extra.n))
      } catch {
        /* 已经被清掉了 */
      }
    }
  } catch {
    /* 目录不可读时保持原样 */
  }
}

function normalizeEntry(raw, cardKey) {
  const src = raw && typeof raw === 'object' ? raw : {}
  return {
    id: str(src.id) || uid(),
    cardKey: str(src.cardKey) || str(cardKey) || GENERAL_KEY,
    title: str(src.title),
    symptom: str(src.symptom),
    cause: str(src.cause),
    fix: str(src.fix),
    scope: SCOPES.includes(src.scope) ? src.scope : '其他',
    status: STATUSES.includes(src.status) ? src.status : 'open',
    tags: splitTags(src.tags),
    refs: str(src.refs),
    evidence: str(src.evidence),
    createdAt: str(src.createdAt) || nowIso(),
    updatedAt: nowIso(),
  }
}

/* ---------------------------------------------------------- card scanning */

/**
 * 卡内脚本盘点。
 *
 * 作者经常随卡附带自定义脚本 —— 悬浮状态栏、地理数据加载、变量更新器、自动化流程 ——
 * 它们不在任何通用清单里，却决定了卡能不能正常跑。DSH 又没有全局脚本槽：脚本随卡加载，
 * 换一张卡就换一套脚本。所以排查任何一张卡之前，先看清它带了什么。
 *
 * 这份规则是从 `data/tools/card-scripts/scan.mjs` 搬进来的，那边是个命令行脚本，
 * 这里做成面板上随时能看的一栏。
 */
const COMMON_SCRIPTS = new Set(['外置状态栏', '小手机脚本', '创意工坊', '格式修复', '辅助计算脚本'])
const CONTROLLER_RE = /控制器|推演|播报|主线|副本控制/

function describeScript(raw) {
  const content = str(raw && raw.content)
  return {
    name: str(raw && raw.name).trim() || '（未命名）',
    chars: content.length,
    enabled: !(raw && raw.enabled === false),
    // 脚本可以用 `import '...'` 指向同一个目录下的另一份文件，那才是它的真身。
    link: (content.match(/^import\s+['"]([^'"]+)['"]/m) || [])[1] || '',
    common: COMMON_SCRIPTS.has(str(raw && raw.name).trim()),
    dataKeys: raw && raw.data && typeof raw.data === 'object' ? Object.keys(raw.data) : [],
  }
}

/** 从一张卡的完整 JSON 里把脚本与几类"机制条目"挑出来。 */
function cardScriptsOf(raw) {
  // 卡文件不一定就是卡本体：DSH 存盘时可能在外面套一层 `{ raw: … }`。
  // 少剥这一层，脚本数就永远是 0。
  const card = (raw && raw.raw) || raw
  const data = card && card.data && typeof card.data === 'object' ? card.data : card
  const extensions = (data || {}).extensions || {}
  const helper = extensions.tavern_helper || extensions.TavernHelper || {}
  const scripts = helper.scripts
  const entries = (((data || {}).character_book || {}).entries) || []
  const list = (Array.isArray(scripts) ? scripts : []).map(describeScript)
  const commentOf = (e) => str(e && e.comment)
  return {
    scripts: list,
    special: list.filter((s) => !s.common),
    hasCommon: list.some((s) => s.common),
    controllers: entries.filter((e) => CONTROLLER_RE.test(commentOf(e))).map(commentOf),
    patchEntries: entries.filter((e) => /json_patch|UpdateVariable/.test(str(e && e.content))).map(commentOf),
    initvar: entries.filter((e) => /\[initvar\]/i.test(commentOf(e))).map(commentOf),
  }
}

/** 卡文件按「路径 + 大小 + 修改时间」缓存解析结果；命中就不必再读那几 MB。 */
const scriptScanCache = new Map()

function scanCardScripts() {
  const out = []
  let names = []
  try {
    names = fs.readdirSync(CARD_DIR)
  } catch {
    return out
  }
  for (const n of names) {
    if (n.startsWith('.') || !/\.json$/i.test(n)) continue
    const full = path.join(CARD_DIR, n)
    let st = null
    try {
      st = fs.statSync(full)
    } catch {
      continue
    }
    const stamp = `${full}:${st.size}:${st.mtimeMs}`
    let parsed = scriptScanCache.get(stamp)
    if (!parsed) {
      try {
        parsed = cardScriptsOf(JSON.parse(fs.readFileSync(full, 'utf8')))
      } catch (e) {
        parsed = {
          error: (e && e.message) || String(e),
          scripts: [],
          special: [],
          hasCommon: false,
          controllers: [],
          patchEntries: [],
          initvar: [],
        }
      }
      scriptScanCache.set(stamp, parsed)
    }
    out.push({ key: `cards/${n}`, name: n.replace(/\.json$/i, ''), bytes: st.size, mtime: st.mtimeMs, ...parsed })
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
  const flagged = out.filter((c) => c.special.length || c.controllers.length || c.patchEntries.length)
  return { cards: out, flagged: flagged.length }
}

/**
 * `data/tools/` 下也躺着脚本：从卡里导出来的、或者为卡自制待命的。
 *
 * 它们不属于任何一张卡，但正是「卡出问题时拿来适配」的原料。判据只认 Tavern 的
 * 脚本形状 —— 有 name、有几百字以上的 content —— 免得把插件的状态文件也收进来。
 */
function scanToolScripts() {
  const root = path.join(TAVERN_DATA, 'tools')
  const out = []
  const looksLikeScript = (obj) =>
    obj && typeof obj === 'object' && typeof obj.name === 'string' && typeof obj.content === 'string' && obj.content.length > 200
  const walk = (dir, depth) => {
    if (depth > 2) return
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full, depth + 1)
        continue
      }
      const ext = path.extname(entry.name).toLowerCase()
      if (ext !== '.json' && ext !== '.mjs' && ext !== '.js') continue
      let st = null
      try {
        st = fs.statSync(full)
      } catch {
        continue
      }
      // wrongbook 自己的数据也在这个目录下，排除掉。
      if (full.startsWith(DATA_DIR)) continue
      const record = {
        rel: path.relative(TAVERN_DATA, full).replace(/\\/g, '/'),
        file: entry.name,
        dir: path.basename(dir),
        bytes: st.size,
        mtime: st.mtimeMs,
      }
      if (ext === '.json') {
        const stamp = `${full}:${st.size}:${st.mtimeMs}`
        let parsed = scriptScanCache.get(stamp)
        if (parsed === undefined) {
          try {
            const raw = JSON.parse(fs.readFileSync(full, 'utf8'))
            parsed = looksLikeScript(raw) ? describeScript(raw) : null
          } catch {
            parsed = null
          }
          scriptScanCache.set(stamp, parsed)
        }
        if (!parsed) continue
        out.push({ ...record, ...parsed })
      } else {
        out.push({ ...record, name: entry.name, kind: 'module' })
      }
    }
  }
  walk(root, 0)
  return out.sort((a, b) => b.mtime - a.mtime)
}

/**
 * profile 名从数据根反推。
 *
 * 标准布局是 `<DSH_HOME>/profile-data/<名>/data`，所以先认 `profile-data` 这一级 ——
 * 比"上一级目录名"稳（后者在任何非标准布局下都会安静地给出一个错名字）。
 * 认不出才退回上一级目录名，聊胜于无。环境里没有现成的 profile 变量可用。
 */
function profileNameFrom(dataRoot) {
  const full = path.resolve(str(dataRoot))
  const parts = full.split(path.sep)
  const at = parts.lastIndexOf('profile-data')
  if (at >= 0 && parts.length > at + 1) return parts[at + 1]
  return path.basename(path.dirname(full))
}

function profileDirPath() {
  return path.join(DSH_HOME, 'profiles', profileNameFrom(TAVERN_DATA))
}

/**
 * 安装状态：profile 清单里还在不在、node_modules 那个链接通不通。
 *
 * Tavern 更新会重写 `profiles/<名>/package.json`，但它是读-改-写：只删自己上次托管的
 * （`previousManagedDependencies`）、只覆盖自己这次托管的，用户自己加的条目原样留着。
 * 所以 `link:` 那条依赖和 `dsh.profile.bundles` 里那个名字都动不到。
 *
 * 这里把它查实并显示出来 —— 万一哪天真被抹掉，面板上直接给补回命令，
 * 不用去翻 README 猜。
 */
function installState() {
  const profileDir = profileDirPath()
  const manifestFile = path.join(profileDir, 'package.json')
  const linked = path.join(profileDir, 'node_modules', 'dsh-wrongbook')
  const state = {
    profileDir,
    manifestFile,
    pluginDir: PLUGIN_DIR,
    declared: false,
    bundled: false,
    linked: false,
    linkTarget: '',
    ok: false,
    fix: '',
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
    state.declared = !!(manifest.dependencies && manifest.dependencies['dsh-wrongbook'])
    const bundles = (((manifest.dsh || {}).profile || {}).bundles) || []
    state.bundled = Array.isArray(bundles) && bundles.includes('dsh-wrongbook')
  } catch {
    /* 读不到就当两样都缺 */
  }

  try {
    const st = fs.lstatSync(linked)
    if (!st.isSymbolicLink()) {
      // 打包安装是复制进来的，不算链接，但也不是问题。
      state.linked = true
      state.linkTarget = '(复制安装)'
    } else {
      state.linkTarget = fs.readlinkSync(linked)
      state.linked = path.resolve(path.dirname(linked), state.linkTarget) === path.resolve(PLUGIN_DIR)
    }
  } catch {
    /* 链接断了 */
  }

  state.ok = state.declared && state.bundled && state.linked
  if (!state.ok) {
    state.fix = [
      `cd "${profileDir}"`,
      `dsh plugin add "${PLUGIN_DIR}"`,
      '',
      '# 或手工补两处（都不属于 Tavern 会重写的那两份清单）：',
      `#   dependencies        : "dsh-wrongbook": "link:${PLUGIN_DIR.replace(/\\/g, '/')}"`,
      '#   dsh.profile.bundles : 追加一条 "dsh-wrongbook"',
    ].join('\n')
  }
  return state
}

/* ------------------------------------------------------------ skill 回流 */

/** 内置 skill 在程序目录里，Tavern 更新会整份覆盖，所以只读不写。 */
function builtinSkillDir() {
  const candidates = []
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(profileDirPath(), 'package.json'), 'utf8'))
    const source = manifest && manifest.dshTavern && manifest.dshTavern.source
    if (source) candidates.push(path.join(source, 'presets', 'tavern', 'skills'))
  } catch {
    /* 读不到就退回默认位置 */
  }
  candidates.push(path.join(DSH_HOME, 'apps', 'dsh-tavern', 'presets', 'tavern', 'skills'))
  return candidates.find(exists) || ''
}

const userSkillDir = () => path.join(TAVERN_DATA, 'skills')

function skillDescriptionOf(file) {
  try {
    const head = fs.readFileSync(file, 'utf8').slice(0, 3000)
    const m = head.match(/description:\s*"?([^"\n]+)"?/)
    return m ? m[1].trim().slice(0, 200) : ''
  } catch {
    return ''
  }
}

function listSkills() {
  const out = []
  const scan = (root, builtin) => {
    if (!root || !exists(root)) return
    let entries = []
    try {
      entries = fs.readdirSync(root, { withFileTypes: true })
    } catch {
      return
    }
    for (const dirent of entries) {
      if (!dirent.isDirectory() || dirent.name.startsWith('.')) continue
      const dir = path.join(root, dirent.name)
      const skillFile = path.join(dir, 'SKILL.md')
      if (!exists(skillFile)) continue
      let references = []
      let entryCount = 0
      try {
        const refDir = path.join(dir, 'references')
        references = fs.readdirSync(refDir).filter((n) => n.endsWith('.md'))
        // 数一数各份参考资料里有多少条 `### ` —— 建重了、或者建完一直没用的 skill
        // 一眼就能看出来，不然列表里几个名字长得一模一样。
        for (const ref of references) {
          try {
            entryCount += (fs.readFileSync(path.join(refDir, ref), 'utf8').match(/^### /gm) || []).length
          } catch {
            /* 读不了就不计 */
          }
        }
      } catch {
        /* 没有 references 目录 */
      }
      out.push({ name: dirent.name, dir, builtin, description: skillDescriptionOf(skillFile), references, entries: entryCount })
    }
  }
  scan(userSkillDir(), false)
  scan(builtinSkillDir(), true)
  // 用户自己的排前面：内置的写不了，先让能写的露头。
  return out.sort((a, b) => (a.builtin === b.builtin ? a.name.localeCompare(b.name) : a.builtin ? 1 : -1))
}

/** 把一条错题铺成能直接读的 md 段落。 */
function refluxBlock(entry) {
  const meta = [cardDisplayName(entry.cardKey), entry.scope, statusLabel(entry.status)]
  const stamp = str(entry.updatedAt).slice(0, 10)
  const lines = [`### ${entry.title}`, '', `> 错题库回流：${meta.join(' · ')}${stamp ? ` · ${stamp}` : ''}`]
  if (entry.tags && entry.tags.length) lines.push('', `标签：${entry.tags.join('、')}`)
  for (const [label, value] of [
    ['现象', entry.symptom],
    ['根因', entry.cause],
    ['修法', entry.fix],
    ['证据', entry.evidence],
    ['引用', entry.refs],
  ]) {
    if (!str(value).trim()) continue
    lines.push('', `**${label}**`, '', str(value).trim())
  }
  return lines.join('\n')
}

const REFLUX_HEADER = [
  '> 由 dsh-wrongbook 从错题库回流而来。只增不改：新条目追加在末尾，同名的不会重复写。',
  '> 手工编辑没问题，但下次回流不会覆盖你改过的内容。',
  '',
].join('\n')

const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]{1,63}$/

/**
 * 把选中的条目写进某个 skill 的 references 下。
 *
 * 只写用户 skill。内置 skill 在程序目录里，写了也会被下次更新整份覆盖 ——
 * 与其让人以为写成功了，不如直接说清，让他先建一个自己的。
 */
function refluxToSkill(payload) {
  const name = str(payload && payload.skill).trim()
  if (!SKILL_NAME_RE.test(name)) throw new Error(`skill 名不合法：${name}`)

  const target = listSkills().find((s) => s.name === name)
  if (target && target.builtin) {
    throw new Error(`「${name}」是内置 skill，在程序目录里，Tavern 更新会整份覆盖它。请先新建一个自己的 skill 再回流。`)
  }

  const skillDir = target ? target.dir : path.join(userSkillDir(), name)
  const rel = str((payload && payload.file) || 'references/错题库回流.md').replace(/\\/g, '/')
  if (rel.startsWith('/') || rel.split('/').includes('..')) throw new Error(`目标文件不合法：${rel}`)
  const targetFile = path.resolve(skillDir, rel)
  if (!targetFile.startsWith(path.resolve(skillDir))) throw new Error(`目标文件跑到 skill 目录外面了：${rel}`)

  const ids = Array.isArray(payload && payload.ids) ? payload.ids.map(String) : []
  const picked = ids.length ? db.entries.filter((e) => ids.includes(e.id)) : []
  if (!picked.length) throw new Error('没有选出任何条目')

  ensureDir(path.dirname(targetFile))
  const existed = exists(targetFile)
  const before = existed ? fs.readFileSync(targetFile, 'utf8') : ''
  const seen = new Set((before.match(/^### .+$/gm) || []).map((line) => line.slice(4).trim()))

  const blocks = []
  let skipped = 0
  for (const entry of picked) {
    if (seen.has(entry.title)) {
      skipped += 1
      continue
    }
    seen.add(entry.title)
    blocks.push(refluxBlock(entry))
  }

  if (!blocks.length) {
    return { skill: name, file: targetFile, written: 0, skipped, bytes: before.length, created: false }
  }

  const body = existed
    ? `${before.replace(/\s*$/, '')}\n\n${blocks.join('\n\n')}\n`
    : `${REFLUX_HEADER}${blocks.join('\n\n')}\n`
  fs.writeFileSync(targetFile, body, 'utf8')
  return {
    skill: name,
    file: targetFile,
    written: blocks.length,
    skipped,
    bytes: Buffer.byteLength(body, 'utf8'),
    created: !existed,
  }
}

/**
 * 删掉一个用户 skill。
 *
 * 先整份复制到 `<数据根>/skill-backups/` 再删：references 里可能攒着几十条
 * 调出来的结论，那是真正花时间换来的东西，一次手滑不该全没。内置的一律拒绝 ——
 * 那在程序目录里，删了也会被更新装回来，只会留下一个半死不活的中间状态。
 */
function deleteUserSkill(payload) {
  const name = str(payload && payload.name).trim()
  if (!SKILL_NAME_RE.test(name)) throw new Error(`skill 名不合法：${name}`)

  const target = listSkills().find((s) => s.name === name)
  if (!target) throw new Error(`没有叫「${name}」的 skill`)
  if (target.builtin) throw new Error(`「${name}」是内置 skill，在程序目录里，这里删不了`)

  const userRoot = path.resolve(userSkillDir())
  const dir = path.resolve(target.dir)
  if (!dir.startsWith(userRoot + path.sep)) throw new Error(`只删用户 skill 目录下的东西：${dir}`)

  let backup = ''
  try {
    const backupDir = path.join(DATA_DIR, 'skill-backups')
    ensureDir(backupDir)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    backup = path.join(backupDir, `${name}-${stamp}`)
    fs.cpSync(dir, backup, { recursive: true })
  } catch (e) {
    // 备份不成就别删 —— 宁可留着，也不要悄悄丢内容。
    throw new Error(`备份没成功，先不删：${(e && e.message) || e}`)
  }

  fs.rmSync(dir, { recursive: true, force: true })
  return { removed: name, backup, files: fs.existsSync(dir) ? 0 : 1 }
}

function createUserSkill(payload) {  const name = str(payload && payload.name).trim()
  if (!SKILL_NAME_RE.test(name)) {
    throw new Error('skill 名只能用 2–64 位小写字母、数字和连字符，例如 mvu-migration-notes')
  }
  const dir = path.join(userSkillDir(), name)
  const skillFile = path.join(dir, 'SKILL.md')
  if (exists(skillFile)) throw new Error(`已经有一个叫「${name}」的 skill 了`)

  // 默认简介刻意不带 skill 名（列表里本来就显示名字），改成写清"什么时候该读它" ——
  // description 是 Agent 判断要不要自动加载的唯一依据，一句空话等于这个 skill 白建。
  const description =
    str(payload && payload.description).trim() ||
    '已解决故障库：DSH Tavern 卡片调试与 MVU 转换踩过的坑，每条含现象、根因、修法与证据。排查同类问题、动手之前先读一遍。'
  const body = [
    '---',
    `name: ${name}`,
    `description: "${description.replace(/"/g, "'")}"`,
    '---',
    '',
    `# ${name}`,
    '',
    '这个 skill 用来沉淀「做这类事情时踩过的坑」。条目由错题库回流而来，动手前先读一遍下面这份。',
    '',
    '## 参考',
    '',
    '- [错题库回流](references/错题库回流.md)',
    '',
  ].join('\n')

  ensureDir(dir)
  fs.writeFileSync(skillFile, body, 'utf8')
  return { name, dir, file: skillFile, description }
}

function imageContentType(p) {
  const ext = path.extname(str(p)).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  return 'image/png'
}

/** `X MVU版本` 与 `X` 视为同一张卡的两个版本，互指一下方便把结论搬过去。 */
function pairKeyOf(key) {
  const m = /^cards\/(.+)\.json$/.exec(key)
  if (!m) return ''
  const base = m[1]
  const stripped = base.replace(/\s*MVU\s*版本$/i, '')
  const partner = stripped === base ? `${base} MVU版本` : stripped
  if (!partner || partner === base) return ''
  return `cards/${partner}.json`
}

/**
 * 原版卡目录 → 卡片目录，建一份 `basename → 图片路径` 的索引。
 *
 * 先扫 `originals`，所以原版卡图优先。原先每张卡要依次试 5 个路径，
 * 几百张卡就是上千次同步 stat；现在两个目录各列一次，之后全是查表。
 */
function buildAvatarIndex() {
  const index = new Map()
  const exts = ['.png', '.jpg', '.jpeg', '.webp']
  for (const dir of [ORIGINALS_DIR, CARD_DIR]) {
    let names = []
    try {
      names = fs.readdirSync(dir)
    } catch {
      continue
    }
    for (const n of names) {
      const ext = path.extname(n).toLowerCase()
      if (!exts.includes(ext)) continue
      const base = n.slice(0, n.length - ext.length)
      if (!index.has(base)) index.set(base, path.join(dir, n))
    }
  }
  return index
}

/**
 * 扫描卡片目录。
 *
 * `withFileTypes` 一次拿到类型，不再逐个 `statSync`：那些 stat 只为判断
 * 「是不是文件」，而它顺手取回的 size/mtime 没有任何地方在用。
 */
function scanCards() {
  if (!exists(CARD_DIR)) return []
  let dirents = []
  try {
    dirents = fs.readdirSync(CARD_DIR, { withFileTypes: true })
  } catch (e) {
    log('card dir unreadable:', e && e.message)
    return []
  }
  const avatars = buildAvatarIndex()
  const out = []
  for (const dirent of dirents) {
    const n = dirent.name
    if (n.startsWith('.') || !/\.json$/i.test(n)) continue
    if (!dirent.isFile()) continue
    const base = n.replace(/\.json$/i, '')
    out.push({
      key: `cards/${n}`,
      name: base,
      rel: `cards/${n}`,
      abs: path.join(CARD_DIR, n),
      base,
      kind: /MVU/i.test(base) ? 'mvu' : 'plain',
      avatar: avatars.get(base) || '',
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
}

/**
 * 把扫描结果并进分类表。
 *
 * 分类分两组：`card` 由卡片目录决定，`other` 是手建的。
 *
 * 卡片分类里已经不在目录中的不删除，只标 `missing` —— 卡片可能只是改名或被移走，
 * 而它上面记着的错题是调出来的结论，丢了就白调了。`other` 组不参与扫描，
 * 所以也不会因为文件消失被标记。
 */
function syncCards(scanned) {
  let changed = false
  const scannedKeys = new Set(scanned.map((c) => c.key))
  for (const card of scanned) {
    const cur = db.cards[card.key]
    const next = {
      key: card.key,
      group: 'card',
      name: cur && cur.name ? cur.name : card.name,
      autoName: card.name,
      rel: card.rel,
      abs: card.abs,
      kind: card.kind,
      base: card.base,
      avatar: card.avatar,
      pairKey: pairKeyOf(card.key),
      note: cur && cur.note ? cur.note : '',
      missing: false,
      updatedAt: cur && cur.updatedAt ? cur.updatedAt : nowIso(),
    }
    if (!cur || !sameCardView(cur, next)) {
      db.cards[card.key] = next
      changed = true
    }
  }
  const gone = []
  for (const key of Object.keys(db.cards)) {
    const card = db.cards[key]
    if (card.group !== 'card') {
      // 早期版本没有 group 字段：那时存在的非扫描分类都是手建的，补成 other。
      if (card.group === undefined) {
        card.group = 'other'
        changed = true
      }
      continue
    }
    if (scannedKeys.has(key)) continue
    if (!card.missing) {
      card.missing = true
      changed = true
    }
    gone.push(key)
  }

  // 卡不在了、分类下又一条记录都没有：留着只是噪音，直接清掉。
  //
  // 有记录的不动 —— 那些是调出来的结论，卡片改名、临时移走或手动换过文件名时
  // 不该跟着消失，标成「已不在卡片目录」留在列表里就是这个意思。
  if (gone.length) {
    const used = new Set(db.entries.map((entry) => entry.cardKey))
    for (const key of gone) {
      if (used.has(key)) continue
      delete db.cards[key]
      changed = true
    }
  }
  return changed
}

/**
 * 两张卡的登记是否一致。
 *
 * 逐字段比，不比整串 JSON：`stringify` 一张卡要把它整个序列化一遍，
 * 而这对每张卡每轮 `state` 都要做两次。
 */
function sameCardView(a, b) {
  for (const k of Object.keys(b)) {
    if (k === 'updatedAt') continue
    if (a[k] !== b[k]) return false
  }
  return true
}

/**
 * 「其它错题」那一组预置的分类。
 *
 * 卡片更新器是第一个落点，所以默认就建出来，打开就能往里记；
 * 名称、说明和分类本身都可以改也可以删。
 */
const OTHER_BUCKETS = [
  {
    key: '__other_card-cases__',
    name: '卡内故障',
    note: '卡本身出的故障：状态栏、变量结算、开场白入口、世界书、正则、卡内界面。',
  },
  {
    key: '__other_card-updater__',
    name: '卡片更新器',
    note: '卡片更新器插件自身的问题：更新链、合并策略、备份还原、链接检测。',
  },
  {
    key: GENERAL_KEY,
    name: '通用 / 未归类',
    // 早期版本的兜底分类叫这个名字；只在它还是旧默认值时才跟着改。
    legacyNames: ['通用 / 跨卡问题'],
    note: '不属于某一具体卡、也还没归到某个工具的问题。',
  },
]

function ensureOtherBuckets() {
  let changed = false
  for (const preset of OTHER_BUCKETS) {
    const cur = db.cards[preset.key]
    if (cur) {
      if (cur.group !== 'other') {
        cur.group = 'other'
        changed = true
      }
      // 改名只认旧默认值：用户自己改过的名字不覆盖。
      if (preset.legacyNames && preset.legacyNames.includes(cur.name)) {
        cur.name = preset.name
        cur.autoName = preset.name
        changed = true
      }
      continue
    }
    db.cards[preset.key] = {
      key: preset.key,
      group: 'other',
      name: preset.name,
      autoName: preset.name,
      rel: '',
      abs: '',
      kind: 'other',
      base: '',
      avatar: '',
      pairKey: '',
      note: preset.note,
      missing: false,
      updatedAt: nowIso(),
    }
    changed = true
  }
  return changed
}

/* ------------------------------------------------------------- retrieval */

/**
 * 检索，固定顺序：本分类 → 其它错题 → 跨卡，前一段永远排在后面几段之前。
 *
 * 顺序是刻意的：同分类的问题往往已经在这张卡上复现过，先看它；
 * 本分类没有答案时，先去「其它错题」那一组找 —— 归类可能偏，但内容还在库里；
 * 最后才是别的卡片。
 *
 * @param {{card?: string, query?: string, status?: string, scope?: string, limit?: number}} request
 * @returns {{cardKey: string, cardName: string, cardGroup: string, own: object[], other: object[], cross: object[], scanned: number}}
 */
function lookup(request) {
  const req = request || {}
  const query = str(req.query).trim().toLowerCase()
  const terms = query ? query.split(/\s+/).filter(Boolean) : []
  const status = STATUSES.includes(req.status) ? req.status : ''
  const scope = str(req.scope)

  const resolved = resolveCardKeyDetail(req.card)
  const cardKey = resolved.key
  const scored = []
  for (const entry of db.entries) {
    if (status && entry.status !== status) continue
    if (scope && entry.scope !== scope) continue
    const score = terms.length ? scoreEntry(entry, terms) : 1
    if (score <= 0) continue
    scored.push({ entry, score })
  }
  scored.sort((a, b) => b.score - a.score || String(b.entry.updatedAt).localeCompare(String(a.entry.updatedAt)))

  // 三段，顺序是刻意的：本分类 → 其它错题 → 跨卡查询。
  //
  // 中间那一段是给「卡的问题被记到了其它错题里」准备的：归类不可能永远分毫不差，
  // 而归档位置的偏差不该让检索漏掉它。它排在跨卡之前，因为插件与工具链上的坑
  // 影响的往往不止一张卡。
  // 分段独立截断。
  //
  // 原先边遍历边塞、总数到顶就停，而排序是全局的 —— 于是本分类里分数低的条目
  // 会被跨卡的高分条目挤出名额。而「① 一定看得到」是这东西存在的全部理由。
  // 现在整表扫一遍，每段各自留前 limit 条，同时记下各段的真实总数。
  const limit = Math.max(1, Math.min(200, Number(req.limit) || 80))
  const own = []
  const other = []
  const cross = []
  let ownTotal = 0
  let otherTotal = 0
  let crossTotal = 0
  for (const item of scored) {
    const key = item.entry.cardKey
    if (key === cardKey) {
      ownTotal += 1
      if (own.length < limit) own.push(item.entry)
    } else if (groupOf(key) === 'other') {
      otherTotal += 1
      if (other.length < limit) other.push(item.entry)
    } else {
      crossTotal += 1
      if (cross.length < limit) cross.push(item.entry)
    }
  }

  return {
    cardKey,
    cardName: cardDisplayName(cardKey),
    cardGroup: groupOf(cardKey),
    // 名字对上多个分类时带回去，让调用方知道该补全哪一个，而不是以为查到了。
    asked: str(req.card).trim(),
    candidates: resolved.candidates,
    own: own,
    other,
    cross,
    ownTotal,
    otherTotal,
    crossTotal,
    scanned: db.entries.length,
  }
}

/** 命中越靠前越值钱：标题 > 标签 > 现象 > 根因/修法 > 引用。 */
function scoreEntry(entry, terms) {
  const title = str(entry.title).toLowerCase()
  const tags = splitTags(entry.tags).join(' ').toLowerCase()
  const symptom = str(entry.symptom).toLowerCase()
  const cause = str(entry.cause).toLowerCase()
  const fix = str(entry.fix).toLowerCase()
  const refs = `${str(entry.refs)} ${str(entry.evidence)}`.toLowerCase()
  let score = 0
  for (const term of terms) {
    if (title.includes(term)) score += 6
    if (tags.includes(term)) score += 4
    if (symptom.includes(term)) score += 3
    if (cause.includes(term)) score += 2
    if (fix.includes(term)) score += 2
    if (refs.includes(term)) score += 1
  }
  return score
}

/** 传 key、卡名、文件名片段都能落到一张卡上。 */
/**
 * 把用户写的名字落到一个分类上，并回报对上的候选。
 *
 * 分层匹配，越精确越优先：完整路径 → 文件基名 → 分类显示名完全相等 → 名字包含。
 *
 * **模糊命中多个时不猜**，落回兜底分类并把候选带回去。这里特别要守住的一点：
 * 原版卡和它的 `MVU版本` 是**两个不同的分类**，同名问题往往只出在其中一张上
 * （MVU 版才是调试对象，坑也多半记在它头上）。替用户在两者之间挑一个，
 * 就是把结论记到不该记的地方，比让他补全名字贵得多。
 */
function resolveCardKeyDetail(input) {
  const raw = str(input).trim()
  if (!raw) return { key: GENERAL_KEY, candidates: [] }
  if (db.cards[raw]) return { key: raw, candidates: [] }
  if (isGeneralAlias(raw)) return { key: GENERAL_KEY, candidates: [] }

  const base = path.basename(raw).replace(/\.json$/i, '')
  if (!base) return { key: GENERAL_KEY, candidates: [] }
  const keys = Object.keys(db.cards)
  const nameOf = (k) => str(db.cards[k].name)
  const baseOf = (k) => str(db.cards[k].base)

  // 1) 文件基名或相对路径完全对上
  const exact = keys.find(
    (k) => (baseOf(k) && baseOf(k) === base) || k.toLowerCase() === `cards/${base}.json`.toLowerCase(),
  )
  if (exact) return { key: exact, candidates: [] }

  // 2) 分类显示名完全对上
  const byName = keys.find((k) => nameOf(k) === base)
  if (byName) return { key: byName, candidates: [] }

  // 3) 模糊：名字或文件基名包含它
  const fuzzy = keys.filter((k) => k !== GENERAL_KEY && (baseOf(k).includes(base) || nameOf(k).includes(base)))
  if (!fuzzy.length) return { key: GENERAL_KEY, candidates: [] }
  if (fuzzy.length === 1) return { key: fuzzy[0], candidates: [] }
  return { key: GENERAL_KEY, candidates: fuzzy.map(nameOf).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')) }
}

function resolveCardKey(input) {
  return resolveCardKeyDetail(input).key
}

const isGeneralAlias = (value) => /^(通用|跨卡|未归类|general|__general__)$/i.test(str(value).trim())

/** 分类属于哪一组；没登记过的 key 当卡片处理。 */
function groupOf(key) {
  const card = db.cards[key]
  return card ? str(card.group) || 'card' : 'card'
}

/**
 * 建一个手写分类；名字撞了就沿用已有的那个。
 *
 * 记一条「谁也不认识的名字」时用它，而不是默默塞进「通用 / 未归类」：
 * 建出来的分类在面板上看得见、能改名也能删，静默归类则连错在哪都看不出来。
 */
function createOtherBucket(name) {
  const clean = str(name).trim()
  const dup = Object.values(db.cards).find((c) => c.name === clean)
  if (dup) return dup.key
  const key = `__other_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}__`
  db.cards[key] = {
    key,
    group: 'other',
    name: clean,
    autoName: clean,
    rel: '',
    abs: '',
    kind: 'other',
    base: '',
    avatar: '',
    pairKey: '',
    note: '',
    missing: false,
    updatedAt: nowIso(),
  }
  return key
}

function cardDisplayName(key) {
  const card = db.cards[key]
  if (!card) return key === GENERAL_KEY ? '通用 / 未归类' : key
  return str(card.name) || str(card.base) || key
}

/* ------------------------------------------------------------- self check */

function readPackageVersion() {
  const manifest = readJson(path.join(PLUGIN_DIR, 'package.json'), null)
  return manifest && manifest.version ? str(manifest.version) : FALLBACK_VERSION
}

/** 插件自身文件指纹：任何一个字节变了，指纹就变。 */
function selfFingerprint() {
  const files = SELF_FILES.map((rel) => {
    const abs = path.join(PLUGIN_DIR, rel)
    const hash = sha256File(abs)
    let mtime = 0
    let bytes = 0
    try {
      const st = fs.statSync(abs)
      mtime = st.mtimeMs
      bytes = st.size
    } catch {
      /* 文件缺了就是 0，指纹会体现出来 */
    }
    return { rel, sha256: hash, bytes, mtime }
  })
  const joined = files.map((f) => `${f.rel}:${f.sha256}`).join('|')
  return {
    files,
    fingerprint: crypto.createHash('sha256').update(joined).digest('hex'),
  }
}

function readSelfRecord() {
  const raw = readJson(SELF_FILE, null)
  if (!raw || typeof raw !== 'object') {
    return { lastCheckAt: '', version: '', fingerprint: '', latestVersion: '', source: '', history: [] }
  }
  return {
    lastCheckAt: str(raw.lastCheckAt),
    version: str(raw.version),
    fingerprint: str(raw.fingerprint),
    latestVersion: str(raw.latestVersion),
    source: str(raw.source),
    history: Array.isArray(raw.history) ? raw.history.slice(0, 20) : [],
  }
}

/** 不联网的即时视图：只用本地文件和已记录的结果。 */
function selfState() {
  const record = readSelfRecord()
  const version = readPackageVersion()
  const fp = selfFingerprint()
  // 首次检查时没有可比的历史：那时报「有改动」是假警报，只能报「已是最新」。
  const seen = !!record.fingerprint
  const changedLocally = seen && record.fingerprint !== fp.fingerprint
  const versionBumped = seen && !!record.version && record.version !== version
  return {
    name: 'dsh-wrongbook',
    dir: PLUGIN_DIR,
    version,
    fingerprint: fp.fingerprint,
    files: fp.files,
    seen,
    lastCheckAt: record.lastCheckAt,
    latestVersion: record.latestVersion,
    source: record.source,
    changedLocally,
    versionBumped,
    updateAvailable: !!record.latestVersion && record.latestVersion !== version,
    history: record.history,
    dataRoot: DATA_DIR,
  }
}

/**
 * 自检：算本地指纹并与上次记录比对；配了远端清单地址时再去问一次最新版本。
 *
 * 比对的是"插件自身"，所以远端可选：没有远端仓库时，这里报的是本地源码
 * 相对上次检查有没有动过 —— 手改过 lib/ 或 client.js 一样要能被看出来。
 */
async function checkSelf(config) {
  const version = readPackageVersion()
  const fp = selfFingerprint()
  const record = readSelfRecord()
  const remoteUrl = str(config && config.remoteUrl)

  let latestVersion = ''
  let source = 'local'
  let remoteError = ''

  if (remoteUrl) {
    try {
      const res = await fetch(remoteUrl, {
        signal: AbortSignal.timeout(8000),
        headers: { accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()
      latestVersion = str(body && (body.version || (body.dsh && body.dsh.version)))
      source = 'remote'
    } catch (e) {
      remoteError = e && e.message ? e.message : String(e)
      source = 'local'
    }
  }

  const changedLocally = !!record.fingerprint && record.fingerprint !== fp.fingerprint
  const versionMoved = !!record.fingerprint && !!record.version && record.version !== version
  const changedFiles = changedLocally
    ? fp.files
        .filter((f) => {
          const before = (record.files || []).find((x) => x.rel === f.rel)
          return !before || before.sha256 !== f.sha256
        })
        .map((f) => f.rel)
    : []

  const verdict = latestVersion && latestVersion !== version
    ? 'update-available'
    : changedLocally || versionMoved
      ? 'changed-locally'
      : 'up-to-date'

  const history = [
    {
      at: nowIso(),
      version,
      fingerprint: fp.fingerprint,
      latestVersion,
      verdict,
      changedFiles,
      remoteError,
    },
    ...(record.history || []),
  ].slice(0, 20)

  const next = {
    lastCheckAt: nowIso(),
    version,
    fingerprint: fp.fingerprint,
    files: fp.files,
    latestVersion,
    source,
    verdict,
    changedFiles,
    remoteError,
    history,
  }
  try {
    writeJsonAtomic(SELF_FILE, next)
  } catch (e) {
    log('selfcheck write failed:', e && e.message)
  }

  return { ...selfState(), lastCheckAt: next.lastCheckAt, latestVersion, verdict, changedFiles, remoteError, source }
}

/* ------------------------------------------------------- folder browsing */

/**
 * 「列出所有驱动器」这个视图的哨兵路径。
 *
 * Windows 上 Node 没有列盘的 API，`wmic` / `Shell.Application` 又要为一次请求
 * 起一个进程。直接探 26 个根各一次 stat：代价小，而且不可能说谎。
 */
const DRIVE_LIST = '::drives'

function listDrives() {
  const out = []
  for (let code = 65; code <= 90; code++) {
    const root = `${String.fromCharCode(code)}:\\`
    try {
      if (fs.existsSync(root)) out.push({ name: root, path: root, type: 'drive' })
    } catch {
      /* 探不到的盘就不列出来 */
    }
  }
  return out
}

/**
 * 把用户敲进来的路径按他的意思读。
 *
 * 输入框要能接住复制来的路径：两边的引号、正反斜杠、`D:` 这种只写了盘符的、
 * 以及没写根目录的相对名。空框不是错误 —— 它是在要驱动器列表，
 * 而那正是让另一块盘可达的唯一入口。
 */
function resolveDirInput(raw) {
  const text = str(raw == null ? '' : raw)
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .trim()
  if (!text) return DRIVE_LIST
  if (text === DRIVE_LIST) return DRIVE_LIST
  const out = /^[A-Za-z]:$/.test(text)
    ? `${text}\\`
    : path.isAbsolute(text)
      ? path.normalize(text)
      : path.resolve(DATA_DIR, text)
  // normalize 会保留末尾分隔符，而「自己名字以分隔符结尾的目录」会被当成自己的父级，
  // 于是「上一级」变成一个按了没反应的按钮。盘根是唯一该留着那个斜杠的位置。
  if (!/^[A-Za-z]:[\\/]$/.test(out) && /[\\/]$/.test(out) && out.length > 1) {
    return out.replace(/[\\/]+$/, '')
  }
  return out
}

/** 上一级；已经在盘根就回到驱动器列表（dirname('C:\\') 返回它自己）。 */
function parentOf(dir) {
  if (dir === DRIVE_LIST) return DRIVE_LIST
  const up = path.dirname(dir)
  return up === dir ? DRIVE_LIST : up
}

/**
 * 列一层目录，供面板里的浏览弹窗用。
 *
 * 卡片更新器就是这么做选择目录的：不赌宿主提不提供目录选择器，自己列、自己选。
 * 这里只列文件夹 —— 选的是备份落在哪儿，文件没有意义。
 *
 * @param {string} target - 敲进来的路径、绝对目录，或空（要驱动器列表）。
 * @returns {{dir: string, parent: string, drives: boolean, entries: Array<{name: string, path: string, type: string}>, error?: string}}
 */
function listDirEntries(target) {
  const dir = resolveDirInput(target)
  if (dir === DRIVE_LIST) {
    return { dir: DRIVE_LIST, parent: '', drives: true, entries: listDrives() }
  }
  const out = { dir, parent: parentOf(dir), drives: false, entries: [] }
  try {
    if (!fs.statSync(dir).isDirectory()) {
      out.error = `这不是文件夹：${dir}`
      return out
    }
  } catch (e) {
    out.error = (e && e.message) || String(e)
    return out
  }

  let dirents = []
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true })
  } catch (e) {
    out.error = (e && e.message) || String(e)
    return out
  }

  const dirs = []
  for (const entry of dirents) {
    if (entry.name.startsWith('.')) continue
    let isDir = entry.isDirectory()
    if (!isDir && entry.isSymbolicLink()) {
      try {
        isDir = fs.statSync(path.join(dir, entry.name)).isDirectory()
      } catch {
        /* 断掉的符号链接当文件处理 */
      }
    }
    if (isDir) dirs.push({ name: entry.name, path: path.join(dir, entry.name), type: 'directory' })
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
  out.entries = dirs
  return out
}

/* ------------------------------------------------------------- mutations */

function requireCard(key) {
  const { key: resolved, candidates } = resolveCardKeyDetail(key)
  if (candidates.length) {
    throw new Error(`「${key}」对上了 ${candidates.length} 个分类：${candidates.join('、')}。请写全名字指明是哪一个。`)
  }
  if (!db.cards[resolved]) {
    throw new Error(`未找到分类：${key}`)
  }
  return resolved
}

function addEntry(payload) {
  // 面板把字段放在 `entry` 里，工具调用则直接平铺在顶层：两处都认。
  const src = (payload && payload.entry) || payload || {}
  const wanted = str((payload && (payload.cardKey || payload.card)) || src.cardKey || src.card).trim()
  const { key: resolved, candidates } = resolveCardKeyDetail(wanted)
  let cardKey = resolved
  let createdBucket = ''

  // 名字对上了好几个分类：说清楚，让调用方补全，不替他挑。
  // 原版卡与它的 MVU 版就是最常见的一对，而问题往往只出在其中一张上。
  if (candidates.length) {
    throw new Error(`「${wanted}」对上了 ${candidates.length} 个分类：${candidates.join('、')}。请写全名字指明是哪一个。`)
  }

  // 名字谁也不认识：给它建一个分类。
  //
  // 不落回「通用 / 未归类」—— 那会把「分类其实记错了」藏起来：条目还在，
  // 但没人会想到去通用里找它。建出来的分类在面板上看得见，改名和删除都是一步的事。
  // 带路径或扩展名的输入除外：那种写法说明用户明确指向某个卡文件，找不到就是找不到。
  const looksLikePath = /[\\/]/.test(wanted) || /\.json$/i.test(wanted)
  if (wanted && cardKey === GENERAL_KEY && !isGeneralAlias(wanted) && !looksLikePath) {
    cardKey = createOtherBucket(wanted)
    createdBucket = cardKey
  }

  const title = str(src.title).trim()
  if (!title) throw new Error('标题不能为空')
  const entry = normalizeEntry(src, cardKey)
  entry.id = uid()
  entry.cardKey = cardKey
  entry.createdAt = nowIso()
  entry.updatedAt = entry.createdAt
  db.entries.unshift(entry)
  saveDb('add-entry')
  return { entry, created: createdBucket ? cardDisplayName(createdBucket) : '' }
}

function updateEntry(payload) {
  const id = str(payload && payload.id)
  const entry = db.entries.find((e) => e.id === id)
  if (!entry) throw new Error(`未找到条目：${id}`)
  const patch = (payload && payload.patch) || {}
  if (patch.title !== undefined) entry.title = str(patch.title)
  if (patch.symptom !== undefined) entry.symptom = str(patch.symptom)
  if (patch.cause !== undefined) entry.cause = str(patch.cause)
  if (patch.fix !== undefined) entry.fix = str(patch.fix)
  if (patch.refs !== undefined) entry.refs = str(patch.refs)
  if (patch.evidence !== undefined) entry.evidence = str(patch.evidence)
  if (patch.scope !== undefined && SCOPES.includes(patch.scope)) entry.scope = patch.scope
  if (patch.status !== undefined && STATUSES.includes(patch.status)) entry.status = patch.status
  if (patch.tags !== undefined) entry.tags = splitTags(patch.tags)
  if (patch.cardKey !== undefined) entry.cardKey = requireCard(patch.cardKey)
  entry.updatedAt = nowIso()
  saveDb('update-entry')
  return { entry }
}

function deleteEntry(payload) {
  const id = str(payload && payload.id)
  const before = db.entries.length
  db.entries = db.entries.filter((e) => e.id !== id)
  if (db.entries.length === before) throw new Error(`未找到条目：${id}`)
  saveDb('delete-entry')
  return { removed: 1 }
}

/** 把一条记录搬到另一张卡下（复制或迁移），用于跨卡复用同一结论。 */
function moveEntry(payload, keepSource) {
  const id = str(payload && payload.id)
  const source = db.entries.find((e) => e.id === id)
  if (!source) throw new Error(`未找到条目：${id}`)
  const toCardKey = requireCard(payload && (payload.toCardKey || payload.card))
  const copy = { ...source, cardKey: toCardKey, id: uid(), createdAt: nowIso(), updatedAt: nowIso() }
  db.entries.unshift(copy)
  if (!keepSource) {
    db.entries = db.entries.filter((e) => e.id !== id)
  }
  saveDb(keepSource ? 'copy-entry' : 'move-entry')
  return { entry: copy, keptSource: !!keepSource }
}

function importEntries(payload) {
  const text = str(payload && payload.json)
  if (!text.trim()) throw new Error('导入内容为空')
  let parsed = null
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    throw new Error(`JSON 解析失败：${e && e.message}`)
  }
  const incoming = Array.isArray(parsed) ? parsed : Array.isArray(parsed.entries) ? parsed.entries : []
  if (!incoming.length) throw new Error('没有可导入的条目')

  // 去重靠一张 Set，不靠对每条 incoming 扫一遍现有条目 —— 后者是 O(n×m)，
  // 几千条一起导会退化到几千万次比较。
  const seen = new Set(db.entries.map((e) => `${e.cardKey}\u0000${e.title}`))
  const fresh = []
  let skipped = 0
  let ambiguous = 0

  for (const raw of incoming) {
    const resolved = resolveCardKeyDetail(str(raw && raw.cardKey))
    if (resolved.candidates.length) {
      // 名字对上多个分类（最常见的是原版与它的 MVU 版）：整批失败不合适，
      // 跳过并计数，让人知道有几条没能落下来。
      ambiguous += 1
      skipped += 1
      continue
    }
    const title = str(raw && raw.title).trim()
    if (!title) {
      skipped += 1
      continue
    }
    const finger = `${resolved.key}\u0000${title}`
    if (seen.has(finger)) {
      skipped += 1
      continue
    }
    seen.add(finger)
    const entry = normalizeEntry(raw, resolved.key)
    entry.id = uid()
    entry.cardKey = resolved.key
    entry.createdAt = entry.createdAt || nowIso()
    entry.updatedAt = nowIso()
    fresh.push(entry)
  }

  if (fresh.length) {
    // 一条一条 unshift 是 O(n²)：八千条导进来会白搬几千万次。
    db.entries = [...fresh, ...db.entries]
    saveDb('import')
  }
  return { added: fresh.length, skipped, ambiguous }
}

function renameCard(payload) {
  const key = requireCard(payload && (payload.key || payload.cardKey))
  const card = db.cards[key]
  if (payload && payload.name !== undefined) card.name = str(payload.name).trim() || card.autoName
  if (payload && payload.note !== undefined) card.note = str(payload.note)
  card.updatedAt = nowIso()
  saveDb('rename-card')
  return { card }
}

/** 手建一个「其它错题」分类。key 用时间戳生成，不跟卡片分类的 `cards/...` 撞。 */
function addBucket(payload) {
  const name = str(payload && payload.name).trim()
  if (!name) throw new Error('分类名不能为空')
  const dup = Object.values(db.cards).find((c) => c.name === name)
  if (dup) throw new Error(`已经有叫「${name}」的分类了`)
  const key = `__other_${Date.now().toString(36)}__`
  db.cards[key] = {
    key,
    group: 'other',
    name,
    autoName: name,
    rel: '',
    abs: '',
    kind: 'other',
    base: '',
    avatar: '',
    pairKey: '',
    note: str(payload && payload.note),
    missing: false,
    updatedAt: nowIso(),
  }
  saveDb('add-bucket')
  return { card: db.cards[key] }
}

/**
 * 删掉一个分类。它下面的条目不会被一起删掉 —— 迁到「通用 / 未归类」，
 * 免得一次误点就把调出来的结论整片丢掉。
 */
function deleteBucket(payload) {
  const key = requireCard(payload && (payload.key || payload.cardKey))
  const card = db.cards[key]
  if (key === GENERAL_KEY) throw new Error('「通用 / 未归类」是兜底分类，不能删除')
  // 卡片分类由卡片目录决定 —— 除非那张卡已经不在了，那时它只是一条没有主人的记录，
  // 允许手动清掉（记录会先迁到兜底分类，不会跟着消失）。
  if ((card.group || 'card') !== 'other' && !card.missing) {
    throw new Error('卡片分类由卡片目录决定，不能在这里删除')
  }
  let moved = 0
  for (const entry of db.entries) {
    if (entry.cardKey === key) {
      entry.cardKey = GENERAL_KEY
      entry.updatedAt = nowIso()
      moved += 1
    }
  }
  delete db.cards[key]
  saveDb('delete-bucket')
  return { removed: key, moved }
}

function restoreBackup(payload) {
  const file = str(payload && payload.file)
  const full = path.join(BACKUP_DIR, path.basename(file))
  if (!file || !exists(full)) throw new Error(`备份不存在：${file}`)
  const raw = readJson(full, null)
  if (!raw || typeof raw !== 'object') throw new Error('备份内容不可读')
  backupDb('before-restore')
  db = {
    version: 1,
    updatedAt: nowIso(),
    cards: raw.cards && typeof raw.cards === 'object' ? raw.cards : {},
    entries: Array.isArray(raw.entries) ? raw.entries.map((e) => normalizeEntry(e, e && e.cardKey)) : [],
    config: raw.config && typeof raw.config === 'object' ? raw.config : db.config || { remoteUrl: '' },
  }
  writeJsonAtomic(DB_FILE, db)
  // 同步写入基线：不同步的话，下一次 saveDb 会拿旧基线做比较，可能把这次恢复当成"没变化"。
  lastWritten = JSON.stringify(db, null, 2)
  // 备份里记着的自定义备份目录也要跟着生效。
  BACKUP_DIR = db.config && db.config.backupDir ? path.resolve(db.config.backupDir) : BACKUP_DIR_DEFAULT
  ensureDir(BACKUP_DIR)
  return { restored: db.entries.length }
}

/**
 * 候选可执行路径，按可信度排。
 *
 * 裸名字（`explorer.exe`）在打包好的桌面客户端里经常解析不到：那种进程的 PATH
 * 可能被裁剪过，只剩几个目录。所以先问宿主自己的解析器（`ctx.subprocess`），
 * 再按系统根目录拼绝对路径，最后才把裸名字当兜底。
 *
 * @param {string} file - explorer.exe / open / xdg-open
 * @param {string[]} problems - 诊断信息收集器
 * @returns {Promise<string[]>}
 */
async function executableCandidates(file, problems) {
  const out = []
  const subprocess = pluginCtx && typeof pluginCtx.get === 'function' ? pluginCtx.get('subprocess') : null
  if (subprocess && typeof subprocess.resolveExecutable === 'function') {
    try {
      const resolved = await subprocess.resolveExecutable(file)
      if (resolved) out.push(resolved)
    } catch (e) {
      problems.push(`resolveExecutable(${file}): ${(e && e.code) || (e && e.message) || e}`)
    }
  }
  if (process.platform === 'win32') {
    const root = process.env.SystemRoot || process.env.windir
    if (root) out.push(path.join(root, 'explorer.exe'))
  }
  out.push(file)
  return out.filter((v, i) => v && out.indexOf(v) === i)
}

/**
 * 把目录交给系统的文件管理器。
 *
 * 两级回退，每一级的失败原因都留着：这台机器上到底哪一级能用是环境决定的，猜不如试。
 * 以前用 fire-and-forget 的 spawn，失败走异步 `error` 事件没人监听，表现就是
 * 「点了没反应、日志还写成功」；现在每一步都必须等到结果才罢休。
 *
 * 1. 宿主解析器 / `SystemRoot` 拼出的绝对路径，兜底才是裸命令名。
 * 2. Windows 上 `cmd /c start` —— 最原始的兜底，几乎不挑环境。
 *
 * 曾经还有一级是把目录交给宿主 Electron 自己的 shell，已经删掉：宿主跑的是它自己
 * 那份 node_modules，里面没有这个模块，那一级从来没成功过；但它会让静态健康检查
 * 判定插件依赖了一个没人提供的包。为一个从未生效的分支去声明一个宿主不一定有的包，
 * 不划算。
 *
 * explorer.exe 打开窗口时也返回非零退出码，所以它的退出码不作为判定；
 * 只有 ENOENT 才等于真的没找到可执行文件。
 *
 * @param {string} target - 绝对路径；不存在时先建出来，免得拒开一个还没用到的目录。
 * @returns {Promise<{opened: string, via: string}>}
 */
async function openPath(target) {
  const dir = target || DATA_DIR
  if (!exists(dir)) ensureDir(dir)
  const platform = process.platform
  const file = platform === 'win32' ? 'explorer.exe' : platform === 'darwin' ? 'open' : 'xdg-open'
  const problems = []

  // 1) 绝对路径优先
  for (const candidate of await executableCandidates(file, problems)) {
    try {
      await execFileAsync(candidate, [dir], { timeout: 10000, windowsHide: true })
      return { opened: dir, via: candidate }
    } catch (e) {
      const code = (e && e.code) || ''
      // Windows 上 explorer 把窗口转交给已有实例后自己退出，退出码非零但事情已经办成。
      if (platform === 'win32' && code !== 'ENOENT') return { opened: dir, via: candidate }
      problems.push(`${candidate}: ${code || (e && e.message) || e}`)
    }
  }

  // 2) Windows 最后的兜底
  if (platform === 'win32') {
    const comspec = process.env.ComSpec || 'cmd.exe'
    try {
      await execFileAsync(comspec, ['/c', 'start', '', dir], { timeout: 10000, windowsHide: true })
      return { opened: dir, via: 'cmd start' }
    } catch (e) {
      problems.push(`cmd start: ${(e && e.code) || (e && e.message) || e}`)
    }
  }

  // 都失败了就把现场交出去：包含哪一级错在哪，以及 PATH 长什么样。
  const pathHead = String(process.env.PATH || '')
    .split(path.delimiter)
    .filter(Boolean)
    .slice(0, 5)
    .join(' ; ')
  throw new Error(
    `打不开 ${dir} → ${problems.join(' / ')} ｜ 环境：platform=${platform} SystemRoot=${
      process.env.SystemRoot || '(空)'
    } PATH前5项=${pathHead || '(空)'} 宿主=${pluginCtx ? '已注入' : '未注入'}`,
  )
}

/** 删掉一份备份。文件名只取 basename，路径穿越进不来。 */
function deleteBackup(payload) {
  const name = path.basename(str(payload && payload.file))
  if (!name || !isBackupName(name)) throw new Error('这个文件名不属于本插件的备份')
  const full = path.join(BACKUP_DIR, name)
  if (!exists(full)) throw new Error(`备份不存在：${name}`)
  fs.unlinkSync(full)
  return { deleted: name, backups: listBackups().length }
}

/** 只保留最近 N 份，其余删掉。清理上限跟自动清理一致。 */
function pruneBackupList(payload) {
  const keep = Math.max(1, Math.min(MAX_BACKUPS, Number(payload && payload.keep) || 20))
  const files = listBackups()
  let removed = 0
  for (const item of files.slice(keep)) {
    try {
      fs.unlinkSync(path.join(BACKUP_DIR, item.file))
      removed += 1
    } catch {
      /* 已经被删了 */
    }
  }
  return { removed, keep, backups: listBackups().length }
}

/* ---------------------------------------------------------------- routes */

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(payload))
}

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = []
    request.on('data', (c) => chunks.push(c))
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (!text) return resolve({})
      try {
        resolve(JSON.parse(text))
      } catch {
        resolve({ raw: text })
      }
    })
    request.on('error', () => resolve({}))
  })
}

function countByStatus(cardKey) {
  const out = { open: 0, watch: 0, fixed: 0, total: 0 }
  for (const entry of db.entries) {
    if (entry.cardKey !== cardKey) continue
    out[entry.status] = (out[entry.status] || 0) + 1
    out.total += 1
  }
  return out
}

function cardList() {
  // 一次遍历把所有分类的计数算完。原先按卡调用 countByStatus，是
  // O(分类数 × 条目数)：几百张卡配几千条记录时会明显卡在打开面板这一步。
  const counts = new Map()
  for (const entry of db.entries) {
    let bucket = counts.get(entry.cardKey)
    if (!bucket) {
      bucket = { open: 0, watch: 0, fixed: 0, total: 0 }
      counts.set(entry.cardKey, bucket)
    }
    bucket[entry.status] = (bucket[entry.status] || 0) + 1
    bucket.total += 1
  }

  return Object.values(db.cards)
    .map((card) => ({
      key: card.key,
      group: card.group || 'card',
      name: card.name,
      autoName: card.autoName,
      base: card.base,
      rel: card.rel,
      abs: card.abs,
      kind: card.kind,
      avatar: card.avatar,
      pairKey: card.pairKey || '',
      note: card.note || '',
      missing: !!card.missing,
      updatedAt: card.updatedAt,
      count: counts.get(card.key) || { open: 0, watch: 0, fixed: 0, total: 0 },
    }))
    .sort((a, b) => {
      // 卡片组在前；其它组内按预置顺序排，预置之外的按名字。
      if (a.group !== b.group) return a.group === 'card' ? -1 : 1
      if (a.group === 'other') {
        const ai = OTHER_BUCKETS.findIndex((preset) => preset.key === a.key)
        const bi = OTHER_BUCKETS.findIndex((preset) => preset.key === b.key)
        if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
      }
      return String(a.name).localeCompare(String(b.name), 'zh-Hans-CN')
    })
}

function statePayload() {
  const scanned = scanCards()
  if (syncCards(scanned) || ensureOtherBuckets()) saveDb('rescan')
  const cards = cardList()
  const stats = { cards: cards.length, entries: db.entries.length, open: 0, watch: 0, fixed: 0 }
  for (const entry of db.entries) {
    if (stats[entry.status] !== undefined) stats[entry.status] += 1
  }
  return {
    ok: true,
    updatedAt: db.updatedAt,
    paths: {
      dataDir: DATA_DIR,
      dbFile: DB_FILE,
      cardDir: CARD_DIR,
      backupDir: BACKUP_DIR,
      backupDirDefault: BACKUP_DIR_DEFAULT,
      backupDirCustom: !!(db.config && db.config.backupDir),
      pluginDir: PLUGIN_DIR,
    },
    scopes: SCOPES,
    statuses: STATUSES,
    generalKey: GENERAL_KEY,
    dataFile: (() => {
      let bytes = 0
      try {
        bytes = fs.statSync(DB_FILE).size
      } catch {
        /* 还没写过 */
      }
      return {
        file: DB_FILE,
        bytes,
        updatedAt: db.updatedAt,
        entries: db.entries.length,
        cards: Object.keys(db.cards).length,
      }
    })(),
    config: { remoteUrl: str(db.config && db.config.remoteUrl) },
    cards,
    entries: db.entries,
    stats,
    backups: listBackups(),
    plugin: selfState(),
    install: installState(),
  }
}

async function handleAction(body) {
  const action = str(body && body.action)
  switch (action) {
    case 'addEntry':
      return { ok: true, action, ...addEntry(body) }
    case 'updateEntry':
      return { ok: true, action, ...updateEntry(body) }
    case 'deleteEntry':
      return { ok: true, action, ...deleteEntry(body) }
    case 'moveEntry':
      return { ok: true, action, ...moveEntry(body, false) }
    case 'copyEntry':
      return { ok: true, action, ...moveEntry(body, true) }
    case 'renameCard':
      return { ok: true, action, ...renameCard(body) }
    case 'addBucket':
      return { ok: true, action, ...addBucket(body) }
    case 'deleteBucket':
      return { ok: true, action, ...deleteBucket(body) }
    case 'importEntries':
      return { ok: true, action, ...importEntries(body) }
    case 'refluxToSkill':
      return { ok: true, action, ...refluxToSkill(body) }
    case 'createSkill':
      return { ok: true, action, ...createUserSkill(body) }
    case 'deleteSkill':
      return { ok: true, action, ...deleteUserSkill(body) }
    case 'restoreBackup':
      return { ok: true, action, ...restoreBackup(body) }
    case 'saveConfig':
      return { ok: true, action, ...saveConfig(body) }
    case 'setBackupDir':
      return { ok: true, action, ...setBackupDir(body) }
    case 'lookup':
      return { ok: true, action, result: lookup(body) }
    case 'checkSelf': {
      const plugin = await checkSelf(db.config)
      return { ok: true, action, plugin }
    }
    case 'backupNow':
      backupDb('manual')
      return { ok: true, action, backups: listBackups().length }
    case 'deleteBackup':
      return { ok: true, action, ...deleteBackup(body) }
    case 'pruneBackups':
      return { ok: true, action, ...pruneBackupList(body) }
    case 'openDataDir':
      return { ok: true, action, ...(await openPath(DATA_DIR)) }
    case 'openBackupDir':
      return { ok: true, action, ...(await openPath(BACKUP_DIR)) }
    case 'rescan': {
      const scanned = scanCards()
      syncCards(scanned)
      saveDb('rescan')
      return { ok: true, action, scanned: scanned.length }
    }
    case 'exportAll':
      return { ok: true, action, json: JSON.stringify({ version: 1, entries: db.entries }, null, 2) }
    case 'state':
      return statePayload()
    default:
      throw new Error(`未知操作：${action}`)
  }
}

function saveConfig(body) {
  const config = body && body.config && typeof body.config === 'object' ? body.config : {}
  db.config = {
    remoteUrl: str(config.remoteUrl).trim(),
    backupDir: str(db.config.backupDir || ''),
  }
  saveDb('save-config')
  return { config: db.config }
}

/**
 * 改备份目录。
 *
 * 建目录、试写一个探针文件再删掉 —— 路径有问题要在按下保存的这一刻就报出来，
 * 而不是等到某次自动备份静默失败、回头看才发现这几天的备份都没落地。
 * 只影响之后写入的备份：旧目录里已有的不搬动也不删除。
 */
function setBackupDir(payload) {
  const raw = str(payload && payload.dir).trim()
  if (!raw) {
    db.config.backupDir = ''
    saveDb('set-backup-dir')
    BACKUP_DIR = BACKUP_DIR_DEFAULT
    ensureDir(BACKUP_DIR)
    return { backupDir: BACKUP_DIR, custom: false }
  }

  const dir = path.resolve(raw)
  if (!path.isAbsolute(dir)) throw new Error('请填绝对路径')
  if (exists(dir)) {
    let st = null
    try {
      st = fs.statSync(dir)
    } catch {
      /* 读不到就交给下面的写探针去报错 */
    }
    if (st && !st.isDirectory()) throw new Error(`这个路径不是文件夹：${dir}`)
  } else {
    try {
      fs.mkdirSync(dir, { recursive: true })
    } catch (e) {
      throw new Error(`建不了这个目录：${(e && e.message) || e}`)
    }
  }

  const probe = path.join(dir, `.wrongbook-write-test-${process.pid}`)
  try {
    fs.writeFileSync(probe, 'ok')
    fs.unlinkSync(probe)
  } catch (e) {
    throw new Error(`这个目录写不进去：${(e && e.message) || e}`)
  }

  db.config.backupDir = dir
  // 这一份还落在旧目录里，等于给切换前的状态留个底。
  saveDb('set-backup-dir')
  BACKUP_DIR = dir
  ensureDir(BACKUP_DIR)
  return { backupDir: dir, custom: true }
}

/* ----------------------------------------------------------------- apply */

/**
 * Host 半边入口。
 *
 * 依赖声明成可选注入：webServer 不在时插件仍能加载，只是没有面板可读的状态；
 * tools 不在时少三个调试工具，数据层照旧。
 */
export function apply(ctx) {
  pluginCtx = ctx
  ensureDir(DATA_DIR)
  loadDb()
  if (!db.config || typeof db.config !== 'object') db.config = { remoteUrl: '' }
  BACKUP_DIR = db.config.backupDir ? path.resolve(db.config.backupDir) : BACKUP_DIR_DEFAULT
  ensureDir(BACKUP_DIR)
  // 首次启动就把分类表落盘：卡片目录是外部状态，下一次启动重新扫描没有意义，
  // 而写盘的时机越早，用户第一次打开面板看到的就是已分好类的列表。
  if (syncCards(scanCards()) || ensureOtherBuckets() || !exists(DB_FILE)) saveDb('bootstrap')
  log(`data ready: ${db.entries.length} entries, ${Object.keys(db.cards).length} card buckets`)

  ctx.inject(['webServer'], (host) => {
    const routes = [
      {
        path: '/dsh-wrongbook/state',
        handler: (request, response) => {
          if (request.method !== 'GET') return response.writeHead(405, { allow: 'GET' }).end()
          try {
            sendJson(response, 200, statePayload())
          } catch (e) {
            sendJson(response, 500, { ok: false, error: e && e.message ? e.message : String(e) })
          }
        },
      },
      {
        // 卡头像按 key 现取现给：原图可能十几 MB，浏览器用 object-fit 缩放，
        // 后台这边不做二次编码也就没有额外的进程和临时文件。
        path: '/dsh-wrongbook/avatar',
        handler: (request, response) => {
          if (request.method !== 'GET') return response.writeHead(405, { allow: 'GET' }).end()
          try {
            const url = new URL(request.url || '/', 'http://127.0.0.1')
            const key = url.searchParams.get('card') || ''
            const card = db.cards[resolveCardKey(key)]
            const file = card && card.avatar && exists(card.avatar) ? card.avatar : ''
            if (!file) {
              response.writeHead(404, { 'cache-control': 'no-store' })
              response.end()
              return
            }
            const buffer = fs.readFileSync(file)
            response.writeHead(200, {
              'content-type': imageContentType(file),
              'content-length': buffer.length,
              'cache-control': 'public, max-age=3600',
            })
            response.end(buffer)
          } catch (e) {
            response.writeHead(500).end(String(e && e.message ? e.message : e))
          }
        },
      },
      {
        // 目录浏览：面板里的「选择文件夹」靠它列一层目录。
        // 跟卡片更新器同一套做法 —— 不赌宿主提不提供目录选择器，自己列、自己选。
        path: '/dsh-wrongbook/list',
        handler: (request, response) => {
          if (request.method !== 'GET') return response.writeHead(405, { allow: 'GET' }).end()
          try {
            const url = new URL(request.url || '/', 'http://127.0.0.1')
            sendJson(response, 200, listDirEntries(url.searchParams.get('path')))
          } catch (e) {
            sendJson(response, 500, { ok: false, error: (e && e.message) || String(e) })
          }
        },
      },
      {
        // 卡内脚本盘点。只有切到「卡脚本」页签时才请求它 —— 它要读几张十几 MB 的卡，
        // 不该拖慢每次打开面板的那次 state。
        path: '/dsh-wrongbook/scripts',
        handler: (request, response) => {
          if (request.method !== 'GET') return response.writeHead(405, { allow: 'GET' }).end()
          try {
            const scanned = scanCardScripts()
            sendJson(response, 200, { ok: true, ...scanned, tools: scanToolScripts() })
          } catch (e) {
            sendJson(response, 500, { ok: false, error: (e && e.message) || String(e) })
          }
        },
      },
      {
        // 可选的回流目标。内置 skill 一并列出但带 builtin 标记 —— 面板要据此把它们
        // 标成"写不了"，而不是让用户点下去才发现。
        path: '/dsh-wrongbook/skills',
        handler: (request, response) => {
          if (request.method !== 'GET') return response.writeHead(405, { allow: 'GET' }).end()
          try {
            sendJson(response, 200, { ok: true, skills: listSkills(), userDir: userSkillDir() })
          } catch (e) {
            sendJson(response, 500, { ok: false, error: (e && e.message) || String(e) })
          }
        },
      },
      {
        path: '/dsh-wrongbook/action',
        handler: async (request, response) => {
          if (request.method !== 'POST') return response.writeHead(405, { allow: 'POST' }).end()
          try {
            const body = await readBody(request)
            sendJson(response, 200, await handleAction(body))
          } catch (e) {
            sendJson(response, 200, { ok: false, error: e && e.message ? e.message : String(e) })
          }
        },
      },
    ]

    host.effect(() => {
      const disposers = routes.map((route) =>
        host.webServer.register({ kind: 'exact', path: route.path, handler: route.handler }),
      )
      return () => {
        for (const dispose of disposers) {
          try {
            dispose()
          } catch {
            /* 已经卸掉了 */
          }
        }
      }
    }, 'dsh-wrongbook: http routes')
    log('http routes ready')
  })

  const tools = ctx.tools || (typeof ctx.get === 'function' ? ctx.get('tools') : null)
  if (tools && typeof tools.register === 'function') {
    const disposers = [      tools.register({
        name: 'wrongbook_lookup',
        description:
          '查错题库。调试某张人物卡时先调它：按固定顺序返回三段 —— 「① 本分类」→「② 其它错题」→「③ 跨卡查询」，前一段永远排在后面几段之前。',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            card: {
              type: 'string',
              description:
                '出问题的分类：卡片名、cards/xxx.json 路径或文件名片段，也可以是「其它错题」里的主题名（如 卡片更新器）。省略则在通用分类下检索。',
            },
            query: { type: 'string', description: '症状关键词，空格分隔多个词。省略则列出全部条目。' },
            status: { type: 'string', enum: STATUSES, description: '只保留某一种状态。' },
            scope: { type: 'string', enum: SCOPES, description: '只保留某一类问题。' },
            limit: { type: 'number', description: '每一部分最多返回多少条，默认 80。' },
          },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: { text: { type: 'string' } },
          },
          render: (_args, value) => [{ type: 'text', text: String((value && value.text) || '') }],
        },
        async execute(args) {
          const result = lookup(args)
          return { text: renderLookup(result, { compact: !str(args && args.query).trim() }) }
        },
      }),
      tools.register({
        name: 'wrongbook_record',
        description:
          '把调试中新发现的问题记进对应分类。名字不认识时会自动建一个新的「其它错题」分类，而不是默默塞进兜底 —— 建出来的分类在面板上看得见、能改名也能删。',
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['card', 'title'],
          properties: {
            card: { type: 'string', description: '问题所属的分类：卡名、cards/xxx.json，或「其它错题」里的主题名。填一个还不存在的名字会新建分类。' },
            title: { type: 'string', description: '一句话症状，作为条目标题。' },
            symptom: { type: 'string', description: '现象：看到什么、什么条件下复现。' },
            cause: { type: 'string', description: '根因。' },
            fix: { type: 'string', description: '已验证的修法；还没解决就留空。' },
            scope: { type: 'string', enum: SCOPES, description: '问题归类。' },
            tags: { type: 'array', items: { type: 'string' }, description: '检索用的标签。' },
            refs: { type: 'string', description: '涉及的文件或字段路径。' },
            evidence: { type: 'string', description: '证据：日志、游玩记录、报错原文。' },
            status: { type: 'string', enum: STATUSES, description: 'open 未解决 / watch 观察中 / fixed 已修复。' },
          },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: { text: { type: 'string' } },
          },
          render: (_args, value) => [{ type: 'text', text: String((value && value.text) || '') }],
        },
        async execute(args) {
          const out = addEntry(args || {})
          const created = out.created ? `（这个名字原先没有分类，已新建「${out.created}」）` : ''
          return { text: `已记入「${cardDisplayName(out.entry.cardKey)}」错题库：${out.entry.title}（${out.entry.id}）${created}` }
        },
      }),
      tools.register({
        name: 'wrongbook_update',
        description: '更新错题库里已有条目：标记已修复、补上根因或修法、改状态。',
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['id'],
          properties: {
            id: { type: 'string', description: '条目 id，wrongbook_lookup 返回里的括号值。' },
            status: { type: 'string', enum: STATUSES, description: '新状态。' },
            cause: { type: 'string', description: '补写的根因。' },
            fix: { type: 'string', description: '补写的修法。' },
            symptom: { type: 'string', description: '修正后的现象描述。' },
            tags: { type: 'array', items: { type: 'string' }, description: '替换标签。' },
            evidence: { type: 'string', description: '补充证据。' },
          },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: { text: { type: 'string' } },
          },
          render: (_args, value) => [{ type: 'text', text: String((value && value.text) || '') }],
        },
        async execute(args) {
          const { id, ...patch } = args || {}
          const out = updateEntry({ id, patch })
          return { text: `已更新条目 ${out.entry.id}：${out.entry.title} → ${out.entry.status}` }
        },
      }),
    ]
    ctx.effect(
      () => () => {
        for (const dispose of disposers) {
          try {
            dispose()
          } catch {
            /* 已经卸掉了 */
          }
        }
      },
      'dsh-wrongbook: tools',
    )
    log(`tools registered: ${disposers.length}`)
  } else {
    log('tools service missing; skipping tool registration')
  }

  // 工具注册只解决「能用」，这一段解决「会用」。
  const prompt = ctx.systemPrompt || (typeof ctx.get === 'function' ? ctx.get('systemPrompt') : null)
  if (prompt && typeof prompt.section === 'function') {
    prompt.section({ name: 'dsh-wrongbook', order: 5100, text: () => WRONGBOOK_PROMPT })
    log('prompt section ready')
  } else {
    log('systemPrompt service missing; skipping prompt section')
  }
}

/* -------------------------------------------------------------- rendering */

function renderEntry(entry, withCard) {
  const head = `- [${statusLabel(entry.status)}] ${entry.title}（#${entry.id}）`
  const meta = [`范围=${entry.scope}`]
  if (withCard) meta.push(`卡片=${cardDisplayName(entry.cardKey)}`)
  if (entry.tags && entry.tags.length) meta.push(`标签=${entry.tags.join(', ')}`)
  const lines = [`${head} · ${meta.join(' · ')}`]
  if (entry.symptom) lines.push(`  现象：${entry.symptom}`)
  if (entry.cause) lines.push(`  根因：${entry.cause}`)
  if (entry.fix) lines.push(`  修法：${entry.fix}`)
  if (entry.refs) lines.push(`  涉及：${entry.refs}`)
  if (entry.evidence) lines.push(`  证据：${entry.evidence}`)
  return lines.join('\n')
}

function statusLabel(status) {
  if (status === 'fixed') return '已修复'
  if (status === 'watch') return '观察中'
  return '未解决'
}

/**
 * 检索结果渲染成给人看的文本，顺序本身就说明了该先看哪一段。
 *
 * 没给关键词时 ② ③ 只印前几条：全库几十条铺开会把 ① 淹掉，而 ① 才是这会儿要看的东西。
 * 给了关键词说明是有目的地在找，那就整段列出来。
 */
function renderLookup(result, options) {
  const compact = !!(options && options.compact)
  const cap = compact ? 8 : Infinity
  const clip = (list) => (list.length > cap ? list.slice(0, cap) : list)
  const note = (list, all) =>
    list.length > cap ? `（共 ${all} 条，这里先列 ${cap} 条；带上关键词可以筛）` : ''

  const inOther = result.cardGroup === 'other'
  const parts = [`【错题库检索】当前分类=${result.cardName} · 全库 ${result.scanned} 条`]
  if (result.candidates && result.candidates.length) {
    parts.push(
      `⚠ 「${result.asked || '（空）'}」对上了 ${result.candidates.length} 个分类：${result.candidates.join('、')}。`,
      '   这次按兜底分类检索的。原版卡和它的 MVU 版是两个分类，请写全名字再说一次。',
    )
  }
  parts.push('')

  // 条数报的是各段总数，不是这次取回来的条数：取回多少受 limit 和上面的
  // 压缩影响，报出来会让人以为库里就这么点。
  const totalOf = (list, key) => (typeof result[key] === 'number' ? result[key] : list.length)
  const section = (title, list, key, tagged) => {
    const all = totalOf(list, key)
    parts.push(`${title} · ${all} 条`)
    if (!all) {
      parts.push('（没有记录）')
      return
    }
    parts.push(clip(list).map((e) => renderEntry(e, tagged)).join('\n'))
    const more = note(list, all)
    if (more) parts.push(more)
  }

  section(`${inOther ? '① 本分类错题库' : '① 本卡错题库'}（${result.cardName}）`, result.own, 'ownTotal', false)
  parts.push('')
  section('② 其它错题（不挂在卡上的问题）', result.other, 'otherTotal', true)
  parts.push('')
  section('③ 跨卡查询（其余卡片）', result.cross, 'crossTotal', true)

  return parts.join('\n')
}
