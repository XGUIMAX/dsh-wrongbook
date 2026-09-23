// 隔离验收：在临时 data root 上跑一遍 host 半边的全链路。
// 用法：node verify/host.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SANDBOX = path.join(os.tmpdir(), 'dsh-wrongbook-sandbox')
fs.rmSync(SANDBOX, { recursive: true, force: true })
const CARDS = path.join(SANDBOX, 'resources', 'cards')
const ORIG = path.join(SANDBOX, 'originals', 'cards')
fs.mkdirSync(CARDS, { recursive: true })
fs.mkdirSync(ORIG, { recursive: true })
fs.writeFileSync(path.join(CARDS, '测试卡A.json'), '{"name":"测试卡A"}', 'utf8')
fs.writeFileSync(path.join(CARDS, '测试卡A MVU版本.json'), '{"name":"A MVU"}', 'utf8')
fs.writeFileSync(path.join(CARDS, '测试卡B.json'), '{"name":"测试卡B"}', 'utf8')
fs.writeFileSync(path.join(ORIG, '测试卡A.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]))

// 必须在 import 之前设置：host 半边在模块求值时解析数据根。
process.env.DSH_TAVERN_DATA = SANDBOX
const mod = await import(new URL('../lib/index.js', import.meta.url).href)

const routes = []
const tools = []
const webServer = { register: (r) => (routes.push(r), () => {}) }
const toolsApi = { register: (d) => (tools.push(d), () => {}) }
const ctx = {
  get: (key) => (key === 'tools' ? toolsApi : undefined),
  inject: (deps, cb) => cb({ webServer, effect: (fn) => void fn() }),
  effect: (fn) => void fn(),
}

const results = []
const check = (label, ok, extra) => results.push({ label, ok, extra })

check('name 导出', mod.name === 'dsh-wrongbook', mod.name)
check('apply 是函数', typeof mod.apply === 'function')
mod.apply(ctx)
const toolMap = Object.fromEntries(tools.map((d) => [d.name, d]))
check('注册了 4 条路由', routes.length === 4, routes.map((r) => r.path).join(', '))
check('注册了 3 个工具', tools.length === 3, tools.map((d) => d.name).join(', '))

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
check('分类 = 3 张卡 + 2 个其它分类', s1.cards.length === 5, String(s1.cards.length))
check('卡片组 3 个', s1.cards.filter((c) => c.group === 'card').length === 3, s1.cards.filter((c) => c.group === 'card').map((c) => c.name).join(','))
check('其它组 2 个', s1.cards.filter((c) => c.group === 'other').length === 2, s1.cards.filter((c) => c.group === 'other').map((c) => c.name).join(','))
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
const iCross = text.indexOf('② 跨卡查询')
check('工具输出含 ①②', iOwn >= 0 && iCross >= 0)
check('工具输出顺序：本卡在前', iCross > iOwn, `${iOwn} < ${iCross}`)
check('工具输出含本卡标题', text.includes('状态栏空白'))
check('工具输出含跨卡卡片名', text.includes('测试卡B'))

check('wrongbook_record 落库', /已记入/.test((await toolMap['wrongbook_record'].execute({ card: '测试卡A', title: '图标错位' }, {})).text))
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
