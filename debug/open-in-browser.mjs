// 在真实浏览器里对**已经开着的一局**发一条消息并回读结果。
//
// 用法：node tools/mvu-api-test/open-in-browser.mjs [输入] [等待秒数]
//   例：node tools/mvu-api-test/open-in-browser.mjs "（开局）" 200
//
// 为什么不做"选卡 → 开始游戏"那两步：封面页的「开始游戏」按钮由卡自带 HTML 里的
// 脚本控制，headless 下启用时机不稳定（依赖检测显示全部就绪、控制台无报错，但按钮
// 长时间保持 disabled）。而那两步对验证卡本身没有价值 —— 真正要看的是开局之后。
//
// 所以这个脚本假设：界面上已经有一局开在游玩界面。它只做三件事 ——
// 往输入区发一条消息、等生成、把结果读回来。**不改任何卡文件。**
//
// 界面结构（2026-09-26 实测）：
//   主页面（DSH 外壳）里有一个 iframe[title="人物卡消息界面"]，Tavern 的
//   游玩界面就在这个 iframe 里。主页面自己的 contenteditable 是 DSH 的对话输入框，
//   抓错了会点不动（指针被 iframe 挡住）。
import { createRequire } from 'node:module'

const require = createRequire('file:///C:/Users/213123543/.dsh/apps/dsh-tavern/node_modules/')
const { chromium } = require('playwright')

const BASE = process.env.DSH_WEB_URL || 'http://127.0.0.1:43120'
const COOKIE_NAME = process.env.DSH_AUTH_COOKIE_NAME || 'dsh-auth-u1zJcETw8Q74Kp2rKDFmtGK4upxaWlNqc-TTM_793dg'
const COOKIE_VALUE =
  process.env.DSH_AUTH_COOKIE_VALUE ||
  'v1.eyJ2ZXJzaW9uIjoxLCJhdXRob3JpdHkiOiIxMjcuMC4wLjE6NDMxMjAiLCJpc3N1ZWRBdCI6MTc5MDQzNDIyNDQ5OCwiZXhwaXJlc0F0IjoxNzkzMDI2MjI0NDk4fQ.SWpp3Lu26dKuexIrT_sL1S-oexSSlquvup5sD7SquY8'

const OPENING = process.argv[2] || '（开局）'
const WAIT_S = Number(process.argv[3] || 240)

const log = (m) => console.log('· ' + m)

const browser = await chromium.launch({
  headless: process.env.DSH_HEADFUL !== '1',
  channel: 'msedge',
  // 卡内脚本常要音频上下文；headless 默认拦掉"无用户手势的音频"。
  args: ['--autoplay-policy=no-user-gesture-required'],
})
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } })
await context.addCookies([
  { name: COOKIE_NAME, value: COOKIE_VALUE, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Strict' },
])
const page = await context.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)))

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 25000 })
await page.waitForTimeout(5000)
log('已打开')

// 有真实手势，脚本更容易就绪
await page.mouse.move(700, 450)
await page.mouse.click(700, 450)
await page.waitForTimeout(1500)

const CARD = process.argv[4] || '' // 可选：从「游玩历史」里进入指定卡的对局

/*
 * web 界面跟主窗口**各自持有自己的会话** —— 在主窗口开的局，web 这边看不到。
 * 所以不能靠"用户开好了我接着用"，得由脚本自己从「游玩历史」点进去。
 * 历史里的对局是持久化的，点开就进游玩界面。
 */
