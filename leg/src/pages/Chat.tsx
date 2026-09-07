import { useEffect, useRef, useState } from "react";
import { BookCheck, History, Search, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { aiApi, type ChatMsg } from "@/api/ai";
import { askStream, convApi, cropApi, type ConversationItem, type CropSearchHit } from "@/api/crop";
import { parseMd, type InlineRun } from "@/utils/md-lite";

interface UiMsg extends ChatMsg {
  citations?: CropSearchHit[];
  steps?: string[];
}

/** AI 助手——单入口双模式：引用知识库（agentic 问答，带引用）/ 自由对话；
 *  右上角可切搜索模式（直查知识库原文分块）。 */

function Runs({ runs }: { runs: InlineRun[] }) {
  return (
    <>
      {runs.map((r, j) =>
        r.t === "bold" ? (
          <strong key={j} className="font-semibold">{r.s}</strong>
        ) : r.t === "italic" ? (
          <em key={j}>{r.s}</em>
        ) : r.t === "code" ? (
          <code key={j} className="rounded bg-muted px-1 py-0.5 font-mono text-[13px]">{r.s}</code>
        ) : r.t === "link" ? (
          <a key={j} href={r.href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">{r.s}</a>
        ) : (
          <span key={j}>{r.s}</span>
        )
      )}
    </>
  );
}

function MdBlocks({ src }: { src: string }) {
  return (
    <>
      {parseMd(src).map((b, i) => {
        switch (b.type) {
          case "code":
            return (
              <pre key={i} className="my-2 overflow-x-auto rounded-xl border border-border/60 bg-muted/60 p-3">
                <code className="font-mono text-[13px] leading-relaxed">{b.text}</code>
              </pre>
            );
          case "h":
            return (
              <p key={i} className={`mb-1 mt-2 font-semibold leading-snug ${b.level === 1 ? "text-[17px]" : "text-[15px]"}`}>
                <Runs runs={b.runs ?? []} />
              </p>
            );
          case "list":
            return (
              <ul key={i} className="my-1.5 list-disc space-y-1 pl-5">
                {b.items?.map((runs, j) => (
                  <li key={j}><Runs runs={runs} /></li>
                ))}
              </ul>
            );
          case "quote":
            return (
              <blockquote key={i} className="my-2 border-l-2 border-primary/50 pl-3 text-muted-foreground">
                <Runs runs={b.runs ?? []} />
              </blockquote>
            );
          case "hr":
            return <hr key={i} className="my-3 border-border/60" />;
          default:
            return (
              <p key={i} className="whitespace-pre-wrap leading-relaxed">
                <Runs runs={b.runs ?? []} />
              </p>
            );
        }
      })}
    </>
  );
}

export default function Chat() {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<UiMsg[]>(() => [
    { role: "assistant", content: t("chat.welcome") },
  ]);
  const [input, setInput] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  // 引用知识库开关（默认开，记住选择）；搜索模式（查原文）
  const [useKb, setUseKb] = useState(() => localStorage.getItem("leg-use-kb") !== "0");
  const [mode, setMode] = useState<"chat" | "search">("chat");
  const [hits, setHits] = useState<CropSearchHit[] | null>(null);
  const conversationId = useRef<string | undefined>(undefined);
  const freeConvId = useRef<string | undefined>(undefined);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [convs, setConvs] = useState<ConversationItem[]>([]);

  async function openHistory() {
    setHistoryOpen(true);
    setConvs(await convApi.list());
  }
  async function pickConversation(id: string) {
    if (!id) { // 新对话
      conversationId.current = undefined; freeConvId.current = undefined;
      setMessages([{ role: "assistant", content: t("chat.welcome") }]); setHistoryOpen(false); setHits(null);
      return;
    }
    const d = await convApi.detail(id);
    conversationId.current = id; freeConvId.current = id;
    setMessages(d.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })));
    setHistoryOpen(false);
    setMode("chat");
  }
  async function renameConv(id: string) {
    const cur = convs.find((c) => c.session_id === id);
    const title = window.prompt(t("chat.renamePrompt"), cur?.title ?? "");
    if (!title?.trim() || title === cur?.title) return;
    await convApi.rename(id, title.trim());
    setConvs(await convApi.list());
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, hits]);

  const toggleKb = () => {
    setUseKb((v) => {
      localStorage.setItem("leg-use-kb", v ? "0" : "1");
      conversationId.current = undefined; // 切换通道即新会话
      return !v;
    });
  };

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    if (mode === "search") {
      setStreaming(true);
      try {
        const d = await cropApi.search(text, 5);
        setHits(d.hits);
      } finally {
        setStreaming(false);
      }
      return;
    }
    setStreaming(true);
    const next: UiMsg[] = [...messages, { role: "user", content: text }];
    setMessages([...next, { role: "assistant", content: "", steps: [] }]);
    const patchLast = (patch: Partial<UiMsg>) =>
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        copy[copy.length - 1] = { ...last, ...patch };
        return copy;
      });
    try {
      if (useKb) {
        if (!conversationId.current) {
          conversationId.current = `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        }
        await askStream(text, (ev) => {
          if (ev.tool_call) {
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              copy[copy.length - 1] = { ...last, steps: [...(last.steps ?? []), t("chat.retrieving", { query: ev.tool_call?.query })] };
              return copy;
            });
          } else if (ev.delta) {
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              copy[copy.length - 1] = { ...last, content: last.content + ev.delta };
              return copy;
            });
          } else if (ev.citations) {
            patchLast({ citations: ev.citations });
          } else if (ev.error) {
            patchLast({ content: ev.error });
          }
        }, [], conversationId.current);
      } else {
        if (!freeConvId.current) {
          freeConvId.current = `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        }
        await aiApi.streamChat(
          next,
          (delta) =>
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              copy[copy.length - 1] = { ...last, content: last.content + delta };
              return copy;
            }),
          freeConvId.current
        );
      }
    } catch (e) {
      patchLast({ content: t("chat.errorPrefix", { message: (e as Error).message }) });
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* 头部 */}
      <header className="flex items-baseline justify-between border-b border-border/60 px-5 pt-4 pb-2.5">
        <div>
          <h1 className="font-specimen text-lg font-bold">{t("chat.title")}</h1>
          <p className="text-[11px] text-muted-foreground">{t("chat.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground"
            onClick={() => void openHistory()}
            title={t("chat.history")}
          >
            <History className="h-3.5 w-3.5" />
          </button>
          <button
            className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
              useKb ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
            }`}
            onClick={toggleKb}
            title={t("chat.kbHint")}
          >
            <BookCheck className="h-3.5 w-3.5" />
            {useKb ? t("chat.kbOn") : t("chat.kbOff")}
          </button>
          <button
            className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
              mode === "search" ? "border-primary text-primary" : "border-border text-muted-foreground"
            }`}
            onClick={() => setMode(mode === "chat" ? "search" : "chat")}
            title={mode === "chat" ? t("chat.toSearch") : t("chat.toChat")}
          >
            <Search className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* 搜索模式：原文分块 */}
      {mode === "search" && (
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {hits === null && <p className="py-10 text-center text-sm text-muted-foreground">{t("chat.searchHint")}</p>}
          {hits?.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t("chat.noResults")}</p>}
          {hits?.map((h) => (
            <div key={h.chunk_id} className="msg-in specimen-card px-4 pb-3 pt-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium">{h.document_title} · #{h.seq}</span>
                <span className="specimen-latin !text-[9px]">sim {h.score.toFixed(3)}</span>
              </div>
              <p className="text-[13px] leading-relaxed">{h.content}</p>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {/* 对话模式 */}
      {mode === "chat" && (
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="msg-in flex justify-end">
                <div className="btn-amber max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md px-4 py-2.5 text-[15px] leading-relaxed">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="msg-in flex flex-col items-start">
                <div className="specimen-card max-w-[86%] px-4 pb-3 pt-4 text-[15px] leading-relaxed">
                  <span className="specimen-latin mb-1.5 block">
                    {i === 0 ? "assistant" : useKb ? t("chat.assistantKb") : "assistant"}
                  </span>
                  {m.steps?.map((s, j) => (
                    <p key={j} className="mb-1 text-[11px] text-muted-foreground">◌ {s}</p>
                  ))}
                  {m.content ? <MdBlocks src={m.content} /> : ""}
                  {streaming && i === messages.length - 1 && <span className="amber-caret" />}
                  {m.citations && m.citations.length > 0 && (
                    <div className="mt-3 border-t border-border/60 pt-2">
                      <span className="specimen-latin !text-[9px] text-muted-foreground">{t("chat.citations")}</span>
                      {m.citations.map((h) => (
                        <p key={h.chunk_id} className="mt-1 text-[11px] text-muted-foreground">
                          📎 《{h.document_title}》#{h.seq}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 backdrop-blur-sm" onClick={() => setHistoryOpen(false)}>
          <div className="msg-in max-h-[70vh] w-full max-w-[480px] overflow-y-auto rounded-t-3xl bg-card p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <span className="font-specimen text-base font-bold">{t("chat.history")}</span>
              <button className="btn-amber rounded-full px-3 py-1 text-xs" onClick={() => void pickConversation("")}>＋ {t("chat.newConversation")}</button>
            </div>
            <div className="space-y-2">
              {convs.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t("chat.noConversations")}</p>}
              {convs.map((c) => (
                <div key={c.session_id} className="flex items-center gap-2 rounded-xl border border-border/60 p-3">
                  <button className="min-w-0 flex-1 text-left" onClick={() => void pickConversation(c.session_id)}>
                    <p className="truncate text-sm font-medium">{c.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {c.channel === "free" ? t("chat.channelFree") : t("chat.channelKb")} · {t("chat.messageCount", { count: c.message_count })} · {c.last_time.slice(5, 16)}
                    </p>
                  </button>
                  <button className="shrink-0 text-xs text-muted-foreground" onClick={() => void renameConv(c.session_id)}>✎</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="glass sticky bottom-16 m-2 rounded-2xl p-3">
        <div className="flex items-center gap-2.5">
          <textarea
            ref={taRef}
            rows={1}
            className="flex-1 resize-none rounded-2xl border bg-card px-4 py-2.5 text-[15px] leading-normal outline-none transition-colors focus:border-primary"
            placeholder={mode === "chat" ? (useKb ? t("chat.kbPlaceholder") : t("chat.freePlaceholder")) : t("chat.searchPlaceholder")}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              const ta = taRef.current;
              if (ta) { ta.style.height = "auto"; ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`; }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
          />
          <button
            className="btn-amber flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40"
            onClick={() => void send()}
            disabled={streaming || !input.trim()}
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
