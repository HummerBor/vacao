# ui/scan — 大文件扫描 Tab

由原 `scan-tab.ts`（917 行）按职责拆分：

- `index.ts` — `mountScanTab` 入口；UI 状态编排与全局事件
- `actions.ts` — 扫描任务动作：开始/暂停/继续、重置、删除选中（含状态轮询）
- `template.ts` — HTML 模板与元素查询（`queryScanEls`）
- `controls.ts` — 扫描参数控件：体积预设/自定义弹层、类型选择弹层
- `results-table.ts` — 结果表渲染、类别显示筛选、行右键菜单、全选
- `progress.ts` — 进度条渲染（无状态纯函数）
- `types.ts` — 类型与常量
