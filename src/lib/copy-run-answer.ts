import { normalizeAnswerMarkdown } from "@/lib/answer-markdown";
import { conversationTimeline } from "@/lib/conversation-layout";
import { record, records, text } from "@/lib/structured-results";

// 保持对话正文、团队输出、最终总结和建议的显示顺序，不复制过程状态或评分。
export function copyableRunAnswer(content: string, run: unknown, streaming = false): string {
  const events = records(record(record(run)?.details)?.displayEvents);
  const teams = events.filter(event => text(event.type) === "display.team_output");
  const followups = events.filter(event => text(event.type) === "display.followup_answer");
  const timeline = conversationTimeline(content, [], teams, followups);
  const parts: string[] = [];
  const add = (value: string) => { if (value.trim()) parts.push(value.trim()); };
  const body = (event: Record<string, unknown>) => event.phase === "end" && typeof event.content === "string" ? event.content : text(event.delta);
  for (const segment of timeline) {
    if (segment.kind === "text") add(normalizeAnswerMarkdown(segment.content, { streaming }));
    else if (segment.kind === "team") {
      const value = body(segment.event);
      if (!value.trim()) continue;
      const title = text(record(segment.event.team)?.name) || "未命名团队";
      const ended = segment.event.phase === "end" || segment.event.phase === "exit";
      add(`**团队输出 · ${title}**\n\n${segment.event.fence_risk === true ? value : normalizeAnswerMarkdown(value, { streaming: streaming && !ended })}`);
    } else if (segment.kind === "followup" && text(segment.event.answer).trim()) add(`**已答**\n\n${text(segment.event.answer)}`);
  }
  for (const event of events.filter(event => text(event.type) === "display.final_answer")) {
    const value = body(event);
    if (!value.trim()) continue;
    const ended = event.phase === "end" || event.phase === "exit";
    add(`**最终总结**\n\n${event.fence_risk === true ? value : normalizeAnswerMarkdown(value, { streaming: streaming && !ended })}`);
  }
  for (const event of events) {
    const type = text(event.type);
    if (type === "display.followups" || type === "display.recommendations" || type === "display.followup_request") {
      const items: Record<string, unknown>[] = type === "display.followup_request" ? records(event.questions).map(question => ({ ...question, text: question.question })) : records(event.items);
      const entries = items.map(item => {
        const label = text(item.text) || text(item.question);
        const prompt = text(item.prompt);
        return label.trim() ? `- ${label}${prompt && prompt !== label ? `\n  ${prompt}` : ""}` : "";
      }).filter(Boolean);
      if (entries.length) add(`**${type === "display.followup_request" ? "服务追问" : type === "display.followups" ? text(event.question) || "追问推荐" : "后续建议"}**\n\n${entries.join("\n")}`);
    } else if (type === "display.supplement") {
      const values = [text(event.answer), text(event.preview), text(event.question)].filter(value => value.trim());
      if (values.length) add(`**补充信息**\n\n${values.join("\n\n")}`);
    }
  }
  return parts.join("\n\n");
}
