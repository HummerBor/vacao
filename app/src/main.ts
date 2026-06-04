import "./disable-context-menu";
import "./polyfill-tauri-internals";
import { invoke } from "./ipc";
import { waitForTauriApi } from "./polyfill-tauri-internals";
import { initTitlebar } from "./titlebar";
import { mountCleanTab, onPackImported } from "./ui/clean-tab";
import { mountScanTab } from "./ui/scan-tab";
import { mountSettingsTab } from "./ui/settings-tab";
import { mountNpmMalwareTab } from "./ui/npm-malware-tab";

function showMountError(root: HTMLElement, label: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  root.innerHTML = `<div class="tab-body"><p class="warn">${label}：${msg.replace(/</g, "&lt;")}</p></div>`;
  console.error(label, err);
}

function mountNpmMalwareTabSafe(root: HTMLElement | null, tauriReady: boolean): boolean {
  if (!root) {
    console.error("npm-malware-root 未找到，请确认 index.html 已更新并重启 dev");
    return false;
  }
  try {
    mountNpmMalwareTab(root, tauriReady);
    return true;
  } catch (err) {
    showMountError(root, "npm 毒包扫描界面加载失败", err);
    return false;
  }
}

function initTabs(onTabShown?: (tabId: string) => void): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>(".tab-btn");
  const panels = document.querySelectorAll<HTMLElement>(".tab-panel");
  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.tab;
      if (!id) return;
      tabs.forEach((b) => b.classList.toggle("active", b === btn));
      panels.forEach((p) =>
        p.classList.toggle("active", p.id === `panel-${id}`),
      );
      onTabShown?.(id);
    });
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  const el = document.getElementById("elev-status");
  const ok = await waitForTauriApi(8000);
  if (!ok) {
    if (el) {
      el.textContent =
        "当前：未检测到 Tauri（可能用浏览器打开了 localhost:1420）。请关掉该标签页，只使用「npm run tauri dev」自动弹出的窗口。";
    }
  } else if (el) {
    try {
      const elevated = await invoke<boolean>("is_elevated");
      el.textContent = elevated
        ? "当前：已提升管理员"
        : "当前：未提升管理员（系统临时目录等可能清理失败）";
    } catch {
      el.textContent = "当前：无法检测管理员状态";
    }
  }
  initTitlebar(ok);

  let npmMalwareMounted = false;
  const ensureNpmMalwareMounted = (): void => {
    if (npmMalwareMounted) return;
    npmMalwareMounted = mountNpmMalwareTabSafe(
      document.getElementById("npm-malware-root"),
      ok,
    );
  };

  initTabs((tabId) => {
    if (tabId === "npm-malware") ensureNpmMalwareMounted();
  });

  mountCleanTab(document.getElementById("clean-root")!);
  mountScanTab(document.getElementById("scan-root")!, ok);
  ensureNpmMalwareMounted();
  mountSettingsTab(document.getElementById("settings-root")!, { onPackImported });
});
