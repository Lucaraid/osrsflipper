import { DEFAULT_SETTINGS, SettingsSchema, type Settings } from "./settings-schema";

/** Kleine Einstellungen in localStorage (validiert; bei Defekt → Standardwerte). */
export const SETTINGS_KEY = "osrs-ge-flipper:settings:v1";

export function loadSettings(storage: Pick<Storage, "getItem"> | null = typeof localStorage !== "undefined" ? localStorage : null): Settings {
  if (!storage) return DEFAULT_SETTINGS;
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const r = SettingsSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings, storage: Pick<Storage, "setItem"> | null = typeof localStorage !== "undefined" ? localStorage : null): void {
  if (!storage) return;
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(SettingsSchema.parse(s)));
  } catch {
    /* Speicher voll oder gesperrt – Einstellungen bleiben für diese Sitzung im Speicher */
  }
}
