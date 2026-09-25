// 隔离验收：在临时 data root 上跑一遍 host 半边的全链路。
// 用法：node verify/host.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 沙盒按真实布局搭：`<根>/profile-data/tavern/data` 是数据根，
// `<根>/profiles/tavern` 是 profile —— 安装自检要从数据根反推 profile 名，
// 布局不像的话那条推算就没被真正验证。
const ROOT = path.join(os.tmpdir(), 'dsh-wrongbook-sandbox')
fs.rmSync(ROOT, { recursive: true, force: true })
const SANDBOX = path.join(ROOT, 'profile-data', 'tavern', 'data')
const CARDS = path.join(SANDBOX, 'resources', 'cards')
const ORIG = path.join(SANDBOX, 'originals', 'cards')
fs.mkdirSync(CARDS, { recursive: true })
fs.mkdirSync(ORIG, { recursive: true })
fs.writeFileSync(path.join(CARDS, '测试卡A.json'), '{"name":"测试卡A"}', 'utf8')
fs.writeFileSync(path.join(CARDS, '测试卡A MVU版本.json'), '{"name":"A MVU"}', 'utf8')
fs.writeFileSync(path.join(CARDS, '测试卡B.json'), '{"name":"测试卡B"}', 'utf8')
fs.writeFileSync(path.join(ORIG, '测试卡A.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]))

// profile 侧照抄真实那两处：dependencies 里一条 link:、dsh.profile.bundles 里一条名字。
const PLUGIN_DIR = fileURLToPath(new URL('..', import.meta.url))
const PROFILE_DIR = path.join(ROOT, 'profiles', 'tavern')
const PROFILE_MODULES = path.join(PROFILE_DIR, 'node_modules')
fs.mkdirSync(PROFILE_MODULES, { recursive: true })
fs.writeFileSync(
  path.join(PROFILE_DIR, 'package.json'),
  JSON.stringify(
    {
      name: 'dsh-profile-tavern',
      private: true,
      dependencies: { 'dsh-wrongbook': `link:${PLUGIN_DIR.replace(/\\/g, '/')}` },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-wrongbook'] } },
      dshTavern: {
        source: path.join(ROOT, 'apps', 'dsh-tavern'),
        managedBundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'],
        managedDependencies: [],
      },
    },
    null,
    2,
  ),
  'utf8',
)

// 两种 skill 各造一个：用户的能写，内置的必须被拒。
fs.mkdirSync(path.join(SANDBOX, 'skills', 'my-notes', 'references'), { recursive: true })
fs.writeFileSync(
  path.join(SANDBOX, 'skills', 'my-notes', 'SKILL.md'),
  '---\nname: my-notes\ndescription: "验收用的用户 skill"\n---\n\n# my-notes\n',
  'utf8',
)
const BUILTIN_DIR = path.join(ROOT, 'apps', 'dsh-tavern', 'presets', 'tavern', 'skills')
fs.mkdirSync(path.join(BUILTIN_DIR, 'builtin-x', 'references'), { recursive: true })
fs.writeFileSync(
  path.join(BUILTIN_DIR, 'builtin-x', 'SKILL.md'),
  '---\nname: builtin-x\ndescription: "验收用的内置 skill"\n---\n\n# builtin-x\n',
  'utf8',
)
let linked = false
try {
  fs.symlinkSync(PLUGIN_DIR, path.join(PROFILE_MODULES, 'dsh-wrongbook'), 'junction')
  linked = true
} catch {
  /* Windows 上建不出链接就算了，那条断言会跳过 */
}

// 必须在 import 之前设置：host 半边在模块求值时解析数据根。
process.env.DSH_HOME = ROOT
process.env.DSH_TAVERN_DATA = SANDBOX
const mod = await import(new URL('../lib/index.js', import.meta.url).href)

const routes = []
const tools = []
const sections = []
const webServer = { register: (r) => (routes.push(r), () => {}) }
const toolsApi = { register: (d) => (tools.push(d), () => {}) }
const promptApi = { section: (s) => (sections.push(s), () => {}) }
const ctx = {
  // 服务按注入的方式挂在 ctx 上（插件用 `export const inject` 声明）。
  // `get` 故意拿不到东西：真实环境里它拿不到未注入的服务，而这正是工具
  // 少注册了半年的原因 —— 面板照常工作，模型侧空空如也。
  tools: toolsApi,
  systemPrompt: promptApi,
  get: () => undefined,
  inject: (deps, cb) => cb({ webServer, effect: (fn) => void fn() }),
  effect: (fn) => void fn(),
}

const results = []
const check = (label, ok, extra) => results.push({ label, ok, extra })

check('name 导出', mod.name === 'dsh-wrongbook', mod.name)
check('apply 是函数', typeof mod.apply === 'function')
check(
  '声明了 tools 与 systemPrompt 注入',
  Array.isArray(mod.inject) && mod.inject.includes('tools') && mod.inject.includes('systemPrompt'),
  JSON.stringify(mod.inject),
)
mod.apply(ctx)
const toolMap = Object.fromEntries(tools.map((d) => [d.name, d]))
check('注册了 6 条路由', routes.length === 6, routes.map((r) => r.path).join(', '))
check('注册了 3 个工具', tools.length === 3, tools.map((d) => d.name).join(', '))

/* 文本文件不能带 BOM。
   PowerShell 5.1 的 `Set-Content -Encoding UTF8` 会偷偷加一个，而 JSON.parse 见到就炸 ——
   表现是插件读自己的 package.json 失败、版本号变成空的。这条挡的是"手改一次文件就把它弄挂"。 */
for (const rel of ['package.json', 'client.js', 'lib/index.js', 'cordis.patch.yml']) {
  const buf = fs.readFileSync(path.join(PLUGIN_DIR, rel))
  check(
    `${rel} 不带 BOM`,
    !(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf),
    `前 3 字节 ${buf.slice(0, 3).toString('hex')}`,
  )
}
check(
  'package.json 能被 JSON.parse 读回',
  (() => {
    try {
      return JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, 'package.json'), 'utf8')).name === 'dsh-wrongbook'
    } catch {
      return false
    }
  })(),
)

