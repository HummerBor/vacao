import { invoke } from "../ipc";
import { listen } from "@tauri-apps/api/event";

type AppConfig = {
  minSizeMb: number;
  excludeDirNames: string[];
};

type CategoryInfo = { id: string; label: string };

type ScannedFileRow = {
  path: string;
  size: number;
  modifiedMs: number;
  category: string;
};

type ScanStatus = {
  state: string;
  results?: ScannedFileRow[] | null;
  error?: string | null;
  filesSeen: number;
  bytesSeen: number;
  hits: number;
  currentPath?: string | null;
};

type DeleteRow = { path: string; ok: boolean; error?: string | null };

const DEFAULT_SCAN_GROUPS = [
  "video",
  "image",
  "archive",
  "disk_image",
  "installer",
];

const DEFAULT_SCAN_ROOT = "C:\\";

/** Preset minimum sizes (MB) for the size dropdown. */
const SCAN_SIZE_PRESETS = [50, 100, 500, 1024] as const;

function parseMinMbInput(el: HTMLInputElement): number {
  const raw = el.value.trim();
  if (raw === "") return 100;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 100;
  return Math.floor(n);
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

function sizeRangeNote(minMb: number, maxMb: number | null): string {
  const maxNote = maxMb ? `≤${maxMb}MB` : "无上限";
  return `${minMb}–${maxNote}`;
}

function setScanPathDisplay(el: HTMLInputElement, path: string): void {
  el.value = path;
  el.title = path;
}

function formatProgressStats(
  st: ScanStatus,
  minMb: number,
  maxMb: number | null,
  brief: boolean,
): string {
  const range = sizeRangeNote(minMb, maxMb);
  const core = `命中 ${st.hits} · 遍历 ${st.filesSeen}`;
  if (brief) return core;
  return `${core} · ${fmtBytes(Number(st.bytesSeen))} · ${range}`;
}

function scanTypeSummary(catAll: boolean, catListEl: Element, labels: Map<string, string>): string {
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

function sizeFilterSummary(minMb: number, maxMb: number | null): string {
  if (maxMb && maxMb > 0) return `≥${minMb}–≤${maxMb}MB`;
  return `≥${minMb}MB`;
}

export function mountScanTab(root: HTMLElement, tauriReady: boolean): void {
  root.innerHTML = `
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

  let jobId: string | null = null;
  let scanState = "";
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let currentRows: ScannedFileRow[] = [];
  let lastRendered = 0;
  let categoryLabels = new Map<string, string>();
  let displayCats = new Set<string>();
  let filterShowAll = true;
  let scanRoot = DEFAULT_SCAN_ROOT;
  /** Native folder dialog is open; webview stays interactive until invoke returns. */
  let folderPickerOpen = false;

  const pathEl = root.querySelector<HTMLInputElement>("#scan-path")!;
  const browseBtn = root.querySelector<HTMLButtonElement>("#scan-browse")!;
  const sizePresetEl = root.querySelector<HTMLSelectElement>("#scan-size-preset")!;
  const sizePopover = root.querySelector<HTMLDivElement>("#scan-size-popover")!;
  const sizeClose = root.querySelector("#scan-size-close")!;
  const minMbEl = root.querySelector<HTMLInputElement>("#scan-minmb")!;
  const maxMbEl = root.querySelector<HTMLInputElement>("#scan-maxmb")!;
  const progEl = root.querySelector<HTMLDivElement>("#scan-progress")!;
  const tbody = root.querySelector("#scan-tbody")!;
  const goBtn = root.querySelector<HTMLButtonElement>("#scan-go")!;
  const resetBtn = root.querySelector<HTMLButtonElement>("#scan-reset")!;
  const delBtn = root.querySelector<HTMLButtonElement>("#scan-del")!;
  const catList = root.querySelector("#scan-cat-list")!;
  const catAllEl = root.querySelector<HTMLInputElement>("#scan-cat-all")!;
  const typeBtn = root.querySelector<HTMLButtonElement>("#scan-type-btn")!;
  const typePopover = root.querySelector<HTMLDivElement>("#scan-type-popover")!;
  const typeClose = root.querySelector("#scan-type-close")!;
  const filterBtn = root.querySelector<HTMLButtonElement>("#scan-filter-btn")!;
  const filterPopover = root.querySelector<HTMLDivElement>("#scan-filter-popover")!;
  const filterAllEl = root.querySelector<HTMLInputElement>("#scan-filter-all")!;
  const filterList = root.querySelector("#scan-filter-list")!;
  const filterClose = root.querySelector("#scan-filter-close")!;
  const selAllEl = root.querySelector<HTMLInputElement>("#scan-selall")!;
  const tableWrap = root.querySelector<HTMLDivElement>(".scan-table-wrap")!;
  const rowMenu = root.querySelector<HTMLDivElement>("#scan-row-menu")!;
  const rowMenuOpenFolder = rowMenu.querySelector<HTMLButtonElement>(
    '[data-action="open-folder"]',
  )!;
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

  function isScanConfigLocked(): boolean {
    return scanState === "running" || scanState === "paused";
  }

  function updateScanUiState(): void {
    if (scanState === "running") {
      goBtn.textContent = "暂停";
    } else if (scanState === "paused") {
      goBtn.textContent = "继续";
    } else {
      goBtn.textContent = "开始扫描";
    }
    const locked = isScanConfigLocked();
    const pickerBusy = folderPickerOpen;
    typeBtn.disabled = locked || pickerBusy;
    sizePresetEl.disabled = locked || pickerBusy;
    browseBtn.disabled = locked || !tauriReady || pickerBusy;
    goBtn.disabled = pickerBusy;
    resetBtn.disabled = pickerBusy;
    delBtn.disabled = locked || !jobId || pickerBusy;
    root.querySelector(".scan-tab")?.classList.toggle("scan-folder-picking", pickerBusy);
    selAllEl.disabled = locked;
    tableWrap.classList.toggle("scan-list-locked", locked);
    tbody.querySelectorAll<HTMLInputElement>("input.sel").forEach((cb) => {
      cb.disabled = locked;
    });
    if (locked) {
      closeTypePopover();
      closeSizePopover();
      closeFilterPopover();
    }
  }

  function closeSizePopover(): void {
    sizePopover.classList.add("hidden");
  }

  function positionSizePopover(): void {
    const r = sizePresetEl.getBoundingClientRect();
    const panel = root.querySelector(".scan-tab")!.getBoundingClientRect();
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
    const checked: string[] = [];
    catList.querySelectorAll<HTMLInputElement>(".scan-cat-id:checked").forEach((el) => {
      checked.push(categoryLabels.get(el.value) || el.value);
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
    const panel = root.querySelector(".scan-tab")!.getBoundingClientRect();
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

  function setFilterBtnVisible(visible: boolean): void {
    filterBtn.classList.toggle("hidden", !visible);
    if (!visible) closeFilterPopover();
  }

  function closeFilterPopover(): void {
    filterPopover.classList.add("hidden");
    filterBtn.setAttribute("aria-expanded", "false");
  }

  function positionFilterPopover(): void {
    const th = root.querySelector(".col-category");
    if (!th) return;
    const r = th.getBoundingClientRect();
    const panel = root.querySelector(".scan-tab")!.getBoundingClientRect();
    filterPopover.style.left = `${r.left - panel.left}px`;
    filterPopover.style.top = `${r.bottom - panel.top + 4}px`;
    filterPopover.style.minWidth = `${Math.max(r.width, 200)}px`;
  }

  function resetScanUi(clearProgress = true): void {
    stopPoll();
    jobId = null;
    scanState = "";
    tbody.innerHTML = "";
    currentRows = [];
    lastRendered = 0;
    filterShowAll = true;
    displayCats.clear();
    setFilterBtnVisible(false);
    closeFilterPopover();
    closeSizePopover();
    closeRowMenu();
    if (clearProgress) {
      clearScanProgress();
      resetCategoryPickDefaults();
    }
    updateScanUiState();
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
    for (const id of present) {
      const label = categoryLabels.get(id) || id;
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
    for (const r of rows) {
      const mod = new Date(Number(r.modifiedMs));
      const label = categoryLabels.get(r.category) || r.category;
      const tr = document.createElement("tr");
      tr.dataset.category = r.category;
      tr.dataset.filePath = r.path;
      const rowLocked = isScanConfigLocked();
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

  function sortAndRenderAll(rows: ScannedFileRow[]): void {
    const sorted = [...rows].sort((a, b) => Number(b.size) - Number(a.size));
    currentRows = sorted;
    tbody.innerHTML = "";
    lastRendered = 0;
    appendRows(sorted);
    lastRendered = sorted.length;
    buildFilterPopoverOptions();
  }

  function clearScanProgress(): void {
    progEl.hidden = true;
    progEl.innerHTML = "";
    progEl.className = "scan-progress-bar";
  }

  function showScanProgressMessage(text: string, mod = "done"): void {
    progEl.className = `scan-progress-bar is-active scan-progress--${mod}`;
    progEl.innerHTML = `<span class="scan-progress-state">${escapeHtml(text)}</span>`;
    progEl.hidden = false;
  }

  function buildActiveScanDetail(
    st: ScanStatus,
    minMb: number,
    maxMb: number | null,
  ): string {
    const root = scanRoot || pathEl.value.trim() || DEFAULT_SCAN_ROOT;
    const parts = [
      root,
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

  function renderScanProgress(st: ScanStatus, minMb: number, maxMb: number | null): void {
    const stateMap: Record<string, { label: string; mod: string }> = {
      running: { label: "扫描中", mod: "running" },
      paused: { label: "已暂停", mod: "paused" },
      cancelled: { label: "已停止", mod: "stopped" },
      failed: { label: "失败", mod: "failed" },
      completed: { label: "完成", mod: "done" },
    };
    const meta = stateMap[st.state] ?? { label: st.state, mod: "done" };
    const active = st.state === "running" || st.state === "paused";
    let stats = active
      ? buildActiveScanDetail(st, minMb, maxMb)
      : formatProgressStats(st, minMb, maxMb, false);
    if (st.state === "failed") {
      stats = `${st.error || ""} · ${stats}`.replace(/^ · /, "");
    }
    const dot = active ? '<span class="scan-progress-dot" aria-hidden="true"></span>' : "";
    const err =
      st.state === "completed" && st.error
        ? ` · ${st.error}`
        : "";
    const fullLine = err ? `${stats}${err}` : stats;
    progEl.className = `scan-progress-bar is-active scan-progress--${meta.mod}`;
    progEl.title = fullLine;
    progEl.innerHTML = `<span class="scan-progress-state">${dot}${escapeHtml(meta.label)}</span><span class="scan-progress-text" title="${escapeAttr(fullLine)}">${escapeHtml(fullLine)}</span>`;
    progEl.hidden = false;
  }

  function updateProgress(st: ScanStatus, minMb: number, maxMb: number | null): void {
    if (!st.state || st.state === "idle") {
      clearScanProgress();
      return;
    }
    renderScanProgress(st, minMb, maxMb);
  }

  void (async () => {
    try {
      const cfg = await invoke<AppConfig>("get_config");
      resetSizePickDefaults(cfg.minSizeMb ?? 100);
    } catch {
      resetSizePickDefaults(100);
    }
    try {
      const labels = await invoke<CategoryInfo[]>("scan_category_labels");
      categoryLabels = new Map(labels.map((c) => [c.id, c.label]));
    } catch {
      /* ignore */
    }
    try {
      const groups = await invoke<CategoryInfo[]>("scan_categories");
      buildCategoryPickList(groups);
    } catch {
      catList.innerHTML = '<span class="warn">无法加载类别</span>';
    }
  })();

  async function pickScanFolder(): Promise<void> {
    if (folderPickerOpen || !tauriReady) return;
    folderPickerOpen = true;
    updateScanUiState();
    try {
      const picked = await invoke<string | null>("pick_scan_folder", {
        defaultPath: scanRoot || DEFAULT_SCAN_ROOT,
      });
      if (picked) {
        scanRoot = picked;
        setScanPathDisplay(pathEl, picked);
      }
    } catch (e) {
      alert(String(e));
    } finally {
      folderPickerOpen = false;
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
      if (!jobId || e.payload.jobId !== jobId) return;
      if (scanState !== "running" && scanState !== "paused") {
        scanState = "running";
        updateScanUiState();
      }
      const maxMb = maxMbEl.value.trim() ? Number(maxMbEl.value) : null;
      renderScanProgress(
        {
          state: "running",
          hits: e.payload.hits,
          filesSeen: e.payload.filesSeen,
          bytesSeen: e.payload.bytesSeen,
          currentPath: e.payload.currentPath,
          results: null,
          error: null,
        },
        parseMinMbInput(minMbEl),
        maxMb && maxMb > 0 ? maxMb : null,
      );
    }).catch(() => {});
  }

  function stopPoll(): void {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  sizePresetEl.addEventListener("change", () => {
    applySizePreset(sizePresetEl.value);
  });

  sizeClose.addEventListener("click", () => closeSizePopover());

  minMbEl.addEventListener("input", () => syncSizePresetSelect());
  maxMbEl.addEventListener("input", () => syncSizePresetSelect());

  typeBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const open = typePopover.classList.contains("hidden");
    if (open) {
      closeSizePopover();
      closeFilterPopover();
      positionTypePopover();
      typePopover.classList.remove("hidden");
      typeBtn.setAttribute("aria-expanded", "true");
    } else {
      closeTypePopover();
    }
  });

  typeClose.addEventListener("click", () => closeTypePopover());

  filterBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (filterBtn.classList.contains("hidden")) return;
    const open = filterPopover.classList.contains("hidden");
    if (open) {
      closeTypePopover();
      closeSizePopover();
      positionFilterPopover();
      filterPopover.classList.remove("hidden");
      filterBtn.setAttribute("aria-expanded", "true");
    } else {
      closeFilterPopover();
    }
  });

  filterClose.addEventListener("click", () => closeFilterPopover());

  tableWrap.addEventListener("contextmenu", (ev) => {
    if (!tauriReady) return;
    const tr = (ev.target as Element).closest<HTMLTableRowElement>("tr[data-file-path]");
    if (!tr || tr.classList.contains("scan-row-hidden")) return;
    const path = tr.dataset.filePath?.trim();
    if (!path) return;
    showRowMenu(ev.clientX, ev.clientY, path);
  });

  rowMenuOpenFolder.addEventListener("click", () => {
    const path = rowMenuPath;
    closeRowMenu();
    if (!path) return;
    void invoke("open_path_in_shell", { path }).catch((e) => {
      alert(String(e));
    });
  });

  tableWrap.addEventListener("scroll", () => closeRowMenu(), true);

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") closeRowMenu();
  });

  document.addEventListener("click", (ev) => {
    const t = ev.target as Node;
    if (!rowMenu.classList.contains("hidden") && !rowMenu.contains(t)) {
      closeRowMenu();
    }
    if (!sizePopover.classList.contains("hidden")) {
      if (
        !sizePopover.contains(t) &&
        !sizePresetEl.contains(t) &&
        t !== sizePresetEl
      ) {
        closeSizePopover();
      }
    }
    if (!typePopover.classList.contains("hidden")) {
      if (!typePopover.contains(t) && !typeBtn.contains(t)) closeTypePopover();
    }
    if (!filterPopover.classList.contains("hidden")) {
      if (!filterPopover.contains(t) && !filterBtn.contains(t)) closeFilterPopover();
    }
  });

  selAllEl.addEventListener("change", (ev) => {
    if (isScanConfigLocked()) {
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

  goBtn.addEventListener("click", () => {
    void (async () => {
      if (folderPickerOpen) return;
      if (scanState === "running" && jobId) {
        try {
          await invoke("scan_pause", { jobId });
          scanState = "paused";
          updateScanUiState();
          filterBtn.disabled = false;
        } catch (e) {
          showScanProgressMessage(String(e), "failed");
        }
        return;
      }
      if (scanState === "paused" && jobId) {
        try {
          await invoke("scan_resume", { jobId });
          scanState = "running";
          updateScanUiState();
          filterBtn.disabled = true;
        } catch (e) {
          showScanProgressMessage(String(e), "failed");
        }
        return;
      }

      resetScanUi(false);
      filterBtn.disabled = true;

      const rootPath = pathEl.value.trim() || DEFAULT_SCAN_ROOT;
      if (!rootPath) {
        alert("请选择扫描文件夹");
        return;
      }

      const minSizeMb = parseMinMbInput(minMbEl);
      const maxRaw = maxMbEl.value.trim();
      const maxSizeMb = maxRaw ? Number(maxRaw) : null;
      if (maxSizeMb !== null && maxSizeMb > 0 && maxSizeMb < minSizeMb) {
        alert("最大 MB 不能小于最小 MB");
        return;
      }

      const categories = selectedScanCategories();
      if (categories.length === 0) {
        alert("请勾选「全部类型」或至少一种类别");
        return;
      }

      let excludeDirNames: string[] = [];
      try {
        const cfg = await invoke<AppConfig>("get_config");
        excludeDirNames = cfg.excludeDirNames || [];
      } catch {
        /* ignore */
      }

      showScanProgressMessage("正在启动…", "running");
      try {
        jobId = await invoke<string>("scan_start", {
          args: {
            roots: [rootPath],
            minSizeMb,
            maxSizeMb: maxSizeMb && maxSizeMb > 0 ? maxSizeMb : null,
            categories,
            excludeDirNames,
          },
        });
        scanState = "running";
        scanRoot = rootPath;
        updateScanUiState();
      } catch (e) {
        showScanProgressMessage(String(e), "failed");
        return;
      }

      pollTimer = setInterval(() => {
        void (async () => {
          if (!jobId) return;
          try {
            const st = await invoke<ScanStatus>("scan_status", { jobId });
            scanState = st.state;
            updateScanUiState();
            const maxMb = maxSizeMb && maxSizeMb > 0 ? maxSizeMb : null;

            if (st.state === "running" || st.state === "paused") {
              const batch = st.results || [];
              if (batch.length > lastRendered) {
                appendRows(batch.slice(lastRendered));
                lastRendered = batch.length;
              }
              if (st.state === "running") filterBtn.disabled = true;
              else filterBtn.disabled = false;
              updateProgress(st, minSizeMb, maxMb);
              if (batch.length > 0 && st.state === "paused") {
                setFilterBtnVisible(true);
              }
              return;
            }

            stopPoll();
            sortAndRenderAll(st.results || []);
            updateProgress(st, minSizeMb, maxMb);
            updateScanUiState();
            filterBtn.disabled = false;
          } catch (e) {
            stopPoll();
            showScanProgressMessage(String(e), "failed");
            scanState = "";
            updateScanUiState();
            filterBtn.disabled = false;
          }
        })();
      }, 400);
    })();
  });

  resetBtn.addEventListener("click", () => {
    void (async () => {
      const id = jobId;
      if (id && (scanState === "running" || scanState === "paused")) {
        try {
          await invoke("scan_cancel", { jobId: id });
        } catch {
          /* ignore */
        }
      }
      scanRoot = DEFAULT_SCAN_ROOT;
      setScanPathDisplay(pathEl, DEFAULT_SCAN_ROOT);
      try {
        const cfg = await invoke<AppConfig>("get_config");
        resetSizePickDefaults(cfg.minSizeMb ?? 100);
      } catch {
        resetSizePickDefaults(100);
      }
      resetScanUi(true);
      filterBtn.disabled = false;
      closeTypePopover();
    })();
  });

  delBtn.addEventListener("click", () => {
    void (async () => {
      if (!jobId || isScanConfigLocked()) return;
      const paths = [...tbody.querySelectorAll<HTMLInputElement>("input.sel:checked")]
        .filter((inp) => {
          const tr = inp.closest("tr");
          const p = inp.dataset.path || "";
          return p && tr && !tr.classList.contains("scan-row-hidden");
        })
        .map((inp) => inp.dataset.path || "");
      if (paths.length === 0) {
        alert("请勾选要删除的文件");
        return;
      }
      if (!confirm(`将 ${paths.length} 个文件移入回收站，是否继续？`)) return;
      try {
        const res = await invoke<DeleteRow[]>("delete_to_recycle", {
          payload: { jobId, paths },
        });
        const failed = new Set(res.filter((r) => !r.ok).map((r) => r.path));
        const bad = res.filter((r) => !r.ok);
        alert(
          bad.length === 0
            ? "已提交删除到回收站（若文件被占用可能失败，以结果为准）。"
            : `部分失败 ${bad.length} 条（示例）：\n${bad
                .slice(0, 8)
                .map((r) => `${r.path}: ${r.error || ""}`)
                .join("\n")}`,
        );
        currentRows = currentRows.filter((r) => {
          if (!paths.includes(r.path)) return true;
          return failed.has(r.path);
        });
        sortAndRenderAll(currentRows);
      } catch (e) {
        alert(String(e));
      }
    })();
  });

  window.addEventListener(
    "resize",
    () => {
      if (!filterPopover.classList.contains("hidden")) positionFilterPopover();
      if (!typePopover.classList.contains("hidden")) positionTypePopover();
      if (!sizePopover.classList.contains("hidden")) positionSizePopover();
    },
    { passive: true },
  );

  updateScanUiState();
}