if (CARD) {
  let head = page.locator(`text=${CARD}`).first()
  if (!(await head.count())) {
    // 可能已展开过，换个更宽松的匹配
    head = page.locator(`text=${CARD.slice(0, 10)}`).first()
  }
  if (await head.count()) {
    await head.click({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(2500)
    log('已展开「' + CARD + '」的历史')
    // 点第一条对局（带「故事」标签 + 时间戳的那行）
    const row = page.locator('text=故事').first()
    if (await row.count()) {
      await row.click({ timeout: 8000 }).catch(() => {})
      await page.waitForTimeout(6000)
      log('已点开最近一局')
    } else {
      log('展开后没看到对局行')
    }
  } else {
    log('历史里没有这张卡：' + CARD)
  }
}

// 用 tabpanel 限定：切换对局时旧的 iframe 不会立刻销毁，页面上会同时存在两个
// 同名 iframe，裸选择器会命中多个（strict mode violation）。tabpanel 里那个才是当前这一局。
const frame = page.getByRole('tabpanel').locator('iframe[title="人物卡消息界面"]')

/*
 * 关键：**先等 iframe 里真的出现内容**，再去找输入区。
 *
 * 之前的判定是"能不能找到 input"，但进入游玩界面是异步的 —— iframe 元素可能已经
 * 挂上、内容还是空的，这时找 input 必然失败，脚本就退回主页面抓 DSH 的输入框，
 * 于是"发送成功"而界面文本始终 0 字。先确认 it 有内容，是更靠得住的就位信号。
 */
let frameReady = false
for (let i = 0; i < 60; i += 1) {
  const n = (await frame.locator('body').innerText().catch(() => '')).length
  if (n > 80) {
    frameReady = true
    log('游玩界面已就位（iframe 文本 ' + n + ' 字）')
    break
  }
  if (i === 0) log('等游玩界面就位…')
  await page.waitForTimeout(1000)
}
if (!frameReady) {
  console.log('✗ 等了 60 秒，Tavern 的 iframe 里始终没有内容 —— 没有进到游玩界面。')
  console.log('  主页面可见文本：')
  console.log((await page.locator('body').innerText().catch(() => '')).slice(0, 700))
  await browser.close()
  process.exit(1)
}

// 1) 输入区：**先在 Tavern 的 iframe 里找**，别抓主页面那个 DSH 输入框。
const pickInput = async () => {
  for (const [sel, where] of [
    ['textarea', 'iframe textarea'],
    ['[contenteditable=true]', 'iframe contenteditable'],
  ]) {
    const els = await frame.locator(sel).all()
    if (els.length) return { el: els[els.length - 1], where }
  }
  const main = await page.locator('textarea:visible, [contenteditable=true]:visible').all()
  if (main.length) return { el: main[main.length - 1], where: '主页面（可能抓错）' }
  return null
}

let picked = null
for (let i = 0; i < 30 && !picked; i += 1) {
  picked = await pickInput()
  if (!picked) await page.waitForTimeout(1000)
}
if (!picked) {
  console.log('✗ 找不到输入区 —— 界面上可能没有开着的对局。')
  console.log('  当前可见文本：')
  console.log((await page.locator('body').innerText().catch(() => '')).slice(0, 600))
  await browser.close()
  process.exit(1)
}
log('找到输入区（' + picked.where + '）')

const before = (await frame.locator('body').innerText().catch(() => '')).length
log('发送前 iframe 文本 ' + before + ' 字')

// 2) 输入并发送
await picked.el.click({ timeout: 10000 })
await picked.el.fill(OPENING).catch(async () => await picked.el.type(OPENING, { delay: 25 }))
await page.waitForTimeout(600)
await page.keyboard.press('Enter')
log('已发送：' + OPENING)

// 3) 等生成：文本长度增长且稳定下来
console.log('')
const t0 = Date.now()
let last = before
let stable = 0
while ((Date.now() - t0) / 1000 < WAIT_S) {
  await page.waitForTimeout(5000)
  const n = (await frame.locator('body').innerText().catch(() => '')).length
  stable = n === last ? stable + 1 : 0
  last = n
  const s = Math.round((Date.now() - t0) / 1000)
  if (s % 30 < 6) console.log('   ' + s + 's  iframe 文本 ' + n + ' 字（稳定 ' + stable + '）')
  if (n > before + 1200 && stable >= 3) break
}

const out = await frame.locator('body').innerText().catch(() => '')
console.log('')
console.log('用时 ' + Math.round((Date.now() - t0) / 1000) + ' 秒 · 最终文本 ' + out.length + ' 字')
console.log('')
console.log('=== 界面文本末尾 4500 字 ===')
console.log(out.slice(-4500))
if (pageErrors.length) {
  console.log('')
  console.log('页面错误 ' + pageErrors.length + ' 条：')
  for (const e of pageErrors.slice(0, 8)) console.log('  · ' + e)
}
await page.screenshot({ path: 'C:/Users/213123543/.dsh/profile-data/tavern/data/tools/_run.png' })
console.log('')
console.log('截图：tools/_run.png')
await browser.close()
