# CommandShelf — Development Specification

> Local command, prompt and snippet workspace for developers.

## 0. AUTONOMOUS EXECUTION POLICY

You are expected to complete this project with a high degree of autonomy.

Continue working whenever a reasonable engineering decision can be made.

Do not ask the user about:

- minor implementation choices
- folder naming
- library selection when equivalent choices exist
- styling details that can be improved later
- ordinary bugs
- test failures
- dependency conflicts that can be resolved safely

Diagnose and fix normal engineering problems independently.

After each major implementation stage:

1. run tests;
2. inspect failures;
3. fix them;
4. rerun tests;
5. continue.

Only escalate when:

1. product requirements fundamentally conflict;
2. credentials or private information are required;
3. an irreversible/destructive action requires approval;
4. multiple serious debugging attempts fail;
5. the environment makes the requested functionality impossible.

The goal is approximately 95% autonomous implementation.

---

# 1. Project Goal

开发一个真正实用的、本地优先的开发者命令 / 提示词 / 片段工作台：

> **CommandShelf — 把你散落在各处的命令、Prompt 和代码片段收进一个随手可取的架子。**

目标用户是本人这类同时进行：

- 远程服务器开发（ssh / scp / docker / nvidia-smi）
- AI 实验（hf download / CUDA_VISIBLE_DEVICES / 训练脚本）
- 日常工程（git / npm / pytest / uvicorn）
- 与 AI 对话（Codex / ChatGPT 长 Prompt）

的开发者。

CommandShelf 解决的核心问题不是"怎么记笔记"，而是：

> **我需要的那条命令，现在到底在哪？**

它当前的可能位置是：

```text
ChatGPT 的历史对话
Terminal history（已翻走 / 已被覆盖）
某个 README
桌面上一个 commands.txt
VS Code 里某个未保存的 tab
微信 / 聊天工具收藏
浏览器书签
```

CommandShelf 把它们统一到一个本地数据库里，并做到：

```text
记住它 → 一秒找到它 → 一键拿走它
```

---

# 2. Product Philosophy

CommandShelf 必须遵守五条原则。

### 1. Local First

所有数据都在本地。

v1 明确不做：

- 用户账号
- 登录
- 云同步
- 在线数据库
- SaaS
- 遥测
- "AI 助手自动整理"

数据就是一个本地 SQLite 文件，用户可以随时拷走、备份、删除。

---

### 2. 一秒可用（这是项目存在的唯一理由）

如果一个片段管理工具需要：

```text
切到窗口 → 点击搜索框 → 输入 → 找到 → 点复制 → 切回编辑器 → 粘贴
```

那它并不比翻聊天记录好多少，用户会在一周内放弃使用。

因此 CommandShelf 的核心交互必须是：

```text
在任何界面按下 Ctrl+Shift+Space
        ↓
置顶小面板出现，光标已在搜索框
        ↓
输入 2~3 个字母
        ↓
回车
        ↓
内容已在剪贴板，面板消失，焦点回到原来的窗口
        ↓
Ctrl+V
```

整个流程不超过 3 秒，手不离键盘。

这是 CommandShelf 的**产品底线**。任何以"功能更全"为名损害这条流程的设计都应被拒绝。

---

### 3. 小而精，禁止长成知识管理平台

HOME.md 中明确要求：

> 核心要求是"小而精"，禁止发展为大型知识管理平台。

v1 明确**不做**：

- Markdown 富文本笔记 / 双链 / 反链
- 无限层级文件夹树
- 附件与文件上传
- 团队协作 / 分享链接
- 数据库视图 / 看板 / 甘特图
- 插件系统
- 内嵌 AI 生成与改写
- 内嵌终端执行命令
- 剪贴板历史自动记录

判断标准很简单：

> 这个功能是让"找到并拿走一条内容"变得更快，还是让它变得更慢？

只有前者可以做。

---

### 4. 绝不丢数据

用户的片段是长期积累的结果，丢失即不可接受。

- 所有写入都是单条 SQLite 事务。
- 删除进入两步确认；批量删除显示确切条目。
- 支持一键导出全部数据为可读 JSON。
- 数据库文件位置对用户可见，并提供"打开数据目录"。
- 版本升级通过显式 schema migration 完成，绝不重建表。

---

