# 项目管理器需求 — 现状分析报告

> 分支：`feature/project-manager` · 调研日期：2026-11-01
> 项目：Sigma File Manager（Tauri v2 + Vue 3 + Rust，版本 2.2.0）

## 0. 总结论

本应用**没有"项目（Project）"这个一等实体** — 这是全部需求的核心缺口。
但已有的基础设施（标签系统、自定义打开方式、注册表工具、扩展系统、任务中心）
覆盖度相当高，大部分需求可以"嫁接"而非"重建"。

## 1. 需求逐条对照

### 1.1 轻量、easy — 打开项目像打开文件夹一样简单

| 状态 | 说明 |
|---|---|
| ✅ 基本实现 | 打开文件夹的完整链路已存在：tabs/分屏、收藏/最常访问/历史、启动参数（CLI 路径 → `app-launch-args` 事件 → 新开 tab，`src-tauri/src/lib.rs:221` → `src/composables/use-init.ts`）、Dashboard 汇总页 |
| ❌ 缺失 | "项目"实体（文件夹 + 元数据：IDE 命令、终端 profile、工作区状态）不存在；无项目专属入口页 |

关键文件：
- `src/stores/storage/workspaces.ts` — tab/分屏会话持久化（`user-workspaces.json`）
- `src/stores/storage/user-stats.ts` — 收藏/历史/最常访问（`user-stats.json`）

### 1.2 注册右键菜单（Explorer），加入管理

| 状态 | 说明 |
|---|---|
| ✅ 基建完整 | `src-tauri/src/default_file_manager/registry.rs` 已有 HKCU 注册表写入（`write_shell_command`）、快照/回滚机制；launcher EXE 部署与自愈（`default_file_manager/launcher.rs`）；`winreg` crate；单实例参数通道 |
| ❌ 缺失 | Sigma 未注册任何 Explorer 右键菜单项；无深链协议（无 `sigma://`、无 tauri-plugin-deep-link）；当前参数通道只认"纯路径"，无命令语义（如 `--add-project`） |

可行性：Windows 上写 `HKCU\SOFTWARE\Classes\Directory\shell\...` 一项即可
（复用现有 `write_shell_command` 模式，无需管理员权限），中等偏小改动。
Linux 对应 `.desktop` ServiceMenu 文件。

### 1.3 可以打开 IDE，添加自定义打开方式

| 状态 | 说明 |
|---|---|
| ✅ ~80% 已实现 | `open_with_program`（`src-tauri/src/open_with/mod.rs:178`）支持任意程序 + `%1` 参数替换打开文件夹；用户自定义命令已持久化（localStorage `sigma-custom-open-commands`，`file-browser-open-with-dialog.vue`）；枚举系统关联程序/资源管理器右键项（独立 helper 进程隔离，4s 超时） |
| ✅ 终端 | 外置终端模块（`src-tauri/src/terminal/`）：WT profiles（含 as-admin）/ pwsh / powershell / cmd，Linux/macOS 也有实现 |
| ❌ 缺失 | 无 IDE 预设/自动探测（vscode/cursor/jetbrains 全无）；自定义命令存在 localStorage（非统一设置存储）；扩展无法挂进内置"打开方式"子菜单 |

### 1.4 分组、标签

| 状态 | 说明 |
|---|---|
| ✅ 标签完整 | `user-stats.json` 的 `tags`/`taggedItems`：任意路径（文件/文件夹）、颜色、增删改；Dashboard 按标签分组视图（`dashboard-tagged-view.vue`）；侧栏分组渲染；列表 tags 列；重命名/删除路径自动维护、失效路径清理 |
| ⚠️ 分组 = 标签复用 | 标签即分组（带颜色）；"命名工作区"schema 已预留：`workspaces.ts` 的 `Workspace` 数组支持 N 个命名工作区，但代码只创建过一个 `primary`（`createDefaultWorkspaces()`，workspaces.ts:118），无切换 UI |

