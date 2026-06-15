/** 扫描任务动作：开始/暂停/继续、重置、删除选中（含状态轮询）。 */

import { invoke } from "../../ipc";
import type { AppConfig, DeleteRow, ScanStatus } from "./types";
import { DEFAULT_SCAN_ROOT } from "./types";
import type { ScanEls } from "./template";
import type { ScanControls } from "./controls";
import type { ResultsView } from "./results-table";
import { parseMinMbInput } from "./controls";
import { showScanProgressMessage, updateProgress } from "./progress";

/** 跨模块共享的扫描运行时状态（index 创建，actions 读写）。 */
export type ScanRuntime = {
  jobId: string | null;
  scanState: string;
  pollTimer: ReturnType<typeof setInterval> | null;
  scanRoot: string;
  folderPickerOpen: boolean;
};

export type ScanActionDeps = {
  els: ScanEls;
  rt: ScanRuntime;
  controls: ScanControls;
  view: ResultsView;
  setScanPathDisplay: (el: HTMLInputElement, path: string) => void;
  updateScanUiState: () => void;
  resetScanUi: (clearProgress?: boolean) => void;
  stopPoll: () => void;
  isScanConfigLocked: () => boolean;
  buildActiveScanDetail: (st: ScanStatus, minMb: number, maxMb: number | null) => string;
};

export function wireScanActions(d: ScanActionDeps): void {
  const { els, rt, controls, view } = d;
  const { pathEl, minMbEl, maxMbEl, progEl, tbody, goBtn, resetBtn, delBtn, filterBtn } = els;

  goBtn.addEventListener("click", () => {
    void (async () => {
      if (rt.folderPickerOpen) return;
      if (rt.scanState === "running" && rt.jobId) {
        try {
          await invoke("scan_pause", { jobId: rt.jobId });
          rt.scanState = "paused";
          d.updateScanUiState();
          filterBtn.disabled = false;
        } catch (e) {
          showScanProgressMessage(progEl, String(e), "failed");
        }
        return;
      }
      if (rt.scanState === "paused" && rt.jobId) {
        try {
          await invoke("scan_resume", { jobId: rt.jobId });
          rt.scanState = "running";
          d.updateScanUiState();
          filterBtn.disabled = true;
        } catch (e) {
          showScanProgressMessage(progEl, String(e), "failed");
        }
        return;
      }

      d.resetScanUi(false);
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

      const categories = controls.selectedScanCategories();
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

      showScanProgressMessage(progEl, "正在启动…", "running");
      try {
        rt.jobId = await invoke<string>("scan_start", {
          args: {
            roots: [rootPath],
            minSizeMb,
            maxSizeMb: maxSizeMb && maxSizeMb > 0 ? maxSizeMb : null,
            categories,
            excludeDirNames,
          },
        });
        rt.scanState = "running";
        rt.scanRoot = rootPath;
        d.updateScanUiState();
      } catch (e) {
        showScanProgressMessage(progEl, String(e), "failed");
        return;
      }

      rt.pollTimer = setInterval(() => {
        void (async () => {
          if (!rt.jobId) return;
          try {
            const st = await invoke<ScanStatus>("scan_status", { jobId: rt.jobId });
            rt.scanState = st.state;
            d.updateScanUiState();
            const maxMb = maxSizeMb && maxSizeMb > 0 ? maxSizeMb : null;
            const activeDetail = (s: ScanStatus) =>
              d.buildActiveScanDetail(s, minSizeMb, maxMb);

            if (st.state === "running" || st.state === "paused") {
              const batch = st.results || [];
              view.appendNewRows(batch);
              if (st.state === "running") filterBtn.disabled = true;
              else filterBtn.disabled = false;
              updateProgress(progEl, st, minSizeMb, maxMb, activeDetail);
              if (batch.length > 0 && st.state === "paused") {
                view.setFilterBtnVisible(true);
              }
              return;
            }

            d.stopPoll();
            view.sortAndRenderAll(st.results || []);
            updateProgress(progEl, st, minSizeMb, maxMb, activeDetail);
            d.updateScanUiState();
            filterBtn.disabled = false;
          } catch (e) {
            d.stopPoll();
            showScanProgressMessage(progEl, String(e), "failed");
            rt.scanState = "";
            d.updateScanUiState();
            filterBtn.disabled = false;
          }
        })();
      }, 400);
    })();
  });

  resetBtn.addEventListener("click", () => {
    void (async () => {
      const id = rt.jobId;
      if (id && (rt.scanState === "running" || rt.scanState === "paused")) {
        try {
          await invoke("scan_cancel", { jobId: id });
        } catch {
          /* ignore */
        }
      }
      rt.scanRoot = DEFAULT_SCAN_ROOT;
      d.setScanPathDisplay(pathEl, DEFAULT_SCAN_ROOT);
      try {
        const cfg = await invoke<AppConfig>("get_config");
        controls.resetSizePickDefaults(cfg.minSizeMb ?? 100);
      } catch {
        controls.resetSizePickDefaults(100);
      }
      d.resetScanUi(true);
      filterBtn.disabled = false;
      controls.closeTypePopover();
    })();
  });

  delBtn.addEventListener("click", () => {
    void (async () => {
      if (!rt.jobId || d.isScanConfigLocked()) return;
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
          payload: { jobId: rt.jobId, paths },
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
        const kept = view.getRows().filter((r) => {
          if (!paths.includes(r.path)) return true;
          return failed.has(r.path);
        });
        view.sortAndRenderAll(kept);
      } catch (e) {
        alert(String(e));
      }
    })();
  });
}
