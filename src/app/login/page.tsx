import { LoginForm } from "@/components/login-form";
import { ThemeSelect } from "@/components/theme-controls";
import { Logo } from "@/components/logo";
import Link from "next/link";

export default function LoginPage() {
  return <main className="login-page">
    <header className="login-header"><Link href="/" className="login-brand"><Logo /><span>Science <b>评测</b></span></Link>
    <ThemeSelect /></header>
    <section className="login-content" aria-labelledby="login-title">
      <Logo className="login-mark" />
      <h1 id="login-title">欢迎回来</h1>
      <p className="login-intro">登录后进入科学服务评测工作空间</p>
      <LoginForm />
    </section>
    <footer className="login-footer">Science 评测 · 内部工作空间</footer>
  </main>;
}