/* 提示段：工具注册只解决「能用」，这一段解决「会用」 */
const promptSection = sections.find((s) => s.name === 'dsh-wrongbook')
check('注入了错题库提示段', !!promptSection, sections.map((s) => s.name).join(', '))
if (promptSection) {
  const promptText = promptSection.text()
  check('提示段给出三段检索顺序', promptText.includes('① 本分类 → ② 其它错题 → ③ 跨卡查询'))
  check('提示段要求归档后回报「已归档」', promptText.includes('已归档到错题库'))
  check('提示段点名两个工具', promptText.includes('wrongbook_lookup') && promptText.includes('wrongbook_record'))
  check('提示段禁止再写进 md 文件', promptText.includes('不要再把错题写进 md'))
  check('提示段把转 MVU 纳入必查场景', promptText.includes('转 MVU 版'))
  check(
    '提示段点出脚本被转换清空后不会自己回来',
    promptText.includes('被转换清空之后不会自己回来'),
    promptText.includes('差异判定') ? 'ok' : '缺差异判定',
  )
  check('提示段顺序值不与别家撞车', promptSection.order === 5100, String(promptSection.order))

}

function fakeRes() {
  return {
    statusCode: 0,
    headers: null,
    body: '',
    writeHead(code, headers) {
      this.statusCode = code
      this.headers = headers || {}
      return this
    },
    end(chunk) {
      if (chunk) this.body += chunk
      return this
    },
  }
}

function fakeReq(method, url, body) {
  const handlers = {}
  const req = {
    method,
    url,
    on(event, fn) {
      ;(handlers[event] = handlers[event] || []).push(fn)
      return req
    },
  }
  setTimeout(() => {
    if (body !== undefined && handlers.data) handlers.data.forEach((fn) => fn(Buffer.from(JSON.stringify(body))))
    if (handlers.end) handlers.end.forEach((fn) => fn())
  }, 0)
  return req
}

async function call(routePath, method, body, query) {
  const route = routes.find((r) => r.path === routePath)
  if (!route) throw new Error(`route missing: ${routePath}`)
  const res = fakeRes()
  await route.handler(fakeReq(method, `${routePath}${query || ''}`, body), res)
  await new Promise((r) => setTimeout(r, 15))
  return { status: res.statusCode, headers: res.headers, body: res.body }
}

const state = async () => JSON.parse((await call('/dsh-wrongbook/state', 'GET')).body)
const action = async (payload) => JSON.parse((await call('/dsh-wrongbook/action', 'POST', payload)).body)

const s1 = await state()
const cardA = s1.cards.find((c) => c.key === 'cards/测试卡A.json')
const cardAmvu = s1.cards.find((c) => c.key === 'cards/测试卡A MVU版本.json')
check('state.ok', s1.ok === true)
check('分类 = 3 张卡 + 3 个其它分类', s1.cards.length === 6, String(s1.cards.length))
check('卡片组 3 个', s1.cards.filter((c) => c.group === 'card').length === 3, s1.cards.filter((c) => c.group === 'card').map((c) => c.name).join(','))
check('其它组 3 个', s1.cards.filter((c) => c.group === 'other').length === 3, s1.cards.filter((c) => c.group === 'other').map((c) => c.name).join(','))
check('预置了卡内故障分类', s1.cards.some((c) => c.group === 'other' && c.name === '卡内故障'))
check('预置了卡片更新器分类', s1.cards.some((c) => c.group === 'other' && c.name === '卡片更新器'))
check('通用分类归在其它组', (s1.cards.find((c) => c.key === s1.generalKey) || {}).group === 'other')
check('返回 scopes/statuses', Array.isArray(s1.scopes) && Array.isArray(s1.statuses))
check('返回 plugin 版本', typeof s1.plugin.version === 'string' && s1.plugin.version.length > 0, s1.plugin.version)
check('卡名取到', !!cardA && cardA.name === '测试卡A', cardA && cardA.name)
check('头像解析到原版卡目录', !!cardA && cardA.avatar.endsWith('测试卡A.png'), cardA && cardA.avatar)
check('MVU 版标记', !!cardAmvu && cardAmvu.kind === 'mvu', cardAmvu && cardAmvu.kind)
check('配对互指', !!cardA && cardA.pairKey === 'cards/测试卡A MVU版本.json', cardA && cardA.pairKey)
check('通用分类存在', s1.cards.some((c) => c.key === s1.generalKey))

const addA = await action({
  action: 'addEntry',
  cardKey: 'cards/测试卡A.json',
  entry: { title: '状态栏空白', symptom: 'M2 后留白', cause: '变量未初始化', scope: 'MVU', tags: 'MVU, 状态栏' },
})
check('addEntry 到卡A', addA.ok === true && !!addA.entry && addA.entry.id.startsWith('e_'), addA.entry && addA.entry.id)
check('标签按逗号切开', JSON.stringify(addA.entry.tags) === JSON.stringify(['MVU', '状态栏']), JSON.stringify(addA.entry.tags))

const addB = await action({
  action: 'addEntry',
  cardKey: 'cards/测试卡B.json',
  entry: { title: '状态栏串台', scope: 'MVU', tags: '状态栏' },
})
check('addEntry 到卡B', addB.ok === true)

const lk = await action({ action: 'lookup', card: '测试卡A', query: '状态栏' })
check('① 本卡命中 1 条', lk.result.own.length === 1, JSON.stringify(lk.result.own.map((e) => e.title)))
check('② 跨卡命中 1 条', lk.result.cross.length === 1, JSON.stringify(lk.result.cross.map((e) => e.title)))
check('本卡命中确实是卡A 的', lk.result.own[0] && lk.result.own[0].cardKey === 'cards/测试卡A.json')
check('跨卡命中确实是别的卡的', lk.result.cross[0] && lk.result.cross[0].cardKey === 'cards/测试卡B.json')
check('卡名片段可解析', (await action({ action: 'lookup', card: '测试卡B', query: '状态栏' })).result.own.length === 1)
check('无关键词时列出全部', (await action({ action: 'lookup', card: '测试卡A' })).result.own.length === 1)

const text = (await toolMap['wrongbook_lookup'].execute({ card: '测试卡A', query: '状态栏' }, {})).text
const iOwn = text.indexOf('① 本卡错题库')
const iOther = text.indexOf('② 其它错题')
const iCross = text.indexOf('③ 跨卡查询')
check('工具输出含三段标记', iOwn >= 0 && iOther >= 0 && iCross >= 0, `${iOwn}/${iOther}/${iCross}`)
check('工具输出顺序：本卡 → 其它错题 → 跨卡', iOwn < iOther && iOther < iCross, `${iOwn} < ${iOther} < ${iCross}`)
check('工具输出含本卡标题', text.includes('状态栏空白'))
check('工具输出含跨卡卡片名', text.includes('测试卡B'))

