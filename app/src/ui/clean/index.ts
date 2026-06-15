/** 一键清理 Tab：挂载入口、分组列表渲染与清理执行。 */

import { invoke } from "../../ipc";
import { escapeHtml, formatBytes } from "../shared";
import type { CleanCatalogItem, CleanGroupDef, CleanResultItem } from "./types";
import { CLEAN_GROUPS, PACK_GROUP, sizeCellClass, sizeLabel, tagClass } from "./types";
import {
  clearCleanProgress,
  openCleanRunModal,
  openCleanTextModal,
  renderCleanProgress,
} from "./modals";
import { DETAIL_PLACEHOLDER, mountCleanDetailPanel } from "./detail-panel";
import {
  applyBuiltInChecks,
  applyBuiltInChecksNow,
  getPendingProfileChecks,
  setCleanRootRef,
} from "./profile";

export type { CleanResultItem } from "./types";
export { applyBuiltInChecks } from "./profile";

let reloadCleanCatalog: (() => void) | null = null;

export function mountCleanTab(root: HTMLElement): void {
  setCleanRootRef(root);
  root.innerHTML = `
    <div class="tab-body">
      <div class="tab-body-head clean-head">
        <div class="clean-toolbar">
          <button type="button" id="clean-refresh" class="secondary">刷新占用</button>
          <button type="button" id="clean-select-safe" class="secondary">全选可安全项</button>
        </div>
        <div class="clean-summary" id="clean-summary">
          <div class="clean-stat">
            <span class="clean-stat-label">本机可清理合计</span>
            <span class="clean-stat-value" id="clean-scan-total">\u2014</span>
          </div>
          <div class="clean-stat clean-stat-accent">
            <span class="clean-stat-label">当前已勾选</span>
            <span class="clean-stat-value" id="clean-pick-total">\u2014</span>
          </div>
        </div>
      </div>
      <div class="clean-main-split">
        <div id="clean-checks" class="checks tab-body-scroll ui-scroll clean-list-pane"></div>
        <aside id="clean-detail-panel" class="clean-detail-panel ui-scroll" aria-label="项目详情"></aside>
      </div>
      <div class="tab-body-foot clean-foot">
        <div class="actions">
          <button type="button" id="clean-exec" class="danger">执行清理</button>
        </div>
        <div id="clean-progress" class="scan-progress-bar clean-progress-bar" aria-live="polite" hidden></div>
      </div>
    </div>
  `;

  const split = root.querySelector(".clean-main-split") as HTMLElement;
  const box = root.querySelector("#clean-checks") as HTMLElement;
  const detailPanel = root.querySelector("#clean-detail-panel") as HTMLElement;
  const scanTotalEl = root.querySelector("#clean-scan-total")!;
  const pickTotalEl = root.querySelector("#clean-pick-total")!;
  let catalog: CleanCatalogItem[] = [];

  function renderGroupSection(
    group: CleanGroupDef,
    rows: CleanCatalogItem[],
    listHead: string,
  ): string {
    const groupBytes = rows.reduce((acc, r) => acc + r.sizeBytes, 0);
    const withData = rows.filter((r) => r.sizeBytes > 0).length;
    return `
        <section class="clean-group" data-group="${group.id}">
          <header class="clean-group-head">
            <div class="clean-group-title-wrap">
              <h3 class="clean-group-title">${escapeHtml(group.title)}</h3>
              <p class="clean-group-hint">${escapeHtml(group.hint)}</p>
            </div>
            <div class="clean-group-meta">
              <span>${rows.length} 项 \u00b7 ${withData} 项有数据 \u00b7 合计 ${formatBytes(groupBytes)}</span>
              <button type="button" class="link-btn clean-group-select" data-group="${group.id}">全选本组</button>
            </div>
          </header>
          <div class="clean-list">
            ${listHead}
            ${rows.map(renderRow).join("")}
          </div>
        </section>`;
  }

  mountCleanDetailPanel(split, detailPanel, box, (id) => catalog.find((c) => c.id === id));

  const updateTotal = () => {
    const checked = [
      ...root.querySelectorAll<HTMLInputElement>('input[name="clean"]:checked'),
    ];
    const sumAll = catalog.reduce((acc, c) => acc + c.sizeBytes, 0);
    const sumChecked = checked.reduce((acc, el) => {
      const item = catalog.find((c) => c.id === el.value);
      return acc + (item?.sizeBytes ?? 0);
    }, 0);
    scanTotalEl.textContent = catalog.length ? formatBytes(sumAll) : "\u2014";
    pickTotalEl.textContent =
      checked.length > 0
        ? `${checked.length} 项 \u00b7 ${formatBytes(sumChecked)}`
        : "未勾选";
  };

  function renderRow(row: CleanCatalogItem): string {
    const id = `cc-${row.id}`;
    const checked = row.defaultChecked ? " checked" : "";
    const isSafe = row.tag.includes("可安全");
    const empty = row.sizeBytes <= 0;
    return `
      <div class="clean-row${empty ? " clean-row-empty" : ""}" data-id="${row.id}">
        <div class="clean-row-line">
          <label class="clean-row-check">
            <input type="checkbox" name="clean" value="${row.id}" id="${id}"${checked} data-safe="${isSafe}"/>
          </label>
          <label class="clean-row-main" for="${id}">
            <span class="clean-row-title">${escapeHtml(row.label)}</span>
          </label>
          <span class="${sizeCellClass(row)}">${escapeHtml(sizeLabel(row))}</span>
          <span class="clean-tag ${tagClass(row.tag)}">${escapeHtml(row.tag)}</span>
          <button
            type="button"
            class="clean-detail-btn"
            data-id="${row.id}"
            aria-label="${escapeHtml(row.label)} 详情"
          >详情</button>
        </div>
      </div>`;
  }

  function renderCatalog(items: CleanCatalogItem[]): void {
    catalog = items;
    const byId = new Map(items.map((i) => [i.id, i]));
    const used = new Set<string>();
    let html = "";

    const listHead = `
      <div class="clean-list-head" aria-hidden="true">
        <span></span><span>项目</span><span>占用</span><span class="clean-list-col-tag">安全</span><span>详情</span>
      </div>`;

    for (const group of CLEAN_GROUPS) {
      const rows = group.ids
        .map((id) => byId.get(id))
        .filter((r): r is CleanCatalogItem => !!r)
        .sort((a, b) => b.sizeBytes - a.sizeBytes);
      rows.forEach((r) => used.add(r.id));
      if (rows.length === 0) continue;
      html += renderGroupSection(group, rows, listHead);
    }

    const packRows = items
      .filter((i) => i.id.startsWith("X"))
      .sort((a, b) => b.sizeBytes - a.sizeBytes);
    packRows.forEach((r) => used.add(r.id));
    if (packRows.length > 0) {
      html += renderGroupSection(PACK_GROUP, packRows, listHead);
    }

    box.innerHTML = html;
    detailPanel.innerHTML = DETAIL_PLACEHOLDER;
    detailPanel.classList.remove("has-content");

    box.querySelectorAll('input[name="clean"]').forEach((el) => {
      el.addEventListener("change", updateTotal);
    });
    box.querySelectorAll(".clean-group-select").forEach((btn) => {
      btn.addEventListener("click", () => {
        const gid = (btn as HTMLButtonElement).dataset.group;
        const section = box.querySelector(`section.clean-group[data-group="${gid}"]`);
        section?.querySelectorAll<HTMLInputElement>('input[name="clean"]').forEach((el) => {
          el.checked = true;
        });
        updateTotal();
      });
    });
    updateTotal();
    const pending = getPendingProfileChecks();
    if (pending) {
      applyBuiltInChecksNow(pending);
      updateTotal();
    }
  }

  let catalogLoading = false;
  const execBtn = root.querySelector<HTMLButtonElement>("#clean-exec")!;
  const progEl = root.querySelector<HTMLDivElement>("#clean-progress")!;
  const refreshBtn = root.querySelector<HTMLButtonElement>("#clean-refresh")!;
  const selectSafeBtn = root.querySelector<HTMLButtonElement>("#clean-select-safe")!;

  async function loadCatalog(): Promise<void> {
    if (catalogLoading) return;
    catalogLoading = true;
    refreshBtn.disabled = true;
    const hadCatalog = catalog.length > 0;
    if (hadCatalog) {
      box.classList.add("clean-catalog-refreshing");
      scanTotalEl.textContent = "刷新中\u2026";
      pickTotalEl.textContent = "刷新中\u2026";
    } else {
      box.innerHTML = `<p class="hint clean-loading">正在后台统计各项占用，界面仍可操作\u2026</p>`;
      scanTotalEl.textContent = "\u2026";
      pickTotalEl.textContent = "\u2026";
    }
    try {
      const items = await invoke<CleanCatalogItem[]>("clean_catalog");
      renderCatalog(items);
    } catch (e) {
      if (!hadCatalog) {
        box.innerHTML = `<p class="warn">加载失败：${escapeHtml(String(e))}</p>`;
      }
    } finally {
      catalogLoading = false;
      refreshBtn.disabled = false;
      box.classList.remove("clean-catalog-refreshing");
    }
  }

  refreshBtn.addEventListener("click", () => {
    void loadCatalog();
  });

  selectSafeBtn.addEventListener("click", () => {
    box.querySelectorAll<HTMLInputElement>('input[name="clean"]').forEach((el) => {
      el.checked = el.dataset.safe === "true";
    });
    updateTotal();
  });

  function setCleanBusy(busy: boolean): void {
    execBtn.disabled = busy;
    refreshBtn.disabled = busy;
    selectSafeBtn.disabled = busy;
  }

  root.querySelector("#clean-exec")!.addEventListener("click", () => {
    void (async () => {
      const checked = [
        ...root.querySelectorAll<HTMLInputElement>('input[name="clean"]:checked'),
      ].map((x) => x.value);
      if (checked.length === 0) {
        alert("请至少勾选一项");
        return;
      }
      if (checked.includes("C09")) {
        const ok = confirm(
          "已勾选「可配置目录」：将清空设置里每个路径下的文件。路径配错可能丢失重要数据，确认继续？",
        );
        if (!ok) return;
      }
      if (checked.includes("C18")) {
        const ok = confirm(
          "「Cursor 全局库重置」将删除全局 state.vscdb（及备份/wal）。\n\n会失去：登录态（需重登）、全局侧边栏聊天历史、部分扩展全局状态。\n不会删：项目源码、各项目 workspaceStorage（除非你另勾「Cursor 工作区缓存」）。\n\n建议已备份 conversation-backups。确认继续？",
        );
        if (!ok) return;
      }
      if (checked.includes("C04")) {
        try {
          const cfg = await invoke<{ browserClearCookies?: boolean }>("get_config");
          if (cfg.browserClearCookies) {
            const ok = confirm("设置中已开启「同时删除 Cookies」：清理 Chrome/Edge 时会导致多数网站退出登录。确认继续？");
            if (!ok) return;
          }
        } catch {
          /* skip */
        }
      }
      const warnPack = checked.some((id) => {
        const row = catalog.find((c) => c.id === id);
        return row?.warn || row?.tag.includes("需谨慎");
      });
      if (warnPack) {
        const ok = confirm("已勾选需谨慎的扩展项，确认继续？");
        if (!ok) return;
      }
      setCleanBusy(true);
      renderCleanProgress(progEl, "running", `已选 ${checked.length} 项，正在清理…`);
      try {
        const res = await invoke<CleanResultItem[]>("clean_run", { ids: checked });
        clearCleanProgress(progEl);
        openCleanRunModal(res, catalog);
        void loadCatalog();
      } catch (e) {
        renderCleanProgress(progEl, "failed", String(e));
        openCleanTextModal("清理失败", `<p>${escapeHtml(String(e))}</p>`);
      } finally {
        setCleanBusy(false);
      }
    })();
  });

  reloadCleanCatalog = () => {
    void loadCatalog();
  };
  void loadCatalog();
}

/** 设置页导入扩展包后：可选静默应用 Profile，并刷新本 Tab */
export async function onPackImported(applyProfile: boolean): Promise<string> {
  let note = "";
  if (applyProfile) {
    const r = await invoke<{ checks: Record<string, boolean> }>(
      "apply_clean_profile",
    );
    note = applyBuiltInChecks(r.checks);
  }
  document.querySelector<HTMLButtonElement>('[data-tab="clean"]')?.click();
  reloadCleanCatalog?.();
  return note || (applyProfile ? "" : "已打开一键清理，扩展项在「扩展清理」分组。");
}