### 5. 好看的 UI 是功能，不是装饰

界面必须让"扫一眼就能认出是哪条命令"成立：

- 命令用等宽字体、按类型做语法高亮。
- 卡片式列表，一眼看到标题、正文首行、标签、类型。
- 深色为默认，提供浅色主题，跟随系统可选。
- 动效克制，只用于状态变化（复制成功、面板出现），不做装饰性动画。
- 沿用 LabWatch / ModelShelf 的视觉语言（GitHub 风格配色、`ui.tsx` 基础组件、Tailwind v4 主题变量）。

---

# 3. 技术栈

| 层       | 选型                                            | 理由                                                    |
| -------- | ----------------------------------------------- | ------------------------------------------------------- |
| 桌面外壳 | Electron                                        | 全局热键 + 托盘 + 剪贴板 + 置顶窗口，浏览器方案无法实现 |
| UI       | React 19 + TypeScript                           | 与既有项目一致                                          |
| 构建     | electron-vite                                   | 一套配置同时处理 main / preload / renderer              |
| 样式     | Tailwind CSS v4                                 | 与 LabWatch / ModelShelf 一致                           |
| 数据库   | SQLite（`node:sqlite`）+ FTS5                   | 单文件、本地、全文搜索快；Node 24 内置，**零原生依赖**  |
| 高亮     | Prism.js（按需引入语言）                        | 体积小，token 颜色用项目主题变量覆盖                    |
| 打包     | electron-builder                                | Windows 安装包 + 免安装版                               |
| 测试     | Vitest + Testing Library + Playwright(Electron) | 单元 + 组件 + 端到端                                    |

不使用 Python。CommandShelf 是纯 Node 工具链，避免用户为了用一个小工具去装 Python 环境。

### 关于 SQLite：为什么是 `node:sqlite` 而不是 `better-sqlite3`

`better-sqlite3` 是原生模块，需要针对 Electron 的 ABI 重新编译，也就意味着：

```text
需要 Visual Studio Build Tools / node-gyp
需要 @electron/rebuild
需要 asar unpack
prebuild 未覆盖新 Electron 版本时构建直接失败
```

Electron 44 内置 Node 24，`node:sqlite` 与 FTS5 均已实测可用（见 `docs/ACCEPTANCE.md`）。
因此 CommandShelf 使用内置模块：

- 零原生依赖，`npm install` 不需要编译器
- 打包时无需 unpack，产物更小
- API 与 `better-sqlite3` 高度相似（`DatabaseSync` / `prepare` / `run` / `get` / `all`）

代价是要求 Electron 版本足够新（Node ≥ 22.5）。这对本项目不构成限制，因为桌面外壳版本由我们自己锁定。

---

# 4. 数据模型

单文件 SQLite，位于 `app.getPath('userData')/commandshelf.db`。
可在设置中查看路径并"打开数据目录"。

## 4.1 items

```sql
CREATE TABLE items (
  id            TEXT PRIMARY KEY,           -- uuid v4
  title         TEXT NOT NULL,
  body          TEXT NOT NULL DEFAULT '',
  kind          TEXT NOT NULL,              -- command | prompt | snippet | link | path
  language      TEXT,                       -- snippet 的语法高亮语言，如 python / bash
  collection_id TEXT REFERENCES collections(id) ON DELETE SET NULL,
  favorite      INTEGER NOT NULL DEFAULT 0,
  use_count     INTEGER NOT NULL DEFAULT 0,
  last_used_at  TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT                        -- 软删除，支撑撤销
);
```

## 4.2 collections

```sql
CREATE TABLE collections (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
```

## 4.3 tags / item_tags

```sql
CREATE TABLE tags (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE item_tags (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);
```

## 4.4 全文搜索

```sql
CREATE VIRTUAL TABLE items_fts USING fts5(
  title, body, tags,
  content='',           -- 外部内容表，手工同步
  tokenize='unicode61 remove_diacritics 2'
);
```

由触发器在 items / item_tags 变化时同步。
中文搜索：FTS5 的 `unicode61` 不切分中文词，因此对含中日韩字符的查询额外回退到 `LIKE` 匹配。
这是刻意的取舍——不引入分词依赖，同时保证中文可用。

## 4.5 settings

