/** 扫描进度条渲染（无内部状态，全部通过参数传入）。 */

import { escapeHtml, escapeAttr, formatBytes as fmtBytes } from "../shared";
import type { ScanStatus } from "./types";

export function sizeRangeNote(minMb: number, maxMb: number | null): string {
  const maxNote = maxMb ? `≤${maxMb}MB` : "无上限";
  return `${minMb}–${maxNote}`;
}

export function formatProgressStats(
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

export function clearScanProgress(progEl: HTMLDivElement): void {
  progEl.hidden = true;
  progEl.innerHTML = "";
  progEl.className = "scan-progress-bar";
}

export function showScanProgressMessage(
  progEl: HTMLDivElement,
  text: string,
  mod = "done",
): void {
  progEl.className = `scan-progress-bar is-active scan-progress--${mod}`;
  progEl.innerHTML = `<span class="scan-progress-state">${escapeHtml(text)}</span>`;
  progEl.hidden = false;
}

export function renderScanProgress(
  progEl: HTMLDivElement,
  st: ScanStatus,
  minMb: number,
  maxMb: number | null,
  buildActiveDetail: (st: ScanStatus) => string,
): void {
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
    ? buildActiveDetail(st)
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

export function updateProgress(
  progEl: HTMLDivElement,
  st: ScanStatus,
  minMb: number,
  maxMb: number | null,
  buildActiveDetail: (st: ScanStatus) => string,
): void {
  if (!st.state || st.state === "idle") {
    clearScanProgress(progEl);
    return;
  }
  renderScanProgress(progEl, st, minMb, maxMb, buildActiveDetail);
}
