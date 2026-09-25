// 客户端半边验收：最小 React 运行时下渲染两轮，验证注册接线与主分支不抛错。
// 用法：node verify/client.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../client.js', import.meta.url))

/* 最小浏览器环境 */
let captured = null
const win = {
  __ModuleLoader__: { load: (entry) => void (captured = entry) },
  addEventListener() {},
  removeEventListener() {},
  confirm: () => true,
  prompt: () => null,
}
const doc = {
  head: { appendChild() {} },
  createElement: () => ({ setAttribute() {}, textContent: '', click() {}, style: {} }),
  querySelectorAll: () => [],
}

/* 最小 React：useState 走缓存数组，useEffect 收集后由测试手动 commit */
const states = []
const effects = []
let cursor = 0
const React = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  Fragment: 'Fragment',
  useState(init) {
    const i = cursor++
    if (!(i in states)) states[i] = typeof init === 'function' ? init() : init
    return [states[i], (next) => void (states[i] = typeof next === 'function' ? next(states[i]) : next)]
  },
  useEffect(fn) {
    effects.push(fn)
  },
  useMemo(fn) {
    return fn()
  },
  useCallback(fn) {
    return fn
  },
  useRef: (v) => ({ current: v }),
}

const STATE = {
  ok: true,
  updatedAt: '2026-09-23T10:00:00.000Z',
  paths: {
    dataDir: 'C:\\sandbox\\tools\\wrongbook',
    dbFile: 'C:\\sandbox\\tools\\wrongbook\\data.json',
    cardDir: 'C:\\sandbox\\resources\\cards',
    backupDir: 'C:\\sandbox\\tools\\wrongbook\\backups',
    backupDirDefault: 'C:\\sandbox\\tools\\wrongbook\\backups',
    backupDirCustom: false,
    pluginDir: 'C:\\sandbox\\plugins\\dsh-wrongbook',
  },
  scopes: ['卡片', 'MVU', '世界书', '正则', '脚本', '前端UI', '预设', '工具链', '其他'],
  statuses: ['open', 'watch', 'fixed'],
  generalKey: '__general__',
  dataFile: {
    file: 'C:\\sandbox\\tools\\wrongbook\\data.json',
    bytes: 12980,
    updatedAt: '2026-09-23T10:00:00.000Z',
    entries: 1,
    cards: 2,
  },
  config: {
    remoteUrl: '',
    autoReflux: { skill: 'my-notes', file: 'references/错题库回流.md' },
    autoRefluxLast: { at: '2026-09-23T10:00:00.000Z', written: 3, skipped: 0, file: '', error: '' },
  },
  cards: [
    {
      key: 'cards/测试卡A.json',
      group: 'card',
      name: '测试卡A',
      base: '测试卡A',
      rel: 'cards/测试卡A.json',
      abs: 'C:\\sandbox\\resources\\cards\\测试卡A.json',
      kind: 'plain',
      avatar: 'C:\\sandbox\\originals\\cards\\测试卡A.png',
      pairKey: 'cards/测试卡A MVU版本.json',
      note: '',
      missing: false,
      updatedAt: '2026-09-23T10:00:00.000Z',
      count: { open: 1, watch: 0, fixed: 0, total: 1 },
    },
    {
      key: 'cards/测试卡A MVU版本.json',
      group: 'card',
      name: '测试卡A MVU版本',
      base: '测试卡A MVU版本',
      rel: 'cards/测试卡A MVU版本.json',
      abs: 'C:\\sandbox\\resources\\cards\\测试卡A MVU版本.json',
      kind: 'mvu',
      avatar: '',
      pairKey: 'cards/测试卡A.json',
      note: '',
      missing: false,
      updatedAt: '2026-09-23T10:00:00.000Z',
      count: { open: 0, watch: 0, fixed: 0, total: 0 },
    },
    {
      key: 'cards/已删掉的卡.json',
      group: 'card',
      name: '已删掉的卡',
      base: '已删掉的卡',
      rel: 'cards/已删掉的卡.json',
      abs: 'C:\\sandbox\\resources\\cards\\已删掉的卡.json',
      kind: 'plain',
      avatar: '',
      pairKey: '',
      note: '',
      missing: true,
      updatedAt: '2026-09-23T10:00:00.000Z',
      count: { open: 0, watch: 0, fixed: 0, total: 0 },
    },
    {
      key: '__other_card-updater__',
      group: 'other',
      name: '卡片更新器',
      base: '卡片更新器',
      rel: '',
      abs: '',
      kind: 'other',
      avatar: '',
      pairKey: '',
      note: '卡片更新器插件自身的问题',
      missing: false,
      updatedAt: '2026-09-23T10:00:00.000Z',
      count: { open: 0, watch: 0, fixed: 0, total: 0 },
    },
    {
      key: '__general__',
      group: 'other',
      name: '通用 / 未归类',
      base: '通用 / 未归类',
      rel: '',
      abs: '',
      kind: 'other',
      avatar: '',
      pairKey: '',
      note: '',
      missing: false,
      updatedAt: '2026-09-23T10:00:00.000Z',
      count: { open: 0, watch: 0, fixed: 0, total: 0 },
    },
  ],
  entries: [
    {
      id: 'e_demo1',
      cardKey: 'cards/测试卡A.json',
      title: '状态栏空白',
      symptom: 'M2 后留白',
      cause: '变量未初始化',
      fix: '补初值',
      scope: 'MVU',
      status: 'open',
      tags: ['MVU', '状态栏'],
      refs: '',
      evidence: '',
      createdAt: '2026-09-23T10:00:00.000Z',
      updatedAt: '2026-09-23T10:00:00.000Z',
    },
  ],
  stats: { cards: 2, entries: 1, open: 1, watch: 0, fixed: 0 },
  backups: [
    { file: '1790000000000__manual__data.json', at: 1790000000000, reason: 'manual', bytes: 13000, entries: 1 },
    { file: '1789999990000__add-entry__data.json', at: 1789999990000, reason: 'add entry', bytes: 12000, entries: 0 },
  ],
  plugin: {
    name: 'dsh-wrongbook',
    dir: 'C:\\sandbox\\plugins\\dsh-wrongbook',
    version: '1.0.0',
    fingerprint: 'abc',
    files: [{ rel: 'lib/index.js', sha256: 'b', bytes: 1, mtime: 0 }],
    seen: true,
    lastCheckAt: '2026-09-23T10:00:00.000Z',
    latestVersion: '',
    source: 'local',
    changedLocally: false,
    versionBumped: false,
    updateAvailable: false,
    history: [],
    dataRoot: 'C:\\sandbox\\tools\\wrongbook',
  },
  install: {
    profileDir: 'C:\\sandbox\\profiles\\tavern',
    manifestFile: 'C:\\sandbox\\profiles\\tavern\\package.json',
    pluginDir: 'C:\\sandbox\\plugins\\dsh-wrongbook',
    declared: true,
    bundled: true,
    linked: true,
    linkTarget: '..\\..\\..\\plugins\\dsh-wrongbook',
    ok: true,
    fix: '',
  },
}

