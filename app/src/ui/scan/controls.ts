/** 扫描参数控件：体积预设/自定义弹层、类型选择弹层。 */

import { escapeHtml, escapeAttr } from "../shared";
import type { CategoryInfo } from "./types";
import { DEFAULT_SCAN_GROUPS, SCAN_SIZE_PRESETS } from "./types";

export function parseMinMbInput(el: HTMLInputElement): number {
  const raw = el.value.trim();
  if (raw === "") return 100;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 100;
  return Math.floor(n);
}

export function scanTypeSummary(
  catAll: boolean,
  catListEl: Element,
  labels: Map<string, string>,
): string {
  if (catAll) return "全部类型";
  const checked: string[] = [];
  catListEl.querySelectorAll<HTMLInputElement>(".scan-cat-id:checked").forEach((el) => {
    checked.push(labels.get(el.value) || el.value);
  });
  if (checked.length === 0) return "未选类型";
  if (checked.length === 1) return checked[0];
  if (checked.length === 2) return `${checked[0]}等 2 项`;
  return `${checked.length} 项`;
}

export function sizeFilterSummary(minMb: number, maxMb: number | null): string {
  if (maxMb && maxMb > 0) return `≥${minMb}–≤${maxMb}MB`;
  return `≥${minMb}MB`;
}

export type ScanControlsDeps = {
  root: HTMLElement;
  sizePresetEl: HTMLSelectElement;
  sizePopover: HTMLDivElement;
  sizeClose: Element;
  minMbEl: HTMLInputElement;
  maxMbEl: HTMLInputElement;
  typeBtn: HTMLButtonElement;
  typePopover: HTMLDivElement;
  typeClose: Element;
  catAllEl: HTMLInputElement;
  catList: Element;
  getLabels: () => Map<string, string>;
  /** 打开类型弹层前关闭类别筛选弹层（归 results-table 管）。 */
  closeFilterPopover: () => void;
};

export type ScanControls = ReturnType<typeof createScanControls>;