check('wrongbook_record 落库', /已归档到错题库/.test((await toolMap['wrongbook_record'].execute({ card: '测试卡A', title: '图标错位' }, {})).text))
check('wrongbook_update 改状态', /fixed/.test((await toolMap['wrongbook_update'].execute({ id: addA.entry.id, status: 'fixed' }, {})).text))

const avatar = await call('/dsh-wrongbook/avatar', 'GET', undefined, '?card=cards%2F%E6%B5%8B%E8%AF%95%E5%8D%A1A.json')
check('头像路由 200', avatar.status === 200, String(avatar.status))
check('头像 content-type', avatar.headers['content-type'] === 'image/png', avatar.headers['content-type'])
check('缺图卡返回 404', (await call('/dsh-wrongbook/avatar', 'GET', undefined, '?card=cards%2F%E6%B5%8B%E8%AF%95%E5%8D%A1B.json')).status === 404)

const c1 = await action({ action: 'checkSelf' })
check('checkSelf 首次 = up-to-date', c1.plugin.verdict === 'up-to-date', c1.plugin.verdict)
const c2 = await action({ action: 'checkSelf' })
check('checkSelf 复检仍 = up-to-date', c2.plugin.verdict === 'up-to-date', c2.plugin.verdict)
check('checkSelf 记录历史', Array.isArray(c2.plugin.history) && c2.plugin.history.length >= 2, String(c2.plugin.history.length))

const copyRes = await action({ action: 'copyEntry', id: addA.entry.id, toCardKey: 'cards/测试卡A MVU版本.json' })
check('copyEntry 保留原条目', copyRes.ok === true && copyRes.keptSource === true)
check('复制后条目 +1', (await state()).entries.length === 4)
check('deleteEntry', (await action({ action: 'deleteEntry', id: copyRes.entry.id })).removed === 1)
check('renameCard', (await action({ action: 'renameCard', key: 'cards/测试卡B.json', name: '乙卡' })).card.name === '乙卡')
check('exportAll', JSON.parse((await action({ action: 'exportAll' })).json).entries.length === 3)
check('未知操作报错', (await action({ action: 'nope' })).ok === false)

check('data.json 落盘', fs.existsSync(path.join(SANDBOX, 'tools', 'wrongbook', 'data.json')))
check('selfcheck.json 落盘', fs.existsSync(path.join(SANDBOX, 'tools', 'wrongbook', 'selfcheck.json')))
const backupDir = path.join(SANDBOX, 'tools', 'wrongbook', 'backups')
check('写盘前产生备份', fs.existsSync(backupDir) && fs.readdirSync(backupDir).length > 0)
check('通用分类可写', (await action({ action: 'addEntry', entry: { title: '整库通用坑' } })).entry.cardKey === s1.generalKey)
check('rescan 可用', (await action({ action: 'rescan' })).scanned === 3)

/* 「其它错题」这一组：分类可建可删，删分类不删记录 */
const nb = await action({ action: 'addBucket', name: '测试主题' })
check('addBucket 建出其它分类', nb.ok === true && nb.card.group === 'other', nb.card && nb.card.key)
check('addBucket 拒绝重名', (await action({ action: 'addBucket', name: '测试主题' })).ok === false)
check('addBucket 拒绝空名', (await action({ action: 'addBucket', name: '   ' })).ok === false)

const inBucket = await action({ action: 'addEntry', cardKey: nb.card.key, entry: { title: '主题里的坑' } })
check('往其它分类记条目', inBucket.ok === true && inBucket.entry.cardKey === nb.card.key)

const lkOther = await action({ action: 'lookup', card: '卡片更新器' })
check('lookup 认其它分类名', lkOther.ok === true && lkOther.result.cardKey === '__other_card-updater__', lkOther.result.cardKey)

const del2 = await action({ action: 'deleteBucket', key: nb.card.key })
check('deleteBucket 迁走记录而不是删掉', del2.ok === true && del2.moved === 1, JSON.stringify(del2))
check(
  '被删分类的条目落到通用',
  (await state()).entries.some((e) => e.title === '主题里的坑' && e.cardKey === s1.generalKey),
)
check('deleteBucket 拒绝删卡片分类', (await action({ action: 'deleteBucket', key: 'cards/测试卡A.json' })).ok === false)
check('deleteBucket 拒绝删兜底分类', (await action({ action: 'deleteBucket', key: s1.generalKey })).ok === false)

/* ================= 全量回归：归类、解析、自动建分类、三段检索 ================= */

const resolve = async (card) => (await action({ action: 'lookup', card })).result.cardKey
const groupOfKey = async (key) => {
  const found = (await state()).cards.find((c) => c.key === key)
  return found ? found.group : ''
}

/* 归类：写进去的条目必须落在指定分类下，不能串门 */
for (const target of [
  'cards/测试卡A.json',
  'cards/测试卡B.json',
  'cards/测试卡A MVU版本.json',
  '__other_card-cases__',
  '__other_card-updater__',
  s1.generalKey,
]) {
  const r = await action({ action: 'addEntry', cardKey: target, entry: { title: `归类 ${target}` } })
  check(`addEntry 落在 ${target}`, r.ok === true && r.entry.cardKey === target, r.entry ? r.entry.cardKey : r.error)
}
const knownKeys = (await state()).cards.map((c) => c.key)
const strayEntries = (await state()).entries.filter((e) => !knownKeys.includes(e.cardKey))
check('没有条目挂在已不存在的分类下', strayEntries.length === 0, strayEntries.map((e) => e.cardKey).join(','))

