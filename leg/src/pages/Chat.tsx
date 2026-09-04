import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { aiApi, type ChatMsg } from "@/api/ai";

const WELCOME: ChatMsg = {
  role: "assistant",
  content: "你好，我是 PeriNest 的神经索 🧠 有什么可以帮你？",
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
    setMessages(next);

    // 追加一个空的 assistant 消息，流式增量逐字填充
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
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
                m.role === "user"
                  ? "rounded-br-sm bg-primary text-primary-foreground"
                  : "rounded-bl-sm border bg-white"
              }`}
            >
              {m.content || (streaming && i === messages.length - 1 ? "▍" : "")}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="sticky bottom-16 border-t bg-white p-3">
        <div className="flex items-center gap-2">
          <input
            className="flex-1 rounded-full border px-4 py-2.5 text-[15px] outline-none focus:border-primary"
            placeholder="问点什么…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <button
            className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground active:opacity-80 disabled:opacity-40"
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
