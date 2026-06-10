# TaskNexus 产品需求文档（PRD）

> 版本：v1.0（精简重写）
> 日期：2026-06-10
> 与 v0.3 的关系：基于团队评审，将 M0 范围大幅精简为"架构立形"最小集；协作能力从核心移出，改为未来插件
> 状态：待评审

---

## 0. 文档信息

| 项目 | 内容 |
| --- | --- |
| 项目名称 | TaskNexus（工作代号，产品名待定） |
| 文档目标 | 明确 MVP v0 的功能范围、架构、数据模型与里程碑 |
| 核心原则 | **架构优先**：先证明"内核 + 客户端 + 协议"三件套可行，再堆叠功能 |
| 主要受众 | 创始团队、研发 |

---

## 1. 一句话架构

**TaskNexus = 本地 Node.js 内核进程（数据 + 逻辑 + 协议）+ 无状态 TUI 客户端（通过 ndjson over WebSocket 通信）。**

不是 SaaS。**用户拥有数据，内核是唯一可信源，客户端是无状态视图。**

协作能力不在核心产品中，未来以插件形式提供。

---

## 2. 背景与目标

### 2.1 现状

- 现有 `taskcli` 是单进程 CLI 任务管理器，数据在 `~/.taskcli/tasks.json` 单文件。
- 视图单一，无多视图能力，协作无法开展，字段模型简陋。

### 2.2 战略目标

- **MVP v0 目标**：把 taskcli 升级为「本地优先的多维表格内核 + TUI 客户端」，**验证架构形态**。
- **差异化**：「你的私人 Airtable，跑在你自己的机器上」。
- **长期**：以「本地优先 + 协议开放 + 插件生态」对抗 SaaS 锁定。

### 2.3 MVP v0 要验证的假设

| 假设 | 验证方式 |
| --- | --- |
| Core-Client 进程分离架构可行 | TUI 通过 WebSocket 与 Core 通信，体验流畅 |
| ndjson over WebSocket 协议开发体验好 | 开发者可用 `wscat` 直接调试 Core |
| TUI 作为多维表格客户端可用 | 极客用户愿意用 TUI 操作结构化数据 |

---

## 3. 目标用户（MVP v0）

| ID | 类型 | 关键诉求 |
| --- | --- | --- |
| P1 | 极客个人（taskcli 老用户） | 本地、CLI、脚本化 |
| P4 | 高级开发者 | 可编程数据引擎、自建工具 |

> MVP v0 不面向非技术用户。P2（隐私敏感用户）和 P3（小团队）是后续版本的目标。

---

## 4. 系统架构

### 4.1 总览

```
Core 进程（tnx-core）              TUI 进程（tnx）
┌───────────────────────┐         ┌──────────────────────┐
│  协议层 (Router)       │         │  Grid 视图 + 虚拟滚动 │
│    ↓                  │◄─ndjson─►│  单元格编辑           │
│  Service 层           │  over WS │  多表切换             │
│    ↓                  │         │  状态栏               │
│  Storage 层 (SQLite)  │         └──────────────────────┘
│    ↓                  │
│  EventBus (emit)      │
└───────────────────────┘
    127.0.0.1:8421
```

### 4.2 三层架构（Core 内部）

```
协议层 (Router)  →  Service 层  →  Storage 层
     ↑                 ↓
   encode         EventBus.emit()
```

- **Router**：解析 ndjson 帧，路由到对应 Service 方法，编码响应
- **Service**：业务逻辑（校验、CRUD、计算），不关心传输层
- **Storage**：封装 SQLite 操作的单一类，所有 DB 访问通过此层

> 不要让 Router handler 直接操作 SQLite。Service 层是未来 REST API、插件的复用入口。

### 4.3 仓库结构（monorepo, pnpm）

```
tasknexus/
├── packages/
│   ├── core/         # 内核进程（CLI: tnx-core）
│   ├── protocol/     # 协议类型 + zod schema（共享）
│   ├── client/       # 客户端 SDK（连接、重连）
│   ├── tui/          # TUI 客户端（CLI: tnx）
│   └── shared/       # 共享类型（Field/Record 实体等）
└── docs/
```

### 4.4 进程模型

- Core：单进程 Node.js 22+。**默认前台运行**（`tnx-core start`），不自己实现 daemon。
- 后台运行推荐使用 systemd / launchd / pm2，提供配置模板。
- 数据目录：`~/.tasknexus/`
  - `core.db`（SQLite，WAL 模式）
  - `logs/`（滚动日志）
  - `config.json`（端口等配置）