/** 一次跨卡查询的返回：三段各一条，用来验证三段都渲染得出来。 */
const LOOKUP = {
  cardKey: 'cards/测试卡A.json',
  cardName: '测试卡A',
  cardGroup: 'card',
  own: [
    {
      id: 'e_own',
      cardKey: 'cards/测试卡A.json',
      title: '状态栏空白',
      scope: 'MVU',
      status: 'open',
      tags: ['MVU'],
      symptom: '',
      cause: '',
      fix: '',
      refs: '',
      evidence: '',
      createdAt: '',
      updatedAt: '2026-09-23T10:00:00.000Z',
    },
  ],
  other: [
    {
      id: 'e_other',
      cardKey: '__other_card-updater__',
      title: '合并会覆盖状态栏入口',
      scope: '工具链',
      status: 'fixed',
      tags: ['U-01'],
      symptom: '',
      cause: '',
      fix: '',
      refs: '',
      evidence: '',
      createdAt: '',
      updatedAt: '2026-09-23T10:00:00.000Z',
    },
  ],
  cross: [
    {
      id: 'e_cross',
      cardKey: 'cards/测试卡B.json',
      title: '状态栏串台',
      scope: 'MVU',
      status: 'open',
      tags: [],
      symptom: '',
      cause: '',
      fix: '',
      refs: '',
      evidence: '',
      createdAt: '',
      updatedAt: '2026-09-23T10:00:00.000Z',
    },
  ],
  scanned: 3,
}

