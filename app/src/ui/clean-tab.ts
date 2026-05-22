import { invoke } from "../ipc";

export type CleanResultItem = {
  id: string;
  status: string;
  detail?: string | null;
};

type CleanCatalogItem = {
  id: string;
  label: string;
  pathsHint: string;
  purpose: string;
  deleteNote: string;
  tag: string;
  warn: boolean;
  defaultChecked: boolean;
  sizeBytes: number;
  sizeDisplay: string;
};

type CleanGroupDef = {
  id: string;
  title: string;
  hint: string;
  ids: string[];
};

const CLEAN_GROUPS: CleanGroupDef[] = [
  {
    id: "cache",
    title: "日常缓存",
    hint: "临时文件、浏览器与开发工具缓存，一般可放心清理",
    ids: ["C01", "C06", "C04", "C10", "C16", "C08", "C11", "C12", "C13"],
  },
  {
    id: "system",
    title: "系统与其它",
    hint: "回收站、系统临时目录等，部分需管理员权限",
    ids: ["C03", "C02", "C05"],
  },
  {
    id: "advanced",
    title: "高级",
    hint: "Cursor 工作区/全局库、自定义目录等，清理前请看清说明并退出 Cursor",
    ids: ["C17", "C18", "C09"],
  },
];

const PACK_GROUP: CleanGroupDef = {
  id: "pack",
  title: "扩展清理",
  hint: "来自 clean-pack.json；请先在设置中导入",
  ids: [],
};

let reloadCleanCatalog: (() => void) | null = null;

const DETAIL_PLACEHOLDER =
  '<p class="clean-detail-placeholder">将鼠标移到「详情」查看说明</p>';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tagClass(tag: string): string {
  if (tag.includes("需谨慎")) return "tag-warn";
  if (tag.includes("可安全")) return "tag-safe";
  return "tag-normal";
}

function formatBytes(n: number): string {
  if (n <= 0) return "0 B";
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function sizeLabel(row: CleanCatalogItem): string {
  if (row.sizeBytes <= 0) return "\u2014";
  return row.sizeDisplay;
}

function sizeCellClass(row: CleanCatalogItem): string {
  if (row.sizeBytes <= 0) return "clean-size clean-size-empty";
  if (row.sizeBytes >= 1024 ** 3) return "clean-size clean-size-lg";
  return "clean-size";
}

function deleteNoteToPlain(note: string): string {
  return note
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ");
}

function deleteNoteToModalHtml(note: string): string {
  return note
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (!t) return "";
      if (t.startsWith("【")) {
        return `<p class="clean-modal-heading">${escapeHtml(t)}</p>`;
      }
      if (t.startsWith("·")) {
        return `<p class="clean-modal-bullet">${escapeHtml(t)}</p>`;
      }
      return `<p>${escapeHtml(t)}</p>`;
    })
    .join("");
}

function buildClampSection(
  label: string,
  plainText: string,
  sectionId: string,
  blockExtraClass = "",
): string {
  return [
    `<div class="clean-tip-block clean-tip-block-fixed${blockExtraClass}">`,
    `<span class="clean-tip-label">${escapeHtml(label)}</span>`,
    '<div class="clean-tip-clamp-wrap">',
    `<p class="clean-tip-clamp-3">${escapeHtml(plainText)}</p>`,
    `<button type="button" class="clean-tip-more" data-section="${sectionId}">详情</button>`,
    "</div>",
    "</div>",
  ].join("");
}

function buildDetailHtml(row: CleanCatalogItem): string {
  const warnCls = row.warn ? " clean-tip-warn" : "";
  const purposeSection = buildClampSection("作用", row.purpose, "purpose");
  const deletePlain = deleteNoteToPlain(row.deleteNote);
  const deleteSection = buildClampSection(
    "删除注意",
    deletePlain,
    "delete",
    warnCls,
  );
  return [
    '<div class="clean-detail-body">',
    `<p class="clean-tip-title">${escapeHtml(row.label)}</p>`,
    purposeSection,
    '<div class="clean-tip-block clean-tip-block-paths">',
    '<span class="clean-tip-label">路径</span>',
    `<pre class="clean-tip-paths">${escapeHtml(row.pathsHint)}</pre>`,
    "</div>",
    deleteSection,
    "</div>",
  ].join("");
}

