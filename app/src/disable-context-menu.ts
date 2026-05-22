/** Block WebView2 / WebView default context menu (Back, Inspect, …). */
function blockContextMenu(e: Event): void {
  e.preventDefault();
}

document.addEventListener("contextmenu", blockContextMenu, { capture: true });
window.addEventListener("contextmenu", blockContextMenu, { capture: true });