/** 卡脚本盘点的一次返回：一张卡带两个脚本（一个通用、一个特化），外加工具目录里那一个。 */
const SCRIPT_SCAN = {
  ok: true,
  flagged: 1,
  cards: [
    {
      key: 'cards/测试卡A.json',
      name: '测试卡A',
      bytes: 2048,
      mtime: 0,
      error: '',
      scripts: [
        { name: '外置状态栏', chars: 120, enabled: true, link: '', common: true, dataKeys: [] },
        {
          name: '助手agent_v0.15',
          chars: 1015009,
          enabled: true,
          link: '',
          common: false,
          dataKeys: ['ash_agent', 'acu_anticliche_agent'],
        },
      ],
      special: [
        {
          name: '助手agent_v0.15',
          chars: 1015009,
          enabled: true,
          link: '',
          common: false,
          dataKeys: ['ash_agent', 'acu_anticliche_agent'],
        },
      ],
      hasCommon: true,
      controllers: ['主线控制器'],
      patchEntries: [],
      initvar: [],
    },
    {
      key: 'cards/测试卡A MVU版本.json',
      name: '测试卡A MVU版本',
      bytes: 1024,
      mtime: 0,
      error: '',
      scripts: [],
      special: [],
      hasCommon: false,
      controllers: [],
      patchEntries: [],
      initvar: [],
    },
  ],
  tools: [
    {
      rel: 'tools/async-agent/assistant-agent-v0.15.json',
      file: 'assistant-agent-v0.15.json',
      dir: 'async-agent',
      bytes: 2436096,
      mtime: 0,
      name: '助手agent_v0.15',
      chars: 1015009,
      enabled: true,
      link: '',
      common: false,
      dataKeys: ['ash_agent'],
    },
  ],
}

/** 回流目标：一个用户 skill 加一个内置的，面板要把后者标成写不了。 */
const SKILL_LIST = {
  ok: true,
  userDir: 'C:\\sandbox\\skills',
  skills: [
    { name: 'my-notes', dir: 'C:\\sandbox\\skills\\my-notes', builtin: false, description: '验收用', references: [] },
    {
      name: 'card-to-mvu',
      dir: 'C:\\program\\skills\\card-to-mvu',
      builtin: true,
      description: '内置',
      references: ['mvu-recipe.md'],
    },
  ],
}

const fetchStub = async (url, init) => {
  const target = String(url)
  if (target.includes('/state')) return { status: 200, ok: true, json: async () => STATE }
  if (target.includes('/scripts')) return { status: 200, ok: true, json: async () => SCRIPT_SCAN }
  if (target.includes('/skills')) return { status: 200, ok: true, json: async () => SKILL_LIST }
  if (target.includes('/action')) {
    let body = {}
    try {
      body = JSON.parse((init && init.body) || '{}')
    } catch {
      body = {}
    }
    if (body.action === 'lookup') return { status: 200, ok: true, json: async () => ({ ok: true, result: LOOKUP }) }
  }
  return { status: 200, ok: true, json: async () => ({ ok: true }) }
}

const results = []
const check = (label, ok, extra) => results.push({ label, ok, extra })

/* 加载模块 */
new Function('window', 'document', 'fetch', fs.readFileSync(SRC, 'utf8'))(win, doc, fetchStub)
check('调用了 __ModuleLoader__.load', !!captured)
check('模块 id = dsh-wrongbook', !!captured && captured.id === 'dsh-wrongbook', captured && captured.id)

const plugin = captured.factory((name) => {
  if (name === 'react') return React
  throw new Error(`unexpected require: ${name}`)
})
check('导出 name', plugin.name === 'dsh-wrongbook', plugin.name)
check('inject = slots + locale', JSON.stringify(plugin.inject) === '["slots","locale"]', JSON.stringify(plugin.inject))

/* apply 接线 */
const registrations = []
const dicts = []
const ctx = {
  effect: (fn) => void fn(),
  locale: {
    register: (ns, dict) => void dicts.push({ ns, dict }),
    bind: (ns) => (key) => (dicts[0] && dicts[0].dict.zh[key] !== undefined ? dicts[0].dict.zh[key] : key),
  },
  slots: {
    inject: (_key, cb) => void cb(),
    register: (options, component) => void registrations.push({ options, component }),
  },
}
plugin.apply(ctx)

