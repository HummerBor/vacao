# Vacao

Vacao — Windows disk cleanup with extensible clean packs.

**一键清理**（内置 + 可扩展 `clean-pack.json`）、**大文件扫描**、**设置**。基于 [Tauri 2](https://v2.tauri.app/) + Vite + Rust。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows-0078d6)

## 功能

- **一键清理**：临时文件、浏览器/编辑器缓存、回收站、Cursor 工作区/全局库（可配置）等；支持导入扩展包 `X01…`
- **大文件扫描**：按路径、体积、类型扫描；暂停/继续；结果可移入回收站；右键打开所在目录
- **设置**：`config.json`、扩展包导入/导出、Skill 安装包 zip

## 环境要求

- Windows 10/11
- [Node.js](https://nodejs.org/) LTS
- [Rust](https://rustup.rs/) stable（`rustup default stable`）
- Microsoft Edge WebView2（Win10/11 通常已自带）

## 开发

```powershell
cd app
npm install
npm run tauri dev
```

请使用 `tauri dev` **弹出的应用窗口**，不要用浏览器单独打开 `http://localhost:1420`（无 Tauri 注入会报错）。

发布构建：

```powershell
cd app
npm run tauri build
```

安装包一般在 `app/src-tauri/target/release/bundle/`。

## 配置

首次运行后，可执行文件旁会生成 `config.json`。可参考仓库根目录的 [`config.example.json`](config.example.json)。

扩展包示例：`app/samples/clean-pack.sample.json`。在 Cursor 中生成扩展包可使用 [`skills/disk-cleaner-pack/`](skills/disk-cleaner-pack/)（见 [`skills/SKILL_INSTALL.md`](skills/SKILL_INSTALL.md)）。

## 目录结构

| 路径 | 说明 |
|------|------|
| `app/` | Tauri + 前端（**主工程**） |
| `skills/` | Cursor/Claude Skill：生成 `clean-pack.json` |
| `config.example.json` | 配置模板 |

## 故障排除

- **搬目录后插件权限路径仍是旧盘符**：在 `app/src-tauri` 执行 `cargo clean`，再 `npm run tauri dev`。
- **`invoke` 未定义**：未在 Tauri 窗口中打开页面；请只用 `npm run tauri dev` 的窗口。
- **未提升管理员**：系统临时目录等部分项可能清理失败；界面顶部会提示。

## 开源说明

- 许可证：[MIT](LICENSE)
- 欢迎 Issue / PR；请勿提交含个人路径的 `config.json` 或私有 `clean-pack.json`。

## 实现状态

- [x] Tauri 版 v1.x 功能（清理 / 扫描 / 设置 / 扩展包）
- [ ] CI 与签名发布流程（待补充）
