import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlaskConical, Pencil, Plus, Send } from "lucide-react";
import Modal from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { agentApi, askStream, auditApi, type AuditItem, type CropSearchHit } from "@/api/crop";
import { useAuthStore } from "@/stores/auth";
import { parseMd, type InlineRun } from "@/utils/md-lite";
import { fmtTime } from "@/utils/format";

type Msg = { role: "user" | "assistant"; content: string };

/** Tab 2 · 智能问答：多轮对话 + 列表式历史会话 */
export function AskPane() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canAudit = useAuthStore((s) => s.permissions).some(
    (p) => p === "system" || p.startsWith("system:")
  );

  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  // 本轮过程展示：检索步骤 / 引用来源 / 错误
  const [steps, setSteps] = useState<string[]>([]);
  const [citations, setCitations] = useState<CropSearchHit[]>([]);
  const [error, setError] = useState("");
  const [auditOpen, setAuditOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const { data: usage } = useQuery({
    queryKey: ["crop", "usage"],
    queryFn: () => agentApi.usage(7),
  });
  const { data: conversations = [], isLoading: convLoading } = useQuery({
    queryKey: ["crop", "conversations"],
    queryFn: agentApi.conversations,
  });

  // 新消息/流式推进时钉住消息区底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, asking]);

  async function runAsk(q: string) {
    if (!q.trim() || asking) return;
    const sid = conversationId ?? `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    if (!conversationId) setConversationId(sid);
    setInput(""); setSteps([]); setCitations([]); setError("");
    setMessages((m) => [...m, { role: "user", content: q.trim() }, { role: "assistant", content: "" }]);
    setAsking(true);
    try {
      await askStream(q, (ev) => {
        if (ev.tool_call) {
          setSteps((s) => [...s, t("crop.ask.retrieving", { query: ev.tool_call?.query, round: ev.tool_call?.round })]);
        } else if (ev.delta) {
          setMessages((m) => {
            const n = [...m];
            const last = n[n.length - 1];
            if (last?.role === "assistant") n[n.length - 1] = { ...last, content: last.content + ev.delta };
            return n;
          });
        } else if (ev.citations) {
          setCitations(ev.citations);
        } else if (ev.error) {
          setError(ev.error);
        }
      }, [], sid);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("crop.ask.servingErr"));
    } finally {
      setAsking(false);
      qc.invalidateQueries({ queryKey: ["crop", "usage"] });
      qc.invalidateQueries({ queryKey: ["crop", "conversations"] });
    }
  }

  function newConversation() {
    if (asking) return;
    setConversationId(undefined);
    setMessages([]); setSteps([]); setCitations([]); setError("");
  }

  async function loadConversation(sid: string) {
    if (asking || !sid) return;
    setConversationId(sid);
    setMessages([]); setSteps([]); setCitations([]); setError("");
    try {
      const d = await agentApi.conversation(sid);
      setMessages(d.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("crop.ask.loadFail"));
    }
  }

  async function renameConversation(sid: string) {
    const cur = conversations.find((c) => c.session_id === sid);
    const title = window.prompt(t("crop.ask.renamePrompt"), cur?.title ?? "");
    if (!title || !title.trim() || title === cur?.title) return;
    try {
      await agentApi.rename(sid, title.trim());
      qc.invalidateQueries({ queryKey: ["crop", "conversations"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("crop.ask.renameFail"));
    }
  }

  return (
    <div className="flex h-full flex-col space-y-4">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden glass rounded-2xl">
        <div className="flex min-h-0 flex-1">
          {/* —— 左栏：历史会话（列表式，可点击续聊） —— */}
          <aside className="flex w-60 shrink-0 flex-col border-r border-border/60">
            <div className="border-b border-border/60 p-2">
              <Button
                size="sm" className="w-full" onClick={newConversation} disabled={asking}
                title={asking ? t("crop.ask.busy") : t("crop.ask.newConvTitle")}
              >
                <Plus className="mr-1 h-4 w-4" /> {t("crop.ask.newConv")}
              </Button>
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto p-2">
              {convLoading && <p className="px-2 py-6 text-center text-xs text-muted-foreground">{t("common.loading")}</p>}
              {!convLoading && conversations.length === 0 && (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">{t("crop.ask.noHistory")}</p>
              )}
              {conversations.map((c) => {
                const active = c.session_id === conversationId;
                return (
                  <div
                    key={c.session_id}
                    role="button" tabIndex={0}
                    onClick={() => !asking && void loadConversation(c.session_id)}
                    onKeyDown={(e) => e.key === "Enter" && !asking && void loadConversation(c.session_id)}
                    title={c.title || t("crop.ask.newConv")}
                    className={`group relative cursor-pointer rounded-xl border px-3 py-2 text-left transition-colors ${
                      active ? "border-primary/50 bg-primary/5" : "border-transparent hover:bg-muted"
                    } ${asking && !active ? "pointer-events-none opacity-60" : ""}`}
                  >
                    <div className="flex items-center gap-1 pr-4">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.title || t("crop.ask.newConv")}</span>
                      {c.channel === "free" && <span className="shrink-0 rounded bg-muted px-1 text-[9px] text-muted-foreground">{t("crop.ask.chatting")}</span>}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{t("crop.ask.msgCount", { n: c.message_count })}</span>
                      <span>{c.last_time ? fmtTime(c.last_time) : ""}</span>
                    </div>
                    {active && !asking && (
                      <button
                        onClick={(e) => { e.stopPropagation(); void renameConversation(c.session_id); }}
                        className="absolute right-1.5 top-1.5 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                        title={t("crop.ask.rename")}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {canAudit && (
              <div className="border-t border-border/60 p-2">
                <Button variant="outline" size="sm" className="w-full" onClick={() => setAuditOpen(true)} title={t("crop.ask.audit")}>
                  {t("crop.ask.audit")}
                </Button>
              </div>
            )}
          </aside>

          {/* —— 右栏：对话主体 —— */}
          <section className="flex min-w-0 flex-1 flex-col">
            {/* 头部：当前会话 + 用量 */}
            <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {conversationId
                  ? (conversations.find((c) => c.session_id === conversationId)?.title || t("crop.ask.talking"))
                  : t("crop.ask.newConv")}
              </span>
              {usage && (
                <span className="shrink-0 text-[10px] text-muted-foreground" title={t("crop.ask.usageTitle")}>
                  {t("crop.ask.usageLine", { calls: usage.calls, tokens: usage.total_tokens.toLocaleString(), tools: usage.tool_calls })}
                </span>
              )}
            </div>

            {/* 消息时间线 */}
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {messages.length === 0 && !asking && (
                <div className="flex h-full flex-col items-center justify-center gap-1 py-16 text-center">
                  <p className="text-sm font-medium text-foreground/80">{t("crop.ask.askHintTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("crop.ask.emptyHint")}</p>
                </div>
              )}
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary/90 px-3.5 py-2 text-sm leading-relaxed text-primary-foreground">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex justify-start">
                    <div className="max-w-[94%]">
                      <div className="rounded-2xl rounded-bl-sm border border-border/60 bg-background/70 px-3.5 py-2.5 text-sm leading-relaxed">
                        {m.content
                          ? <MdAnswer src={m.content} />
                          : asking && <span className="inline-block h-3.5 w-1.5 animate-pulse rounded bg-primary/70" />}
                      </div>
                    </div>
                  </div>
                )
              )}
              {/* 本轮过程：思考步骤 */}
              {steps.length > 0 && (
                <div className="space-y-1 rounded-xl border border-border/40 bg-background/40 px-3 py-2">
                  {steps.map((s, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      <FlaskConical className="mr-1 inline h-3 w-3" /> {s}
                    </p>
                  ))}
                </div>
              )}
              {error && (
                <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              {/* 本轮引用来源 */}
              {citations.length > 0 && (
                <div className="rounded-xl border border-border/40 bg-background/40 px-3 py-2">
                  <p className="specimen-latin mb-1 !text-[9px] text-muted-foreground">{t("crop.ask.citations")}</p>
                  {citations.map((h) => (
                    <p key={h.chunk_id} className="truncate text-xs text-muted-foreground">
                      《{h.document_title}》#{h.seq} · {h.content.slice(0, 60)}…
                    </p>
                  ))}
                </div>
              )}
              <div className="h-px" /> {/* 底部锚点 */}
            </div>

            {/* 输入区 */}
            <div className="border-t border-border/60 p-3">
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && input.trim() && !asking) {
                      void runAsk(input);
                    }
                  }}
                  placeholder={asking ? t("crop.ask.answering") : t("crop.ask.placeholderAsk")}
                  disabled={asking}
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60 disabled:opacity-60"
                />
                <Button size="sm" onClick={() => void runAsk(input)} disabled={!input.trim() || asking}>
                  {asking ? t("crop.ask.thinking") : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* agent 审计（admin/system）：谁让 AI 干了什么 */}
      <Modal open={auditOpen} onClose={() => setAuditOpen(false)} title={t("crop.ask.audit")} width="w-[720px]">
        <AuditList />
      </Modal>
    </div>
  );
}

/* ================= md-lite 渲染 ================= */

function MdRuns({ runs }: { runs: InlineRun[] }) {
  return (
    <>
      {runs.map((r, j) =>
        r.t === "bold" ? <strong key={j}>{r.s}</strong>
        : r.t === "italic" ? <em key={j}>{r.s}</em>
        : r.t === "code" ? (
          <code key={j} className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{r.s}</code>
        ) : r.t === "link" ? (
          <a key={j} href={r.href} target="_blank" rel="noreferrer" className="text-primary underline">{r.s}</a>
        ) : <span key={j}>{r.s}</span>
      )}
    </>
  );
}

function MdAnswer({ src }: { src: string }) {
  return (
    <>
      {parseMd(src).map((b, i) => {
        switch (b.type) {
          case "code":
            return (
              <pre key={i} className="my-1.5 overflow-x-auto rounded-lg border border-border/60 bg-muted/60 p-2.5">
                <code className="font-mono text-[11px] leading-relaxed">{b.text}</code>
              </pre>
            );
          case "h":
            return <p key={i} className="mb-1 mt-2 text-sm font-semibold"><MdRuns runs={b.runs ?? []} /></p>;
          case "list":
            return (
              <ul key={i} className="my-1 list-disc space-y-0.5 pl-4">
                {b.items?.map((runs, j) => <li key={j}><MdRuns runs={runs} /></li>)}
              </ul>
            );
          case "quote":
            return <blockquote key={i} className="my-1.5 border-l-2 border-primary/50 pl-2.5 text-muted-foreground"><MdRuns runs={b.runs ?? []} /></blockquote>;
          case "hr":
            return <hr key={i} className="my-2 border-border/60" />;
          default:
            return <p key={i} className="whitespace-pre-wrap leading-relaxed"><MdRuns runs={b.runs ?? []} /></p>;
        }
      })}
    </>
  );
}

/* ================= 审计列表 ================= */

function AuditList() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["crop", "audit"],
    queryFn: () => auditApi.list(50),
  });
  if (isLoading) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (!data?.items.length) return <p className="text-sm text-muted-foreground">{t("crop.ask.noAudit")}</p>;
  return (
    <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
      {data.items.map((a: AuditItem) => {
        let d: { tool?: string; args?: Record<string, unknown>; denied?: boolean; ok?: boolean } = {};
        try { d = JSON.parse(a.detail); } catch { /* 原样 */ }
        return (
          <div key={a.id} className="flex items-baseline gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs">
            <span className={`font-mono ${a.level === "INFO" ? "text-muted-foreground" : a.level === "WARN" ? "text-amber-600" : "text-destructive"}`}>
              {a.level}
            </span>
            <span className="font-medium">{d.tool ?? "agent"}</span>
            <span className="text-muted-foreground">
              {d.denied ? t("crop.ask.denied") : d.ok === false ? t("crop.ask.failedTag") : "✓"}
            </span>
            <span className="truncate text-muted-foreground">
              {JSON.stringify(d.args ?? {})}
            </span>
            <span className="ml-auto shrink-0 text-muted-foreground">u{a.user_id} · {a.created_at.slice(5, 16)}</span>
          </div>
        );
      })}
    </div>
  );
}
