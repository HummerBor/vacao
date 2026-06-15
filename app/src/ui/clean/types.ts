/** 一键清理 Tab 的类型、分组定义与行渲染小工具。 */

export type CleanResultItem = {
  id: string;
  status: string;
  detail?: string | null;
};

export type CleanCatalogItem = {
  id: string;
  label: string;
  pathsHint: string;
  purpose: string;
  deleteNote: string;
  tag: string;
  warn: boolean;
  defaultChecked: boolean;
  sizeBytes: number;
  sizeDisplay: string;
};

export type CleanGroupDef = {
  id: string;
  title: string;
  hint: string;
  ids: string[];
};

export const CLEAN_GROUPS: CleanGroupDef[] = [
  {
    id: "cache",
    title: "日常缓存",
    hint: "临时文件、浏览器与开发工具缓存，一般可放心清理",
    ids: ["C01", "C06", "C04", "C10", "C16", "C08", "C11", "C12", "C13"],
  },
  {
    id: "system",
    title: "系统与其它",
    hint: "回收站、系统临时目录等，部分需管理员权限",
    ids: ["C03", "C02", "C05"],
  },
  {
    id: "advanced",
    title: "高级",
    hint: "Cursor 工作区/全局库、自定义目录等，清理前请看清说明并退出 Cursor",
    ids: ["C17", "C18", "C09"],
  },
];

export const PACK_GROUP: CleanGroupDef = {
  id: "pack",
  title: "扩展清理",
  hint: "来自 clean-pack.json；请先在设置中导入",
  ids: [],
};

export function tagClass(tag: string): string {
  if (tag.includes("需谨慎")) return "tag-warn";
  if (tag.includes("可安全")) return "tag-safe";
  return "tag-normal";
}

export function sizeLabel(row: CleanCatalogItem): string {
  if (row.sizeBytes <= 0) return "\u2014";
  return row.sizeDisplay;
}

export function sizeCellClass(row: CleanCatalogItem): string {
  if (row.sizeBytes <= 0) return "clean-size clean-size-empty";
  if (row.sizeBytes >= 1024 ** 3) return "clean-size clean-size-lg";
  return "clean-size";
}