- **TUI 启动时自动检测并拉起 Core**：`tnx` 启动 → 检查 Core 是否在运行 → 不在则自动 spawn → 连接。用户不需要手动管两个进程。

### 4.5 默认端口

- WebSocket：`127.0.0.1:8421`（loopback 绑定，外部不可达）

---

## 5. 协议：ndjson over WebSocket

### 5.1 帧格式

所有帧携带 `type` 字段，统一判别。

**握手**

```json
{"type":"hello","protocolVersion":1,"clientId":"tnx-tui","clientVersion":"0.1.0"}
{"type":"welcome","protocolVersion":1,"serverVersion":"0.1.0"}
```

**请求（client → server）**

```json
{"type":"req","id":"01J...","method":"table.list","params":{}}
```

**成功响应（server → client）**

```json
{"type":"res","id":"01J...","ok":true,"result":{"tables":[...]}}
```

**失败响应**

```json
{"type":"res","id":"01J...","ok":false,"error":{"code":"NOT_FOUND","message":"Table not found"}}
```

**服务端推送**

```json
{"type":"push","event":"record.updated","data":{"tableId":"t_1","recordId":"r_42","changes":{...}}}
```

**心跳**

```json
{"type":"ping","ts":1717824000000}
{"type":"pong","ts":1717824000000,"serverTs":1717824000001}
```

### 5.2 方法清单（MVP v0 范围）

```
core.health       健康检查
core.version      版本信息
table.list        列出所有表
table.get         获取单张表
table.create      创建表
table.update      更新表名/描述
table.delete      删除表
field.list        列出表的字段
field.create      创建字段
field.update      更新字段
field.delete      删除字段
field.reorder     字段排序
record.list       列出记录（强制分页，默认 limit=100, max=1000）
record.get        获取单条记录
record.create     创建记录
record.update     更新记录
record.delete     删除记录
record.batch      批量创建/更新/删除
record.import     CSV 导入
```

### 5.3 订阅机制

- 客户端 `subscribe` channel（如 `table.t_1.records`）
- 服务端推送 `{"type":"push", ...}`
- 订阅生命周期跟随 WebSocket 连接

### 5.4 协议约束

| 约束 | 值 |
| --- | --- |
| 最大帧大小 | 16MB |
| 心跳间隔 | 30s |
| 心跳超时 | 10s |
| 最大丢失心跳 | 3 次 → 断开 |
| list 查询默认分页 | limit=100 |
| list 查询最大分页 | limit=1000 |

### 5.5 错误码

| code | 含义 |
| --- | --- |
| `BAD_REQUEST` | 参数校验失败 |
| `NOT_FOUND` | 资源不存在 |
| `CONFLICT` | 唯一约束冲突 |
| `INTERNAL` | 内部错误 |
| `NOT_IMPLEMENTED` | 暂未实现 |

---

## 6. 数据模型

### 6.1 SQLite Schema（MVP v0，4 张表）

```sql
-- 工作区元数据
CREATE TABLE workspace_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 表
CREATE TABLE tbl_table (
  id TEXT PRIMARY KEY,        -- ULID
  name TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 字段
CREATE TABLE tbl_field (
  id TEXT PRIMARY KEY,        -- ULID
  table_id TEXT NOT NULL REFERENCES tbl_table(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('text','number','select','checkbox','date')),
  options TEXT NOT NULL DEFAULT '{}',  -- JSON: select 的选项/颜色、number 的精度等
  position INTEGER NOT NULL,
  required INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 记录
CREATE TABLE tbl_record (
  id TEXT PRIMARY KEY,        -- ULID
  table_id TEXT NOT NULL REFERENCES tbl_table(id),
  data TEXT NOT NULL DEFAULT '{}',  -- JSON: { fieldId: value, ... }
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 索引
CREATE INDEX idx_record_table ON tbl_record(table_id, updated_at);
CREATE INDEX idx_field_table ON tbl_field(table_id, position);
```

### 6.2 ID 生成

使用 **ULID**（而非 UUID）：时间有序 → SQLite TEXT PRIMARY KEY 索引友好、可排序。推荐 `ulidx` 库。

### 6.3 事务策略

