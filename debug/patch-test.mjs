// 让纯 API 测试在超时时也能留下已经拿到的前台正文。
//
// 用法：
//   node data/tools/mvu-api-test/patch-test.mjs            # 看状态
//   node data/tools/mvu-api-test/patch-test.mjs --apply    # 应用（幂等，自动备份）
//   node data/tools/mvu-api-test/patch-test.mjs --revert   # 还原
//
// 背景：MVU 卡在纯 API 环境里后台结算必然被挂起 —— 宿主的注释写得很清楚，
// MVU 执行器是**浏览器侧**的能力，宿主只把事务持久化、等执行器注册：
//
//   if (availability && availability.ready !== true) {
//     return { updated: false, deferred: true, deferredReason: 'runtime-not-ready', ... }
//   }
//
// 于是 card-response-test 的收尾判据
//   settledTurn(...) → { ready: chat.settleStatus === 'done' && !reply.mvu?.pending }
// 永远不成立，轮询到 timeoutMs（默认 300 秒）后抛超时。
//
// 问题在于：前台生成本来已经成功了，正文也在手上，但写进 round 的代码在
// "满足收尾条件" 的分支里 —— 超时时 text 直接丢掉，只剩一句「测试超时」。
// 这让人误以为模型没干活，其实干完了。
//
// 这个补丁只在轮询里记一份最新的 result.text，并在 catch 里落进 round，
// 让超时记录里也带着正文。不改任何判据、不改超时长度。
import fs from 'node:fs'
import path from 'node:path'

const TARGET = 'C:/Users/213123543/.dsh/apps/dsh-tavern/tavern-plugin/lib/domain/card-response-test.js'
const BACKUP = TARGET + '.bak-mvu-api-test-partial'

const ORIG = `        const round = { round: index + 1, input, selection, status: 'running', refused: null }
        record.rounds.push(round)`

const PATCHED = `        const round = { round: index + 1, input, selection, status: 'running', refused: null }
        // 轮询期间留一份最新的前台正文。MVU 卡的后台结算在纯 API 下必然挂起
        // （执行器在浏览器侧），收尾判据永远不成立；但前台生成是成功的，
        // 超时时不该把已经拿到的正文丢掉。
        round._lastText = ''
        record.rounds.push(round)`

const ORIG2 = `          const result = nativeResult((await call('native')).events, afterSeq)
          if (result.ready) {`

const PATCHED2 = `          const result = nativeResult((await call('native')).events, afterSeq)
          if (result.ready && result.text) round._lastText = result.text
          if (result.ready) {`

const ORIG3 = `    } catch (error) {
      Object.assign(record, { status: controller.signal.aborted ? 'cancelled' : 'error', refused: null, evidence: signal.aborted && !controller.signal.aborted ? '测试超时' : String(error.message || error) })`

const PATCHED3 = `    } catch (error) {
      const timedOut = signal.aborted && !controller.signal.aborted
      // 超时时把已经收到的正文落进那一轮：前台是成功的，证据不该只剩一句超时。
      const running = record.rounds.filter((r) => r.status === 'running')
      for (const r of running) {
        if (r._lastText) Object.assign(r, { text: r._lastText, textNote: '测试超时，但前台正文已收到' })
      }
      Object.assign(record, { status: controller.signal.aborted ? 'cancelled' : 'error', refused: null, evidence: timedOut ? '测试超时（后台结算在纯 API 下不会完成；前台正文见 rounds[].text）' : String(error.message || error) })`

const args = process.argv.slice(2)
const mode = args.includes('--apply') ? 'apply' : args.includes('--revert') ? 'revert' : 'status'

if (!fs.existsSync(TARGET)) {
  console.log('找不到：' + TARGET)
  process.exit(1)
}

const read = () => fs.readFileSync(TARGET, 'utf8')
const write = (s) => fs.writeFileSync(TARGET, s, 'utf8')
const stateOf = (t) => (t.includes(ORIG) && t.includes(ORIG2) && t.includes(ORIG3) ? 'original' : t.includes('_lastText') ? 'patched' : 'unknown')

function report() {
  const st = stateOf(read())
  console.log('目标：' + TARGET)
  console.log('  状态：' + { original: '未打补丁（锚点齐全，可应用）', patched: '已打补丁', unknown: '⭐ 锚点没匹配上，宿主可能改过这段' }[st])
  if (st === 'patched') console.log('  → 超时记录里会带上前台正文。')
  return st
}

if (mode === 'status') {
  report()
  process.exit(0)
}

if (mode === 'apply') {
  const t = read()
  const st = stateOf(t)
  if (st === 'patched') {
    console.log('已经打过，不动。')
    process.exit(0)
  }
  if (st === 'unknown') {
    console.log('锚点没匹配上，拒绝改。')
    process.exit(1)
  }
  if (!fs.existsSync(BACKUP)) {
    fs.copyFileSync(TARGET, BACKUP)
    console.log('已备份 → ' + path.basename(BACKUP))
  }
  write(t.replace(ORIG, PATCHED).replace(ORIG2, PATCHED2).replace(ORIG3, PATCHED3))
  console.log('已应用。')
  report()
  process.exit(0)
}

if (mode === 'revert') {
  const t = read()
  if (!fs.existsSync(BACKUP)) {
    console.log('没有备份；用锚点原地还原。')
    write(t.replace(PATCHED, ORIG).replace(PATCHED2, ORIG2).replace(PATCHED3, PATCHED3))
  } else {
    write(fs.readFileSync(BACKUP, 'utf8'))
    console.log('已从备份还原。')
  }
  report()
  process.exit(0)
}