function ensureCleanTextModal(): HTMLElement {
  let el = document.getElementById("clean-text-modal");
  if (el) return el;
  el = document.createElement("div");
  el.id = "clean-text-modal";
  el.className = "clean-text-modal";
  el.hidden = true;
  el.innerHTML = [
    '<div class="clean-text-modal-backdrop" data-close="1"></div>',
    '<div class="clean-text-modal-box" role="dialog" aria-modal="true">',
    '<p class="clean-text-modal-title"></p>',
    '<div class="clean-text-modal-body ui-scroll"></div>',
    '<div class="clean-text-modal-actions">',
    '<button type="button" class="secondary" data-close="1">关闭</button>',
    "</div>",
    "</div>",
  ].join("");
  document.body.appendChild(el);
  const close = () => {
    el!.hidden = true;
  };
  el.querySelectorAll("[data-close]").forEach((n) => {
    n.addEventListener("click", close);
  });
  return el;
}

function openCleanTextModal(title: string, bodyHtml: string): void {
  const modal = ensureCleanTextModal();
  const titleEl = modal.querySelector(".clean-text-modal-title")!;
  const bodyEl = modal.querySelector(".clean-text-modal-body")!;
  titleEl.textContent = title;
  bodyEl.innerHTML = bodyHtml;
  modal.hidden = false;
}

function ensureCleanRunModal(): HTMLElement {
  let el = document.getElementById("clean-run-modal");
  if (el) return el;
  el = document.createElement("div");
  el.id = "clean-run-modal";
  el.className = "clean-text-modal clean-run-modal";
  el.hidden = true;
  el.innerHTML = [
    '<div class="clean-text-modal-backdrop" data-close="1"></div>',
    '<div class="clean-text-modal-box" role="dialog" aria-modal="true" aria-labelledby="clean-run-modal-title">',
    '<p id="clean-run-modal-title" class="clean-text-modal-title"></p>',
    '<div class="clean-run-modal-summary"></div>',
    '<div class="clean-text-modal-body clean-run-modal-body ui-scroll"></div>',
    '<div class="clean-text-modal-actions">',
    '<button type="button" class="secondary" data-close="1">关闭</button>',
    "</div>",
    "</div>",
  ].join("");
  document.body.appendChild(el);
  const close = () => {
    el!.hidden = true;
  };
  el.querySelectorAll("[data-close]").forEach((n) => {
    n.addEventListener("click", close);
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !el!.hidden) close();
  });
  return el;
}

function statusLabel(status: string): string {
  if (status === "ok") return "成功";
  if (status === "error") return "失败";
  if (status === "skipped") return "跳过";
  return status;
}

function statusRowClass(status: string): string {
  if (status === "ok") return "clean-result-ok";
  if (status === "error") return "clean-result-err";
  if (status === "skipped") return "clean-result-skip";
  return "";
}

