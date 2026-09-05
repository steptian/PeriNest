/** Crop 嗉囊知识库封装 — 检索 + agentic 问答（SSE 流式） */
import { api } from "./client";
import { useAuthStore } from "@/stores/auth";

export interface CropSearchHit {
  chunk_id: number; document_id: number; document_title: string;
  seq: number; content: string; score: number;
}

export interface AskEvent {
  tool_call?: { name: string; round: number; query: string };
  delta?: string;
  citations?: CropSearchHit[];
  done?: boolean;
  error?: string;
}

export const cropApi = {
  search: (query: string, top_k = 5) =>
    api.post<{ query: string; mock: boolean; hits: CropSearchHit[] }>("/crop/search", { query, top_k }).then((r) => r.data),
};

/** 流式知识库问答：AI 自主多轮检索后作答，事件经 onEvent 逐个下发 */
export async function askStream(
  query: string,
  onEvent: (ev: AskEvent) => void
): Promise<void> {
  const token = useAuthStore.getState().token;
  const resp = await fetch(`${import.meta.env.VITE_QUEEN_API}/crop/ask/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Client": "Leg",
    },
    body: JSON.stringify({ query }),
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
        onEvent(JSON.parse(line.slice(5).trim()) as AskEvent);
      } catch {
        /* 忽略半包 */
      }
    }
  }
}