### 1.5 保持实时状态、工作区

| 状态 | 说明 |
|---|---|
| ✅ 目录级实时 | `src-tauri/src/dir_watcher.rs`（notify 8）非递归监听 → `dir-change` 事件 → 300ms 去抖静默刷新（`use-file-browser-navigation.ts`） |
| ✅ 会话恢复 | 单工作区 tabs/分屏/路径/过滤器 + 窗口状态（tauri-plugin-window-state，main 窗口）启动恢复 |
| ❌ 缺失 | git 状态检测（项目完全无 git 集成）；项目级"实时状态"（分支/脏文件/dev server 存活）；多命名工作区切换（schema ready，UI/逻辑缺） |

### 1.6 多窗口

| 状态 | 说明 |
|---|---|
| ✅ 辅助窗口架构 | `main` + 动态创建的 `quick-view`/`print-view`（`src/utils/auxiliary-windows.ts`，含 generation token、ready 握手）；每窗口独立路由（`/quick-view`、`/print-view`）；capability 覆盖三个 label；单实例插件 |
| ❌ 缺失 | 无用户可创建的第二个浏览窗口；各 webview 独立 Pinia 共写同一批 JSON 存储文件，有并发写风险，需按窗口隔离 workspace |

### 1.7 插件的管理方式（打开提供者 / 任务管理）

| 状态 | 说明 |
|---|---|
| ✅ 扩展系统完整 | manifest（`packages/api/manifest.schema.json`）+ 权限模型（`contextMenu`/`shell`/`commands`/…）+ worker 沙箱（模块 Worker，全局锁定、隐藏 `__TAURI_INTERNALS__`）+ 双重权限校验（前端 + Rust `authorize_extension_caller`）+ marketplace（GitHub registry）+ 本地文件夹安装（`install_local_extension`） |
| ✅ 任务中心 | Status Center（`src/modules/status-center/`）：进度/取消/历史，覆盖 copy/move/delete/archive/dir-size |
| ✅ 扩展长任务 | `sigma.shell.runWithProgress`（Rust 侧子进程注册表 + `taskkill /T /F` 终止）、`sigma.ui.withProgress`（可取消进度 toast） |
| ❌ 缺失 | **"提供者"概念**：无 open-with provider 注册点，扩展无法进入内置"打开方式"对话框/子菜单，无法拦截默认打开行为；扩展任务不进 Status Center（`withProgress` 的 `location` 参数声明了但被忽略）；terminals/open_with 派生进程 fire-and-forget 无跟踪；OS 级通知（tauri-plugin-notification）未安装 |

## 2. 可复用基础设施清单

| 基础设施 | 位置 | 对项目管理器的价值 |
|---|---|---|
| 标签系统 | `src/stores/storage/user-stats.ts` | 项目分组的现成模型 |
| 自定义打开命令 | localStorage `sigma-custom-open-commands` + `open_with_program`（`%1`） | "打开 IDE"的现成执行通道 |
| 外置终端 | `src-tauri/src/terminal/` | "在终端中打开项目" |
| 注册表工具 | `default_file_manager/registry.rs`（HKCU 写入/快照/回滚） | Explorer 右键菜单注册 |
| 单实例参数通道 | `lib.rs:221` → `app-launch-args` 事件 | 右键菜单 → 运行中实例的命令分发 |
| 扩展系统 | `src/modules/extensions/**`、`src-tauri/src/extensions/` | P0 的宿主：右键项/命令面板/沙箱 shell/storage/modal UI 全套 API |
| Status Center | `src/modules/status-center/` | 任务管理 UI 的挂载点 |
| 目录监听 | `dir_watcher.rs` | 项目目录实时刷新 |
| 多工作区 schema | `src/types/workspaces.ts`、`src/stores/schemas/workspaces.ts` | 项目级会话的持久化模型参考 |
