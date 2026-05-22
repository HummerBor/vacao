import { invoke } from "../ipc";

type AppConfig = {
  useBuiltInDefaults: boolean;
  extraRoots: string[];
  minSizeMb: number;
  excludeDirNames: string[];
  browserClearCookies: boolean;
  cleanPackPath?: string;
  cleanPackApplyProfileOnImport?: boolean;
  cursorWsMinAgeDays?: number;
  cursorWsMinSizeMb?: number;
  cursorWsMatchMode?: string;
  cursorGlobalMinMb?: number;
  cursorGlobalForceReset?: boolean;
};

type ImportPackResult = {
  ok: boolean;
  path: string;
  preview: { itemCount: number; enabledBuiltInIds: string[] };
  errors: string[];
};

type CleanPackMeta = {
  loaded: boolean;
  path?: string | null;
  itemCount: number;
};

function packBasename(p: string): string {
  const n = p.replace(/\\/g, "/");
  const i = n.lastIndexOf("/");
  return i >= 0 ? n.slice(i + 1) : n;
}

export type SettingsTabOptions = {
  onPackImported?: (applyProfile: boolean) => Promise<string | void>;
};

export function mountSettingsTab(
  root: HTMLElement,
  options: SettingsTabOptions = {},
): void {
  root.innerHTML = `
    <div class="tab-body">
    <div class="tab-body-scroll settings-scroll ui-scroll">
    <p class="settings-lead">配置保存在程序目录 <code>config.json</code>，修改后点底部「保存」。</p>

    <section class="settings-card">
      <h3 class="settings-card-title">通用</h3>
      <div class="settings-card-body">
        <label class="settings-check"><input type="checkbox" id="set-builtins"/><span class="settings-check-text">使用内置默认排除目录名</span></label>
        <label class="settings-check"><input type="checkbox" id="set-browser-cookies"/><span class="settings-check-text">浏览器缓存清理时同时删除 Cookies</span></label>
        <p class="settings-note">勾选 Cookies 会导致多数网站退出登录；默认只清网页缓存。</p>
        <div class="settings-field">
          <span class="settings-field-label">大文件扫描默认最小体积 (MB)</span>
          <input type="number" id="set-minmb" class="settings-input-narrow" min="1" value="100"/>
        </div>
      </div>
    </section>

    <section class="settings-card">
      <h3 class="settings-card-title">Cursor 存储</h3>
      <p class="settings-note">用于一键清理「高级」中的 Cursor 项；须完全退出 Cursor 后再清理。</p>
      <div class="settings-card-body">
        <p class="settings-subhead">工作区缓存</p>
        <div class="settings-grid-2">
          <div class="settings-field">
            <span class="settings-field-label">至少未修改 (天)</span>
            <input type="number" id="set-cursor-ws-days" class="settings-input-narrow" min="1" value="30"/>
          </div>
          <div class="settings-field">
            <span class="settings-field-label">子目录至少 (MB)</span>
            <input type="number" id="set-cursor-ws-mb" class="settings-input-narrow" min="0" value="10"/>
          </div>
        </div>
        <div class="settings-field">
          <span class="settings-field-label">匹配方式</span>
          <select id="set-cursor-ws-mode" class="settings-select">
            <option value="all">天数与体积都满足</option>
            <option value="any">满足天数或体积其一</option>
          </select>
        </div>
        <p class="settings-subhead">全局库重置</p>
        <div class="settings-field">
          <span class="settings-field-label">主库删除阈值 (MB)</span>
          <input type="number" id="set-cursor-global-mb" class="settings-input-narrow" min="50" value="500"/>
        </div>
        <label class="settings-check"><input type="checkbox" id="set-cursor-global-force"/><span class="settings-check-text">强制删除主库（忽略阈值，需重新登录）</span></label>
      </div>
    </section>

    <section class="settings-card">
      <h3 class="settings-card-title">路径与扫描</h3>
      <div class="settings-card-body">
        <div class="settings-field">
          <span class="settings-field-label">自定义清理目录</span>
          <span class="settings-field-hint">每行一个绝对路径，用于「可配置目录」</span>
          <textarea id="set-roots" rows="4" class="settings-textarea monospace"></textarea>
        </div>
        <div class="settings-field">
          <span class="settings-field-label">扫描时排除的目录名</span>
          <span class="settings-field-hint">按文件夹名匹配，如 <code>$Recycle.Bin</code></span>
          <textarea id="set-excl" rows="3" class="settings-textarea monospace"></textarea>
        </div>
      </div>
    </section>

    <section class="settings-card">
      <h3 class="settings-card-title">扩展包</h3>
      <div class="settings-card-body">
        <p class="settings-pack-status" id="set-pack-status">状态：未配置</p>
        <label class="settings-check"><input type="checkbox" id="set-pack-auto-apply"/><span class="settings-check-text">导入时同步推荐勾选（仅内置清理项）</span></label>
        <p class="settings-note">不勾选则只加载扩展项，不改动当前勾选。从文件导入会直接使用所选 JSON 的完整路径，不会复制到程序目录；「导出模板」仍会写入程序目录。</p>
        <div class="settings-field">
          <span class="settings-field-label">扩展包文件路径</span>
          <input type="text" id="set-pack-path" class="settings-text-input monospace"/>
        </div>
        <div class="settings-btn-grid">
          <button type="button" id="set-pack-import" class="secondary">从文件导入</button>
          <button type="button" id="set-pack-export-exe" class="secondary">导出模板</button>
          <button type="button" id="set-pack-open-folder" class="secondary" disabled>打开目录</button>
          <button type="button" id="set-pack-export-skill" class="secondary">下载 Skill 包</button>
          <button type="button" id="set-pack-clear" class="secondary">清除</button>
        </div>
      </div>
    </section>
    </div>
    <div class="tab-body-foot">
    <div class="actions">
      <button type="button" id="set-load">重新读取</button>
      <button type="button" id="set-save" class="primary">保存</button>
    </div>
    <pre id="set-msg" class="output"></pre>
    </div>
    </div>
  `;

  const built = root.querySelector<HTMLInputElement>("#set-builtins")!;
  const browserCookies = root.querySelector<HTMLInputElement>("#set-browser-cookies")!;
  const minmb = root.querySelector<HTMLInputElement>("#set-minmb")!;
  const cursorWsDays = root.querySelector<HTMLInputElement>("#set-cursor-ws-days")!;
  const cursorWsMb = root.querySelector<HTMLInputElement>("#set-cursor-ws-mb")!;
  const cursorWsMode = root.querySelector<HTMLSelectElement>("#set-cursor-ws-mode")!;
  const cursorGlobalMb = root.querySelector<HTMLInputElement>("#set-cursor-global-mb")!;
  const cursorGlobalForce = root.querySelector<HTMLInputElement>("#set-cursor-global-force")!;
  const roots = root.querySelector<HTMLTextAreaElement>("#set-roots")!;
  const excl = root.querySelector<HTMLTextAreaElement>("#set-excl")!;
  const packPath = root.querySelector<HTMLInputElement>("#set-pack-path")!;
  const packAutoApply = root.querySelector<HTMLInputElement>("#set-pack-auto-apply")!;
  const packStatus = root.querySelector("#set-pack-status")!;
  const openFolderBtn = root.querySelector<HTMLButtonElement>("#set-pack-open-folder")!;
  const msg = root.querySelector("#set-msg")!;

  async function refreshPackDisplay(): Promise<void> {
    try {
      const meta = await invoke<CleanPackMeta>("get_clean_pack");
      const resolved = meta.path?.trim() ?? "";
      if (!resolved) {
        packPath.value = "";
        packStatus.textContent = "状态：未配置";
        openFolderBtn.disabled = true;
        return;
      }
      packPath.value = resolved;
      openFolderBtn.disabled = false;
      const base = packBasename(resolved);
      if (meta.loaded) {
        packStatus.textContent = `状态：已加载 ${base}（${meta.itemCount} 个扩展项）`;
      } else {
        packStatus.textContent = `状态：文件不存在 — ${resolved}`;
      }
    } catch (e) {
      packStatus.textContent = "状态：读取失败";
      msg.textContent = String(e);
    }
  }

  async function load(): Promise<void> {
    try {
      const cfg = await invoke<AppConfig>("get_config");
      built.checked = cfg.useBuiltInDefaults;
      browserCookies.checked = !!cfg.browserClearCookies;
      minmb.value = String(cfg.minSizeMb);
      roots.value = (cfg.extraRoots || []).join("\n");
      excl.value = (cfg.excludeDirNames || []).join("\n");
      packAutoApply.checked = !!cfg.cleanPackApplyProfileOnImport;
      cursorWsDays.value = String(cfg.cursorWsMinAgeDays ?? 30);
      cursorWsMb.value = String(cfg.cursorWsMinSizeMb ?? 10);
      cursorWsMode.value = cfg.cursorWsMatchMode === "any" ? "any" : "all";
      cursorGlobalMb.value = String(cfg.cursorGlobalMinMb ?? 500);
      cursorGlobalForce.checked = !!cfg.cursorGlobalForceReset;
      await refreshPackDisplay();
      msg.textContent = "已加载";
    } catch (e) {
      msg.textContent = String(e);
    }
  }

  async function readConfigFromForm(): Promise<AppConfig> {
    const lines = (s: string) =>
      s
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean);
    const current = await invoke<AppConfig>("get_config");
    return {
      ...current,
      useBuiltInDefaults: built.checked,
      extraRoots: lines(roots.value),
      minSizeMb: (() => {
        const raw = minmb.value.trim();
        if (raw === "") return 100;
        const n = Number(raw);
        return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 100;
      })(),
      excludeDirNames: lines(excl.value),
      browserClearCookies: browserCookies.checked,
      cleanPackPath: packPath.value.trim(),
      cleanPackApplyProfileOnImport: packAutoApply.checked,
      cursorWsMinAgeDays: Math.max(1, Math.floor(Number(cursorWsDays.value) || 30)),
      cursorWsMinSizeMb: Math.max(
        0,
        Math.floor(Number(cursorWsMb.value) || 10),
      ),
      cursorWsMatchMode: cursorWsMode.value === "any" ? "any" : "all",
      cursorGlobalMinMb: Math.max(
        50,
        Math.min(4096, Math.floor(Number(cursorGlobalMb.value) || 500)),
      ),
      cursorGlobalForceReset: cursorGlobalForce.checked,
    };
  }

  root.querySelector("#set-load")!.addEventListener("click", () => {
    void load();
  });
  root.querySelector("#set-save")!.addEventListener("click", () => {
    void (async () => {
      try {
        const cfg = await readConfigFromForm();
        await invoke("save_config", { cfg });
        msg.textContent = "已保存";
        await load();
      } catch (e) {
        msg.textContent = String(e);
      }
    })();
  });

  root.querySelector("#set-pack-import")!.addEventListener("click", () => {
    void (async () => {
      try {
        const picked = await invoke<string | null>("pick_clean_pack_file", {
          defaultPath: packPath.value.trim() || null,
        });
        if (!picked) return;
        const res = await invoke<ImportPackResult>("import_clean_pack_from_path", {
          path: picked,
        });
        if (!res.ok) {
          msg.textContent = `导入失败：\n${res.errors.join("\n")}`;
          return;
        }
        let line = `已导入：${res.path}，扩展项 ${res.preview.itemCount} 个`;
        await refreshPackDisplay();

        const cfg = await invoke<AppConfig>("get_config");
        const applyProfile = !!cfg.cleanPackApplyProfileOnImport;
        if (options.onPackImported) {
          const note = await options.onPackImported(applyProfile);
          if (note) line += `\n${note}`;
        } else if (!applyProfile) {
          line += "\n请到「一键清理」查看扩展项。";
        }
        msg.textContent = line;
      } catch (e) {
        msg.textContent = String(e);
      }
    })();
  });

  root.querySelector("#set-pack-export-exe")!.addEventListener("click", () => {
    void (async () => {
      try {
        const res = await invoke<{ path: string; overwritten: boolean }>(
          "export_clean_pack_to_exe_dir",
        );
        const note = res.overwritten ? "（已覆盖原文件）" : "";
        msg.textContent = `已写入：${res.path}${note}\n可在下方【从文件导入】加载。`;
        await refreshPackDisplay();
      } catch (e) {
        msg.textContent = String(e);
      }
    })();
  });

  openFolderBtn.addEventListener("click", () => {
    const p = packPath.value.trim();
    if (!p) return;
    void invoke("open_path_in_shell", { path: p }).catch((e) => {
      msg.textContent = String(e);
    });
  });

  root.querySelector("#set-pack-export-skill")!.addEventListener("click", () => {
    void (async () => {
      try {
        const zipPath = await invoke<string>("export_skill_zip_bundle");
        msg.textContent = `Skill 安装包已保存：${zipPath}\n请解压后按 SKILL_INSTALL.md 安装（全局或项目 skills 目录）。`;
        const open = confirm("是否打开所在文件夹？");
        if (open) {
          await invoke("open_path_in_shell", { path: zipPath });
        }
      } catch (e) {
        msg.textContent = String(e);
      }
    })();
  });

  root.querySelector("#set-pack-clear")!.addEventListener("click", () => {
    void (async () => {
      if (!confirm("确定清除扩展包文件与配置引用？")) return;
      try {
        await invoke("clear_clean_pack");
        msg.textContent = "已清除扩展包";
        await refreshPackDisplay();
      } catch (e) {
        msg.textContent = String(e);
      }
    })();
  });

  void load();
}
