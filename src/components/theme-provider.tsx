"use client";
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { getThemePreference, setThemePreference, subscribeTheme, type ThemePreference } from "@/lib/theme";
const ThemeContext = createContext<{ preference: ThemePreference; setPreference: (value: ThemePreference) => void } | null>(null);
const serverPreference = (): ThemePreference => "system";
export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useSyncExternalStore(subscribeTheme, getThemePreference, serverPreference);
  return <ThemeContext.Provider value={{ preference, setPreference: setThemePreference }}>{children}</ThemeContext.Provider>;
}
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("主题控件必须在ThemeProvider内使用");
  return context;
}
