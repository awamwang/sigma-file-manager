# 项目管理器 — 分期实施规划

> 分支：`feature/project-manager` · 前置文档：[analysis.md](./analysis.md)

## 目标拆解（对应需求）

1. 轻量、easy — 打开项目像打开文件夹一样简单
2. 注册 Explorer 右键菜单，"加入管理"
3. 可以打开 IDE，添加自定义打开方式
4. 分组、标签
5. 保持实时状态、工作区
6. 多窗口
7. 插件的管理方式：打开提供者、任务管理

---

## P0 — MVP 验证（零核心代码改动，纯扩展实现）

**思路**：不动主程序任何代码，用现有扩展系统拼出"项目管理器"最小闭环，
验证交互后再决定哪些能力下沉为内置功能。

**交付物**：`extensions/project-manager/` 本地扩展（api 类型，ESM worker 沙箱内运行）

| 功能 | 实现方式 | 用到的现有 API |
|---|---|---|
| 右键"添加到项目" | 目录右键菜单项（`when: {selectionType:'single', entryType:'directory'}`） | `sigma.contextMenu.registerItem` |
| 右键"从项目移除" | 同上（已收录的目录显示） | 同上 + `sigma.storage` |
| 项目选择器 | 命令面板命令 `Projects: Open project…` → listDetail 布局 modal（搜索/选择/详情） | `sigma.ui.createModal({layout:'listDetail'})` |
| 打开项目文件夹 | 选中项目 → 导航器直接打开（像打开文件夹一样） | `sigma.commands.executeCommand('sigma.navigator.openPath', path)` |
| 打开 IDE | 选中项目 → 执行可配置 IDE 命令（默认 `code <path>`） | `sigma.shell.run`（PATH 解析支持 .cmd/.bat/.exe） |
| 项目数据 | 路径 + 名称 + 添加时间，存扩展自定义设置 | `sigma.storage.get/set` |
| 反馈 | 添加/移除/打开成功失败 toast | `sigma.ui.showNotification` |
| 设置 | manifest `contributes.configuration`：IDE 命令可在应用设置里改 | `sigma.settings.get` |

权限：`contextMenu`、`commands`、`shell`、`notifications`；激活：`onStartup`。

**验收**：本地安装后，在任意文件夹上右键 → 添加 → 命令面板 → 打开项目 →
既能跳转导航器，也能唤起 IDE。全程不重启、不改动主程序。

**局限（预期内）**：无独立侧栏页面（modal 承载）；IDE 命令仅限 PATH 可解析命令；
无 git/进程状态；数据存在扩展自身设置里（P1 下沉）。

---

## P1 — 内置化 + 便利接入（小~中改动）

1. **Projects 数据模型下沉**
   - 新增 `user-projects.json`（照抄 `user-stats` 的 store 模式：`src/stores/storage/user-stats.ts`）
   - `Project { id, path, name, tagIds, ideCommand?, terminalProfile?, addedAt, lastOpenedAt, openCount }`
   - Dashboard 新 tab "Projects"（复用 `dashboard-tagged-view.vue` 的分组渲染模式）
   - 收录/打开走现有 tab 打开链路；分组直接复用标签系统（`tags`/`taggedItems`）

2. **IDE 预设与探测**
   - 前端探测 PATH 中的 `code` / `cursor` / `idea64` / `windsurf` 等，生成内置自定义打开命令
   - 合并 localStorage `sigma-custom-open-commands` 进统一设置存储

3. **Windows Explorer 右键菜单"加入项目管理"**
   - `HKCU\SOFTWARE\Classes\Directory\shell\SigmaAddProject\command` → launcher + `--sfm-add-project "%1"`
   - 复用 `write_shell_command` / 快照 / 回滚（`src-tauri/src/default_file_manager/registry.rs`）
   - `handle_second_instance`（lib.rs:221）扩展命令参数语义 → `app-launch-args` 事件带上 action
   - 设置页开关 + 状态显示（对齐现有"默认文件管理器"设置区块）

4. **扩展任务并入 Status Center**
   - `withProgress` 的 `location: 'statusBar'` 落实（当前被忽略）：注册为 Status Center `Operation`
   - Status Center `OperationType` 增加 `'extension'`，透出扩展图标与取消（接 `cancel_extension_command`）

---

## P2 — 深度能力（较大修改）

1. **"打开提供者"（open-with provider）扩展点**
   - manifest 新增 `contributes.openWithProviders`（id、标题、适用类型 directory/file、图标）
   - 内置"打开方式"子菜单/对话框（`file-browser-open-with-submenu.vue` / `file-browser-open-with-dialog.vue`）读注册表渲染 provider 项
   - `packages/api` 新增 `sigma.openWith.registerProvider(handler)`；权限沿用 `shell`
   - 可选：默认打开拦截（需谨慎，涉及 `use-dir-entry-actions.ts` 的 action 分发）

2. **多浏览窗口**
   - tauri.conf 增加可复制的浏览窗口定义 + capability label；窗口管理入口（工具栏/命令面板）
   - workspace 按窗口 label 隔离（`user-workspaces.json` 键拆分），解决多 webview 共写 JSON 的并发冲突（LazyStore 串行化或按窗口分文件）
   - 窗口状态纳入 window-state 插件管理

3. **项目实时状态**
   - git 集成：Rust 侧 `git2` 或 `git status --porcelain -b`（进程方式，避免大依赖），项目卡片显示分支/脏文件数；`.git` 探测复用 dir_reader
   - 进程跟踪：terminals/open_with/IDE 派生进程注册到 Rust 侧注册表 → Status Center "运行中"区 → 可停止
   - dev server 探测（可选）：端口探测或启动命令托管（`shell.runWithProgress` 托管 + 停止按钮）

4. **工作区会话与项目绑定**
   - 激活"命名工作区"（schema 已支持 N 个）：项目 ↔ 工作区映射，打开项目 = 切换到对应工作区（tabs 恢复）
   - 每项目记住：打开的 tab 集、分屏布局、IDE 命令、终端 profile

---

## 里程碑顺序与理由

```
P0（扩展验证交互） → P1.1/P1.2（数据与体验内置化） → P1.3（右键菜单）
→ P1.4（任务统一） → P2.1（提供者） → P2.2（多窗口） → P2.3/P2.4（实时状态与会话）
```

- P0 先行的原因：交互未经用户验证前，不把任何模型写进主程序；
  扩展沙箱内试错成本最低，且顺带验证"插件的管理方式"这条需求本身。
- 右键菜单放在 P1 而非 P0：需要改 Rust 与参数通道，且依赖 P1.1 的数据模型才能"加入管理"。
- 多窗口放最后：并发存储隔离影响面最大，且与项目管理器核心闭环相对正交。