function openCleanRunModal(
  results: CleanResultItem[],
  catalog: CleanCatalogItem[],
): void {
  const modal = ensureCleanRunModal();
  const okN = results.filter((r) => r.status === "ok").length;
  const errN = results.filter((r) => r.status === "error").length;
  const skipN = results.filter((r) => r.status === "skipped").length;
  const title =
    errN > 0 ? "清理完成（部分失败）" : skipN > 0 && okN > 0 ? "清理完成" : "清理完成";
  modal.querySelector(".clean-text-modal-title")!.textContent = title;
  modal.querySelector(".clean-run-modal-summary")!.textContent =
    `成功 ${okN} · 跳过 ${skipN} · 失败 ${errN}`;
  const lines = results
    .map((r) => {
      const row = catalog.find((c) => c.id === r.id);
      const name = row?.label ?? r.id;
      const detail = (r.detail || "").trim();
      const detailHtml = detail
        ? `<span class="clean-result-detail">${escapeHtml(detail)}</span>`
        : "";
      return `<div class="clean-result-line ${statusRowClass(r.status)}"><span class="clean-result-name">${escapeHtml(name)}</span><span class="clean-result-status">${escapeHtml(statusLabel(r.status))}</span>${detailHtml}</div>`;
    })
    .join("");
  modal.querySelector(".clean-run-modal-body")!.innerHTML = lines;
  modal.hidden = false;
}

function renderCleanProgress(
  el: HTMLElement,
  mod: "running" | "done" | "failed",
  text: string,
): void {
  const stateMap = {
    running: { label: "清理中", cls: "running" },
    done: { label: "完成", cls: "done" },
    failed: { label: "失败", cls: "failed" },
  };
  const meta = stateMap[mod];
  const dot =
    mod === "running"
      ? '<span class="scan-progress-dot" aria-hidden="true"></span>'
      : "";
  el.className = `scan-progress-bar is-active scan-progress--${meta.cls} clean-progress-bar`;
  el.innerHTML = `<span class="scan-progress-state">${dot}${escapeHtml(meta.label)}</span><span class="scan-progress-text">${escapeHtml(text)}</span>`;
  el.hidden = false;
}

function clearCleanProgress(el: HTMLElement): void {
  el.hidden = true;
  el.innerHTML = "";
  el.className = "scan-progress-bar clean-progress-bar";
}

function wireDetailClampLinks(panel: HTMLElement, row: CleanCatalogItem): void {
  panel.querySelectorAll<HTMLElement>(".clean-tip-clamp-wrap").forEach((wrap) => {
    const clamp = wrap.querySelector<HTMLElement>(".clean-tip-clamp-3");
    const more = wrap.querySelector<HTMLButtonElement>(".clean-tip-more");
    if (!clamp || !more) return;
    requestAnimationFrame(() => {
      if (clamp.scrollHeight > clamp.clientHeight + 2) {
        wrap.classList.add("has-more");
      }
    });
    more.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const section = more.dataset.section;
      if (section === "purpose") {
        openCleanTextModal(
          `${row.label} — 作用`,
          `<p>${escapeHtml(row.purpose)}</p>`,
        );
      } else if (section === "delete") {
        openCleanTextModal(
          `${row.label} — 删除注意`,
          deleteNoteToModalHtml(row.deleteNote),
        );
      }
    });
  });
}

function mountCleanDetailPanel(
  split: HTMLElement,
  panel: HTMLElement,
  listBox: HTMLElement,
  getRow: (id: string) => CleanCatalogItem | undefined,
): void {
  document.getElementById("clean-tooltip")?.remove();
  panel.innerHTML = DETAIL_PLACEHOLDER;

  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let activeId: string | null = null;

  const setActiveRow = (id: string | null) => {
    listBox.querySelectorAll<HTMLElement>(".clean-row").forEach((el) => {
      el.classList.toggle("clean-row-active", id !== null && el.dataset.id === id);
    });
    listBox.querySelectorAll<HTMLElement>(".clean-detail-btn").forEach((el) => {
      el.classList.toggle("clean-detail-btn-active", id !== null && el.dataset.id === id);
    });
  };

  const show = (id: string) => {
    if (activeId === id) return;
    const row = getRow(id);
    if (!row) return;
    activeId = id;
    panel.innerHTML = buildDetailHtml(row);
    panel.classList.add("has-content");
    wireDetailClampLinks(panel, row);
    setActiveRow(id);
  };

  const clear = () => {
    activeId = null;
    panel.innerHTML = DETAIL_PLACEHOLDER;
    panel.classList.remove("has-content");
    setActiveRow(null);
  };

  split.addEventListener("mouseover", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>(".clean-detail-btn");
    if (!btn?.dataset.id) return;
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    show(btn.dataset.id);
  });

  split.addEventListener("mouseleave", (e) => {
    const next = e.relatedTarget as Node | null;
    if (next && split.contains(next)) return;
    hideTimer = setTimeout(clear, 180);
  });
}

