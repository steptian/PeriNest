import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { aiApi, type ChatMsg } from "@/api/ai";

const WELCOME: ChatMsg = {
  role: "assistant",
  content: "你好，我是巢穴的神经索。琥珀中沉睡三亿年的生存智慧，随取随用。",
};

export default function Chat() {
  const [messages, setMessages] = useState<ChatMsg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setStreaming(true);
    const next: ChatMsg[] = [...messages, { role: "user", content: text }];
    setMessages([...next, { role: "assistant", content: "" }]);
    try {
      await aiApi.streamChat(next, (delta) =>
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: "assistant",
            content: copy[copy.length - 1].content + delta,
          };
          return copy;
        })
      );
    } catch (e) {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: "assistant",
          content: `⚠️ ${(e as Error).message}`,
        };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* 头部：标本馆标签 */}
      <header className="flex items-baseline justify-between border-b border-border/60 px-5 pt-4 pb-2.5">
        <div>
          <h1 className="font-specimen text-lg font-bold">Nerve</h1>
          <p className="text-[11px] text-muted-foreground">神经索 · 流式对话</p>
        </div>
        <span className="specimen-latin">fossil intelligence</span>
      </header>

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
                  {i === 0 ? "exhibit 001" : `exhibit ${String(i).padStart(3, "0")}`}
                </span>
                {m.content || (streaming && i === messages.length - 1 ? "" : "")}
                {streaming && i === messages.length - 1 && <span className="amber-caret" />}
              </div>
            </div>
          )
        )}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-16 border-t border-border/60 bg-background/90 p-3 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <input
            className="flex-1 rounded-full border bg-card px-4 py-2.5 text-[15px] outline-none transition-colors focus:border-primary"
            placeholder="向神经索提问…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <button
            className="btn-amber flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40"
            onClick={send}
            disabled={streaming || !input.trim()}
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