check('注册了字典', dicts.length === 1 && dicts[0].ns === 'settings.dsh-wrongbook', dicts[0] && dicts[0].ns)
check('只注册一个座位', registrations.length === 1, String(registrations.length))
const seat = registrations[0]
check('座位是 settings.section', seat.options.name === 'settings.section', seat.options.name)
check('座位 id = wrongbook', seat.options.id === 'wrongbook', seat.options.id)
check('座位 order = 46', seat.options.order === 46, String(seat.options.order))
check('座位 label = 错题库', seat.options.label() === '错题库', seat.options.label())
check('没有侧栏入口', !registrations.some((r) => String(r.options.name).includes('sidebar')))

const zhKeys = Object.keys(dicts[0].dict.zh).sort()
const enKeys = Object.keys(dicts[0].dict.en).sort()
check('zh/en 键一致', zhKeys.join('|') === enKeys.join('|'), zhKeys.filter((k) => !enKeys.includes(k)).join(','))

/* 渲染两轮 */
const out = { texts: [], types: [] }
function walk(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return
  if (typeof node === 'string' || typeof node === 'number') return void out.texts.push(String(node))
  if (Array.isArray(node)) return void node.forEach(walk)
  if (typeof node === 'object' && node.type !== undefined) {
    out.types.push(typeof node.type === 'function' ? node.type.name : String(node.type))
    for (const [key, value] of Object.entries(node.props || {})) {
      if (key !== 'children' && (typeof value === 'string' || typeof value === 'number')) out.texts.push(String(value))
    }
    return void walk(node.children)
  }
  if (typeof node === 'object') Object.values(node).forEach(walk)
}

function renderOnce() {
  cursor = 0
  effects.length = 0
  let node = seat.component()
  let guard = 0
  // SettingsSection 只包了一层，展开顶层函数组件才能进到面板本体。
  while (node && typeof node === 'object' && typeof node.type === 'function' && guard++ < 10) node = node.type(node.props)
  out.texts.length = 0
  out.types.length = 0
  walk(node)
  return node
}

renderOnce()
for (const fn of effects.slice()) fn()
await new Promise((r) => setTimeout(r, 30))
const tree = renderOnce()

function findByType(node, name, acc = []) {
  if (!node || typeof node !== 'object') return acc
  if (Array.isArray(node)) return node.reduce((a, n) => findByType(n, name, a), acc)
  if (typeof node.type === 'function' && node.type.name === name) acc.push(node)
  return findByType(node.children, name, acc)
}

check('渲染出主分支', !out.texts.includes('连不上后台'))
check('标题「错题库」', out.texts.includes('错题库'))
check('「① 本卡错题库」', out.texts.includes('① 本卡错题库'))
check('检索顺序提示是三段', out.texts.some((t) => t.includes('① 本卡错题库 → ② 其它错题 → ③ 跨卡查询')), out.texts.filter((t) => t.includes('检索顺序')).join(' / '))
check('无查询时不渲染 ②', !out.texts.includes('② 跨卡查询'))
check('卡名显示', out.texts.includes('测试卡A'))
check('版本号显示', out.texts.includes('v1.0.0'))
check('自检结论显示', out.texts.includes('已是最新版'))
check('数据目录显示', out.texts.some((t) => t.includes('tools\\wrongbook')))
check('EntryView 已渲染', out.types.includes('EntryView'))