/* 卡名解析：精确优先；模糊只认同一张卡的版本，否则不猜 */
check('解析：完整相对路径', (await resolve('cards/测试卡B.json')) === 'cards/测试卡B.json')
check('解析：带扩展名的卡名', (await resolve('测试卡B.json')) === 'cards/测试卡B.json')
check('解析：精确卡名', (await resolve('测试卡B')) === 'cards/测试卡B.json')
check('解析：精确 MVU 卡名', (await resolve('测试卡A MVU版本')) === 'cards/测试卡A MVU版本.json')
check('解析：其它分类名', (await resolve('卡片更新器')) === '__other_card-updater__')
check('解析：新分类名', (await resolve('卡内故障')) === '__other_card-cases__')
check('解析：通用别名', (await resolve('通用')) === s1.generalKey)
check('解析：未归类别名', (await resolve('未归类')) === s1.generalKey)
check('解析：空输入', (await resolve('')) === s1.generalKey)
check('解析：没听说过的名字', (await resolve('完全不存在的名字')) === s1.generalKey)
check('解析：唯一模糊命中直接采用', (await resolve('测试卡A MVU版')) === 'cards/测试卡A MVU版本.json', await resolve('测试卡A MVU版'))
check('解析：命中多张卡时不猜', (await resolve('测试卡')) === s1.generalKey, await resolve('测试卡'))
check('解析：同一输入两次结果一致', (await resolve('测试卡A MVU')) === (await resolve('测试卡A MVU')))

/* 原版卡和它的 MVU 版是两个分类：对上两个就不许猜 */
const pair = (await action({ action: 'lookup', card: '卡A' })).result
check('解析：同一张卡的两个版本也不猜', pair.cardKey === s1.generalKey, pair.cardKey)
check(
  '解析：带回候选让人补全',
  pair.candidates.length === 2 && pair.candidates.includes('测试卡A MVU版本'),
  pair.candidates.join('、'),
)
const refused = await action({ action: 'addEntry', card: '卡A', entry: { title: '不该落进来' } })
check('多候选时 refuse 记录', refused.ok === false && /对上了 2 个分类/.test(refused.error || ''), refused.error)
const pairText = (await toolMap['wrongbook_lookup'].execute({ card: '卡A' }, {})).text
check('多候选时工具输出给出提示', pairText.includes('对上了 2 个分类') && pairText.includes('请写全名字'), (pairText.split('\n')[1] || '').trim())

/* 名字不认识时建分类，而不是静默落兜底 */
const madeUp = await action({ action: 'addEntry', card: '某个新插件', entry: { title: '新插件的问题' } })
check('陌生名字建出新分类', madeUp.ok === true && madeUp.created === '某个新插件', madeUp.created || madeUp.error)
check('新分类落在其它组', (await groupOfKey(madeUp.entry.cardKey)) === 'other', await groupOfKey(madeUp.entry.cardKey))
check('同名再记一次不重复建', (await action({ action: 'addEntry', card: '某个新插件', entry: { title: '第二条' } })).created === '')

const pathLike = await action({ action: 'addEntry', card: 'cards/不存在的卡.json', entry: { title: '路径式名字' } })
check('路径式陌生名字不建分类', pathLike.created === '' && pathLike.entry.cardKey === s1.generalKey, pathLike.entry.cardKey)
const explicitGeneral = await action({ action: 'addEntry', card: '通用', entry: { title: '显式兜底' } })
check('显式「通用」不建分类', explicitGeneral.created === '' && explicitGeneral.entry.cardKey === s1.generalKey)

/* 三段检索：每一段只装该装的东西 */
const tri = (await action({ action: 'lookup', card: '测试卡A', query: '归类' })).result
check('三段都是数组', Array.isArray(tri.own) && Array.isArray(tri.other) && Array.isArray(tri.cross))
check('own 只装本分类', tri.own.every((e) => e.cardKey === 'cards/测试卡A.json'), tri.own.map((e) => e.cardKey).join(','))
check('other 只装其它错题组', tri.other.every((e) => e.cardKey === s1.generalKey || e.cardKey.startsWith('__other_')), tri.other.map((e) => e.cardKey).join(','))
check('cross 只装卡片', tri.cross.every((e) => e.cardKey.startsWith('cards/')), tri.cross.map((e) => e.cardKey).join(','))
check('卡片视角 cardGroup=card', tri.cardGroup === 'card', tri.cardGroup)

const triOther = (await action({ action: 'lookup', card: '卡片更新器', query: '归类' })).result
check('其它视角：own 是它自己', triOther.own.every((e) => e.cardKey === '__other_card-updater__'), triOther.own.map((e) => e.cardKey).join(','))
check('其它视角：other 是其余其它错题', triOther.other.every((e) => e.cardKey === s1.generalKey || e.cardKey.startsWith('__other_')), triOther.other.map((e) => e.cardKey).join(','))
check('其它视角：cross 是卡片', triOther.cross.every((e) => e.cardKey.startsWith('cards/')), triOther.cross.map((e) => e.cardKey).join(','))
check('其它视角 cardGroup=other', triOther.cardGroup === 'other', triOther.cardGroup)

