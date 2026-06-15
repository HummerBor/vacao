# ui/clean — 一键清理 Tab

由原 `clean-tab.ts`（647 行）按职责拆分：

- `index.ts` — `mountCleanTab` 入口、分组列表渲染、清理执行；`onPackImported` 供设置页调用
- `modals.ts` — 文本说明弹窗、清理结果弹窗、进度条渲染
- `detail-panel.ts` — 右侧详情面板（hover 展示、详情弹窗联动）
- `profile.ts` — Profile 推荐勾选与列表的同步（含挂载前暂存）
- `types.ts` — 类型、分组定义与行渲染小工具