/* 回流到 Skill：按钮打开弹窗，内置 skill 在弹窗里被标成写不了 */
const refluxBtn = findByClass(tree, 'dwb-btn').find((n) => n.children.join('').includes('回流到 Skill'))
check('错题页有回流按钮', !!refluxBtn)
check(
  '自动同步开着时按钮上有个点',
  !!refluxBtn && refluxBtn.children.some((c) => c && c.props && c.props.className === 'dwb-live'),
  refluxBtn ? refluxBtn.children.map((c) => (c && c.props ? c.props.className : String(c))).join(',') : '',
)
check(
  '提示行写明自动同步跑到哪一步了',
  out.texts.some((t) => t.includes('自动同步已开') && t.includes('写入')),
  out.texts.filter((t) => t.includes('自动同步')).join(' / '),
)
if (refluxBtn) {
  refluxBtn.props.onClick()
  renderOnce()
  for (const fn of effects.slice()) fn()
  await new Promise((r) => setTimeout(r, 80))
  const refluxTree = renderOnce()
  // 组件元素不展开就看不到里面的东西 —— CardRow / CardScriptBlock 都是这么坑的。
  const refluxNode = findByType(refluxTree, 'RefluxModal')[0]
  const textsOf = (node, acc = []) => {
    if (node == null || typeof node === 'boolean') return acc
    if (typeof node === 'string' || typeof node === 'number') {
      acc.push(String(node))
      return acc
    }
    if (Array.isArray(node)) {
      node.forEach((n) => textsOf(n, acc))
      return acc
    }
    if (typeof node === 'object' && node.children) textsOf(node.children, acc)
    return acc
  }
  const refluxBody = refluxNode ? refluxNode.type(refluxNode.props) : null
  const refluxTexts = refluxBody ? textsOf(refluxBody) : []
  const refluxInputs = refluxBody ? findByClass(refluxBody, 'dwb-input') : []
  check('回流弹窗打开', !!refluxNode, out.types.includes('RefluxModal') ? 'ok' : '没有弹窗')
  check('弹窗说明只增不改', refluxTexts.some((t) => t.includes('同名的不会重复写')), refluxTexts.slice(0, 4).join(' / '))
  check('弹窗列出用户 skill', refluxTexts.includes('my-notes'), refluxTexts.filter((t) => t.includes('notes')).join(' / '))
  check('弹窗给出范围与条数', refluxTexts.some((t) => /将写入 \d+ 条/.test(t)), refluxTexts.filter((t) => /将写入/.test(t)).join(' / '))
  check('弹窗有写入按钮', refluxTexts.includes('写入'))

  /* 选中态：显示的是这个 skill 自己的信息，不是一对给新建用的空输入框 */
  check('选中态显示该 skill 的简介', refluxTexts.some((t) => t.includes('验收用')), refluxTexts.filter((t) => t.includes('验收')).join(' / '))
  check('选中态显示参考资料', refluxTexts.some((t) => t.includes('参考资料')), refluxTexts.filter((t) => t.includes('资料')).join(' / '))
  const delConfirm = findByType(refluxBody, 'ConfirmButton')[0]
  check(
    '选中态有删除入口',
    !!delConfirm && String(delConfirm.props.label).includes('删除这个 skill'),
    delConfirm ? String(delConfirm.props.label) : '没有删除按钮',
  )
  check(
    '选中态不摆新建用的输入框',
    !refluxInputs.some((n) => String(n.props.placeholder || '').includes('连字符')),
    refluxInputs.map((n) => String(n.props.placeholder || '').slice(0, 16)).join(' / '),
  )

  /* 自动同步：开了之后记错题就顺手跟一次，这一栏要能看出来它开没开、上次跑成什么样 */
  const autoBoxes = refluxBody ? findByClass(refluxBody, 'dwb-pick') : []
  check('弹窗有自动同步开关', autoBoxes.length === 1, String(autoBoxes.length))
  const checkboxes = refluxBody ? findByClass(refluxBody, 'dwb-check') : []
  check(
    '开关的选中态跟着配置走',
    checkboxes.length === 1 && checkboxes[0].props.checked === true,
    checkboxes.length ? String(checkboxes[0].props.checked) : '没有复选框',
  )
  check(
    '显示上次同步的结果',
    refluxTexts.some((t) => t.includes('上次自动同步')),
    refluxTexts.filter((t) => t.includes('自动同步')).join(' / '),
  )

  /* 面板上就写明"只写自己的 skill"，不用点进来才知道 */
  check(
    '面板 hint 写明了回流范围',
    out.texts.some((t) => t.includes('回流只写你自己的 skill')),
    out.texts.filter((t) => t.includes('回流')).slice(0, 2).join(' / '),
  )

  /* 展开新建：名字、简介、示例三样都要有 */
  const newBtn = findByClass(refluxBody, 'dwb-btn').find((n) => n.children.join('').includes('新建一个'))
  check('有新建开关', !!newBtn)
  if (newBtn) {
    newBtn.props.onClick()
    const grown = refluxNode.type(findByType(renderOnce(), 'RefluxModal')[0].props)
    const grownTexts = textsOf(grown)
    const grownInputs = findByClass(grown, 'dwb-input')
    check(
      '展开后有名字和简介两个输入框',
      grownInputs.some((n) => String(n.props.placeholder || '').includes('连字符')) &&
        grownInputs.some((n) => String(n.props.placeholder || '').includes('Agent 靠这句')),
      grownInputs.map((n) => String(n.props.placeholder || '').slice(0, 14)).join(' / '),
    )
    check('展开后有示例按钮', grownTexts.includes('示例'), grownTexts.filter((t) => t.includes('示例')).join(' / '))
    check('展开后仍然说明名字必填', grownTexts.some((t) => t.includes('名字必填')), grownTexts.filter((t) => t.includes('必填')).join(' / '))

    const sampleBtn = findByClass(grown, 'dwb-btn').find((n) => n.children.join('') === '示例')
    check('示例按钮带说明', !!sampleBtn && String(sampleBtn.props.title || '').includes('算一句出来'), sampleBtn ? String(sampleBtn.props.title).slice(0, 40) : '没有 title')
    if (sampleBtn) {
      sampleBtn.props.onClick()
      const filled = refluxNode.type(findByType(renderOnce(), 'RefluxModal')[0].props)
      const descBox = findByClass(filled, 'dwb-input').find((n) => String(n.props.placeholder || '').includes('Agent 靠这句'))
      const got = descBox ? String(descBox.props.value) : ''
      check('示例按钮算出一句真简介', /已解决故障库|待解决的故障|的已解决故障/.test(got), got.slice(0, 60))
      check('算出来的简介带上了真实条目数', /踩过的 \d+ 个坑|：\d+ 条/.test(got), got.slice(0, 60))
      check('算出来的简介没留尖括号', !got.includes('<') && !got.includes('>'), got.slice(0, 60))
    }
    const collapseBtn = findByClass(refluxNode.type(findByType(renderOnce(), 'RefluxModal')[0].props), 'dwb-btn').find((n) =>
      n.children.join('').includes('收起'),
    )
    if (collapseBtn) collapseBtn.props.onClick()
  }
  // 关掉，别影响后面的断言。
  findByClass(refluxTree, 'dwb-btn')
    .filter((n) => n.children.join('') === '关闭')
    .forEach((n) => n.props.onClick())
  renderOnce()
  check('弹窗能关掉', !out.texts.some((t) => t.includes('同名的不会重复写')))
}

