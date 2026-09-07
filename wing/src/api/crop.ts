import { api } from "./client";
import { useAuthStore } from "@/stores/auth";

export interface CropDocument {
  id: number; title: string; source_type: string; size_bytes: number;
  chunk_count: number; status: string; error: string | null;
  created_by: number | null; created_at: string;
  visible_roles: string | null;
}
export interface CropSearchHit {
  chunk_id: number; document_id: number; document_title: string;
  seq: number; content: string; score: number;
}

export const cropApi = {
  list: (limit = 20, offset = 0) =>
    api.get<CropDocument[]>("/crop/documents", { params: { limit, offset } }).then((r) => r.data),
  upload: (file: File, title?: string, visibleRoles?: string) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<CropDocument>("/crop/documents/upload", form, {
      params: { title: title || "", visible_roles: visibleRoles || "" },
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data);
  },
  create: (title: string, content: string, source_type = "text", visibleRoles?: string) =>
    api.post<CropDocument>("/crop/documents", {
      title, content, source_type,
      visible_roles: visibleRoles || undefined,
    }).then((r) => r.data),
  remove: (id: number) => api.delete(`/crop/documents/${id}`).then((r) => r.data),
  detail: (id: number) =>
    api.get<{ document: CropDocument; chunks: { document_id: number; seq: number; content: string }[] }>(`/crop/documents/${id}`).then((r) => r.data),
  /** 源文件预览：fetch blob（带鉴权头）→ objectURL（浏览器新窗预览 PDF/txt） */
  openFile: async (id: number) => {
    const r = await api.get(`/crop/documents/${id}/file`, { responseType: "blob" });
    const url = URL.createObjectURL(r.data as Blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
  search: (query: string, top_k = 5) =>
    api.post<{ query: string; mock: boolean; hits: CropSearchHit[] }>("/crop/search", { query, top_k }).then((r) => r.data),
  rebuild: () => api.post<{ rebuilt: number }>("/crop/projection/rebuild").then((r) => r.data),
  health: () => api.get<{ vector_set: string; count: number }>("/crop/health").then((r) => r.data),
};

/** —— 知识库问答（agentic RAG：AI 多轮检索后作答）—— */

export interface AskEvent {
  tool_call?: { name: string; round: number; query: string };
  delta?: string;
  citations?: CropSearchHit[];
  done?: boolean;
  error?: string;
}

export async function askStream(
  query: string,
  onEvent: (ev: AskEvent) => void,
  history: { role: "user" | "assistant"; content: string }[] = [],
  conversationId?: string,
): Promise<void> {
  const token = useAuthStore.getState().token;
  const resp = await fetch(`${import.meta.env.VITE_QUEEN_API}/crop/ask/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Client": "Wing",
    },
    body: JSON.stringify({ query, history, conversation_id: conversationId || undefined }),
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

/** 会话与用量（v0.11.1+ agent 横切能力） */
export interface ConversationItem {
  session_id: string; title: string; channel: string; message_count: number; last_time: string;
}
export interface UsageSummary {
  scope: string; days: number; calls: number;
  prompt_tokens: number; completion_tokens: number; total_tokens: number; tool_calls: number;
}

export const agentApi = {
  conversations: () =>
    api.get<ConversationItem[]>("/crop/conversations").then((r) => r.data),
  rename: (id: string, title: string) =>
    api.put(`/crop/conversations/${id}/title`, { title }).then((r) => r.data),
  conversation: (id: string) =>
    api.get<{ session_id: string; messages: { role: string; content: string }[] }>(
      `/crop/conversations/${id}`
    ).then((r) => r.data),
  usage: (days = 7) =>
    api.get<UsageSummary>("/crop/usage/summary", { params: { days } }).then((r) => r.data),
};

/** agent 审计（admin/system）：谁让 AI 干了什么 */
export interface AuditItem {
  id: number; user_id: number | null; level: string; detail: string; created_at: string;
}
export const auditApi = {
  list: (limit = 50) =>
    api.get<{ total: number; items: AuditItem[] }>("/system/agent-audit", {
      params: { limit },
    }).then((r) => r.data),
};
