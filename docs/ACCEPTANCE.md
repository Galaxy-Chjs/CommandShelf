# CommandShelf 验收记录

这份文档记录的是**实际运行过的验证**，不是计划。每一条都对应一次真实执行，命令与结果一并列出。

执行环境：

```text
OS           Windows 11 (10.0.26100)
Node.js      v24.11.1
npm          11.6.4
Electron     44.3.0 (bundled Node 24.20.0, Chromium 152)
```

---

## 1. 技术选型验证：`node:sqlite` 与 FTS5

在写任何业务代码之前，先验证 Electron 内置的 SQLite 是否可用，因为整个数据层的选型都
取决于它。

**探针**（`probe.mjs`，验证后删除）：

```js
import { app } from 'electron'
const sqlite = await import('node:sqlite')
const db = new sqlite.DatabaseSync(':memory:')
db.exec('CREATE TABLE t (a TEXT)')
db.prepare('INSERT INTO t VALUES (?)').run('hello 中文')
db.exec('CREATE VIRTUAL TABLE f USING fts5(title, body)')
db.prepare('INSERT INTO f VALUES (?, ?)').run('ssh tunnel', 'ssh -L 8080:localhost:80 box')
```

**结果**：

```json
{
  "electron": "44.3.0",
  "node": "24.20.0",
  "chrome": "152.0.7977.78",
  "nodeSqlite": "available",
  "nodeSqliteRoundTrip": "hello 中文",
  "fts5": "available"
}
```

**结论**：`node:sqlite` 与 FTS5 均可用，因此放弃 `better-sqlite3`，项目零原生依赖。
副作用是启动时会打印一条 `ExperimentalWarning: SQLite is an experimental feature`。

---

## 2. 遇到并修复的真实问题

以下每一项都是开发过程中实际触发过的失败，记录下来是因为它们解释了代码里一些看起来
"多此一举"的写法。

### 2.1 `file://` 下 CSP 会静默阻止应用自己的 bundle

**现象**：窗口能打开，`#root` 为空，没有任何报错。

**原因**：`file://` 文档的 origin 是不透明的，`script-src 'self'` 匹配不到任何资源，
ES module 也无法加载。

**修复**：`src/main/protocol.ts` 注册 `standard` + `secure` 的 `app://` scheme，
渲染层获得真实 origin，CSP 真正生效。

### 2.2 Prism 在打包环境下抛错

**现象**：`Cannot set properties of undefined (setting 'class-name')`，面板白屏。

**原因**：Prism 的语言模块依赖 `window.Prism` 这个全局变量，在打包后的模块求值顺序下
会出现语法对象尚未初始化就被扩展的情况。

**修复**：改用 highlight.js，它有真正的 ES module 导出，注册顺序显式，没有全局状态。

### 2.3 SQL 里的 `\u0000` 会截断语句

**现象**：导入示例数据时报 `unrecognized token: "'"`。

**原因**：用 `kind || '\u0000' || title || ...` 构造去重指纹时，JS 模板串把 `\u0000`
变成了真正的 NUL 字符，SQLite 以 C 字符串解析 SQL，语句在 NUL 处被截断，引号因此不闭合。

**修复**：两端统一改用 `char(31)`（JS 侧写作 `\u001f`），并抽出常量与注释说明它必须
两侧一致，否则去重会静默失效。

### 2.4 `transact` 不能嵌套

**现象**：`cannot start a transaction within a transaction`。

**原因**：仓库层每个写函数都自带事务，一旦被另一个事务包裹就冲突。

**修复**：`transact` 改为支持嵌套——最外层 `BEGIN IMMEDIATE`，内层 `SAVEPOINT`，
深度记在 `WeakMap<DatabaseSync, number>` 中。测试覆盖了嵌套提交与"内层回滚不影响外层"。

### 2.5 表单 `<label>` 没有关联控件

**现象**：组件测试中 `getByLabelText('local_port（默认 8888）')` 找不到输入框。

**原因**：`Field` 组件渲染了 `<label>`，但既没有 `htmlFor` 也没有包裹控件，标签和输入框
在可访问性树上毫无关系——点击标签不会聚焦输入框，屏幕阅读器也不会朗读标签。

**修复**：`Field` 默认用真正的 `<label>` 包裹控件；按钮组这种没有单一控件的场景用
`as="group"` 走 ARIA group，因为在一个 `<label>` 里塞多个按钮是无效 HTML 且会吞掉点击。

