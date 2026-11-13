import { Button } from "@/components/ui";

export default function ComparePage() {
  return <div className="chat-view"><div className="chat-top"><h1>对比测评</h1></div><div className="chat-scroll"><div className="chat-scroll-inner"><p>新建对比测评已停用，已有对比仍可从历史记录查看。</p><Button href="/runs" variant="secondary">查看运行记录</Button></div></div></div>;
}
