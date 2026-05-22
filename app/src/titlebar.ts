import { getCurrentWindow } from "@tauri-apps/api/window";

/** Custom window chrome when native decorations are disabled. */
export function initTitlebar(enabled: boolean): void {
  const bar = document.querySelector<HTMLElement>(".titlebar");
  if (!bar) return;
  if (!enabled) {
    document.body.classList.add("no-tauri-chrome");
    return;
  }
  document.body.classList.remove("no-tauri-chrome");

  const win = getCurrentWindow();
  const maxBtn = document.getElementById("tb-max");
  const iconMax = maxBtn?.querySelector<SVGElement>(".icon-maximize");
  const iconRestore = maxBtn?.querySelector<SVGElement>(".icon-restore");
  const syncMaxIcon = async (): Promise<void> => {
    if (!maxBtn) return;
    const maxed = await win.isMaximized();
    iconMax?.classList.toggle("hidden", maxed);
    iconRestore?.classList.toggle("hidden", !maxed);
    maxBtn.setAttribute("aria-label", maxed ? "还原" : "最大化");
  };

  document.getElementById("tb-min")?.addEventListener("click", () => {
    void win.minimize();
  });
  maxBtn?.addEventListener("click", () => {
    void win.toggleMaximize().then(() => syncMaxIcon());
  });
  document.getElementById("tb-close")?.addEventListener("click", () => {
    void win.close();
  });

  void win.onResized(() => {
    void syncMaxIcon();
  });
  void syncMaxIcon();
}
