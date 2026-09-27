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
| `scan-parent-window.mjs` | 找**经 `TavernHelper` 命名空间**取宿主接口的卡（`TavernHelper.generate` 这类） |
| `scan-window-calls.mjs` | 找**在跨层 window 上直接调**宿主接口的卡（`topWin.createChatMessages` 这类） |

**后两个是一对，缺一会漏一半** —— 卡取宿主接口有两条路径，只扫命名空间那条抓不到直接调 window 的。实测全库只有两张卡会这么做：龙娘回廊（经 `TavernHelper`）和艹🐎大作战（经 `topWin.createChatMessages`）。

**`scan-window-calls.mjs` 的识别条件要收紧**：第一版把所有 `let X = …window.parent…` 的 X 都当窗口别名，于是压缩代码里的单字母局部变量（`e` / `n` / `r` / `t`）全被算进来，接着 `get()` / `set()` / `replace()` 这类**每个对象都有的方法**涌进来，**一张卡报了 33 个假缺口**。现在要求变量名 ≥3 字符且含窗口语义（`parent` / `top` / `win` / `frame` / `host` / `outer` / `root`）。

**通用一条**：静态扫"跨作用域取全局"时，**变量名识别宁紧勿松**。松了会被通用方法名冲垮判据；紧一点最多漏几个，而漏掉的可以靠"读那张卡取 helper 的原文"补回来。

**为什么留了三个版本**：它们是同一条排查思路的迭代记录。`scan-host-api.mjs` 会误报（把卡自己的函数算成缺口），`scan-host-api2.mjs` 会漏报（`typeof TavernHelper.generate` 这种写法扫不到）。**改判据的代价看得见，比只留最后一个版本更有参考价值。**

## 宿主补丁

补丁改的是 `apps/dsh-tavern/` 下的宿主文件，**都需要重启 DSH 生效**。无参数运行 = 查状态；`--apply` 应用；`--revert` 还原。**全部幂等、自动备份**。

**⚠ 改 `lib/` 会被 build 覆盖。** `lib/client.js` 是 `src/client/*.js` 的编译产物，宿主有 `check:client` 比对两者（`package.json` 里是 `prepublishOnly` 与所有 e2e 的前置）。**只在 `lib/` 上打补丁会让它被判"已过期"** —— 这正是"补丁报告成功、语法也过、也重启了，功能却不生效"的根源，曾为此绕了六轮。

### 一键重打（推荐）

```bash
node debug/patch-all.mjs          # 只查状态
node debug/patch-all.mjs --apply  # 缺的自动重打
# 之后重启 DSH
```

**面板上也有入口**：设置 → 错题库 → **宿主补丁** 页签，里面有「一键重打宿主补丁」「检查补丁状态」两个按钮，以及一份**按"服务于谁"分组的清单**（哪个补丁服务于哪张卡）。

### 其实不用手动跑 —— 插件启动时会自己检查

`dsh-wrongbook` 的 host half 在加载后**异步跑一次 `patch-all.mjs --apply`**（幂等：没缺失就一个字节都不改）。它住在 `.dsh/plugins/` 下，**DSH 升级碰不到它**，所以由它来照看宿主文件。

- 一切就绪 → 日志一行 `宿主补丁已就位`；
- 刚补过 → 日志 `⚠ 宿主补丁缺失，已自动补齐 —— 重启 DSH 后生效`，面板那行也会跟着变；
- **限制**：补丁改的是**宿主文件**，而插件是在这些文件已被读进内存之后才跑的 —— **本次启动补上、下次启动生效**。

面板页签顶部会显示带时间戳的结果（`✓ 本次启动已自动检查：全部就位（13:25:41）`），**"补丁还在不在"因此有一个看得见的答案**，不用手动点一次才知道。

### 顺序不是装饰

`patch-all.mjs` 自己处理依赖顺序，但手动跑时要注意：

| 顺序 | 脚本 | 改哪里 |
| --- | --- | --- |
| **1** | `patch-src.mjs` | `src/client/main.js` + `src/client/opening-preview.js`（**八处**） |
| **2** | `bin/build-tavern-client.mjs` | 重建 `lib/client.js` —— **会覆盖 `lib/` 上的一切直接注入** |
| **3** | `patch.mjs` | `lib/domain/tavern-helper-scripts.js` |
| **4** | `patch-test.mjs` | `lib/domain/card-response-test.js` |

**创意工坊的域名例外已经并入 `patch-src.mjs`（⑦⑧）**，不再单独跑 —— 它原来改 `lib/client.js`，让 `check:client` 永远报"已过期"（src 有改动、lib 多出源码里没有的东西，两者必然对不上）。**别再去跑 `workshop-direct/patch.mjs`**，那样会把状态弄回不一致。