- 写入走 `BEGIN IMMEDIATE` 串行化事务
- 单条请求最多一次事务
- 失败即回滚

### 6.4 备份（MVP 不做功能，做文档）

MVP 不实现自动备份。在 README 中说明：

> 你的数据在 `~/.tasknexus/core.db`，这是标准 SQLite 文件。你可以随时复制它来备份：
> `cp ~/.tasknexus/core.db ~/.tasknexus/core.db.bak`

---

## 7. 字段引擎

### 7.1 MVP v0 字段类型（5 种）

| 类型 | 存储格式 | options 示例 |
| --- | --- | --- |
| `text` | string | `{"multiline": false}` |
| `number` | number | `{"precision": 2, "format": "decimal"}` |
| `select` | string (选项 ID) | `{"options": [{"id":"opt_1","name":"Todo","color":"blue"}, ...]}` |
| `checkbox` | boolean | `{}` |
| `date` | string (ISO 8601) | `{"includeTime": false, "format": "YYYY-MM-DD"}` |

### 7.2 FieldRegistry（扩展点）

```typescript
interface FieldTypeDefinition {
  type: string;
  validate(value: unknown, options: unknown): ValidationResult;
  serialize(value: unknown): string;
  deserialize(raw: string): unknown;
  defaultValue(options: unknown): unknown;
}

class FieldRegistry {
  register(def: FieldTypeDefinition): void;
  get(type: string): FieldTypeDefinition;
}
```

MVP 注册 5 种内置类型。未来通过插件注册新类型（multiSelect、url、formula 等），不需要改核心代码。

---

## 8. 扩展点预留

MVP 不做插件系统，但在架构上预留 3 个关键扩展点：

### 8.1 EventBus

```typescript
interface CoreEvent {
  type: 'record.created' | 'record.updated' | 'record.deleted' |
        'field.created' | 'table.created' | ...;
  timestamp: number;
  payload: unknown;
}

class EventBus {
  emit(event: CoreEvent): void;
  on(type: string, handler: (event: CoreEvent) => void): void;
  off(type: string, handler: Function): void;
}
```

MVP 中的用途：WebSocket 推送。未来用途：插件订阅、审计日志、协作同步。

### 8.2 FieldRegistry

见 §7.2。

### 8.3 Storage 抽象

所有 SQLite 操作封装在单一 `Storage` 类中。MVP 用同步调用；未来可无缝迁移到 `worker_threads`（如 CSV 大批量导入场景）。

```typescript
interface IStorage {
  runInTransaction<T>(fn: () => T): T;
  tables: ITableStorage;
  fields: IFieldStorage;
  records: IRecordStorage;
}
```

---

## 9. TUI 客户端

### 9.1 技术栈

- Ink 5 + React 18 + TypeScript
- 客户端 SDK：`@tasknexus/client`
- 状态管理：React Context 或 Zustand（轻量）

### 9.2 MVP 功能

| 功能 | 说明 |
| --- | --- |
| 连接管理 | 自动连接本地 Core，自动拉起 Core 进程，断线重连 |
| Grid 视图 | 虚拟滚动渲染、列宽自适应、行列导航 |
| 单元格编辑 | Enter 编辑、Esc 取消、Tab 切列 |
| 多表切换 | 简单列表，快捷键切换 |
| CRUD | 新建表/字段/记录，编辑/删除记录 |
| 基础排序 | 点击列头排序（升/降） |
| CSV 导入 | `tnx record import --table <name> --file data.csv` |
| 首次启动 | 自动创建示例表（Task Tracker），预填示例数据 |
| 状态栏 | 连接状态、当前位置（行/列）、操作提示 |

### 9.3 交互设计

**导航模式**（默认）：
- `j/k`：上下移动行
- `h/l` 或 `Tab/Shift+Tab`：左右移动列
- `Enter`：进入编辑模式
- `n`：新建记录
- `d`：删除记录（带确认）
- `t`：切换表
- `?`：帮助

**编辑模式**：
- 按键输入到当前单元格
- `Esc`：取消编辑
- `Enter` 或 `Tab`：确认并移动到下一个

**字段编辑器：**

| 类型 | TUI 交互 |
| --- | --- |
| text | 内联文本输入。CJK 中文输入触发 `$EDITOR` 降级 |
| number | 内联数字输入 + 校验 |
| checkbox | 空格键切换 ☐/☑ |
| select | Enter 弹出选项列表（带颜色标签），j/k 选择 |
| date | 内联输入 `YYYY-MM-DD` + 格式校验 |

