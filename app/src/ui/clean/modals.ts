/** 一键清理 Tab 的弹窗（文本说明、清理结果）与进度条渲染。 */

import { escapeHtml } from "../shared";
import type { CleanCatalogItem, CleanResultItem } from "./types";

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

export function openCleanTextModal(title: string, bodyHtml: string): void {
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

export function openCleanRunModal(
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

export function renderCleanProgress(
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

export function clearCleanProgress(el: HTMLElement): void {
  el.hidden = true;
  el.innerHTML = "";
  el.className = "scan-progress-bar clean-progress-bar";
}
