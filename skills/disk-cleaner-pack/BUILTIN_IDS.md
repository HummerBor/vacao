# Vacao 内置清理项 ID

Skill 生成 `profile.enabledBuiltInIds` / `disabledBuiltInIds` 时**只能**使用下表 ID。

| ID | 名称 |
|----|------|
| C01 | 用户临时文件 |
| C02 | 系统临时目录 |
| C03 | 清空回收站 |
| C04 | 浏览器缓存（多品牌） |
| C05 | Windows Update 下载缓存 |
| C06 | 缩略图缓存 |
| C08 | 传递优化缓存 |
| C09 | 可配置目录（extra_roots） |
| C10 | npm / pip / pnpm / yarn 缓存 |
| C11 | Prefetch 预读缓存 |
| C12 | DirectX / 显卡着色器缓存 |
| C13 | Windows 错误报告缓存 |
| C16 | 编辑器 / 智能体缓存 |

扩展项 Pack 使用 **X01、X02…**（`^X[0-9]{2,}$`），不得使用 C 前缀。
