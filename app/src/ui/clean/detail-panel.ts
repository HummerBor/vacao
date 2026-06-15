/** 一键清理 Tab 的右侧详情面板（hover 展示项目说明）。 */

import { escapeHtml } from "../shared";
import { openCleanTextModal } from "./modals";
import type { CleanCatalogItem } from "./types";

export const DETAIL_PLACEHOLDER =
  '<p class="clean-detail-placeholder">将鼠标移到「详情」查看说明</p>';

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

export function mountCleanDetailPanel(
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
