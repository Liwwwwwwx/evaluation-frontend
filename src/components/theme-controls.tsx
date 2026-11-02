"use client";
import { useTheme } from "@/components/theme-provider";
import { Select } from "@/components/ui";
import { normalizeTheme, type ThemePreference } from "@/lib/theme";
const options: { value: ThemePreference; label: string }[] = [{ value: "light", label: "浅色" }, { value: "dark", label: "深色" }, { value: "system", label: "跟随系统" }];
export function ThemeIcon({ value }: { value: ThemePreference }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{value === "light" ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : value === "dark" ? <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" /> : <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4" /></>}</svg>;
}
export function themeLabel(value: ThemePreference) { return options.find(option => option.value === value)?.label || "跟随系统"; }
export function ThemeMenuItems({ onSelect }: { onSelect?: () => void }) {
  const { preference, setPreference } = useTheme();
  return <div className="account-theme" role="group" aria-label="主题">{options.map(option => <button key={option.value} type="button" role="menuitemradio" aria-checked={preference === option.value} className="account-menu-item theme-option" onClick={() => { setPreference(option.value); onSelect?.(); }}><ThemeIcon value={option.value} /><span>{option.label}</span><span className="theme-check" aria-hidden="true">{preference === option.value && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>}</span></button>)}</div>;
}
export function ThemeSelect() {
  const { preference, setPreference } = useTheme();
  return <div className="theme-select"><ThemeIcon value={preference} /><Select variant="bare" hideLabel label="外观" value={preference} options={options} onChange={value => setPreference(normalizeTheme(value))} /></div>;
}