const rows = findByType(tree, 'CardRow')
check('卡列表三项', rows.length === 3, String(rows.length))
check(
  '人物卡错题页只列卡片分类',
  rows.every((n) => n.props.card.group === 'card'),
  rows.map((n) => `${n.props.card.name}[${n.props.card.group}]`).join('|'),
)
check(
  '卡列表带名字',
  rows.map((n) => n.props.card.name).join('|') === '测试卡A|测试卡A MVU版本|已删掉的卡',
  rows.map((n) => n.props.card.name).join('|'),
)
check('有图的卡走 img 分支', rows.map((n) => Boolean(n.props.card.avatar)).join(',') === 'true,false,false')
const chipsOf = (row) => findByClass(row.type(row.props), 'dwb-chip').map((n) => n.children.join(''))
check('原版卡标「原版」', chipsOf(rows[0]).includes('原版'), chipsOf(rows[0]).join('/'))
check('MVU 版标「MVU」', chipsOf(rows[1]).includes('MVU'), chipsOf(rows[1]).join('/'))
check('已不在目录的卡标「!」', chipsOf(rows[2]).includes('!'), chipsOf(rows[2]).join('/'))

/* 已不在卡片目录的分类：仍要能手动清掉 */
rows[2].props.onPick('cards/已删掉的卡.json')
renderOnce()
check('missing 的卡片分类给出删除入口', out.texts.includes('删除分类'), out.texts.filter((t) => t.includes('删除')).join(' / '))
check('missing 的卡片分类说明文件已不在', out.texts.includes('文件已不在卡片目录'), out.texts.filter((t) => t.includes('不在')).join(' / '))
check('条目区有自己的滚动容器', findByClass(tree, 'dwb-entries').length === 1, String(findByClass(tree, 'dwb-entries').length))
check('左栏分类列表也有滚动容器', findByClass(tree, 'dwb-list').length === 1)

