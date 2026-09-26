# debug

调试 DSH Tavern 时写的一批小脚本。它们不属于插件本体，是**排查工具** —— 读游玩证据、扫全库找同类问题、给宿主打补丁。

**每个脚本里都有硬编码的绝对路径**（`C:/Users/213123543/...`）。它们是按当前这台机器的目录结构写的，**换机器要改路径才能跑**。这点是刻意的：与其做一套参数化配置，不如让路径显式躺在文件顶部、一眼可见。

## 读游玩证据

一局游玩结束后，落盘在 `data/chats/<chatId>/`：

- `journals/NNNNNNNNNNNN-open.jsonl` —— 事件流。每一步操作、每次变量落库、每次渲染捕获都在这里；
- `snapshots/*.json.gz` —— 完整快照。

| 脚本 | 用途 |
| --- | --- |
| `read-journal.mjs <chatId>` | 事件流、MVU 初始化状态（`openingInitialization.completedAt` / `status`）、变量落库情况、`stat_data` 结构、脚本执行证据。省略 chatId 则读最近一局 |
| `read-display.mjs <chatId>` | 展开 `display.capture`：每次渲染的 `panelId` / `placement` / `dom` / `network` / `errors` |
| `find-bad-img.mjs <chatId>` | 归类失败的资源与网络请求。用来区分「真加载失败」和「空 `src` 被解析成当前页地址」 |

**判读要点**：`tavern-helper.*` 事件数回答的是「脚本做了什么」，`display.capture` 回答的是「界面变成了什么」。**两者合起来才能回答「脚本跑了没有」** —— 界面类脚本天然不产生 `tavern-helper.variables`。

## 扫全库找同类问题

| 脚本 | 用途 |
| --- | --- |
| `scan-host-api.mjs` | 第一版：找卡内脚本用了、但环境给不出的宿主 API |
| `scan-host-api2.mjs` | 加了「剔除卡自有定义」—— `window.x =` 声明过的函数不算缺口 |
| `scan-host-api3.mjs` | **用这个**。按「引用」匹配而不是「调用」匹配，并且区分 `TavernHelper.x`（永远是宿主转发）与 `window.x`（可能是卡自有） |
| `scan-legacy-protocol.mjs` | 找「宿主有 `状态更新规则`、但旧的正文协议条目还在启用」的卡 —— 那种卡每轮同时收到两套相反指令 |

**为什么留了三个版本**：它们是同一条排查思路的迭代记录。`scan-host-api.mjs` 会误报（把卡自己的函数算成缺口），`scan-host-api2.mjs` 会漏报（`typeof TavernHelper.generate` 这种写法扫不到）。**改判据的代价看得见，比只留最后一个版本更有参考价值。**

## 宿主补丁

三个补丁都改 `apps/dsh-tavern/tavern-plugin/lib/` 下的宿主文件，**都需要重启 DSH 生效**。

无参数运行 = 查状态；`--apply` 应用；`--revert` 还原。**全部幂等、自动备份**。

| 脚本 | 改的文件 | 作用 |
| --- | --- | --- |
| `patch.mjs` | `domain/tavern-helper-scripts.js` | 放开 MVU 卡（卡内无脚本的）的纯 API 测试 |
| `patch-test.mjs` | `domain/card-response-test.js` | 超时记录里保留前台正文（否则只看到超时、看不到正文） |
| `patch-frame-helper.mjs` | `client.js` | 给 iframe 补 `generate` / `generateRaw` / `injectPrompts` / `getCharWorldbookNames` |

**状态判读**：

- 「未打补丁（锚点齐全，可应用）」→ 直接 `--apply`；
- 「已打补丁」→ 不用动；
- 「⚠ 只打了一半」→ `--apply` 补齐；
- 「⭐ 锚点没匹配上」→ **停下来看**，宿主那段代码变了，锚点要重找。**别强行改。**

### 每次 DSH 升级后都要重跑

**补丁改的是宿主文件，升级是整份替换 —— 升级后补丁必然失效。** 而且是**静默失效**：不报错，功能悄悄回到补丁前，很容易被当成「升级引入的 bug」。

判据不是版本号。实测遇到过两次都是 `2.3.0`、只有 commit 变了（`64e721b` → `674a554d`），光看 `package.json` 发现不了。**看目标文件的修改时间，或者直接跑三个脚本的状态检查。**

### 补 helper 要看清补哪一层

卡内脚本调宿主走的是 **postMessage RPC**，中间有 shim：

```
卡内脚本 → window.TavernHelper.xxx
             ↑ ③ iframe shim —— 属性是 getter：get: () => window[name]
             ↓ transport.request(method, args)
          ② 宿主白名单 allowedMethods（12 个 method，不在名单里静默丢弃）
             ↓
          ① 实现
```

**宿主有实现 ≠ 脚本能调到。** 三种缺口要分清：

| 情况 | 处理 |
| --- | --- |
| 名字在 iframe 清单里、`window.xxx` 没定义 | 只补 `window.xxx`，getter 自然读到 |
| 名字**不在**清单里（如 `generate`） | **先往清单加名字，再补 `window.xxx`** —— 少一步，`TavernHelper.generate` 连属性都不存在 |
| 宿主压根没实现（如 `generate` 的完整管线） | 要新加 RPC，不是补 shim |

**⚠ 有两个 `TavernHelper` 组装点**：主页面的（`helperNames`，逗号后有空格）和 iframe 的（在 `interactiveHelperShim` 字符串里，紧凑格式）。**卡内脚本读的是 iframe 那份** —— 改错地方会「状态显示已打补丁、但功能依然不可用」，很难察觉。

## 浏览器自动化

`open-in-browser.mjs` —— 用 Playwright 驱动 web 界面（`127.0.0.1:43120`）跑一局，绕开 `tavern_test_response` 在纯 API 下等不到结算的问题。

需要 DSH web 的**认证 cookie**（`HttpOnly`，只能从 DevTools 拿），通过 `DSH_AUTH_COOKIE_NAME` / `DSH_AUTH_COOKIE_VALUE` 传入。默认 headless，`DSH_HEADFUL=1` 看过程。

**已知不稳**：从「游玩历史」进对局那一步的 selector 不够可靠。
