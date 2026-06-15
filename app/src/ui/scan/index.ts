/** 大文件扫描 Tab：挂载入口与 UI 状态编排。 */

import { invoke } from "../../ipc";
import { listen } from "@tauri-apps/api/event";
import { formatBytes as fmtBytes } from "../shared";
import type { AppConfig, CategoryInfo, ScanStatus } from "./types";
import { DEFAULT_SCAN_ROOT } from "./types";
import { scanTabHtml, queryScanEls } from "./template";
import { clearScanProgress, renderScanProgress } from "./progress";
import {
  createScanControls,
  parseMinMbInput,
  scanTypeSummary,
  sizeFilterSummary,
} from "./controls";
import { createResultsView } from "./results-table";
import { wireScanActions, type ScanRuntime } from "./actions";

function setScanPathDisplay(el: HTMLInputElement, path: string): void {
  el.value = path;
  el.title = path;
}

export function mountScanTab(root: HTMLElement, tauriReady: boolean): void {
  root.innerHTML = scanTabHtml();

  const rt: ScanRuntime = {
    jobId: null,
    scanState: "",
    pollTimer: null,
    scanRoot: DEFAULT_SCAN_ROOT,
    /** Native folder dialog is open; webview stays interactive until invoke returns. */
    folderPickerOpen: false,
  };
  let categoryLabels = new Map<string, string>();

  const els = queryScanEls(root);
  const {
    pathEl,
    browseBtn,
    sizePresetEl,
    sizePopover,
    minMbEl,
    maxMbEl,
    progEl,
    tbody,
    goBtn,
    resetBtn,
    delBtn,
    catList,
    catAllEl,
    typeBtn,
    typePopover,
    filterBtn,
    filterPopover,
    selAllEl,
    tableWrap,
    rowMenu,
  } = els;

  function isScanConfigLocked(): boolean {
    return rt.scanState === "running" || rt.scanState === "paused";
  }

  const controls = createScanControls({
    root,
    sizePresetEl,
    sizePopover,
    sizeClose: els.sizeClose,
    minMbEl,
    maxMbEl,
    typeBtn,
    typePopover,
    typeClose: els.typeClose,
    catAllEl,
    catList,
    getLabels: () => categoryLabels,
    closeFilterPopover: () => view.closeFilterPopover(),
  });

  const view = createResultsView({
    root,
    tbody,
    tableWrap,
    selAllEl,
    filterBtn,
    filterPopover,
    filterAllEl: els.filterAllEl,
    filterList: els.filterList,
    filterClose: els.filterClose,
    rowMenu,
    rowMenuOpenFolder: els.rowMenuOpenFolder,
    tauriReady,
    getLabels: () => categoryLabels,
    isLocked: isScanConfigLocked,
    closeOtherPopovers: () => {
      controls.closeTypePopover();
      controls.closeSizePopover();
    },
  });

  function updateScanUiState(): void {
    if (rt.scanState === "running") {
      goBtn.textContent = "暂停";
    } else if (rt.scanState === "paused") {
      goBtn.textContent = "继续";
    } else {
      goBtn.textContent = "开始扫描";
    }
    const locked = isScanConfigLocked();
    const pickerBusy = rt.folderPickerOpen;
    typeBtn.disabled = locked || pickerBusy;
    sizePresetEl.disabled = locked || pickerBusy;
    browseBtn.disabled = locked || !tauriReady || pickerBusy;
    goBtn.disabled = pickerBusy;
    resetBtn.disabled = pickerBusy;
    delBtn.disabled = locked || !rt.jobId || pickerBusy;
    root.querySelector(".scan-tab")?.classList.toggle("scan-folder-picking", pickerBusy);
    selAllEl.disabled = locked;
    tableWrap.classList.toggle("scan-list-locked", locked);
    tbody.querySelectorAll<HTMLInputElement>("input.sel").forEach((cb) => {
      cb.disabled = locked;
    });
    if (locked) {
      controls.closeTypePopover();
      controls.closeSizePopover();
      view.closeFilterPopover();
    }
  }

  function stopPoll(): void {
    if (rt.pollTimer) {
      clearInterval(rt.pollTimer);
      rt.pollTimer = null;
    }
  }

  function resetScanUi(clearProgress = true): void {
    stopPoll();
    rt.jobId = null;
    rt.scanState = "";
    view.resetView();
    controls.closeSizePopover();
    if (clearProgress) {
      clearScanProgress(progEl);
      controls.resetCategoryPickDefaults();
    }
    updateScanUiState();
  }

  function buildActiveScanDetail(
    st: ScanStatus,
    minMb: number,
    maxMb: number | null,
  ): string {
    const rootPath = rt.scanRoot || pathEl.value.trim() || DEFAULT_SCAN_ROOT;
    const parts = [
      rootPath,
      sizeFilterSummary(minMb, maxMb),
      scanTypeSummary(catAllEl.checked, catList, categoryLabels),
      `命中 ${st.hits}`,
      `遍历 ${st.filesSeen}`,
      fmtBytes(Number(st.bytesSeen)),
    ];
    const cur = (st.currentPath || "").trim();
    if (cur) parts.push(`当前 ${cur}`);
    return parts.join(" · ");
  }

  void (async () => {
    try {
      const cfg = await invoke<AppConfig>("get_config");
      controls.resetSizePickDefaults(cfg.minSizeMb ?? 100);
    } catch {
      controls.resetSizePickDefaults(100);
    }
    try {
      const labels = await invoke<CategoryInfo[]>("scan_category_labels");
      categoryLabels = new Map(labels.map((c) => [c.id, c.label]));
    } catch {
      /* ignore */
    }
    try {
      const groups = await invoke<CategoryInfo[]>("scan_categories");
      controls.buildCategoryPickList(groups);
    } catch {
      catList.innerHTML = '<span class="warn">无法加载类别</span>';
    }
  })();

  async function pickScanFolder(): Promise<void> {
    if (rt.folderPickerOpen || !tauriReady) return;
    rt.folderPickerOpen = true;
    updateScanUiState();
    try {
      const picked = await invoke<string | null>("pick_scan_folder", {
        defaultPath: rt.scanRoot || DEFAULT_SCAN_ROOT,
      });
      if (picked) {
        rt.scanRoot = picked;
        setScanPathDisplay(pathEl, picked);
      }
    } catch (e) {
      alert(String(e));
    } finally {
      rt.folderPickerOpen = false;
      updateScanUiState();
    }
  }

  if (tauriReady) {
    browseBtn.addEventListener("click", () => {
      void pickScanFolder();
    });
  } else {
    browseBtn.disabled = true;
    browseBtn.title = "需要 Tauri 环境";
  }

  if (tauriReady) {
    void listen<{
      jobId: string;
      filesSeen: number;
      bytesSeen: number;
      hits: number;
      currentPath: string;
    }>("scan-progress", (e) => {
      if (!rt.jobId || e.payload.jobId !== rt.jobId) return;
      if (rt.scanState !== "running" && rt.scanState !== "paused") {
        rt.scanState = "running";
        updateScanUiState();
      }
      const maxRaw = maxMbEl.value.trim() ? Number(maxMbEl.value) : null;
      const minMb = parseMinMbInput(minMbEl);
      const maxMb = maxRaw && maxRaw > 0 ? maxRaw : null;
      renderScanProgress(
        progEl,
        {
          state: "running",
          hits: e.payload.hits,
          filesSeen: e.payload.filesSeen,
          bytesSeen: e.payload.bytesSeen,
          currentPath: e.payload.currentPath,
          results: null,
          error: null,
        },
        minMb,
        maxMb,
        (s) => buildActiveScanDetail(s, minMb, maxMb),
      );
    }).catch(() => {});
  }

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") view.closeRowMenu();
  });

  document.addEventListener("click", (ev) => {
    const t = ev.target as Node;
    if (!rowMenu.classList.contains("hidden") && !rowMenu.contains(t)) {
      view.closeRowMenu();
    }
    if (!sizePopover.classList.contains("hidden")) {
      if (
        !sizePopover.contains(t) &&
        !sizePresetEl.contains(t) &&
        t !== sizePresetEl
      ) {
        controls.closeSizePopover();
      }
    }
    if (!typePopover.classList.contains("hidden")) {
      if (!typePopover.contains(t) && !typeBtn.contains(t)) controls.closeTypePopover();
    }
    if (!filterPopover.classList.contains("hidden")) {
      if (!filterPopover.contains(t) && !filterBtn.contains(t)) view.closeFilterPopover();
    }
  });

  wireScanActions({
    els,
    rt,
    controls,
    view,
    setScanPathDisplay,
    updateScanUiState,
    resetScanUi,
    stopPoll,
    isScanConfigLocked,
    buildActiveScanDetail,
  });

  window.addEventListener(
    "resize",
    () => {
      if (!filterPopover.classList.contains("hidden")) view.positionFilterPopover();
      if (!typePopover.classList.contains("hidden")) controls.positionTypePopover();
      if (!sizePopover.classList.contains("hidden")) controls.positionSizePopover();
    },
    { passive: true },
  );

  updateScanUiState();
}
