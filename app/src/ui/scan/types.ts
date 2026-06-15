/** 大文件扫描 Tab 的类型与常量。 */

export type AppConfig = {
  minSizeMb: number;
  excludeDirNames: string[];
};

export type CategoryInfo = { id: string; label: string };

export type ScannedFileRow = {
  path: string;
  size: number;
  modifiedMs: number;
  category: string;
};

export type ScanStatus = {
  state: string;
  results?: ScannedFileRow[] | null;
  error?: string | null;
  filesSeen: number;
  bytesSeen: number;
  hits: number;
  currentPath?: string | null;
};

export type DeleteRow = { path: string; ok: boolean; error?: string | null };

export const DEFAULT_SCAN_GROUPS = [
  "video",
  "image",
  "archive",
  "disk_image",
  "installer",
];

export const DEFAULT_SCAN_ROOT = "C:\\";

/** Preset minimum sizes (MB) for the size dropdown. */
export const SCAN_SIZE_PRESETS = [50, 100, 500, 1024] as const;