/* 跨卡查询：三段都渲染得出来，而且各归各位 */
const searchBox = findByClass(tree, 'dwb-input').find((n) => String(n.props.placeholder || '').includes('跨卡查询'))
check('有跨卡查询输入框', !!searchBox)
if (searchBox) {
  searchBox.props.onChange({ target: { value: '状态栏' } })
  renderOnce()
  for (const fn of effects.slice()) fn()
  await new Promise((r) => setTimeout(r, 320))
  const lookupTree = renderOnce()
  check(
    '三段标题都渲染',
    out.texts.includes('① 本卡错题库') && out.texts.includes('② 其它错题') && out.texts.includes('③ 跨卡查询'),
    out.texts.filter((t) => /[①②③]/.test(t)).join(' / '),
  )
  const triEntries = findByType(lookupTree, 'EntryView')
  check('三段各出一条', triEntries.length === 3, String(triEntries.length))
  check('own 段是本分类的条目', triEntries.some((n) => n.props.entry.cardKey === 'cards/测试卡A.json'))
  check('other 段是其它错题的条目', triEntries.some((n) => n.props.entry.cardKey.startsWith('__other_')))
  check('cross 段是别的卡的条目', triEntries.some((n) => n.props.entry.cardKey === 'cards/测试卡B.json'))
}
const entries = findByType(tree, 'EntryView')
check('EntryView 收到本卡条目', entries.length === 1 && entries[0].props.entry.id === 'e_demo1', entries.map((n) => n.props.entry.title).join(','))

/** host 元素（div/button/input）的 type 是字符串，按 className 找比按类型找更直接。 */
function findByClass(node, cls, acc = []) {
  if (!node || typeof node !== 'object') return acc
  if (Array.isArray(node)) return node.reduce((a, n) => findByClass(n, cls, a), acc)
  const cn = node.props && node.props.className
  if (typeof cn === 'string' && cn.split(/\s+/).includes(cls)) acc.push(node)
  return findByClass(node.children, cls, acc)
}

/* 视图切换：三个页签 */
const tabs = findByClass(tree, 'dwb-tab')
check('渲染出四个页签', tabs.length === 4, String(tabs.length))
check('默认停在人物卡错题页', tabs[0] && tabs[0].props.className.includes('on'), tabs.map((n) => n.props.className).join('|'))
check(
  '页签文案正确',
  tabs.map((n) => n.children.join('')).join('|') === '人物卡错题|其它错题|卡脚本|备份与还原',
  tabs.map((n) => n.children.join('')).join('|'),
)
check('错题页渲染查询工具条', findByClass(tree, 'dwb-bar').length >= 1)
check('默认视图不渲染备份列表', findByClass(tree, 'dwb-backup').length === 0)

/* 其它错题页 */
tabs[1].props.onClick()
const otherTree = renderOnce()
const otherRows = findByType(otherTree, 'CardRow')
check(
  '其它错题页列出手建分类',
  otherRows.map((n) => n.props.card.name).join('|') === '卡片更新器|通用 / 未归类',
  otherRows.map((n) => n.props.card.name).join('|'),
)
check('其它错题页不再出现卡片分类', !otherRows.some((n) => n.props.card.group === 'card'))
check('其它错题页用本分类标题', out.texts.includes('① 本分类错题库'), out.texts.filter((t) => t.includes('①')).join(' / '))
check('其它错题页换成该组的提示语', out.texts.some((t) => t.includes('插件自身的更新链')), out.texts.filter((t) => t.includes('这里')).join(' / '))
check('其它错题页有新增分类按钮', out.texts.includes('新增分类'))
const otherTabs = findByClass(otherTree, 'dwb-tab')
check('其它错题页签高亮', otherTabs[1].props.className.includes('on') && !otherTabs[0].props.className.includes('on'))
check('其它错题页不渲染错题条目', findByClass(otherTree, 'dwb-entry').length === 0)

