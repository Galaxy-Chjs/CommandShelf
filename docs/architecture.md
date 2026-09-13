# CommandShelf 架构说明

本文说明 CommandShelf 的内部结构、关键取舍，以及为什么某些看起来"更常见"的做法在这里被放弃了。

---

## 1. 总览

```text
┌──────────────────────── Electron 主进程（Node 24） ─────────────────────────┐
│                                                                             │
│  index.ts        生命周期、单实例锁、按顺序创建各个部件                       │
│  context.ts      全局状态：数据库连接、设置、窗口引用                         │
│  windows.ts      主窗口 + 快捷面板窗口                                       │
│  shortcuts.ts    全局热键注册与冲突处理                                       │
│  tray.ts         托盘图标与菜单                                              │
│  protocol.ts     用 app:// 提供渲染层文件                                     │
│  ipc.ts          所有 IPC 通道，统一包成 Result<T>                            │
│                                                                             │
│  controller.ts   需要多个模块协作的操作：设置副作用、文件对话框、剪贴板          │
│                                                                             │
│  repo/           items · tags · collections · transfer · seed · fts          │
│  db/             node:sqlite 连接、迁移、事务                                 │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │ contextBridge · ipcRenderer.invoke
                                     │ 每个调用返回 Result<T>
┌────────────────────────────────────┴────────────────────────────────────────┐
│                      渲染层（React 19 + Tailwind CSS v4）                    │
│                                                                             │
│  index.html → App.tsx        侧边栏 · 结果列表 · 详情面板 · 编辑 · 设置        │
│  panel.html → QuickPanel.tsx 搜索 · 选择 · 填写参数 · 复制                    │
│                                                                             │
│  两者共用 src/shared/ 中的类型与纯函数，共用 components/ui.tsx 组件库          │
└─────────────────────────────────────────────────────────────────────────────┘
```

依赖方向是**无环**的，这是刻意的：

```text
context  ←  windows, shortcuts, tray  ←  controller  ←  ipc, index
```

`controller.ts` 是唯一同时了解窗口与热键的模块。把它单独拿出来，是为了避免
`windows ↔ shortcuts` 之间出现循环依赖——那种循环在 Electron 项目里很常见，也很容易
在重构时变成难以追踪的初始化顺序问题。

---

## 2. 为什么是 `node:sqlite` 而不是 `better-sqlite3`

`better-sqlite3` 是 Node 生态里最常用的同步 SQLite 绑定，但它是**原生模块**：

```text
需要针对 Electron 的 ABI 重新编译
Windows 上需要 Visual Studio Build Tools 与 node-gyp
需要 @electron/rebuild 参与构建
打包时需要 asar unpack，否则 .node 文件无法加载
Electron 版本较新而 prebuild 尚未覆盖时，构建直接失败
```

Electron 44 内置 Node 24，而 Node 24 自带 `node:sqlite`，其 SQLite 编译时启用了 FTS5。
实测可用（见 `docs/ACCEPTANCE.md` 中的探针输出），因此 CommandShelf 选择内置模块：

- `npm install` 不需要任何编译器
- 打包时不需要 unpack，产物更小
- API 与 `better-sqlite3` 高度相似（`DatabaseSync` / `prepare` / `run` / `get` / `all`）

代价是要求 Electron 版本足够新（Node ≥ 22.5），且 `node:sqlite` 仍被 Node 标记为
experimental，启动时会打印一条警告。这是本项目愿意接受的取舍。

---

## 3. 为什么渲染层通过 `app://` 提供，而不是 `loadFile`

把构建产物用 `file://` 加载会遇到两个问题：

1. `file://` 文档的 origin 是**不透明的**，因此
   `Content-Security-Policy: script-src 'self'` 匹配不到任何东西——它会静默地阻止
   应用自己的 bundle，页面只留下一个空的 `#root`，没有任何报错。
2. ES module 的加载在 file origin 下受额外限制。

`src/main/protocol.ts` 注册了一个 `standard`、`secure` 的自定义 scheme：

```text
app://commandshelf/index.html
app://commandshelf/panel.html
```