### 9.4 CJK 中文输入 Workaround

> **P0 风险**：Ink raw mode 拦截逐字符输入，导致中文输入法组合态被打断。

MVP 方案：text 字段编辑时检测到需要中文输入，弹出 `$EDITOR`（类似 git commit message），用系统编辑器处理。后续版本关注 Ink 上游修复。

### 9.5 TUI 架构

```
packages/tui/src/
├── app.tsx                      # 根组件
├── hooks/
│   ├── useConnection.ts         # WebSocket 连接 + 自动拉起 Core
│   ├── useTable.ts              # 表数据 CRUD + 订阅
│   ├── useInputDispatcher.ts    # 输入模式分发（navigation/editing/dialog）
│   └── useVirtualScroll.ts      # 虚拟滚动
├── views/
│   └── grid/
│       ├── GridView.tsx          # Grid 主组件
│       ├── GridRow.tsx
│       ├── GridCell.tsx
│       └── GridHeader.tsx
├── editors/                     # 字段编辑器，未来跨视图复用
│   ├── TextEditor.tsx
│   ├── NumberEditor.tsx
│   ├── SelectEditor.tsx
│   ├── CheckboxEditor.tsx
│   └── DateEditor.tsx
├── widgets/
│   ├── StatusBar.tsx
│   ├── TableSwitcher.tsx
│   └── Dialog.tsx
└── store/
    ├── connection.ts
    └── view-state.ts
```

> 视图组件和数据获取解耦。未来加 Kanban/Calendar 只需在 `views/` 下新增目录。

---

## 10. CSV 导入

### 10.1 CLI 入口

```bash
# 导入到已有表
tnx record import --table "Tasks" --file tasks.csv

# 自动建表（根据 CSV 头推断字段）
tnx record import --file tasks.csv --auto-create
```

### 10.2 行为规范

- 第一行为列头，自动映射到字段名
- 类型推断：数字 → number，true/false → checkbox，日期格式 → date，其余 → text
- 错误行跳过并汇总输出
- 1000+ 行在 worker_thread 中执行，WebSocket 推送进度

---

## 11. 首次启动体验

用户安装后第一次运行 `tnx`：

```
1. tnx 检测到 Core 未运行 → 自动拉起 tnx-core
2. 检测到 core.db 不存在 → 初始化数据库
3. 创建示例表 "Task Tracker"
   字段：Title(text), Status(select: Todo/In Progress/Done), Priority(number), Due Date(date), Done(checkbox)
   预填 5 条示例数据
4. 进入 Grid 视图，用户立即看到有数据的表格
```

> 目标：从安装到看到第一屏数据 < 30 秒。

---

## 12. 非功能需求

### 12.1 性能（MVP 目标）

| 指标 | 目标 |
| --- | --- |
| Core 启动 | < 500ms |
| 协议 P95 延迟（本地） | < 20ms |
| Grid 渲染（100 行 × 10 列） | 流畅 |
| 内存占用（Core 空载） | < 80MB |

> 暂不承诺「10 万行流畅滚动」。MVP Grid 用虚拟滚动 + 分页，实际体验取决于 Ink 5 Spike 结果。

### 12.2 可靠性

- SQLite WAL 模式提供崩溃恢复
- 协议层断连自动重连
- 数据文件为标准 SQLite，用户可自行备份

### 12.3 跨平台

- macOS、Linux：首要支持
- Windows：Windows Terminal 下可用（不保证 cmd.exe）
- 安装：`npm i -g tasknexus`

---

## 13. 路线图

### MVP v0（6 周）— 架构立形

**Week 1：Spike + 脚手架**
- [ ] Ink 5 Grid Spike：验证 100 行 × 10 列虚拟滚动 + j/k 导航 + 单元格编辑
- [ ] Core 脚手架：WebSocket 服务器 + SQLite 初始化 + 三层架构骨架
- [ ] 协议帧解析器 + hello/welcome 握手

**Week 2：Core CRUD**
- [ ] FieldRegistry + 5 种内置字段类型
- [ ] Storage 层：table/field/record CRUD
- [ ] Service 层：校验 + 业务逻辑
- [ ] EventBus 基础版

