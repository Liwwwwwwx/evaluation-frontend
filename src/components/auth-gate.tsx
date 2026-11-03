"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { clearAssistantDrafts } from "@/lib/assistant-draft";

type User = { id?: string; username?: string; name?: string; nickName?: string | null; canManageAccounts?: boolean };
type AuthValue = { user: User; logout: () => void; exiting: boolean; error: string };
const AuthContext = createContext<AuthValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth 只能在 AuthGate 内使用");
  return value;
}

let sessionCheck: Promise<{ status: number; user: User | null }> | null = null;
function checkSession() {
  if (!sessionCheck) {
    const pending = fetch("/api/auth/me", { cache: "no-store" }).then(async (response) => {
      if (response.status === 401) return { status: 401, user: null };
      if (!response.ok) throw new Error("session unavailable");
      const data = await response.json();
      if (!data.ok || !data.user) throw new Error("invalid session response");
      return { status: response.status, user: data.user as User };
    });
    sessionCheck = pending;
    void pending.then(() => { if (sessionCheck === pending) sessionCheck = null; }, () => { if (sessionCheck === pending) sessionCheck = null; });
  }
  return sessionCheck;
}
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    let active = true;
    void checkSession().then((result) => {
      if (!active) return;
      if (result.status === 401) { router.replace("/login"); return; }
      setUser(result.user);
    }).catch(() => { if (active) setError("无法验证登录状态，请检查认证服务后重试。"); });
    return () => { active = false; };
  }, [router]);
  async function logout() {
    setExiting(true); setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      setUser(null);
      clearAssistantDrafts(user?.id);
      sessionStorage.removeItem("evaluation-unified-run");
      sessionStorage.removeItem("evaluation-unified-pending");
      router.replace("/login"); router.refresh();
    } catch { setError("退出失败，请检查认证服务后重试。"); setExiting(false); }
  }
  if (!user) return <main className="auth-loading">{error ? <><p role="alert">{error}</p><button onClick={() => window.location.reload()}>重试</button></> : "正在验证登录状态…"}</main>;
  return <AuthContext.Provider key={user.id} value={{ user, logout, exiting, error }}>{children}</AuthContext.Provider>;
}