于是渲染层有了真实 origin，CSP 真正生效，模块加载也变成普通行为。
协议处理器会把请求路径 `normalize` 之后校验它仍在渲染层目录内，防止目录穿越。

---

## 4. IPC 的形状

### 4.1 统一返回 `Result<T>`

Electron 会把 handler 中抛出的错误替换成
`Error invoking remote method 'x': ...`，真正的消息往往丢失。因此每个 handler 都返回：

```ts
type Result<T> = { ok: true; data: T } | { ok: false; error: string }
```

包装发生在 `src/main/ipc.ts` 一处，仓库层完全不需要知道自己在通过 IPC 被调用。

### 4.2 白名单式 preload

`src/preload/index.ts` 是渲染层能力的**完整清单**。渲染层以
`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true` 运行，没有
"调用任意通道"的逃生口。

### 4.3 事件方向

主进程 → 渲染层只有三个事件：

| 事件                 | 用途                         |
| -------------------- | ---------------------------- |
| `event:focus-search` | 主窗口把焦点移到搜索框       |
| `event:panel-opened` | 快捷面板每次显示时重置状态   |
| `event:data-changed` | 任何写入之后，打开的视图刷新 |

---

## 5. 数据层

### 5.1 表结构

```text
items          条目本体，kind 取值受 CHECK 约束
collections    分类，条目通过 collection_id 关联（ON DELETE SET NULL）
tags           标签
item_tags      条目与标签的多对多
settings       键值对，值为 JSON
items_fts      FTS5 全文索引
```

迁移通过 `PRAGMA user_version` 版本化，每个迁移在**自己的事务**中执行，失败则整体回滚，
不会留下"升级到一半"的数据库。迁移只追加，已发布的迁移不再修改。

### 5.2 全文检索

`items_fts` 是一张普通的 FTS5 表（不是 external-content，也不是 contentless），
由仓库层显式维护。选择这种做法的原因：

- contentless 表需要 `INSERT ... VALUES('delete', ...)` 这种特殊写法才能删除，
  容易出错；
- external-content 表依赖触发器同步，触发器一旦漏掉某条写路径，索引就会静默失准。

代价是多存一份文本，收益是索引不会悄悄漂移。启动时 `ensureFtsConsistent()` 会比对
条目数与索引行数，不一致就重建。

索引里除了 `title` 和 `body`，还拼进了**标签名与分类名**。它们对 FTS 而言只是一串词，
放在同一个字段里即可让 `ssh` 同时命中 `#ssh` 和「服务器」分类。

查询策略由 `planText()` 决定：

```text
纯 ASCII 查询 → FTS5 前缀词 + bm25 排序，并附加 LIKE 子串匹配作为兜底
含中日韩字符   → 逐词的 LIKE 子串匹配（AND）
```

中文回退是必要的：FTS5 的 `unicode61` 分词器不会切分中文词，
`"端口"*` 匹配不到「端口转发」。回退到 `LIKE %端口%` 才是正确行为。

模板变量用 `{{name}}` / `{{name=default}}` 表示，解析是
`src/shared/template.ts` 里的纯函数，两个进程共用，并被单独单元测试覆盖。

### 5.3 事务可嵌套

`transact()` 支持嵌套：最外层开启真正的 `BEGIN IMMEDIATE`，内层使用 `SAVEPOINT`。
这样"一个自带事务的仓库函数被另一个事务调用"不会抛
`cannot start a transaction within a transaction`，内层失败也只回滚内层。

嵌套深度记录在 `WeakMap<DatabaseSync, number>` 中，而不是模块级变量——测试会同时打开
多个数据库，深度必须属于某一个连接。

---

## 6. 渲染层

### 6.1 两个入口，一个组件库

`index.html` 与 `panel.html` 是两个独立的 Vite 入口，各自挂载
`App.tsx` 与 `QuickPanel.tsx`。它们共用：

- `lib/api.ts` 中的 preload 桥接（用 `Proxy` 惰性解析 `window.commandShelf`，因此测试可以
  替换桥接而不必重新导入模块）