**Week 3：TUI Grid**
- [ ] GridView 虚拟滚动完整实现
- [ ] 单元格导航 + Input Mode 状态机（navigation/editing/dialog）
- [ ] text / number / checkbox 编辑器

**Week 4：TUI 完善 + 多表**
- [ ] select 编辑器（带颜色标签的下拉列表）
- [ ] date 编辑器（文本输入 + 校验）
- [ ] 多表创建 + TUI 切换
- [ ] CSV 导入（CLI 命令）
- [ ] TUI 自动拉起 Core

**Week 5：打通 + 打磨**
- [ ] 首次启动示例表
- [ ] 基础列排序
- [ ] CJK 中文输入 $EDITOR 降级
- [ ] 端到端流程打通 + Bug fix

**Week 6：发布准备**
- [ ] 跨平台测试（macOS / Linux / Windows Terminal）
- [ ] README + 安装指南 + 协议文档
- [ ] npm 包发布准备
- [ ] 种子用户内测

**退出标准**：
- `tnx` 启动 → 自动拉起 Core → 看到示例表 → 建新表 → 导入 CSV → Grid 增删改查，全流程跑通
- 用 `wscat` 直接跟 Core 通信，协议可调试
- macOS + Linux 可跑，Windows Terminal 可跑
- README 让开发者 5 分钟内跑起来

### v0.5（+4-6 周，规划中）

- 更多字段：multiSelect、url/email/phone、createdTime/updatedTime、autonumber
- Kanban 视图（依赖 select 字段分组）
- 基础 filter + 全文搜索（FTS5）
- 每日自动备份
- JSON/CSV 导出
- 旧 taskcli 数据迁移

### v1.0（规划中）

- 插件系统（受限 JS 沙盒）
- 协作插件（设备配对 + CRDT 同步）
- REST API
- 协议 v1.0 冻结，公开 SDK
- 更多视图（Calendar、Gallery）
- Tauri 桌面端

---

## 14. 风险

| 风险 | 等级 | 缓解 |
| --- | --- | --- |
| Ink 5 Grid 体验不达标（滚动卡顿、编辑不流畅） | 🔴 高 | Week 1 做 Spike，失败则评估 Go bubbletea |
| CJK 中文输入法被 raw mode 打断 | 🔴 高 | MVP 用 $EDITOR 降级；持续关注 Ink 上游 |
| MVP 缺乏 aha moment（用户不清楚比 SQLite CLI 好在哪） | 🟡 中 | 示例表 + CSV 导入 + Grid 视觉体验 |
| better-sqlite3 在 Windows 上 native addon 编译问题 | 🟡 中 | CI 提前验证；提供 prebuilt binaries |
| 开发周期失控（自定义协议 + 自定义 Grid 双线作战） | 🟡 中 | 严格砍功能，Spike 失败立即调整 |

---

## 15. 关键决策

| # | 决策 | 选择 | 理由 |
| --- | --- | --- | --- |
| D1 | 协作能力 | 插件形式，不放核心 | 简化 MVP；解耦核心与网络层；打开商业化路径 |
| D2 | MVP 范围 | TUI + 最小内核 | 先验证架构形态，再堆叠功能 |
| D3 | 内核运行时 | Node.js 22+ | 团队已有 TS 栈，MVP 效率优先 |
| D4 | 通信协议 | ndjson over WebSocket | 简单、可调试、双向流 |
| D5 | 存储 | SQLite（WAL）+ better-sqlite3 | 本地优先最佳选择 |
| D6 | TUI 框架 | Ink 5 + React 18 | 与 Core 同栈，Spike 验证后确认 |
| D7 | 进程管理 | 前台模式优先，不自实现 daemon | 避免跨平台坑 |
| D8 | ID 生成 | ULID | 时间有序，索引友好 |
| D9 | WebSocket 库 | `ws` | 最轻量、零依赖 |
| D10 | Core 内部架构 | Router → Service → Storage 三层 | 为 REST API / 插件预留复用入口 |
| D11 | 字段类型（MVP） | text / number / select / checkbox / date | 最小可用集 |
| D12 | 视图（MVP） | Grid only | 集中精力打磨一个视图 |
| D13 | 开源协议 | MIT | 开放生态 |

---

## 16. 明确不做清单（MVP v0 Out-of-Scope）

以下功能在 MVP v0 中**明确不做**，避免范围蔓延：

