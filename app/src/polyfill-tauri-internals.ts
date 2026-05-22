/**
 * Tauri 2：@tauri-apps/api 的 invoke 使用 window.__TAURI_INTERNALS__.invoke。
 * 启用 withGlobalTauri 时，可先出现 window.__TAURI__.core.invoke，此处桥接并支持稍后注入。
 */

export type InvokeFn = (
  cmd: string,
  args?: Record<string, unknown>,
  options?: unknown,
) => Promise<unknown>;

declare global {
  interface Window {
    __TAURI_INTERNALS__?: { invoke: InvokeFn };
    __TAURI__?: { core?: { invoke: InvokeFn } };
  }
}

export function ensureTauriInternals(): boolean {
  if (typeof window === "undefined") return false;
  if (window.__TAURI_INTERNALS__?.invoke) return true;
  const coreInvoke = window.__TAURI__?.core?.invoke;
  if (typeof coreInvoke === "function") {
    window.__TAURI_INTERNALS__ = { invoke: coreInvoke };
    return true;
  }
  return false;
}

/** 等待 WebView 注入 Tauri API（最多 maxMs） */
export async function waitForTauriApi(maxMs = 8000): Promise<boolean> {
  const step = 50;
  let elapsed = 0;
  while (elapsed < maxMs) {
    if (ensureTauriInternals()) return true;
    await new Promise((r) => setTimeout(r, step));
    elapsed += step;
  }
  return ensureTauriInternals();
}

ensureTauriInternals();