- `hooks/useLibrary.ts` 中的数据加载（带请求序号，慢响应不会覆盖新结果）
- `components/ui.tsx` 中的基础组件
- `shared/` 中的纯逻辑

快捷面板不等待主窗口的 React 树，因此呼出时没有额外延迟；面板窗口在应用启动时就创建好
但保持隐藏，同样是为了避免首次按下热键时临时创建 `BrowserWindow` 带来的可见延迟。

### 6.2 键盘处理集中在一处

主窗口的所有快捷键都在 `App.tsx` 的一个 `window` 监听器中处理，保证无论焦点在哪个面板
行为都一致。规则：

- 文本框获得焦点时，单字母快捷键（`N` `E` `B` `Del`）不生效，避免输入查询词时误触发；
- 但 `↑` `↓` `Enter` **在搜索框中也生效**，这样"输入 → 选择 → 复制"全程不需要离开键盘；
- 对话框打开时，方向键与回车交还给表单。

### 6.3 复制后的计数

`items:mark-used` 有意**不**广播 `data-changed`：复制一条内容会让「最近使用」排序变化，
如果此时刷新列表，用户眼前的列表会在光标下重排。取而代之的是让调用方用返回的条目就地
更新那一行（`useLibrary().patchItem`），计数保持诚实，列表不动。

---

## 7. 安全基线

| 项                        | 取值                                                          |
| ------------------------- | ------------------------------------------------------------- |
| `contextIsolation`        | `true`                                                        |
| `nodeIntegration`         | `false`                                                       |
| `sandbox`                 | `true`                                                        |
| 渲染层来源                | 仅 `app://commandshelf/*`（生产）或 Vite dev server（开发）   |
| `Content-Security-Policy` | `default-src 'self'`，禁止内联脚本、禁止 object、禁止表单提交 |
| 导航                      | 一律阻止；http(s) 链接交给系统浏览器                          |
| 远程内容                  | 从不加载                                                      |

应用不发起任何网络请求，没有更新器、没有遥测、没有账号。

---

## 8. 目录结构

```text
src/
├── main/
│   ├── index.ts          入口：生命周期与单实例
│   ├── context.ts        数据库连接、设置、窗口引用
│   ├── windows.ts        主窗口与快捷面板
│   ├── shortcuts.ts      全局热键
│   ├── tray.ts           托盘
│   ├── protocol.ts       app:// 协议
│   ├── ipc.ts            IPC 通道注册
│   ├── controller.ts     跨模块操作
│   ├── assets/tray.ts    由脚本生成的托盘图标（base64）
│   ├── db/               connection · migrations
│   └── repo/             items · tags · collections · settings · transfer · seed · fts · ids
├── preload/index.ts      白名单桥接
├── renderer/
│   ├── index.html       主窗口
│   ├── panel.html       快捷面板
│   └── src/             App · QuickPanel · components · features · hooks · lib · test
└── shared/              types · ipc · template · search · kinds · format
```

---

## 9. 构建与发布

| 命令                                           | 作用                                                 |
| ---------------------------------------------- | ---------------------------------------------------- |
| `npm run dev`                                  | electron-vite 开发模式，两个渲染层都热更新           |
| `npm run build`                                | 类型检查 + 打包到 `out/`                             |
| `npm run dist:win` / `dist:linux` / `dist:mac` | electron-builder 生成安装包到 `release/`             |
| `npm run smoke:packaged`                       | 用 Playwright 启动打包后的可执行文件并做一次真实操作 |
| `npm run icons`                                | 重新生成图标（纯 Node，无图像依赖）                  |

`out/` 中已经包含了渲染层的全部产物，主进程只依赖 Electron 与 Node 内置模块，因此
electron-builder 配置里 `npmRebuild: false`，也不需要打包任何 `node_modules`。

CI（`.github/workflows/ci.yml`）在 Linux 上跑 lint、类型检查、单元测试与文档链接检查，
在 Windows 上跑端到端测试——端到端测试要驱动真实的 Electron 二进制，需要能真正开窗口的
运行环境。

发布（`.github/workflows/release.yml`）在 tag 上构建三平台产物，并在 Windows 上先运行
打包冒烟测试，再创建 GitHub Release。