let cleanRootRef: HTMLElement | null = null;
/** 列表尚未渲染时暂存，待 loadCatalog 完成后再次应用 */
let pendingProfileChecks: Record<string, boolean> | null = null;

function applyBuiltInChecksNow(map: Record<string, boolean>): {
  turnedOn: string[];
  turnedOff: string[];
  missing: string[];
} {
  const turnedOn: string[] = [];
  const turnedOff: string[] = [];
  const missing: string[] = [];
  if (!cleanRootRef) {
    return { turnedOn, turnedOff, missing: Object.keys(map) };
  }
  for (const [id, checked] of Object.entries(map)) {
    const el = cleanRootRef.querySelector<HTMLInputElement>(
      `input[name="clean"][value="${CSS.escape(id)}"]`,
    );
    if (!el) {
      missing.push(id);
      continue;
    }
    if (el.checked === checked) continue;
    if (checked) turnedOn.push(id);
    else turnedOff.push(id);
    el.checked = checked;
  }
  if (turnedOn.length || turnedOff.length) {
    cleanRootRef
      .querySelectorAll<HTMLInputElement>('input[name="clean"]')
      .forEach((el) => el.dispatchEvent(new Event("change", { bubbles: true })));
  }
  return { turnedOn, turnedOff, missing };
}

/** 将 Profile 推荐勾选同步到一键清理；有变化时返回一行说明，否则返回空字符串 */
export function applyBuiltInChecks(map: Record<string, boolean>): string {
  pendingProfileChecks = map;
  const { turnedOn, turnedOff, missing } = applyBuiltInChecksNow(map);
  if (missing.length) {
    return `Profile 已记住，加载一键清理后将同步：${missing.join("、")}`;
  }
  if (turnedOn.length || turnedOff.length) {
    const parts: string[] = [];
    if (turnedOn.length) parts.push(`已勾选 ${turnedOn.join("、")}`);
    if (turnedOff.length) parts.push(`已取消 ${turnedOff.join("、")}`);
    return `已应用 Profile：${parts.join("；")}`;
  }
  return "";
}

export function mountCleanTab(root: HTMLElement): void {
  cleanRootRef = root;
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
    if (pendingProfileChecks) {
      applyBuiltInChecksNow(pendingProfileChecks);
      updateTotal();
    }
  }

  async function loadCatalog(): Promise<void> {
    box.innerHTML = `<p class="hint clean-loading">正在扫描各项占用，请稍候…</p>`;
    scanTotalEl.textContent = "\u2026";
    pickTotalEl.textContent = "\u2026";
    try {
      const items = await invoke<CleanCatalogItem[]>("clean_catalog");
      renderCatalog(items);
    } catch (e) {
      box.innerHTML = `<p class="warn">加载失败：${escapeHtml(String(e))}</p>`;
    }
  }

  root.querySelector("#clean-refresh")!.addEventListener("click", () => {
    void loadCatalog();
  });

  root.querySelector("#clean-select-safe")!.addEventListener("click", () => {
    box.querySelectorAll<HTMLInputElement>('input[name="clean"]').forEach((el) => {
      el.checked = el.dataset.safe === "true";
    });
    updateTotal();
  });

  const execBtn = root.querySelector<HTMLButtonElement>("#clean-exec")!;
  const progEl = root.querySelector<HTMLDivElement>("#clean-progress")!;
  const refreshBtn = root.querySelector<HTMLButtonElement>("#clean-refresh")!;
  const selectSafeBtn = root.querySelector<HTMLButtonElement>("#clean-select-safe")!;

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
