---
name: disk-cleaner-pack
description: 为 Vacao 生成本机 clean-pack.json（Profile 推荐勾选 + Pack 扩展路径）。只读扫描，不删除文件。触发：生成 vacao 配置、clean-pack、清理扩展包、本机清理推荐。
---

# Vacao 扩展包生成

## 安装（首次使用必读）

### 获取 Skill 文件

1. 打开 **Vacao** → **设置** → **扩展包** → 点击 **下载 Skill 安装包**。
2. 解压 `disk-cleaner-pack-skill.zip`（一般在「下载」文件夹）。
3. 将解压后的 **`disk-cleaner-pack` 文件夹**（内含本 `SKILL.md`）复制到下面**任一路径**：

| 方式 | 目标路径 | 说明 |
|------|----------|------|
| **全局** | `%USERPROFILE%\.cursor\skills\disk-cleaner-pack\` | 所有项目可用 |
| **项目** | `<项目根>\.cursor\skills\disk-cleaner-pack\` | 仅当前仓库 |

4. 重启 Cursor，或在 Agent 对话中确认 Skills 已加载本 Skill。

更详细的图文说明见 zip 根目录 **`SKILL_INSTALL.md`**（与 zip 同级，不在 `disk-cleaner-pack` 文件夹内）。

### 无需 Skill 时

也可手动编辑 `clean-pack.json`，在 Vacao **设置 → 导出模板到程序目录**，改完后 **从文件导入**。

---

## 使用（生成 → 导入 → 清理）

### 第一步：生成本机 `clean-pack.json`

在 Cursor Agent 中说例如：

- 「生成本机 Vacao 扩展包」
- 「生成 clean-pack.json」
- 「扫描我电脑可清理项并出 profile」

Agent 应**只读扫描**后输出完整 JSON，保存为 `clean-pack.json`（建议放在 **Vacao exe 同目录**）。

### 第二步：导入 Vacao

1. 打开 Vacao → **设置** → **从文件导入**，选择 `clean-pack.json`。
2. 若勾选 **导入时应用 Profile 推荐勾选**，则同步内置项（C01、C16 等）勾选；未勾选则只加载扩展项。
3. 扩展项出现在一键清理的 **扩展清理** 分组；包路径与 Profile 见 **设置**。

### 第三步：执行清理

打开 **一键清理**，按分组勾选后点 **执行清理**（内置 C* 与扩展 X* 一次提交）：

| 分组 | 清理什么 |
|------|----------|
| 日常缓存 / 系统与其它 / 高级 | 内置项 C01–C16 |
| **扩展清理** | Pack 项 X01、X02…（本机独有路径） |

执行前请**退出**相关浏览器、Cursor、Claude Code 等，避免文件占用。

### 工具内快捷操作

- **导出模板到程序目录**：在 exe 旁生成/覆盖 `clean-pack.json`，可 **打开文件夹** 编辑。

---

## 硬约束（生成 JSON 时）

- **只读**：仅用 `Get-ChildItem`、`Test-Path` 等列举目录与大小；**禁止** `Remove-Item`、清空回收站、修改 `config.json`（除非用户明确要求写入）。
- **Pack 路径**：必须绝对路径；禁止 `C:\`、`D:\` 盘符根；禁止 `Desktop`、`Documents`、`Downloads` 整目录；禁止 `Windows`、`Program Files`。
- **Pack ID**：`X01`…`X99` 格式；不得使用 `C01` 等内置 ID。
- **Profile ID**：仅使用 [BUILTIN_IDS.md](./BUILTIN_IDS.md) 中的 C* ID。

## 输出文件格式

- 文件名：`clean-pack.json`
- Schema：`schema/clean-pack.schema.json`
- 示例：zip 内 `clean-pack.sample.json` 或 `app/samples/clean-pack.sample.json`

## 生成工作流（Agent 执行）

1. 确认 Windows，读取 `%USERPROFILE%`、`%APPDATA%`、`%LOCALAPPDATA%`、`%TEMP%`。
2. 对照内置项（见 BUILTIN_IDS）：若对应路径存在且占用 ≥ 约 1MB，加入 `profile.enabledBuiltInIds`；明确不应勾选的加入 `disabledBuiltInIds`（如 C09 除非用户配置了 extra_roots）。
3. 扫描常见智能体/编辑器缓存（`.claude`、`.codex`、`.cache\opencode`、`%APPDATA%\Cursor` 的 backup/snapshots 等）。**已在 C16 覆盖的不要再写 Pack**，除非是本机独有子路径（如 `.claude\downloads`）。
4. 每项 Pack 必须包含：`id`、`label`、`paths[]`、`purpose`、`deleteNote`、`tag`、`defaultChecked`。
5. 写出 JSON：`schemaVersion: 1`，填写 `generatedAt`、`generator: "disk-cleaner-pack-skill/1.0"`、`machineHint`。
6. 交付时告诉用户：保存路径、在 Vacao **设置 → 从文件导入**、扩展项在 **扩展清理** Tab。

## 路径提示（以本机实测为准）

| 产品 | 常见可清路径 |
|------|----------------|
| Claude Code | `%USERPROFILE%\.claude\downloads`、`cache`、`logs`、`telemetry` |
| Codex | `%USERPROFILE%\.codex\logs`、`cache`、`archived_sessions` |
| OpenCode | `%USERPROFILE%\.cache\opencode`（整目录为缓存） |
| Cursor/VS Code | 优先用内置 C16；Pack 仅补充未内置路径 |

## 交付前自检

- [ ] JSON 符合 `schema/clean-pack.schema.json`
- [ ] 无盘符根、无用户库根目录
- [ ] `pack.items` ≤ 50，每项 `paths` ≤ 20