这是组件测试直接抓出的可访问性缺陷。

### 2.6 搜索框里按方向键无效

**现象**：端到端测试中，搜索之后按 <kbd>↓</kbd> 不会选中任何条目。

**原因**：键盘处理器把所有"焦点在 input 里"的情况一律视为输入中并提前返回。

**修复**：区分单行输入与多行输入。单字母快捷键在输入框里仍然禁用（否则输入查询词会误
触发），但 <kbd>↑</kbd> <kbd>↓</kbd> <kbd>Enter</kbd> 在搜索框里照常生效——这正是命令
面板应有的行为，也让"搜索 → 选择 → 复制"全程不需要离开键盘。

### 2.7 复制之后计数不更新

**现象**：详情面板里复制了一条，`用过 N 次` 纹丝不动。

**原因**：`items:mark-used` 有意不广播 `data-changed`（否则列表会在光标下重排），
于是界面上的计数没有来源。

**修复**：`markUsed` 已经返回更新后的条目，调用方用它就地替换那一行
（`useLibrary().patchItem`）。计数保持诚实，列表顺序不动。

### 2.8 修改设置后快捷面板不更新

**现象**：主窗口切换浅色主题，快捷面板仍是深色。

**原因**：面板是独立的渲染层，只在 `data-changed` 事件里重新读取设置，而
`settings:update` 没有广播任何事件。

**修复**：`applySettings` 结束时调用 `notifyDataChanged()`。

### 2.9 进入参数表单后 Enter / Esc 失效

**现象**：快捷面板展开参数表单后，键盘完全没反应。

**原因**：切换到参数视图会卸载搜索框，焦点落到 `document.body`，而键盘监听挂在面板根
元素上——`body` 上的事件不会向下冒泡到它。

**修复**：进入参数视图时自动聚焦第一个输入框。这既是缺陷修复，也是更好的体验。

### 2.10 透明窗口无法截图

**现象**：对快捷面板窗口调用 `page.screenshot()` 与 `webContents.capturePage()` 都会
永久挂起。

**排查**：逐个变量构造窗口，确认 `frame: false`、`alwaysOnTop`、`skipTaskbar`、
`allWorkspaces`、透明与否**都不是**原因；新创建的窗口可以截图，只有"启动时创建并保持
隐藏、之后才显示"的那个窗口不行。

**修复**：文档截图改为新建一个加载同一个 `panel.html` 的窗口来拍摄——同一套 React 组件、
同一个 preload，不是假图。`screenshots.spec.ts` 中记录了原因。

---

## 3. 自动化验证结果

### 3.1 类型检查

```bash
$ npm run typecheck
> tsc -b          # 三个工程：tsconfig.node / tsconfig.web / tsconfig.e2e
（无输出，退出码 0）
```

### 3.2 Lint

```bash
$ npm run lint
✖ 2 problems (0 errors, 2 warnings)
```

两条警告都是 `react-refresh/only-export-components`：`components/ui.tsx` 同时导出了
`cx` 与 `useToast`。拆文件带来的收益小于成本，因此保留并接受警告。

### 3.3 单元与组件测试

```bash
$ npm test
 Test Files  14 passed (14)
      Tests  250 passed (250)
```

覆盖范围：

| 文件                                   | 数量 | 内容                                                                                     |
| -------------------------------------- | ---- | ---------------------------------------------------------------------------------------- |
| `tests/unit/template.test.ts`          | 27   | 变量解析、默认值、重复、未闭合、中文变量名、正则状态泄漏                                 |
| `tests/unit/items.test.ts`             | 47   | 增删改查、软删除与撤销、搜索（英文/中文/标签/分类名/FTS 运算符）、筛选、排序、分页、计数 |
| `tests/unit/search.test.ts`            | 19   | FTS 查询构造、LIKE 转义、标签规范化                                                      |
| `tests/unit/transfer.test.ts`          | 23   | 导出导入往返、重复检测、非法输入、示例数据幂等                                           |
| `tests/unit/schema.test.ts`            | 19   | 迁移、幂等、事务与嵌套事务、索引一致性修复                                               |
| `tests/unit/collections.test.ts`       | 16   | 分类增删改、重命名冲突、删除后条目变未分类                                               |
| `tests/unit/tags.test.ts`              | 11   | 标签合并、删除、大小写不敏感、无用标签回收                                               |
| `tests/unit/settings.test.ts`          | 9    | 默认值、非法值回退、损坏数据容错                                                         |
| `tests/unit/format.test.ts`            | 19   | 中文相对时间、截断、标题推导                                                             |
| `src/renderer/.../accelerator.test.ts` | 11   | 快捷键录制与格式化                                                                       |
| `.../VariableForm.test.tsx`            | 9    | 默认值预填、缺失提示、Enter 提交条件                                                     |
| `.../CodeBlock.test.tsx`               | 13   | 变量渲染、HTML 转义、高亮、未知语言容错                                                  |
| `.../ItemCard.test.tsx`                | 13   | 标题、类型、标签、使用统计、事件冒泡                                                     |
| `.../ItemDetail.test.tsx`              | 14   | 复制、参数替换、失败反馈、链接与路径动作                                                 |