/* 卡脚本页 */
otherTabs[2].props.onClick()
renderOnce()
for (const fn of effects.slice()) fn()
await new Promise((r) => setTimeout(r, 80))
const scriptTree = renderOnce()
const scriptBlocks = findByType(scriptTree, 'CardScriptBlock')
// CardScriptBlock 和 CardRow 一样是函数组件元素，children 是空的 —— 要展开才看得到里面。
const rowsOf = (block) => findByType(block.type(block.props), 'ScriptRow')
check(
  '卡脚本页给出汇总',
  out.texts.some((t) => t.includes('共 2 张卡')),
  out.texts.filter((t) => t.includes('张卡')).join(' / '),
)
check('卡脚本页每张卡一块', scriptBlocks.length === 2, String(scriptBlocks.length))
check('卡脚本页列出脚本行', scriptBlocks.length === 2 && rowsOf(scriptBlocks[0]).length === 2, scriptBlocks.length ? String(rowsOf(scriptBlocks[0]).length) : '0')
check(
  '卡脚本页用该页自己的说明',
  out.texts.some((t) => t.includes('DSH 没有全局脚本槽')),
  out.texts.filter((t) => t.includes('脚本随卡')).join(' / '),
)
check('卡脚本页列出工具目录', out.texts.includes('工具目录里的脚本'))
check(
  '工具目录里能看到那个导出的脚本',
  out.texts.some((t) => t.includes('assistant-agent-v0.15')),
  out.texts.filter((t) => t.includes('async-agent')).join(' / '),
)

/* 备份页 */
const scriptTabs = findByClass(scriptTree, 'dwb-tab')
scriptTabs[3].props.onClick()
const backupTree = renderOnce()
const backupRows = findByClass(backupTree, 'dwb-backup')
check('备份页渲染出备份行', backupRows.length === 2, String(backupRows.length))
check('备份页显示条目数', out.texts.includes('1 条') && out.texts.includes('0 条'), out.texts.filter((t) => t.includes('条')).join(' / '))
check('备份页显示还原与删除按钮', out.texts.includes('还原') && out.texts.includes('删除'))
check('备份页显示当前数据概览', out.texts.some((t) => t.includes('data.json')) && out.texts.includes('13 KB'))
check('备份页不再渲染错题列表', findByClass(backupTree, 'dwb-entry').length === 0)
check('备份页有备份目录设置', out.texts.includes('备份目录'), out.texts.filter((t) => t.includes('目录')).join(' / '))
check('备份页显示当前备份路径', out.texts.some((t) => t.includes('wrongbook\\backups')))
check('备份页有选择文件夹入口', out.texts.includes('选择文件夹'))
check('默认目录不显示自定义标记', !out.texts.includes('自定义'))
check(
  '备份页给出插件安装自检',
  out.texts.some((t) => t.includes('插件安装正常')),
  out.texts.filter((t) => t.includes('安装')).join(' / '),
)
check('安装正常时不显示补回命令', findByClass(backupTree, 'dwb-pre').length === 0)

/* 备份目录的浏览弹窗：卡片更新器那一套，自己列目录、自己选 */
const pickBtn = findByClass(backupTree, 'dwb-btn').find((n) => n.children.join('') === '选择文件夹')
check('备份页有选择文件夹按钮', !!pickBtn)
if (pickBtn) {
  pickBtn.props.onClick()
  const browseTree = renderOnce()
  const modal = findByType(browseTree, 'BrowseModal')
  check('点一下就有浏览弹窗', modal.length === 1, String(modal.length))
  check(
    '弹窗以当前备份目录为起点',
    modal.length === 1 && modal[0].props.initialPath === STATE.paths.backupDir,
    modal.length ? modal[0].props.initialPath : '',
  )
  check(
    '弹窗能选也能关',
    modal.length === 1 && typeof modal[0].props.onPick === 'function' && typeof modal[0].props.onClose === 'function',
  )
}

/* 静态检查：Electron 渲染进程里 prompt 被禁用、confirm 行为不稳定，一律不用。
   注释里会提到这两个名字，所以只扫代码行。 */
const source = fs.readFileSync(SRC, 'utf8')
const code = source
  .split('\n')
  .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
  .join('\n')
check('源码不使用 window.prompt', !/window\s*\.\s*prompt/.test(code))
check('源码不使用 window.confirm', !/window\s*\.\s*confirm/.test(code))

let failed = 0
for (const r of results) {
  if (!r.ok) failed += 1
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}${r.extra !== undefined ? `  [${r.extra}]` : ''}`)
}
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
