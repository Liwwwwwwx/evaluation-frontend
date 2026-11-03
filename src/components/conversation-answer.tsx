"use client";

import { useMemo } from "react";
import { AnswerMarkdown } from "@/components/answer-markdown";
import { FollowupAnswer, InlineProcess, RecommendationCard, TeamOutputBlock } from "@/components/conversation-blocks";
import { record, records, text } from "@/lib/structured-results";
import { conversationTimeline } from "@/lib/conversation-layout";

function eventBody(event: Record<string, unknown>) {
  return event.phase === "end" && typeof event.content === "string" ? event.content : text(event.delta);
}

// 实时与历史共用：后端已按 event_id / seq 归并，展示层不再猜测或拼接协议帧。
export function ConversationAnswer({ content, run, streaming = false, uncertain = false }: { content: string; run: unknown; streaming?: boolean; uncertain?: boolean }) {
  const details = record(record(run)?.details);
  const events = useMemo(() => records(details?.displayEvents), [details?.displayEvents]);
  const steps = useMemo(() => events.filter((event) => text(event.type) === "display.process.step"), [events]);
  const teams = useMemo(() => events.filter((event) => text(event.type) === "display.team_output"), [events]);
  const finals = useMemo(() => events.filter((event) => text(event.type) === "display.final_answer"), [events]);
  const followupAnswers = useMemo(() => events.filter((event) => text(event.type) === "display.followup_answer"), [events]);
  const notes = useMemo(() => events.filter((event) => ["display.followups", "display.followup_request", "display.recommendations", "display.supplement"].includes(text(event.type))), [events]);
  const timeline = useMemo(() => conversationTimeline(content, steps, teams, followupAnswers), [content, steps, teams, followupAnswers]);
  const lastText = timeline.length > 0 && timeline[timeline.length - 1].kind === "text" ? timeline.length - 1 : -1;
  return <div className="conversation-answer">
    {timeline.map((segment, index) => {
      if (segment.kind === "text") return segment.content.trim() ? <AnswerMarkdown key={segment.key} content={segment.content} streaming={streaming && index === lastText} empty="" /> : null;
      if (segment.kind === "steps") return <InlineProcess key={segment.key} steps={segment.steps} uncertain={uncertain} />;
      if (segment.kind === "team") return <TeamOutputBlock key={segment.key} event={segment.event} live={streaming} uncertain={uncertain} />;
      return <FollowupAnswer key={segment.key} event={segment.event} />;
    })}
    {finals.map((event, index) => {
      const body = eventBody(event);
      if (!body) return null;
      const ended = event.phase === "end" || event.phase === "exit";
      return <section className="conversation-final" aria-label="最终总结" key={text(event.event_id) || `final:${index}`}>
        {event.fence_risk === true ? <pre>{body}</pre> : <AnswerMarkdown content={body} streaming={streaming && !ended} />}
      </section>;
    })}
    {notes.map((event, index) => {
      const type = text(event.type);
      const key = text(event.event_id) || index;
      if (type === "display.followups" || type === "display.recommendations") {
        return <RecommendationCard key={key} title={type === "display.followups" ? text(event.question) || "追问推荐" : "后续建议"} items={records(event.items)} />;
      }
      if (type === "display.followup_request") {
        const questions = records(event.questions).map((question, i) => ({ ...question, id: question.id ?? i, text: question.question }));
        return <RecommendationCard key={key} title="服务追问" items={questions} />;
      }
      return <section className="conversation-note" key={key}>
        <h3>补充信息</h3>
        {text(event.answer) && <AnswerMarkdown content={text(event.answer)} />}
        {text(event.preview) && <p>{text(event.preview)}</p>}
        {text(event.question) && <p>{text(event.question)}</p>}
      </section>;
    })}
    {!content.trim() && !teams.length && !steps.length && !finals.length && <p className="run-score-note">{streaming ? "等待服务输出…" : "暂无正文输出。"}</p>}
  </div>;
}
