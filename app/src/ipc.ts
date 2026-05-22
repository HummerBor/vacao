import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { ensureTauriInternals } from "./polyfill-tauri-internals";

/** 调用 Rust command；若不在 Tauri 窗口中会抛出明确错误 */
export async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!ensureTauriInternals()) {
    throw new Error(
      "未连接到 Tauri（缺少 __TAURI_INTERNALS__ / __TAURI__.core）。请使用「npm run tauri dev」弹出的「Vacao」窗口操作，不要使用 Chrome/Edge 直接打开 http://localhost:1420。",
    );
  }
  return tauriInvoke<T>(cmd, args ?? {});
}