export function createScanControls(d: ScanControlsDeps) {
  const { sizePresetEl, sizePopover, minMbEl, maxMbEl, typeBtn, typePopover, catAllEl, catList } = d;

  function closeSizePopover(): void {
    sizePopover.classList.add("hidden");
  }

  function positionSizePopover(): void {
    const r = sizePresetEl.getBoundingClientRect();
    const panel = d.root.querySelector(".scan-tab")!.getBoundingClientRect();
    sizePopover.style.left = `${r.left - panel.left}px`;
    sizePopover.style.top = `${r.bottom - panel.top + 4}px`;
    sizePopover.style.minWidth = `${Math.max(r.width, 220)}px`;
  }

  function syncSizePresetSelect(): void {
    const min = parseMinMbInput(minMbEl);
    const hasMax = maxMbEl.value.trim() !== "";
    if (!hasMax && (SCAN_SIZE_PRESETS as readonly number[]).includes(min)) {
      sizePresetEl.value = String(min);
      return;
    }
    sizePresetEl.value = "custom";
  }

  function applySizePreset(value: string): void {
    if (value === "custom") {
      syncSizePresetSelect();
      positionSizePopover();
      sizePopover.classList.remove("hidden");
      return;
    }
    closeSizePopover();
    minMbEl.value = value;
    maxMbEl.value = "";
    syncSizePresetSelect();
  }

  function resetSizePickDefaults(minFromConfig: number): void {
    const min = Number.isFinite(minFromConfig) && minFromConfig >= 0 ? minFromConfig : 100;
    minMbEl.value = String(min);
    maxMbEl.value = "";
    if ((SCAN_SIZE_PRESETS as readonly number[]).includes(min)) {
      sizePresetEl.value = String(min);
    } else {
      sizePresetEl.value = "custom";
    }
    closeSizePopover();
  }

  function updateScanTypeButtonLabel(): void {
    if (catAllEl.checked) {
      typeBtn.textContent = "类型 · 全部";
      return;
    }
    const labels = d.getLabels();
    const checked: string[] = [];
    catList.querySelectorAll<HTMLInputElement>(".scan-cat-id:checked").forEach((el) => {
      checked.push(labels.get(el.value) || el.value);
    });
    if (checked.length === 0) {
      typeBtn.textContent = "类型";
      return;
    }
    if (checked.length === 1) {
      typeBtn.textContent = `类型 · ${checked[0]}`;
      return;
    }
    if (checked.length === 2) {
      typeBtn.textContent = `类型 · ${checked[0]}等 2 项`;
      return;
    }
    typeBtn.textContent = `类型 · ${checked.length} 项`;
  }

  function closeTypePopover(): void {
    typePopover.classList.add("hidden");
    typeBtn.setAttribute("aria-expanded", "false");
  }

  function positionTypePopover(): void {
    const r = typeBtn.getBoundingClientRect();
    const panel = d.root.querySelector(".scan-tab")!.getBoundingClientRect();
    typePopover.style.left = `${r.left - panel.left}px`;
    typePopover.style.top = `${r.bottom - panel.top + 4}px`;
    typePopover.style.minWidth = `${Math.max(r.width, 200)}px`;
  }

  function resetCategoryPickDefaults(): void {
    catAllEl.checked = false;
    catList.querySelectorAll<HTMLInputElement>(".scan-cat-id").forEach((c) => {
      c.disabled = false;
      c.checked = DEFAULT_SCAN_GROUPS.includes(c.value);
    });
    updateScanTypeButtonLabel();
  }

  function selectedScanCategories(): string[] {
    if (catAllEl.checked) return ["all"];
    const ids: string[] = [];
    catList.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked').forEach((el) => {
      if (el.value && el.value !== "all") ids.push(el.value);
    });
    return ids;
  }

  function buildCategoryPickList(groups: CategoryInfo[]): void {
    catList.innerHTML = "";
    for (const g of groups) {
      if (g.id === "all") continue;
      const on = DEFAULT_SCAN_GROUPS.includes(g.id) ? " checked" : "";
      catList.insertAdjacentHTML(
        "beforeend",
        `<label class="scan-filter-item"><input type="checkbox" class="scan-cat-id" value="${escapeAttr(g.id)}"${on}/><span>${escapeHtml(g.label)}</span></label>`,
      );
    }
    catList.querySelectorAll(".scan-cat-id").forEach((el) => {
      el.addEventListener("change", () => {
        if ((el as HTMLInputElement).checked) catAllEl.checked = false;
        updateScanTypeButtonLabel();
      });
    });
    catAllEl.addEventListener("change", () => {
      const on = catAllEl.checked;
      catList.querySelectorAll<HTMLInputElement>(".scan-cat-id").forEach((c) => {
        c.disabled = on;
        if (on) c.checked = false;
      });
      updateScanTypeButtonLabel();
    });
    updateScanTypeButtonLabel();
  }

  sizePresetEl.addEventListener("change", () => {
    applySizePreset(sizePresetEl.value);
  });

  d.sizeClose.addEventListener("click", () => closeSizePopover());

  minMbEl.addEventListener("input", () => syncSizePresetSelect());
  maxMbEl.addEventListener("input", () => syncSizePresetSelect());

  typeBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const open = typePopover.classList.contains("hidden");
    if (open) {
      closeSizePopover();
      d.closeFilterPopover();
      positionTypePopover();
      typePopover.classList.remove("hidden");
      typeBtn.setAttribute("aria-expanded", "true");
    } else {
      closeTypePopover();
    }
  });

  d.typeClose.addEventListener("click", () => closeTypePopover());

  return {
    closeSizePopover,
    positionSizePopover,
    resetSizePickDefaults,
    closeTypePopover,
    positionTypePopover,
    resetCategoryPickDefaults,
    selectedScanCategories,
    buildCategoryPickList,
  };
}