```sql
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

键值对，包含 `theme`、`hotkey`、`launch_at_login`、`hide_after_copy`、`panel_width`、`schema_version`。

---

# 5. 模板变量

正文中支持 `{{变量}}` 语法。

```bash
ssh -L {{local_port}}:localhost:{{remote_port}} {{server}}
```

规则：

- `{{name}}` —— 无默认值，复制时提示填写。
- `{{name=default}}` —— 有默认值，预填并可直接回车确认。
- 变量名允许 Unicode 字母、数字、下划线、连字符、点。因此 `{{server}}` 和 `{{文件名}}` 都成立。
- 变量按首次出现顺序排列，重复出现只问一次。
- 未闭合的 `{{` 原样保留，不报错。
- 解析逻辑是纯函数，必须单独单元测试。

复制流程：

```text
选中条目 → 若含变量 → 弹出变量填写区（首个输入框自动聚焦）
                    → 实时预览最终结果
                    → 回车复制
         → 若不含变量 → 直接复制
```

---

# 6. 功能范围（v1）

## 6.1 内容类型

五种类型，每种有独立的默认动作：

| kind      | 名称     | 默认动作 | 次要动作           |
| --------- | -------- | -------- | ------------------ |
| `command` | 命令     | 复制     | 复制并去除换行     |
| `prompt`  | 提示词   | 复制     | —                  |
| `snippet` | 代码片段 | 复制     | —                  |
| `link`    | 链接     | 复制     | 在浏览器打开       |
| `path`    | 路径     | 复制     | 在文件管理器中打开 |

## 6.2 创建与编辑

- 新建（`N`）、编辑（`E`）
- 表单字段：标题、类型、正文、语言（snippet）、分类、标签、收藏
- 标题留空时自动用正文首行生成
- 标签输入支持逗号 / 回车分隔，并给出已有标签的自动补全
- 编辑器对命令 / 片段使用等宽字体并实时高亮

## 6.3 查找

- 全局搜索：标题、正文、标签、分类名
- 类型筛选、分类筛选、标签筛选、仅收藏
- 排序：最近使用、最近创建、最近修改、使用次数、标题
- 键盘导航：`↑` `↓` 选择、`Enter` 复制、`B` 收藏、`E` 编辑、`Delete` 删除
- 空状态给出明确引导，而不是空白页

## 6.4 快捷面板

- 全局热键（默认 `Ctrl+Shift+Space`）呼出 / 收起
- 无边框、置顶、居中偏上、约 680×460，圆角与阴影
- 失焦自动隐藏
- 输入即搜，结果按"最近使用 + 匹配度"排序
- `↑` `↓` 选择，`Enter` 复制并隐藏，`Esc` 隐藏
- 含变量时先填变量再复制
- 面板内可一键收藏 / 编辑（不打断流程）
- 复制后显示极短的成功反馈，然后隐藏

## 6.5 收藏与整理

- 收藏标记
- 分类的增删改（删除分类不删条目，条目变为未分类）
- 标签的增删；删除标签自动清理关联
- 使用次数与最后使用时间自动记录

## 6.6 数据

- 导出全部数据为 JSON（含分类、标签、条目）
- 从 JSON 导入，支持合并 / 跳过重复
- 删除条目为软删除，5 秒内可撤销
- 载入示例数据（首次启动引导使用，也用于生成截图）

## 6.7 设置

- 主题：深色 / 浅色 / 跟随系统
- 全局热键（录制式修改，冲突时明确报错）
- 开机自启动
- 复制后是否自动隐藏面板
- 面板宽度
- 数据目录路径 + 打开数据目录
- 导出 / 导入
- 版本与 schema 版本

---

# 7. UI 设计

## 7.1 视觉语言

沿用 ModelShelf 的设计 token，命名空间改为 `--cs-*`：

```text
canvas   #0d1117     surface  #11161d     surface-2 #161b22
border   #232a33     border-strong #30363d
ink      #e6edf3     ink-muted #8b949e    ink-faint #6e7681
accent   #58a6ff     accent-dim #1f6feb
good     #3fb950     warn #d29922         bad #f85149
```

浅色主题同样定义一套。
字体：系统 UI 字体做正文，`ui-monospace` 做命令与代码。
禁止：渐变背景、玻璃拟态、装饰性动画、任何形式的"AI 感"元素。

## 7.2 主窗口布局

```text
┌──────────────────────────────────────────────────────────────┐
│  CommandShelf            [ 搜索…            ]   [+]   [主题]  │
├────────────┬─────────────────────────────────────────────────┤
│ 全部       │  结果列表                                       │
│ 收藏       │  ┌───────────────────────────────────────────┐  │
│ ─────────  │  │ ● ssh -L 端口转发           命令  ★         │  │
│ 命令       │  │   ssh -L {{local_port}}:…                 │  │
│ 提示词     │  │   #ssh #server              用过 12 次      │  │
│ 代码片段   │  └───────────────────────────────────────────┘  │
│ 链接       │  ┌───────────────────────────────────────────┐  │
│ 路径       │  │ …                                         │  │
│ ─────────  │  └───────────────────────────────────────────┘  │
│ 分类       │                                                 │
│  服务器    │                                                 │
│  实验      │                                                 │
│ ─────────  │                                                 │
│ 标签       │                                                 │
│  #ssh      │                                                 │
└────────────┴─────────────────────────────────────────────────┘
```

选中条目后右侧滑出详情面板，显示完整正文、高亮、变量、元信息与操作按钮。

## 7.3 快捷面板布局

```text
┌─────────────────────────────────────────────┐
│  ⌕  输入命令、提示词或标签…                 │
├─────────────────────────────────────────────┤
│  ● ssh -L 端口转发              命令   ★   │
│    ssh -L {{local_port}}:localhost:…        │
│  ○ 打开远程 Jupyter             命令       │
│    ssh -N -L 8888:localhost:8888 user@…     │
│  ○ 服务器地址                   路径       │
│    user@10.0.0.12                           │
├─────────────────────────────────────────────┤
│  ↑↓ 选择   ↵ 复制   Tab 填充变量   Esc 关闭 │
└─────────────────────────────────────────────┘
```

---

# 8. 架构

```text
┌──────────────────── Main Process (Node) ────────────────────┐
│  app lifecycle · window manager · tray · globalShortcut     │
│  settings store                                             │
│         │                                                   │
│         ├── db/  ── node:sqlite · migrations · FTS5          │
│         ├── repo/ ─ items · tags · collections · settings   │
│         ├── ipc/ ── typed channel handlers (invoke/handle)  │
│         └── clipboard · shell · dialog · autoLaunch         │
└─────────────────────────────┬───────────────────────────────┘
                              │ contextBridge (preload)
                              │  window.commandShelf
┌─────────────────────────────┴───────────────────────────────┐
│                   Renderer (React + TS)                     │
│  MainWindow  ─ sidebar · list · detail · editor · settings  │
│  QuickPanel  ─ search · list · variable fill · copy         │
│  shared/     ─ ui.tsx · tokens · hooks · types              │
└─────────────────────────────────────────────────────────────┘
```

安全基线：

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`（renderer 不直接接触 Node）
- preload 只暴露白名单方法，全部走 `ipcRenderer.invoke` / `on`
- 外部链接一律 `shell.openExternal`，禁止在应用内打开
- 不加载任何远程内容

---

# 9. 目录结构

```text
CommandShelf/
├── src/
│   ├── main/
│   │   ├── index.ts              # app 生命周期、单实例
│   │   ├── windows.ts            # 主窗口与快捷面板
│   │   ├── tray.ts
│   │   ├── shortcuts.ts          # 全局热键注册与冲突处理
│   │   ├── ipc.ts                # 通道注册
│   │   ├── db/
│   │   │   ├── connection.ts
│   │   │   ├── migrations.ts
│   │   │   └── schema.sql
│   │   ├── repo/
│   │   │   ├── items.ts
│   │   │   ├── tags.ts
│   │   │   ├── collections.ts
│   │   │   └── settings.ts
│   │   └── services/
│   │       ├── clipboard.ts
│   │       ├── transfer.ts       # 导入 / 导出
│   │       └── seed.ts           # 示例数据
│   ├── preload/
│   │   └── index.ts
│   ├── renderer/
│   │   ├── index.html            # 主窗口
│   │   ├── panel.html            # 快捷面板
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── panel.tsx
│   │   │   ├── index.css
│   │   │   ├── components/
│   │   │   ├── features/
│   │   │   ├── hooks/
│   │   │   └── lib/
│   │   └── ...
│   └── shared/
│       ├── types.ts
│       ├── template.ts           # {{var}} 解析（纯函数）
│       ├── highlight.ts
│       └── ipc-contract.ts
├── tests/
│   ├── unit/
│   └── e2e/
├── docs/
│   ├── images/
│   ├── architecture.svg
│   └── ACCEPTANCE.md
├── scripts/
├── .github/workflows/
├── package.json
├── electron.vite.config.ts
├── electron-builder.yml
├── LICENSE
├── README.md
└── README.zh-CN.md
```

---

# 10. 测试要求

## 单元测试（Vitest）

必须覆盖：

- 模板变量解析：无变量、单变量、多变量、默认值、重复变量、未闭合、空名、中文内容
- 搜索：英文 / 中文 / 标签 / 大小写 / 特殊字符、空查询、排序
- 仓库层：items / tags / collections 的增删改查、软删除与撤销、使用计数、分类删除后条目变未分类
- 导入导出：往返一致、重复检测、非法 JSON、缺字段
- schema migration：从 0 到最新、重复执行幂等

## 组件测试（Testing Library）

- 列表渲染与键盘导航
- 变量填写区：预填默认值、实时预览、空值禁用
- 编辑器表单校验
- 空状态与错误状态

## 端到端测试（Playwright + Electron）

- 首次启动 → 载入示例数据 → 列表出现
- 新建条目 → 出现在列表
- 编辑 → 内容更新
- 搜索过滤
- 复制到剪贴板（读取 Electron clipboard 校验）
- 变量填写 → 复制的最终文本正确
- 收藏 / 分类 / 标签筛选
- 删除 → 撤销
- 导出 → 导入往返（使用临时数据目录）
- 快捷面板窗口可以打开、搜索、回车复制并隐藏

e2e 使用独立的临时 `userData` 目录，绝不触碰用户真实数据。

---

# 11. 交付标准（GitHub Release Ready）

必须包含：

```text
README.md / README.zh-CN.md
LICENSE (MIT)
.gitignore
package.json + 锁文件
单元测试 + 组件测试 + e2e 测试
GitHub Actions CI
electron-builder 打包配置 + Release workflow
docs/architecture.svg
docs/images/ 截图（真实界面，中文 UI）
docs/ACCEPTANCE.md 验收记录
```

README 结构（与 LabWatch / ModelShelf 统一）：

```text
LOGO / PROJECT NAME
One sentence description
Badges
Hero Screenshot
Features
Quick Start
Keyboard Shortcuts
Architecture
Screenshots
Tech Stack
Roadmap
License
```

---

# 12. Roadmap（明确的非目标）

v1 之后**可能**考虑，但 v1 绝不做：

- 云同步 / 多设备
- 浏览器扩展与 VSCode 扩展的深度集成
- 变量组 / 环境变量集（如"服务器 A"一套值）
- 片段使用统计图表
- 命令历史自动导入

v1 明确不做：

- 账号、同步、协作、分享
- 内嵌终端执行
- 剪贴板历史
- Markdown 笔记系统
- AI 生成内容

---

# 13. 验收清单

## Functional

- [ ] 能新建五种类型的内容并正确保存
- [ ] 全局热键在任意应用上呼出快捷面板
- [ ] 面板输入即搜，回车复制，焦点回到原应用
- [ ] 含变量的条目在复制前能填写并预览
- [ ] 主窗口搜索、筛选、排序、键盘导航全部可用
- [ ] 收藏 / 分类 / 标签可用且能筛选
- [ ] 删除可撤销
- [ ] 导出后导入数据完全一致
- [ ] 主题切换、热键修改、开机自启生效
- [ ] 重启应用后数据完整

## Engineering

- [ ] 单元 + 组件 + e2e 测试全部通过
- [ ] `npm run typecheck` 无错误
- [ ] lint 无错误
- [ ] 打包产物可以安装并启动
- [ ] CI 在 push 与 PR 上通过

## Presentation

- [ ] README 中英文齐备，含 Hero 截图
- [ ] 架构图存在且与实现一致
- [ ] 截图来自真实运行的中文界面
- [ ] 仓库无临时文件、无调试残留、无多余日志

## Product（由人判定）

- [ ] 本人连续使用一天，回答"是否比原来的方法方便"为 Yes
