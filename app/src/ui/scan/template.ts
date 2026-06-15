/** 大文件扫描 Tab 的 HTML 模板与元素查询。 */

import { escapeAttr } from "../shared";
import { DEFAULT_SCAN_ROOT } from "./types";

export function scanTabHtml(): string {
  return `
    <div class="tab-body scan-tab">
    <div class="tab-body-head scan-head">
      <div class="scan-row scan-row-main">
        <div class="scan-toolbar-config">
          <span class="scan-row-label" id="scan-path-label">路径</span>
          <input type="text" id="scan-path" class="scan-path-input" readonly value="${escapeAttr(DEFAULT_SCAN_ROOT)}" title="${escapeAttr(DEFAULT_SCAN_ROOT)}" aria-labelledby="scan-path-label"/>
          <button type="button" id="scan-browse" class="secondary">浏览</button>
          <select id="scan-size-preset" class="scan-size-select" aria-label="文件体积">
            <option value="50">≥50MB</option>
            <option value="100">≥100MB</option>
            <option value="500">≥500MB</option>
            <option value="1024">≥1GB</option>
            <option value="custom">自定义…</option>
          </select>
          <button type="button" id="scan-type-btn" class="secondary" aria-expanded="false" aria-haspopup="dialog">类型</button>
        </div>
        <div class="scan-toolbar-run">
          <button type="button" id="scan-reset" class="secondary">重置</button>
          <button type="button" id="scan-go" class="primary">开始扫描</button>
        </div>
      </div>
      <div id="scan-progress" class="scan-progress-bar" aria-live="polite" hidden></div>
    </div>
    <div id="scan-size-popover" class="scan-type-popover hidden" role="dialog" aria-label="自定义体积范围">
      <div class="scan-filter-popover-head">
        <span>体积范围</span>
        <button type="button" id="scan-size-close" class="scan-filter-close" aria-label="关闭">×</button>
      </div>
      <div class="scan-size-custom-fields">
        <label class="scan-size-custom-row">最小 MB
          <input type="number" id="scan-minmb" class="scan-num-input" min="0" value="100"/>
        </label>
        <label class="scan-size-custom-row">最大 MB
          <input type="number" id="scan-maxmb" class="scan-num-input" min="0" placeholder="不限"/>
        </label>
      </div>
    </div>
    <div id="scan-type-popover" class="scan-type-popover hidden" role="dialog" aria-label="扫描文件类型">
      <div class="scan-filter-popover-head">
        <span>扫描类型</span>
        <button type="button" id="scan-type-close" class="scan-filter-close" aria-label="关闭">×</button>
      </div>
      <label class="scan-filter-all"><input type="checkbox" id="scan-cat-all" value="all"/> 全部类型</label>
      <div id="scan-cat-list" class="scan-type-list"></div>
    </div>
    <div class="table-wrap tab-body-scroll ui-scroll scan-table-wrap">
      <table class="data-table scan-table">
        <thead>
          <tr>
            <th class="col-check"><input type="checkbox" id="scan-selall" title="全选可见行"/></th>
            <th class="col-path">路径</th>
            <th class="col-category">
              <span class="scan-th-category">
                类别
                <button type="button" id="scan-filter-btn" class="scan-filter-btn hidden" title="筛选显示类别" aria-label="筛选类别" aria-expanded="false">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>
                </button>
              </span>
            </th>
            <th class="col-size">大小</th>
            <th class="col-time">修改时间</th>
          </tr>
        </thead>
        <tbody id="scan-tbody"></tbody>
      </table>
    </div>
    <div id="scan-row-menu" class="scan-row-menu hidden" role="menu" aria-label="行操作">
      <button type="button" class="scan-row-menu-item" role="menuitem" data-action="open-folder">打开所在目录</button>
    </div>
    <div id="scan-filter-popover" class="scan-filter-popover hidden" role="dialog" aria-label="筛选类别">
      <div class="scan-filter-popover-head">
        <span>显示类别</span>
        <button type="button" id="scan-filter-close" class="scan-filter-close" aria-label="关闭">×</button>
      </div>
      <label class="scan-filter-all"><input type="checkbox" id="scan-filter-all" checked/> 全选</label>
      <div id="scan-filter-list" class="scan-filter-list"></div>
    </div>
    <div class="tab-body-foot actions">
      <button type="button" id="scan-del" class="danger" disabled>删除选中到回收站</button>
    </div>
    </div>
  `;
}

