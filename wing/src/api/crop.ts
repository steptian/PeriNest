import { api } from "./client";

export interface CropDocument {
  id: number; title: string; source_type: string; size_bytes: number;
  chunk_count: number; status: string; error: string | null;
  created_by: number | null; created_at: string;
}
export interface CropSearchHit {
  chunk_id: number; document_id: number; document_title: string;
  seq: number; content: string; score: number;
}

export const cropApi = {
  list: (limit = 20, offset = 0) =>
    api.get<CropDocument[]>("/crop/documents", { params: { limit, offset } }).then((r) => r.data),
  upload: (file: File, title?: string) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<CropDocument>("/crop/documents/upload", form, {
      params: title ? { title } : {},
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data);
  },
  create: (title: string, content: string, source_type = "text") =>
    api.post<CropDocument>("/crop/documents", { title, content, source_type }).then((r) => r.data),
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
