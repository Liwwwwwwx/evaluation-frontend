"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setLoading(true);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password, rememberMe: remember }) });
      const data = await response.json();
      if (!response.ok || !data.ok) { setError(typeof data.error === "string" ? data.error : "登录失败，请稍后重试。"); return; }
      setPassword(""); router.replace("/"); router.refresh();
    } catch { setError("无法连接认证服务，请稍后重试。"); }
    finally { setLoading(false); }
  }
  return <form className="login-form" onSubmit={submit}>
    <label htmlFor="username">用户名</label><input id="username" name="username" autoComplete="username" placeholder="请输入用户名" value={username} onChange={(event) => setUsername(event.target.value)} required maxLength={100} disabled={loading}/>
    <label htmlFor="password">密码</label><input id="password" name="password" type="password" autoComplete="current-password" placeholder="请输入密码" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={100} disabled={loading}/>
    <label className="remember"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} disabled={loading}/>记住登录状态</label>
    {error && <p className="login-error" role="alert">{error}</p>}
    <button type="submit" disabled={loading}>{loading ? "登录中…" : "登录"}</button>
  </form>;
}
