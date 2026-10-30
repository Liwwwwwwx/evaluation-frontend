export type ThemePreference = "light" | "dark" | "system";
export const THEME_STORAGE_KEY = "science-evaluation-theme";
const THEME_EVENT = "science-evaluation-theme-change";
const DARK_QUERY = "(prefers-color-scheme: dark)";

export function normalizeTheme(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}
export function resolveTheme(preference: ThemePreference, systemDark: boolean): "light" | "dark" {
  return preference === "system" ? systemDark ? "dark" : "light" : preference;
}
// 静态自包含脚本，在正文绘制前选择外观；不将本地存储内容插入脚本文本。
export const THEME_INIT_SCRIPT = `(function(){
  var p="system";try{var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(s==="light"||s==="dark")p=s;}catch(e){}
  var d=!!(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);
  var r=document.documentElement;r.dataset.themePreference=p;r.dataset.theme=p==="system"?(d?"dark":"light"):p;
})();`;

function storedPreference(): ThemePreference {
  try { return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY)); } catch { return "system"; }
}
export function getThemePreference(): ThemePreference {
  if (typeof document === "undefined") return "system";
  const value = document.documentElement.dataset.themePreference;
  return value === undefined ? storedPreference() : normalizeTheme(value);
}
function applyTheme(preference: ThemePreference) {
  const dark = Boolean(window.matchMedia?.(DARK_QUERY).matches);
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = resolveTheme(preference, dark);
}
export function setThemePreference(value: ThemePreference) {
  const preference = normalizeTheme(value);
  applyTheme(preference);
  try { window.localStorage.setItem(THEME_STORAGE_KEY, preference); } catch { /* 存储不可用时保留当前页选择。 */ }
  window.dispatchEvent(new Event(THEME_EVENT));
}
export function subscribeTheme(onChange: () => void) {
  const media = window.matchMedia?.(DARK_QUERY);
  const systemChanged = () => { applyTheme(getThemePreference()); };
  const storageChanged = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    try { if (event.storageArea && event.storageArea !== window.localStorage) return; } catch { return; }
    applyTheme(normalizeTheme(event.newValue)); onChange();
  };
  applyTheme(getThemePreference());
  media?.addEventListener("change", systemChanged);
  window.addEventListener("storage", storageChanged);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    media?.removeEventListener("change", systemChanged);
    window.removeEventListener("storage", storageChanged);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}