### 各补丁的作用

| 脚本 | 改的文件 | 作用 |
| --- | --- | --- |
| `patch-src.mjs` | `src/client/*.js`（**源码，八处**） | ① 消息 iframe 的四个 helper；②③ 同层的 `generate`；④⑤ facade 清单与 `window.generate`；⑥ 开场预览层；⑦⑧ 创意工坊域名例外 |
| `verify-srcpatch.mjs` | —— | 断言八处同时进了源码和产物、**三处 `generate` 包装的归一化数量正确**（main.js 2 处、opening-preview.js 1 处）、旧 lib 标记已清除 |
| `workshop-direct/patch.mjs` | `lib/client.js` | 创意工坊域名直连（否则 Build / 人设 / 拓展 / 世界书 都是空的） |
| `patch.mjs` | `domain/tavern-helper-scripts.js` | 放开 MVU 卡（卡内无脚本的）的纯 API 测试 |
| `patch-test.mjs` | `domain/card-response-test.js` | 超时记录里保留前台正文 |
| `patch-card-generate.mjs` | **卡内脚本** | 给龙娘回廊补 `generate` 并适配宿主的 `ordered_prompts` 契约；**不受升级影响**。判据是"接管 + 自有标记"（`__dshNormalized`），不是"存在就不管" —— 见下节 |
| ~~`patch-frame-helper.mjs`~~ | ~~`lib/client.js`~~ | **已退役** —— 六处补丁住进 `src/` 后由 build 带进 `lib/`，它的旧标记检测会误报「只打了一半」，属正常，别去"修" |
| ~~`workshop-direct/patch.mjs`~~ | ~~`lib/client.js`~~ | **已退役** —— 域名例外并入 `patch-src.mjs` 的 ⑦⑧。跑它会让 `check:client` 重新报"已过期" |

### 三处 `generate` 包装必须一致

宿主的 `generateRaw` 是**显式编排契约**（`lib/domain/helper-generation.js`）：只认 `ordered_prompts` / `user_input` / `max_chat_history` / `should_stream` / `should_silence` / `overrides` / `generation_id`，**没有 `prompt`**，且 `ordered_prompts` 必填非空。

所以每个把 ST 风格 `generate(prompt, options)` 映射过去的包装都要做两步归一化：

```js
if (cfg.prompt !== undefined) { if (cfg.user_input === undefined) cfg.user_input = cfg.prompt; delete cfg.prompt; }
if (!Array.isArray(cfg.ordered_prompts) || !cfg.ordered_prompts.length) cfg.ordered_prompts = ["user_input"];
```

**而这样的包装有三份**（各跑在不同的 frame，没法合并）：

| # | 位置 | 谁读它 |
| --- | --- | --- |
| ① | `src/client/main.js` 的 `tavernHelperScriptBootstrap`（`genNorm`） | 消息 iframe 里的脚本 |
| **⑤** | **`src/client/main.js` 的 `installTavernHelperFacade`** | **卡内脚本（经 `window.parent`）** |
| ⑥ | `src/client/opening-preview.js` 的 `installOpeningPreviewBridge` | 开场预览 |

**改了一份而漏了另两份，症状会变成"下一层的错"** —— 提示从「API 不可用」变成「需要显式 ordered_prompts」，看起来像前进了一步。**改完一定数一遍命中数**：

```bash
grep -c "config.ordered_prompts =" apps/dsh-tavern/tavern-plugin/src/client/main.js            # 期望 2
grep -c "config.ordered_prompts =" apps/dsh-tavern/tavern-plugin/src/client/opening-preview.js # 期望 1
```

（`verify-srcpatch.mjs` 和 `patch-all.mjs` 都把这两项算进判据了。）

**状态判读**：

- 「未打补丁（锚点齐全，可应用）」→ 直接 `--apply`；
- 「已打补丁」→ 不用动；
- 「⚠ 只打了一半」→ `--apply` 补齐；
- 「⭐ 锚点没匹配上」→ **停下来看**，宿主那段代码变了，锚点要重找。**别强行改。**

### 每次 DSH 升级后都要重跑

**补丁改的是宿主文件，升级是整份替换 —— 升级后补丁必然失效。** 而且是**静默失效**：不报错，功能悄悄回到补丁前，很容易被当成「升级引入的 bug」。**实测已发生三次。**

判据不是版本号。实测遇到过两次都是 `2.3.0`、只有 commit 变了（`64e721b` → `674a554d`），光看 `package.json` 发现不了。**跑 `patch-all.mjs` 看状态最快。**

**例外**：`patch-card-generate.mjs` 改的是**卡**，升级碰不到 —— 这正是"能修在卡里就别修在宿主里"的理由。

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
