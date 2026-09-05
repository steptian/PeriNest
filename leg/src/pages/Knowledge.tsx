import { useEffect, useRef, useState } from "react";
import { BookOpen, FlaskConical, MessagesSquare, Search, Send } from "lucide-react";
import { askStream, cropApi, type CropSearchHit } from "@/api/crop";

type Mode = "search" | "ask";

/** 嗉囊（Crop）—— 知识库：查原文 / 问共生体（琥珀标本馆 · 蜚蠊嗉囊） */
export default function Knowledge() {
  const [mode, setMode] = useState<Mode>("ask");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  // 查原文
  const [hits, setHits] = useState<CropSearchHit[] | null>(null);
  const [mockNote, setMockNote] = useState(false);

  // 问共生体
  const [steps, setSteps] = useState<string[]>([]);
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<CropSearchHit[]>([]);
  const [error, setError] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [hits, steps, answer]);

  const run = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    setError("");
    if (mode === "search") {
      setHits(null);
      try {
        const d = await cropApi.search(q, 5);
        setHits(d.hits);
        setMockNote(d.mock);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }
    setSteps([]);
    setAnswer("");
    setCitations([]);
    try {
      await askStream(q, (ev) => {
        if (ev.tool_call) {
          setSteps((s) => [...s, `检索知识库：${ev.tool_call?.query}（第 ${ev.tool_call?.round} 轮）`]);
        } else if (ev.delta) {
          setAnswer((a) => a + ev.delta);
        } else if (ev.citations) {
          setCitations(ev.citations);
        } else if (ev.error) {
          setError(ev.error);
        }
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* 头部：标本馆标签 */}
      <header className="flex items-baseline justify-between border-b border-border/60 px-5 pt-4 pb-2.5">
        <div>
          <h1 className="font-specimen text-lg font-bold">Crop · 嗉囊</h1>
          <p className="text-[11px] text-muted-foreground">先吞后消化 · 知识库四端共享</p>
        </div>
        <span className="specimen-latin">ingested wisdom</span>
      </header>

      {/* 模式切换 */}
      <div className="flex gap-2 px-4 pt-3">
        <button
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
            mode === "ask" ? "btn-amber" : "border-border text-muted-foreground"
          }`}
          onClick={() => setMode("ask")}
        >
          <MessagesSquare className="h-3.5 w-3.5" /> 问共生体
        </button>
        <button
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
            mode === "search" ? "btn-amber" : "border-border text-muted-foreground"
          }`}
          onClick={() => setMode("search")}
        >
          <Search className="h-3.5 w-3.5" /> 查原文
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {mode === "ask" && steps.map((s, i) => (
          <p key={i} className="msg-in text-[11px] text-muted-foreground">
            <FlaskConical className="mr-1 inline h-3 w-3" />
            {s}
          </p>
        ))}

        {mode === "ask" && answer && (
          <div className="msg-in specimen-card px-4 pb-3 pt-4 text-[15px] leading-relaxed">
            <span className="specimen-latin mb-1.5 block">symbiont · 共生体作答</span>
            <p className="whitespace-pre-wrap">{answer}</p>
            {busy && <span className="amber-caret" />}
            {citations.length > 0 && (
              <div className="mt-3 border-t border-border/60 pt-2">
                <span className="specimen-latin !text-[9px] text-muted-foreground">citations · 引用来源</span>
                {citations.map((h) => (
                  <p key={h.chunk_id} className="mt-1 text-[11px] text-muted-foreground">
                    《{h.document_title}》#{h.seq}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {mode === "search" && hits && (
          <>
            {mockNote && (
              <p className="text-[11px] italic text-muted-foreground">
                mock embedding 模式——同词可召回，无语义泛化
              </p>
            )}
            {hits.length === 0 && (
              <p className="msg-in py-8 text-center text-sm text-muted-foreground">嗦囊空空如也</p>
            )}
            {hits.map((h) => (
              <div key={h.chunk_id} className="msg-in specimen-card px-4 pb-3 pt-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium">{h.document_title} · #{h.seq}</span>
                  <span className="specimen-latin !text-[9px]">sim {h.score.toFixed(3)}</span>
                </div>
                <p className="text-[13px] leading-relaxed">{h.content}</p>
              </div>
            ))}
          </>
        )}

        {error && (
          <p className="msg-in rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {!hits && !answer && !steps.length && !error && (
          <div className="py-10 text-center">
            <BookOpen className="mx-auto mb-2 h-8 w-8 opacity-30" />
            <p className="text-sm text-muted-foreground">
              {mode === "ask" ? "向共生体提问，它自己去嗦囊里翻找答案" : "输入关键词，直查知识库原文分块"}
            </p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 输入框 */}
      <div className="glass sticky bottom-16 m-2 rounded-2xl p-3">
        <div className="flex items-center gap-2.5">
          <input
            className="flex-1 rounded-2xl border bg-card px-4 py-2.5 text-[15px] outline-none transition-colors focus:border-primary"
            placeholder={mode === "ask" ? "问点什么…" : "关键词检索…"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
          />
          <button
            className="btn-amber flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40"
            onClick={() => void run()}
            disabled={busy || !input.trim()}
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
