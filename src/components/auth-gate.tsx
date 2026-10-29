"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type User = { username?: string; name?: string; nickName?: string | null };
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/me", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (response.status === 401) { router.replace("/login"); return; }
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!data.ok || !data.user) throw new Error();
      setUser(data.user);
    }).catch(() => { if (!controller.signal.aborted) setError("无法验证登录状态，请检查认证服务后重试。"); });
    return () => controller.abort();
  }, [router]);
  async function logout() {
    setExiting(true); setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      router.replace("/login"); router.refresh();
    } catch { setError("退出失败，请检查认证服务后重试。"); setExiting(false); }
  }
  if (!user) return <main className="auth-loading">{error ? <><p role="alert">{error}</p><button onClick={() => window.location.reload()}>重试</button></> : "正在验证登录状态…"}</main>;
  return <>{children}<div className="account-control"><span>{user.nickName || user.name || user.username}</span><button onClick={logout} disabled={exiting}>{exiting ? "退出中…" : "退出"}</button>{error && <span role="alert">{error}</span>}</div></>;
}
