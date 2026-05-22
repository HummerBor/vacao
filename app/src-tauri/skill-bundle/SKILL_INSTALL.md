# Vacao Pack Skill — 安装说明

本包用于在 **Cursor**（及支持 Agent Skills 的 IDE）中生成本机 `clean-pack.json`，再导入 **Vacao** 的「扩展清理」功能。

## 1. 安装 Skill（二选一）

### 方式 A：全局（所有项目可用）

将整个 `disk-cleaner-pack` 文件夹复制到：

```text
%USERPROFILE%\.cursor\skills\disk-cleaner-pack\
```

示例：`C:\Users\你的用户名\.cursor\skills\disk-cleaner-pack\SKILL.md` 应存在。

### 方式 B：仅当前项目

将 `disk-cleaner-pack` 文件夹复制到项目根目录下：

```text
<项目根>\.cursor\skills\disk-cleaner-pack\
```

适合团队仓库统一分发；仅在该仓库打开 Cursor 时生效。

### 安装后

1. 重启 Cursor，或重新打开 Agent 对话。
2. 在 Skills 列表中确认出现 **disk-cleaner-pack**（名称以 `SKILL.md` 为准）。
3. 若未出现，检查文件夹名是否为 `disk-cleaner-pack`，且内含 `SKILL.md`。

> **Claude Code / 其他 IDE**：若不支持 `.cursor/skills`，可将 `SKILL.md` 全文作为自定义指令参考；未在 v1 中正式验证。

## 2. 生成 clean-pack.json

在 Agent 对话中说例如：

- 「生成 disk cleaner 扩展包」
- 「生成本机 clean-pack.json」

Agent 应**只读扫描**本机路径，输出 `clean-pack.json`（格式见 `schema/clean-pack.schema.json`）。  
可参考同目录下的 `clean-pack.sample.json`。

**禁止**让 Agent 直接删除文件；清理只在 Vacao 里勾选后执行。

## 3. 导入 Vacao

1. 将 `clean-pack.json` 放到 **Vacao  exe 同目录**（与 `vacao.exe` 并列），或任意路径。
2. 打开工具 → **设置** → **从文件导入**，选择该 JSON。
3. 按提示选择是否将 **Profile** 应用到「一键清理」。
4. 打开 **扩展清理** Tab，勾选扩展项（X01…）后执行。

也可在工具内点击 **导出模板到程序目录**，在 exe 旁编辑后再 **从文件导入**。

## 4. 文件说明

| 文件 | 用途 |
|------|------|
| `SKILL.md` | Agent 行为说明 |
| `BUILTIN_IDS.md` | 内置清理项 C01–C16 列表 |
| `schema/clean-pack.schema.json` | JSON 校验结构 |
| `clean-pack.sample.json` | 示例包 |

## 5. 常见问题

**Q：扩展项和「编辑器 / 智能体缓存 C16」重复？**  
A：Profile 负责推荐勾选内置项；Pack 只补充 C16 未覆盖的本机路径。重复路径清理时可能显示 0 个文件，无害。

**Q：导入失败提示路径非法？**  
A：不要填写 `C:\`、桌面、文档根目录；只填具体缓存子目录（见 Skill 白名单）。