### 3.4 端到端测试

```bash
$ npm run e2e
  56 passed (1.0m)
```

驱动真实 Electron 二进制，覆盖：

- 启动、空状态、载入示例数据
- 搜索（标题 / 正文 / 中英混排 / 无结果）、类型 / 收藏 / 分类 / 标签筛选、清除筛选
- 键盘：<kbd>/</kbd>、<kbd>N</kbd>、<kbd>E</kbd>、<kbd>B</kbd>、<kbd>Del</kbd>、方向键、回车
- 新建 / 编辑 / 删除 + 撤销 / 多行内容
- 复制到剪贴板（从主进程读取电子剪贴板校验）、参数替换后复制、使用次数累加
- 分类新建 / 重命名 / 删除后条目变未分类，标签删除只解除关联
- 快捷面板：呼出即聚焦、输入即搜、回车复制并关闭、方向键、参数填写、空值拒绝复制、
  Esc 返回与关闭、重新呼出是干净状态、浅色主题同步
- 设置：主题、快捷键录制与冲突提示、开关持久化、面板宽度、数据目录、清空数据二次确认

### 3.5 打包验证

```bash
$ npm run dist:win
  • packaging       platform=win32 arch=x64 electron=44.3.0
  • building        target=nsis file=release/CommandShelf-1.0.0-win-x64.exe
  • building        target=portable file=release/CommandShelf-1.0.0-portable.exe
```

打包后的可执行文件用 Playwright 真实启动并操作了一次：

```bash
$ npm run smoke:packaged
smoke: release/win-unpacked/CommandShelf.exe
url: app://commandshelf/index.html
title: CommandShelf
rendered header: true
rendered empty state: true
rows after seeding: 39
rows for ssh: 3
app info: {"version":"1.0.0","schema":1}
page errors: none
```

**这说明打包产物不是"能构建"而已**：它真的能启动、能渲染、能写入数据库、能搜索。

### 3.6 文档链接检查

```bash
$ npm run check:docs
docs: 25 relative links resolve
```

---

## 4. 仓库卫生

```bash
$ git status --short
（无未跟踪的临时文件）
```

- 调试脚本（`debug-launch.mjs`、`debug-shot.mjs`、`debug-capture.mjs`）已删除
- 探针输出与临时截图已删除
- `release/`、`out/`、`coverage/`、`node_modules/` 均在 `.gitignore` 中
- 截图位于 `docs/images/`，由测试脚本可重复生成
- 图标由 `scripts/generate-icons.mjs` 生成，仓库中没有不可复现的二进制资源

---

## 5. 尚未完成的验证

诚实记录：

1. **没有代码签名。** Windows SmartScreen 与 macOS Gatekeeper 会在首次启动时提示。
   需要付费证书，不在本项目范围内。
2. **Linux 与 macOS 产物只在 CI 中构建，未在真机运行过。** 本次开发环境是 Windows，
   端到端测试也只覆盖 Windows。
3. **开机自启动只在打包版本中写入系统登录项**，开发模式下刻意跳过，因此本次未做端到端
   验证。
4. **导入导出走原生文件对话框**，无法在自动化测试中点击，因此只做了仓库层的往返测试
   （`tests/unit/transfer.test.ts`），对话框本身是人工验证的。
5. **长期使用验证需要人来完成**：连续使用一天后回答"是否比原来的方法方便"。
