/** Profile 推荐勾选与一键清理列表的同步。 */

let cleanRootRef: HTMLElement | null = null;
/** 列表尚未渲染时暂存，待 loadCatalog 完成后再次应用 */
let pendingProfileChecks: Record<string, boolean> | null = null;

export function setCleanRootRef(root: HTMLElement): void {
  cleanRootRef = root;
}

export function getPendingProfileChecks(): Record<string, boolean> | null {
  return pendingProfileChecks;
}

export function applyBuiltInChecksNow(map: Record<string, boolean>): {
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
