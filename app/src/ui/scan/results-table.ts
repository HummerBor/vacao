/** 扫描结果表：行渲染、类别显示筛选、行右键菜单、全选。 */

import { invoke } from "../../ipc";
import { escapeHtml, escapeAttr, formatBytes as fmtBytes } from "../shared";
import type { ScannedFileRow } from "./types";

export type ResultsViewDeps = {
  root: HTMLElement;
  tbody: Element;
  tableWrap: HTMLDivElement;
  selAllEl: HTMLInputElement;
  filterBtn: HTMLButtonElement;
  filterPopover: HTMLDivElement;
  filterAllEl: HTMLInputElement;
  filterList: Element;
  filterClose: Element;
  rowMenu: HTMLDivElement;
  rowMenuOpenFolder: HTMLButtonElement;
  tauriReady: boolean;
  getLabels: () => Map<string, string>;
  isLocked: () => boolean;
  /** 打开类别筛选弹层前关闭体积/类型弹层（归 controls 管）。 */
  closeOtherPopovers: () => void;
};

export type ResultsView = ReturnType<typeof createResultsView>;

export function createResultsView(d: ResultsViewDeps) {
  const { tbody, tableWrap, selAllEl, filterBtn, filterPopover, filterAllEl, filterList, rowMenu } = d;

  let currentRows: ScannedFileRow[] = [];
  let lastRendered = 0;
  let displayCats = new Set<string>();
  let filterShowAll = true;
  let rowMenuPath = "";

  function closeRowMenu(): void {
    rowMenu.classList.add("hidden");
    rowMenuPath = "";
  }

  function showRowMenu(clientX: number, clientY: number, path: string): void {
    rowMenuPath = path;
    rowMenu.classList.remove("hidden");
    const pad = 6;
    rowMenu.style.left = `${clientX}px`;
    rowMenu.style.top = `${clientY}px`;
    requestAnimationFrame(() => {
      const rect = rowMenu.getBoundingClientRect();
      let left = clientX;
      let top = clientY;
      if (rect.right > window.innerWidth - pad) {
        left = Math.max(pad, window.innerWidth - rect.width - pad);
      }
      if (rect.bottom > window.innerHeight - pad) {
        top = Math.max(pad, window.innerHeight - rect.height - pad);
      }
      rowMenu.style.left = `${left}px`;
      rowMenu.style.top = `${top}px`;
    });
  }

  function setFilterBtnVisible(visible: boolean): void {
    filterBtn.classList.toggle("hidden", !visible);
    if (!visible) closeFilterPopover();
  }

  function closeFilterPopover(): void {
    filterPopover.classList.add("hidden");
    filterBtn.setAttribute("aria-expanded", "false");
  }

  function positionFilterPopover(): void {
    const th = d.root.querySelector(".col-category");
    if (!th) return;
    const r = th.getBoundingClientRect();
    const panel = d.root.querySelector(".scan-tab")!.getBoundingClientRect();
    filterPopover.style.left = `${r.left - panel.left}px`;
    filterPopover.style.top = `${r.bottom - panel.top + 4}px`;
    filterPopover.style.minWidth = `${Math.max(r.width, 200)}px`;
  }

  function applyDisplayFilter(): void {
    tbody.querySelectorAll<HTMLTableRowElement>("tr[data-category]").forEach((tr) => {
      const cat = tr.dataset.category || "";
      const visible = filterShowAll || displayCats.has(cat);
      tr.classList.toggle("scan-row-hidden", !visible);
    });
    filterBtn.classList.toggle("is-active", !filterShowAll);
  }

  function buildFilterPopoverOptions(): void {
    const present = [...new Set(currentRows.map((r) => r.category))].sort();
    if (present.length === 0) {
      setFilterBtnVisible(false);
      return;
    }
    setFilterBtnVisible(true);
    displayCats = new Set(present);
    filterShowAll = true;
    filterAllEl.checked = true;
    filterList.innerHTML = "";
    const labels = d.getLabels();
    for (const id of present) {
      const label = labels.get(id) || id;
      filterList.insertAdjacentHTML(
        "beforeend",
        `<label class="scan-filter-item"><input type="checkbox" class="scan-filter-id" value="${escapeAttr(id)}" checked/><span>${escapeHtml(label)}</span></label>`,
      );
    }
    filterList.querySelectorAll(".scan-filter-id").forEach((el) => {
      el.addEventListener("change", () => {
        filterAllEl.checked = false;
        filterShowAll = false;
        displayCats.clear();
        filterList.querySelectorAll<HTMLInputElement>(".scan-filter-id:checked").forEach((c) => {
          displayCats.add(c.value);
        });
        if (displayCats.size === 0) {
          filterShowAll = true;
          filterAllEl.checked = true;
        }
        applyDisplayFilter();
      });
    });
    filterAllEl.onchange = () => {
      const on = filterAllEl.checked;
      filterShowAll = on;
      filterList.querySelectorAll<HTMLInputElement>(".scan-filter-id").forEach((c) => {
        c.checked = on;
      });
      if (on) displayCats = new Set(present);
      applyDisplayFilter();
    };
    applyDisplayFilter();
  }

  function appendRows(rows: ScannedFileRow[]): void {
    const labels = d.getLabels();
    for (const r of rows) {
      const mod = new Date(Number(r.modifiedMs));
      const label = labels.get(r.category) || r.category;
      const tr = document.createElement("tr");
      tr.dataset.category = r.category;
      tr.dataset.filePath = r.path;
      const rowLocked = d.isLocked();
      tr.innerHTML = `<td class="col-check"><input type="checkbox" class="sel"${
        rowLocked ? " disabled" : ""
      } data-path="${escapeAttr(
        r.path,
      )}"/></td><td class="col-path path-cell" title="${escapeAttr(r.path)}">${escapeHtml(
        r.path,
      )}</td><td class="col-category">${escapeHtml(label)}</td><td class="col-size">${fmtBytes(
        Number(r.size),
      )}</td><td class="col-time">${mod.toLocaleString()}</td>`;
      tbody.appendChild(tr);
    }
    applyDisplayFilter();
  }

  /** 增量渲染：只追加上次之后新增的行。 */
  function appendNewRows(batch: ScannedFileRow[]): void {
    if (batch.length > lastRendered) {
      appendRows(batch.slice(lastRendered));
      lastRendered = batch.length;
    }
  }

  function sortAndRenderAll(rows: ScannedFileRow[]): void {
    const sorted = [...rows].sort((a, b) => Number(b.size) - Number(a.size));
    currentRows = sorted;
    tbody.innerHTML = "";
    lastRendered = 0;
    appendRows(sorted);
    lastRendered = sorted.length;
    buildFilterPopoverOptions();
  }

  function resetView(): void {
    tbody.innerHTML = "";
    currentRows = [];
    lastRendered = 0;
    filterShowAll = true;
    displayCats.clear();
    setFilterBtnVisible(false);
    closeFilterPopover();
    closeRowMenu();
  }

  function getRows(): ScannedFileRow[] {
    return currentRows;
  }

  filterBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (filterBtn.classList.contains("hidden")) return;
    const open = filterPopover.classList.contains("hidden");
    if (open) {
      d.closeOtherPopovers();
      positionFilterPopover();
      filterPopover.classList.remove("hidden");
      filterBtn.setAttribute("aria-expanded", "true");
    } else {
      closeFilterPopover();
    }
  });

  d.filterClose.addEventListener("click", () => closeFilterPopover());

  tableWrap.addEventListener("contextmenu", (ev) => {
    if (!d.tauriReady) return;
    const tr = (ev.target as Element).closest<HTMLTableRowElement>("tr[data-file-path]");
    if (!tr || tr.classList.contains("scan-row-hidden")) return;
    const path = tr.dataset.filePath?.trim();
    if (!path) return;
    showRowMenu(ev.clientX, ev.clientY, path);
  });

  d.rowMenuOpenFolder.addEventListener("click", () => {
    const path = rowMenuPath;
    closeRowMenu();
    if (!path) return;
    void invoke("open_path_in_shell", { path }).catch((e) => {
      alert(String(e));
    });
  });

  tableWrap.addEventListener("scroll", () => closeRowMenu(), true);

  selAllEl.addEventListener("change", (ev) => {
    if (d.isLocked()) {
      selAllEl.checked = false;
      return;
    }
    const on = (ev.target as HTMLInputElement).checked;
    tbody.querySelectorAll<HTMLTableRowElement>("tr[data-category]").forEach((tr) => {
      if (tr.classList.contains("scan-row-hidden")) return;
      const cb = tr.querySelector<HTMLInputElement>("input.sel");
      if (cb) cb.checked = on;
    });
  });

  return {
    closeRowMenu,
    setFilterBtnVisible,
    closeFilterPopover,
    positionFilterPopover,
    appendNewRows,
    sortAndRenderAll,
    resetView,
    getRows,
  };
}
