import Link from "next/link";
import { Logo } from "@/components/logo";

export default function RunsPage() {
  return (
        <div className="chat-empty-state">
          <Logo className="stage-mark" />
          <h2>选择一条运行记录</h2>
          <p>从左侧打开历史运行，查看完整回答、机检和两个模型的评分；也可以发起一次新的测评。</p>
          <Link className="primary-button" href="/evaluate">新建测评</Link>
        </div>
  );
}
