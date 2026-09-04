/** Nerve AI 网关封装 — SSE 流式消费 */
import { useAuthStore } from "@/stores/auth";

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

export async function streamChat(
  messages: ChatMsg[],
  onDelta: (text: string) => void
): Promise<void> {
  const token = useAuthStore.getState().token;
  const resp = await fetch(`${import.meta.env.VITE_QUEEN_API}/ai/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Client": "Wing",
    },
    body: JSON.stringify({ messages }),
  });
  if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      try {
        const data = JSON.parse(line.slice(5).trim());
        if (data.delta) onDelta(data.delta);
        if (data.error) throw new Error(data.error);
      } catch {
        /* 忽略无法解析的行 */
      }
    }
  }
}

export const aiApi = { streamChat };