/* 无关键词时 ② ③ 要压缩，不能把 ① 淹掉 */
for (let i = 0; i < 10; i += 1) {
  await action({ action: 'addEntry', cardKey: '__other_card-cases__', entry: { title: `批量用例 ${i}` } })
}
const printed = (text) =>
  text
    .split('② 其它错题')[1]
    .split('③ 跨卡查询')[0]
    .split('\n')
    .filter((l) => /^- \[/.test(l.trim())).length

const wide = (await toolMap['wrongbook_lookup'].execute({ card: '测试卡A' }, {})).text
check('无关键词时 ② 只印前 8 条', printed(wide) === 8, String(printed(wide)))
check('压缩时说明总数', wide.includes('共 1'), wide.split('\n').filter((l) => l.includes('共 ')).join(' / '))

const narrow = (await toolMap['wrongbook_lookup'].execute({ card: '测试卡A', query: '批量用例' }, {})).text
check('带关键词时 ② 全列', printed(narrow) === 10, String(printed(narrow)))

/* 分段的截断必须各算各的：本分类的低分条目不能被跨卡的高分条目挤出名额 */
const bullies = []
for (let i = 0; i < 20; i += 1) bullies.push({ cardKey: '__other_card-cases__', title: `压制用例 ${i}` })
await action({ action: 'importEntries', json: JSON.stringify({ entries: bullies }) })
const squeezed = (await action({ action: 'lookup', card: 'cards/测试卡A.json', limit: 2 })).result
check('limit 很小也留得住本分类', squeezed.own.length >= 1, `own=${squeezed.own.length} other=${squeezed.other.length}`)
check('other 段被 limit 限制', squeezed.other.length === 2, String(squeezed.other.length))
check('各段带回真实总数', squeezed.otherTotal > squeezed.other.length, `other=${squeezed.other.length}/${squeezed.otherTotal}`)

/* 分类计数一次算完，结果要跟逐条数一致 */
const counted = await state()
const cardAView = counted.cards.find((c) => c.key === 'cards/测试卡A.json')
const manual = counted.entries.filter((e) => e.cardKey === 'cards/测试卡A.json').length
check('分类计数与实际条目数一致', cardAView.count.total === manual, `${cardAView.count.total} vs ${manual}`)
check(
  '分类计数按状态细分',
  cardAView.count.open + cardAView.count.watch + cardAView.count.fixed === cardAView.count.total,
  JSON.stringify(cardAView.count),
)

/* 每次写入都要留下自己那份备份：同毫秒撞名会静默覆盖掉其中一份 */
const beforeBackups = (await state()).backups.length
for (let i = 0; i < 3; i += 1) {
  await action({ action: 'addEntry', cardKey: 'cards/测试卡A.json', entry: { title: `备份计数 ${i}` } })
}
const afterBackups = (await state()).backups.length
check('三次连续写入留下三份备份', afterBackups === beforeBackups + 3, `${beforeBackups} → ${afterBackups}`)
const backupNames = (await state()).backups.map((b) => b.file)
check('备份文件名互不重复', new Set(backupNames).size === backupNames.length, String(backupNames.length))

/* 导入时名字对上多个分类：跳过并计数，不是整批失败 */
const ambiguous = await action({ action: 'importEntries', json: JSON.stringify({ entries: [{ cardKey: '卡A', title: '模棱两可' }] }) })
check('导入跳过模棱两可的条目并计数', ambiguous.ambiguous === 1 && ambiguous.added === 0, JSON.stringify(ambiguous))

/* 导入去重：同分类同标题算重，不同分类不算 */const dup = await action({
  action: 'importEntries',
  json: JSON.stringify({
    entries: [
      { cardKey: 'cards/测试卡A.json', title: '状态栏空白' },
      { cardKey: 'cards/测试卡B.json', title: '状态栏空白' },
    ],
  }),
})
check('同分类同标题算重复', dup.added === 1 && dup.skipped === 1, JSON.stringify(dup))

/* 搬运：目标分类要对，源分类要空 */
const moveSrc = await action({ action: 'addEntry', cardKey: 'cards/测试卡A.json', entry: { title: '搬运用例' } })
const moved = await action({ action: 'moveEntry', id: moveSrc.entry.id, toCardKey: 'cards/测试卡B.json' })
check('moveEntry 落到目标分类', moved.ok === true && moved.entry.cardKey === 'cards/测试卡B.json', moved.entry && moved.entry.cardKey)
check('moveEntry 不在原分类留副本', (await state()).entries.filter((e) => e.id === moveSrc.entry.id).length === 0)

/* 卡消失之后，分类留不留，取决于它下面有没有东西 */

const ghostPath = path.join(CARDS, '幽灵卡.json')
fs.writeFileSync(ghostPath, '{}', 'utf8')
check('新出现的卡会被扫出来', (await state()).cards.some((c) => c.key === 'cards/幽灵卡.json'))
fs.unlinkSync(ghostPath)
check('空记录的分类跟着卡一起消失', !(await state()).cards.some((c) => c.key === 'cards/幽灵卡.json'))

const keeperPath = path.join(CARDS, '留有记录的卡.json')
fs.writeFileSync(keeperPath, '{}', 'utf8')
await state()
await action({ action: 'addEntry', cardKey: 'cards/留有记录的卡.json', entry: { title: '这张卡上有结论' } })
fs.unlinkSync(keeperPath)
const keptView = await state()
const kept = keptView.cards.find((c) => c.key === 'cards/留有记录的卡.json')
check('有记录的分类标成已不在卡片目录', !!kept && kept.missing === true, kept ? String(kept.missing) : '分类没了')
check('记录没有跟着丢', keptView.entries.some((e) => e.cardKey === 'cards/留有记录的卡.json'))

const lifted = await action({ action: 'deleteBucket', key: 'cards/留有记录的卡.json' })
check('missing 的卡片分类允许手动删除', lifted.ok === true, lifted.error)
check(
  '手动删掉后记录迁到兜底',
  (await state()).entries.some((e) => e.title === '这张卡上有结论' && e.cardKey === s1.generalKey),
)
check('在册的卡片分类仍然拒绝删除', (await action({ action: 'deleteBucket', key: 'cards/测试卡A.json' })).ok === false)

/* 卡内脚本盘点 */

const scripted = {
  raw: {
    data: {
      extensions: {
        tavern_helper: {
          scripts: [
            { name: '外置状态栏', content: 'x'.repeat(50), enabled: true },
            { name: '某卡特化脚本', content: 'y'.repeat(500), enabled: false },
          ],
        },
      },
      character_book: {
        entries: [
          { comment: '主线控制器', content: '' },
          { comment: '普通条目', content: 'json_patch 什么的' },
        ],
      },
    },
  },
}
fs.writeFileSync(path.join(CARDS, '带脚本的卡.json'), JSON.stringify(scripted), 'utf8')
const scanned = JSON.parse((await call('/dsh-wrongbook/scripts', 'GET')).body)
const scriptedCard = scanned.cards.find((c) => c.key === 'cards/带脚本的卡.json')
check('扫得到卡内脚本', !!scriptedCard && scriptedCard.scripts.length === 2, scriptedCard ? String(scriptedCard.scripts.length) : '没扫到这张卡')
check('外层 raw 包装被剥掉', !!scriptedCard && scriptedCard.scripts.length === 2, '少剥一层就会是 0')
check(
  '通用脚本不算特化',
  !!scriptedCard && scriptedCard.special.length === 1 && scriptedCard.special[0].name === '某卡特化脚本',
  scriptedCard ? scriptedCard.special.map((s) => s.name).join(',') : '',
)
check('停用状态读得出来', !!scriptedCard && scriptedCard.special[0].enabled === false)
check('控制器条目挑出来', !!scriptedCard && scriptedCard.controllers.includes('主线控制器'), scriptedCard ? scriptedCard.controllers.join(',') : '')
check('含 json_patch 的条目挑出来', !!scriptedCard && scriptedCard.patchEntries.includes('普通条目'), scriptedCard ? scriptedCard.patchEntries.join(',') : '')
check('没脚本的卡也照实返回', scanned.cards.some((c) => c.scripts.length === 0))
check('工具目录一并扫了', Array.isArray(scanned.tools), String(scanned.tools.length))
check('统计出带特化内容的卡数', scanned.flagged >= 1, String(scanned.flagged))

/* 备份的删除与清理 */
const bk = await action({ action: 'backupNow' })
check('backupNow 报告份数', bk.ok === true && bk.backups >= 1, String(bk.backups))
const list1 = (await state()).backups
check('备份列表带条目数', list1.length >= 1 && list1.every((b) => typeof b.entries === 'number'), JSON.stringify(list1.map((b) => b.entries)))
const del1 = await action({ action: 'deleteBackup', file: list1[0].file })
check('deleteBackup 生效', del1.ok === true && del1.backups === list1.length - 1, `${del1.backups} vs ${list1.length - 1}`)
check('deleteBackup 挡住路径穿越', (await action({ action: 'deleteBackup', file: '../../data.json' })).ok === false)
check('deleteBackup 报不存在的文件', (await action({ action: 'deleteBackup', file: 'nope.json' })).ok === false)

const prune = await action({ action: 'pruneBackups', keep: 2 })
check('pruneBackups 保留最近 N 份', prune.ok === true && prune.keep === 2 && prune.backups <= 2, JSON.stringify(prune))

/* 自定义备份目录 */
const defaultBackups = path.join(SANDBOX, 'tools', 'wrongbook', 'backups')
const customDir = path.join(SANDBOX, 'custom-backups')
const sd = await action({ action: 'setBackupDir', dir: customDir })
check('setBackupDir 建出并切到新目录', sd.ok === true && sd.custom === true && sd.backupDir === customDir, sd.backupDir || sd.error)
check('切换后 paths 指向新目录', (await state()).paths.backupDir === customDir)
await action({ action: 'backupNow' })
check(
  '手动备份写进了新目录',
  fs.existsSync(customDir) && fs.readdirSync(customDir).some((n) => n.endsWith('.json')),
  fs.existsSync(customDir) ? String(fs.readdirSync(customDir).length) : 'missing',
)
check('旧目录里的备份没被搬走', fs.readdirSync(defaultBackups).length > 0, String(fs.readdirSync(defaultBackups).length))
check('setBackupDir 拒绝文件路径', (await action({ action: 'setBackupDir', dir: path.join(CARDS, '测试卡A.json') })).ok === false)
check('setBackupDir 拒绝写不进去的路径', (await action({ action: 'setBackupDir', dir: path.join(CARDS, '测试卡A.json', 'sub') })).ok === false)
const reset = await action({ action: 'setBackupDir', dir: '' })
check('setBackupDir 空值恢复默认', reset.ok === true && reset.custom === false && reset.backupDir === defaultBackups, reset.backupDir)
check('恢复默认后 paths 跟着回来', (await state()).paths.backupDir === defaultBackups)

/* 自定义目录里混着别人的 JSON：不能进列表，更不能被清理带走 */
const foreignDir = path.join(SANDBOX, 'foreign')
fs.mkdirSync(foreignDir, { recursive: true })
const foreignFile = path.join(foreignDir, '别人的备份.json')
fs.writeFileSync(foreignFile, '{"mine":false}', 'utf8')
await action({ action: 'setBackupDir', dir: foreignDir })
await action({ action: 'backupNow' })
const mixed = (await state()).backups
check(
  '只列本插件写的备份',
  mixed.length === 1 && mixed.every((b) => /^\d+__.*__data\.json$/.test(b.file)),
  mixed.map((b) => b.file).join(','),
)
await action({ action: 'pruneBackups', keep: 1 })
check('清理不动别人的文件', fs.existsSync(foreignFile))
check('deleteBackup 拒绝外来文件名', (await action({ action: 'deleteBackup', file: '别人的备份.json' })).ok === false)

/* 安装自检：profile 侧那两处都造好了，应当判定为正常 */

const install = (await state()).install
check('安装自检有结论', !!install && typeof install.ok === 'boolean', JSON.stringify(install && install.ok))
check('profile 目录从数据根反推得出来', install.profileDir === PROFILE_DIR, install.profileDir)
check('认得出 dependencies 里那条 link', install.declared === true)
check('认得出 dsh.profile.bundles 里那条名字', install.bundled === true)
check('链接状态有结论', typeof install.linked === 'boolean', String(install.linked))
check('两处都在时判定为正常', install.ok === (install.linked === true), `ok=${install.ok} linked=${install.linked}`)
check('正常时不啰嗦补回命令', install.ok ? install.fix === '' : install.fix.length > 0)

/* 把 bundles 里那条名字拿掉：应当立刻判定为缺失，并给出补回命令 */
const manifestPath = path.join(PROFILE_DIR, 'package.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
manifest.dsh.profile.bundles = ['@deepseek-ai/dsh-base']
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
const broken = (await state()).install
check('少一条名字就判定为缺失', broken.ok === false && broken.bundled === false, `ok=${broken.ok} bundled=${broken.bundled}`)
check('缺失时给出补回命令', broken.fix.includes('dsh plugin add'), (broken.fix.split('\n')[1] || '').trim())
check(
  '补回命令点名两处该补的地方',
  broken.fix.includes('dsh.profile.bundles') && broken.fix.includes('dependencies'),
  broken.fix.split('\n').slice(-2).join(' / '),
)
manifest.dsh.profile.bundles = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-wrongbook']
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
check('补回后重新判定为正常', (await state()).install.bundled === true)
/* 自检里要能看出「磁盘上的版本」和「进程里跑的版本」是不是同一个 */

const selfNow = (await state()).plugin
check(
  '自检带上运行版本',
  typeof selfNow.runningVersion === 'string' && selfNow.runningVersion.length > 0,
  String(selfNow.runningVersion),
)
check(
  '刚加载完时磁盘与运行一致，不报需要重启',
  selfNow.runningVersion === selfNow.version && selfNow.stale === false,
  `disk=${selfNow.version} run=${selfNow.runningVersion} stale=${selfNow.stale}`,
)

/* 回流到 Skill：只写用户自己的，内置的当场说清不给写 */

const skillList = JSON.parse((await call('/dsh-wrongbook/skills', 'GET')).body)
check('列出用户 skill', skillList.skills.some((s) => s.name === 'my-notes' && !s.builtin), skillList.skills.map((s) => s.name).join(','))
check('内置 skill 也列出来并带标记', skillList.skills.some((s) => s.name === 'builtin-x' && s.builtin))
check('用户 skill 排在前面', skillList.skills[0] && skillList.skills[0].builtin === false, skillList.skills[0] && skillList.skills[0].name)
check('认得出 skill 的 references', skillList.skills.find((s) => s.name === 'my-notes').references.includes('x') === false)

const firstEntry = (await state()).entries[0]
const firstId = firstEntry.id
const reflux1 = await action({ action: 'refluxToSkill', skill: 'my-notes', ids: [firstId] })
check('回流写入一条', reflux1.ok === true && reflux1.written === 1, JSON.stringify(reflux1).slice(0, 120))
const refluxText = fs.readFileSync(reflux1.file, 'utf8')
check('写出来的是条目正文', refluxText.includes(`### ${firstEntry.title}`), refluxText.slice(0, 60))
check('带上分类与状态', refluxText.includes('错题库回流：') && refluxText.includes('·'), refluxText.split('\n').find((l) => l.startsWith('>')) || '')
check('有现象就写进现象', !firstEntry.symptom || refluxText.includes(firstEntry.symptom))
check('有修法就写进修法', !firstEntry.fix || refluxText.includes(firstEntry.fix))
check('开头写清只增不改', refluxText.includes('只增不改'))

const reflux2 = await action({ action: 'refluxToSkill', skill: 'my-notes', ids: [firstId] })
check('同名条目不会写第二遍', reflux2.written === 0 && reflux2.skipped === 1, JSON.stringify(reflux2))

const toBuiltin = await action({ action: 'refluxToSkill', skill: 'builtin-x', ids: [firstId] })
check('内置 skill 拒绝回流', toBuiltin.ok === false, toBuiltin.error)
check('拒绝时说清了为什么', /程序目录|更新会整份覆盖/.test(toBuiltin.error || ''), toBuiltin.error)
check('内置 skill 目录没被写脏', !fs.existsSync(path.join(BUILTIN_DIR, 'builtin-x', 'references', '错题库回流.md')))

check(
  '目标文件不许跑出 skill 目录',
  (await action({ action: 'refluxToSkill', skill: 'my-notes', file: '../../x.md', ids: [firstId] })).ok === false,
)
check('skill 名不许带路径', (await action({ action: 'refluxToSkill', skill: '../evil', ids: [firstId] })).ok === false)
check('没选条目时拒绝', (await action({ action: 'refluxToSkill', skill: 'my-notes', ids: [] })).ok === false)

const made = await action({ action: 'createSkill', name: 'new-notes' })
check('能建出新 skill', made.ok === true && fs.existsSync(path.join(SANDBOX, 'skills', 'new-notes', 'SKILL.md')))
check(
  '新 skill 默认引用了回流文件',
  fs.readFileSync(path.join(SANDBOX, 'skills', 'new-notes', 'SKILL.md'), 'utf8').includes('references/错题库回流.md'),
)
check('重名拒绝', (await action({ action: 'createSkill', name: 'new-notes' })).ok === false)
check('名字不合法拒绝', (await action({ action: 'createSkill', name: 'Bad Name' })).ok === false)
check('新 skill 立刻能作为回流目标', (await action({ action: 'refluxToSkill', skill: 'new-notes', ids: [firstId] })).ok === true)

/* 简介决定 Agent 会不会自动加载这个 skill，默认值不能是一句空话 */
const defaultSkillText = fs.readFileSync(path.join(SANDBOX, 'skills', 'new-notes', 'SKILL.md'), 'utf8')
check('默认简介写的是什么时候读它', defaultSkillText.includes('排查同类问题、动手之前先读一遍'), defaultSkillText.split('\n')[2])
check('默认简介不重复 skill 名', !defaultSkillText.includes('new-notes：'), defaultSkillText.split('\n')[2])

await action({ action: 'createSkill', name: 'with-desc', description: '排查某类问题时读一遍' })
const withDesc = fs.readFileSync(path.join(SANDBOX, 'skills', 'with-desc', 'SKILL.md'), 'utf8')
check('自己写的简介会进 frontmatter', withDesc.includes('description: "排查某类问题时读一遍"'), withDesc.split('\n')[2])

/* 删 skill：先整份备份再删，内置的拒绝 */
const removed = await action({ action: 'deleteSkill', name: 'with-desc' })
check('能删用户 skill', removed.ok === true && !fs.existsSync(path.join(SANDBOX, 'skills', 'with-desc')), removed.error)
check('删前留了整份备份', !!removed.backup && fs.existsSync(path.join(removed.backup, 'SKILL.md')), removed.backup)
check(
  '备份落在数据目录下，不跟着 skill 一起没',
  String(removed.backup).startsWith(path.join(SANDBOX, 'tools', 'wrongbook')),
  String(removed.backup),
)
check('删完就不在列表里了', !(await call('/dsh-wrongbook/skills', 'GET')).body.includes('with-desc'))
check('内置 skill 不许删', (await action({ action: 'deleteSkill', name: 'builtin-x' })).ok === false)
check('内置目录没被动过', fs.existsSync(path.join(BUILTIN_DIR, 'builtin-x', 'SKILL.md')))
check('删不存在的拒绝', (await action({ action: 'deleteSkill', name: 'nope-nope' })).ok === false)
check('名字带路径拒绝', (await action({ action: 'deleteSkill', name: '../evil' })).ok === false)

/* 自动回流：配了目标之后，记错题就顺手同步一次 */

const autoOn = await action({ action: 'setAutoReflux', skill: 'new-notes' })
check(
  '能打开自动同步',
  autoOn.ok === true && autoOn.autoReflux && autoOn.autoReflux.skill === 'new-notes',
  JSON.stringify(autoOn.autoReflux),
)
check('打开时先同步一次', typeof autoOn.synced === 'number', String(autoOn.synced))

const refluxFile = path.join(SANDBOX, 'skills', 'new-notes', 'references', '错题库回流.md')
check('打开时就写出了文件', fs.existsSync(refluxFile))
// 按标题逐条核对，别去数 `### ` —— 条目正文里也可能有小标题，数出来的不是条数。
const titles = (await state()).entries.map((e) => e.title)
const textAtOn = fs.readFileSync(refluxFile, 'utf8')
const missing = titles.filter((t) => !textAtOn.includes(`### ${t}`))
check('打开时把已有条目一次补齐', missing.length === 0, missing.length ? `缺 ${missing.length} 条：${missing[0]}` : `${titles.length} 条都在`)

await action({ action: 'addEntry', cardKey: 'cards/测试卡A.json', entry: { title: '自动同步用例' } })
check('记一条新错题就自动跟进去', fs.readFileSync(refluxFile, 'utf8').includes('自动同步用例'), '没写进去')
check('自动同步是追加不是重写', fs.readFileSync(refluxFile, 'utf8').includes('只增不改'), '文件头没了')

const withAuto = await state()
check(
  'state 带上自动同步目标',
  !!withAuto.config.autoReflux && withAuto.config.autoReflux.skill === 'new-notes',
  JSON.stringify(withAuto.config.autoReflux),
)
check(
  'state 带上上次同步结果',
  !!withAuto.config.autoRefluxLast && withAuto.config.autoRefluxLast.written >= 1,
  JSON.stringify(withAuto.config.autoRefluxLast),
)
check('上次同步记录里没有错误', withAuto.config.autoRefluxLast.error === '', withAuto.config.autoRefluxLast.error)
check('内置 skill 不能设为自动目标', (await action({ action: 'setAutoReflux', skill: 'builtin-x' })).ok === false)

const autoOff = await action({ action: 'setAutoReflux', skill: '' })
check('能关掉自动同步', autoOff.ok === true && autoOff.autoReflux === null, JSON.stringify(autoOff.autoReflux))

/*
 * 归档回执：工具返回的那段文本是 Agent 唯一的信息来源。
 * 它必须带全「写到哪、写入多少、对方现在共多少」—— 少一项，回复里就少一项。
 */
const recordTool = tools.find((d) => d.name === 'wrongbook_record')
check('注册了 wrongbook_record', !!recordTool)

await action({ action: 'setAutoReflux', skill: 'new-notes' })
const withSync = await recordTool.execute({ card: 'new-notes', title: '回执断言用例（开同步）', scope: '工具链' })
check('回执写明已归档', withSync.text.includes('已归档到错题库：'), withSync.text.slice(0, 40))
check('回执带上分类名', withSync.text.includes('「new-notes」分类'), withSync.text.slice(0, 60))
check('回执带上条目标题', withSync.text.includes('《回执断言用例（开同步）》'), withSync.text.slice(0, 70))
check('回执报出写进了哪个 skill', /已写进 skill「new-notes」/.test(withSync.text), withSync.text.split('\n')[1])
check('回执报出本次条数', /本次新增 \d+ 条/.test(withSync.text), withSync.text.split('\n')[1])
check('回执报出对方现在共多少', /现在共 \d+ 条/.test(withSync.text), withSync.text.split('\n')[1])
check(
  '渲染出来的就是这段原文',
  recordTool.output.render({}, withSync)[0].text === withSync.text,
  recordTool.output.render({}, withSync)[0].text.slice(0, 50),
)

await action({ action: 'setAutoReflux', skill: '' })
const noSync = await recordTool.execute({ card: 'new-notes', title: '回执断言用例（没开同步）', scope: '工具链' })
check('没开同步时回执明说', noSync.text.includes('自动同步没开'), noSync.text.split('\n')[1])
check('没开同步时仍报出归档结果', noSync.text.includes('已归档到错题库：'), noSync.text.slice(0, 40))
const sizeBefore = fs.readFileSync(refluxFile, 'utf8').length
await action({ action: 'addEntry', cardKey: 'cards/测试卡A.json', entry: { title: '关掉之后不该再出现' } })
check(
  '关掉之后记错题就不再回写',
  fs.readFileSync(refluxFile, 'utf8').length === sizeBefore &&
    !fs.readFileSync(refluxFile, 'utf8').includes('关掉之后不该再出现'),
)

await action({ action: 'setBackupDir', dir: '' })

/* 目录浏览：面板里「选择文件夹」的后台 */
const listDrivesRes = JSON.parse((await call('/dsh-wrongbook/list', 'GET', undefined, '?path=')).body)
check('空路径列出驱动器', listDrivesRes.drives === true && Array.isArray(listDrivesRes.entries), String(listDrivesRes.entries.length))
const listSandbox = JSON.parse((await call('/dsh-wrongbook/list', 'GET', undefined, `?path=${encodeURIComponent(SANDBOX)}`)).body)
check(
  '列出子目录',
  ['resources', 'tools'].every((n) => listSandbox.entries.some((e) => e.name === n)),
  listSandbox.entries.map((e) => e.name).join(','),
)
check('只列目录不列文件', listSandbox.entries.every((e) => e.type === 'directory'))
check('给出上一级', listSandbox.parent === path.dirname(SANDBOX), listSandbox.parent)
const listCards = JSON.parse((await call('/dsh-wrongbook/list', 'GET', undefined, `?path=${encodeURIComponent(CARDS)}`)).body)
check('叶子目录没有子项', listCards.entries.length === 0, String(listCards.entries.length))
const listFile = JSON.parse((await call('/dsh-wrongbook/list', 'GET', undefined, `?path=${encodeURIComponent(path.join(CARDS, '测试卡A.json'))}`)).body)
check('路径指到文件时报错', !!listFile.error, listFile.error)
const listDriveOnly = JSON.parse((await call('/dsh-wrongbook/list', 'GET', undefined, '?path=C%3A')).body)
check('只写盘符也能解析成根', listDriveOnly.dir === 'C:\\', listDriveOnly.dir)

/*
 * 这里原本有一条实跑 openBackupDir 的用例，已经删掉。
 *
 * 它是整个套件里唯一有外部副作用的检查：真的会弹出一个资源管理器窗口，而窗口
 * 指向的目录一旦在事后被删（沙盒会），资源管理器就弹「位置不可用」——比不测还烦。
 * 中途试过两种补丁（保留沙盒、把目标挪到沙盒外的常驻目录），但窗口本身仍然会留下，
 * 这类检查就不该待在自动化里。
 *
 * 「打开目录」属于人工验证项：重启后在面板上点一下，看窗口落到哪儿、面板上回的
 * via 是哪一级回退。脚本只管到动作被正确分派为止，不碰外部程序。
 */

let failed = 0
for (const r of results) {
  if (!r.ok) failed += 1
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}${r.extra !== undefined ? `  [${r.extra}]` : ''}`)
}
console.log(`\n${results.length - failed}/${results.length} passed`)
// 沙盒用完即删：这里没有任何检查会打开外部程序，所以不会留下指着被删目录的窗口。
fs.rmSync(SANDBOX, { recursive: true, force: true })
process.exit(failed ? 1 : 0)
