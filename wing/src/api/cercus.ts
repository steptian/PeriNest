import { api } from "./client";

export interface WecomContact {
  id: number; external_userid: string; staff_userid: string; name: string;
  remark_mobile: string; unionid: string; tags: string[]; kv: Record<string, unknown>;
  synced_at: string | null; created_at: string;
}
export interface WecomFollowup {
  id?: number; content: string; staff_userid?: string;
  next_at?: string | null; done?: boolean; created_at?: string;
}

export const cercusApi = {
  list: (params: { keyword?: string; tag?: string; limit?: number; offset?: number }) =>
    api.get<WecomContact[]>("/cercus/contacts", { params }).then((r) => r.data),
  detail: (id: number) =>
    api.get<{ contact: WecomContact; followups: WecomFollowup[] }>(`/cercus/contacts/${id}`).then((r) => r.data),
  updateTags: (id: number, tags: string[]) =>
    api.put(`/cercus/contacts/${id}/tags`, { tags }).then((r) => r.data),
  addFollowup: (id: number, content: string, next_at?: string) =>
    api.post(`/cercus/contacts/${id}/followup`, { content, next_at: next_at || null }).then((r) => r.data),
  sync: () => api.post<{ synced: number }>("/cercus/sync").then((r) => r.data),
  health: () => api.get<{ module: string; wecom_enabled: boolean }>("/cercus/health").then((r) => r.data),
};