| 不做 | 理由 | 计划 |
| --- | --- | --- |
| 多人协作 / 设备同步 / CRDT | 以插件形式提供 | v1.0 |
| Kanban / Calendar 视图 | MVP 集中打磨 Grid | v0.5 |
| 自动化引擎 | 超出架构验证范围 | v0.5+ |
| 表单 | 超出架构验证范围 | v0.5+ |
| 全文搜索 | MVP 数据量小，排序够用 | v0.5 |
| 正式备份恢复 | 用户可自行 copy SQLite 文件 | v0.5 |
| 插件系统 | 架构上预留扩展点即可 | v1.0 |
| 附件 | 超出架构验证范围 | v0.5+ |
| JSON/CSV 导出 | 用户可直接访问 SQLite | v0.5 |
| REST API | MVP 只走 WebSocket | v1.0 |
| 鉴权 / Token | MVP 只有本地 loopback，无认证 | v0.5+ |
| 高级字段（formula, link, lookup, rollup） | 复杂度高，每个 1-2 周工作量 | v0.5+ |
| i18n | MVP 先英文 | v0.5 |
| Docker 镜像 | MVP 先 npm 安装 | v0.5 |

---

## 17. 未来：协作作为插件

协作能力从核心移出，未来以插件形式提供。设计思路：

```
┌──────────────────────────────────────┐
│ TaskNexus Core                       │
│ ┌──────────┐  ┌──────────────────┐   │
│ │ EventBus │──│ Collaboration    │   │
│ │          │  │ Plugin           │   │
│ │ (hook)   │  │ ┌──────────────┐ │   │
│ │          │  │ │ Yjs CRDT     │ │   │
│ └──────────┘  │ │ Device Pair  │ │   │
│               │ │ Token Auth   │ │   │
│               │ │ Tunnel Guide │ │   │
│               │ └──────────────┘ │   │
│               └──────────────────┘   │
└──────────────────────────────────────┘
```

- 插件通过 EventBus 订阅数据变更事件
- 插件通过 Service 层 API 读写数据
- 插件可以注册新的协议方法（`sync.*`、`auth.*`）
- 官方协作插件可以成为付费点

---

## 18. 技术选型总结

| 组件 | 选型 | 备选 |
| --- | --- | --- |
| Core 运行时 | Node.js 22+ | — |
| Core 语言 | TypeScript | — |
| SQLite 绑定 | better-sqlite3 | — |
| WebSocket 库 | ws | — |
| 协议格式 | ndjson (自定义，类 JSON-RPC) | — |
| TUI 框架 | Ink 5 + React 18 | Go bubbletea（Spike 失败时） |
| ID 生成 | ULID (ulidx) | — |
| 参数校验 | zod | — |
| 包管理 | pnpm | — |

---

## 附录 A：与 PRD v0.3 的差异

| 维度 | v0.3 M0 | v1.0 MVP v0 |
| --- | --- | --- |
| 字段类型 | 18 种（除 ai 外全部） | 5 种基础类型 |
| 视图 | Grid + Kanban + Calendar | Grid only |
| 同步 | Yjs CRDT + 设备配对 | **移除**（未来插件） |
| 鉴权 | Token + SSH 风配对 | **移除**（loopback 免认证） |
| FTS5 | 包含 | **移除** |
| 备份恢复 | 自动每日备份 | **移除**（文档说明手动 copy） |
| Schema | 12 张表 | 4 张表 |
| 协议帧 | 无统一 type 字段 | 所有帧携带 type 字段 |
| 进程管理 | 默认后台守护 | **默认前台**，外部管理器 |
| CSV 导入 | 包含 | 包含（保留） |
| 架构 | 无明确分层 | Router → Service → Storage 三层 |
| 扩展点 | 未提及 | EventBus + FieldRegistry + Storage 抽象 |

---

## 附录 B：Ink 5 Grid Spike 验收标准

第一周必须完成的 Spike，用于决定 TUI 技术方向：

- [ ] 100 行 × 10 列数据虚拟滚动渲染
- [ ] j/k 快速连续按键时渲染无明显延迟
- [ ] 单元格 Enter 进入编辑 → 输入文本 → Esc 取消 / Enter 确认
- [ ] 80×24 小终端窗口下布局合理
- [ ] macOS Terminal + iTerm2 + Windows Terminal 三个终端模拟器测试通过

**Spike 失败标准**：以上任一项在调优后仍不可接受 → 评估 Go bubbletea 替代方案。