export type ScanEls = {
  pathEl: HTMLInputElement;
  browseBtn: HTMLButtonElement;
  sizePresetEl: HTMLSelectElement;
  sizePopover: HTMLDivElement;
  sizeClose: Element;
  minMbEl: HTMLInputElement;
  maxMbEl: HTMLInputElement;
  progEl: HTMLDivElement;
  tbody: Element;
  goBtn: HTMLButtonElement;
  resetBtn: HTMLButtonElement;
  delBtn: HTMLButtonElement;
  catList: Element;
  catAllEl: HTMLInputElement;
  typeBtn: HTMLButtonElement;
  typePopover: HTMLDivElement;
  typeClose: Element;
  filterBtn: HTMLButtonElement;
  filterPopover: HTMLDivElement;
  filterAllEl: HTMLInputElement;
  filterList: Element;
  filterClose: Element;
  selAllEl: HTMLInputElement;
  tableWrap: HTMLDivElement;
  rowMenu: HTMLDivElement;
  rowMenuOpenFolder: HTMLButtonElement;
};

export function queryScanEls(root: HTMLElement): ScanEls {
  const rowMenu = root.querySelector<HTMLDivElement>("#scan-row-menu")!;
  return {
    pathEl: root.querySelector<HTMLInputElement>("#scan-path")!,
    browseBtn: root.querySelector<HTMLButtonElement>("#scan-browse")!,
    sizePresetEl: root.querySelector<HTMLSelectElement>("#scan-size-preset")!,
    sizePopover: root.querySelector<HTMLDivElement>("#scan-size-popover")!,
    sizeClose: root.querySelector("#scan-size-close")!,
    minMbEl: root.querySelector<HTMLInputElement>("#scan-minmb")!,
    maxMbEl: root.querySelector<HTMLInputElement>("#scan-maxmb")!,
    progEl: root.querySelector<HTMLDivElement>("#scan-progress")!,
    tbody: root.querySelector("#scan-tbody")!,
    goBtn: root.querySelector<HTMLButtonElement>("#scan-go")!,
    resetBtn: root.querySelector<HTMLButtonElement>("#scan-reset")!,
    delBtn: root.querySelector<HTMLButtonElement>("#scan-del")!,
    catList: root.querySelector("#scan-cat-list")!,
    catAllEl: root.querySelector<HTMLInputElement>("#scan-cat-all")!,
    typeBtn: root.querySelector<HTMLButtonElement>("#scan-type-btn")!,
    typePopover: root.querySelector<HTMLDivElement>("#scan-type-popover")!,
    typeClose: root.querySelector("#scan-type-close")!,
    filterBtn: root.querySelector<HTMLButtonElement>("#scan-filter-btn")!,
    filterPopover: root.querySelector<HTMLDivElement>("#scan-filter-popover")!,
    filterAllEl: root.querySelector<HTMLInputElement>("#scan-filter-all")!,
    filterList: root.querySelector("#scan-filter-list")!,
    filterClose: root.querySelector("#scan-filter-close")!,
    selAllEl: root.querySelector<HTMLInputElement>("#scan-selall")!,
    tableWrap: root.querySelector<HTMLDivElement>(".scan-table-wrap")!,
    rowMenu,
    rowMenuOpenFolder: rowMenu.querySelector<HTMLButtonElement>(
      '[data-action="open-folder"]',
    )!,
  };
}
