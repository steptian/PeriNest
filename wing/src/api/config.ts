import { api } from "./client";

export interface ConfigItem { key: string; value: string; source: "env" | "db" }

export const configApi = {
  read: () => api.get<{ configs: ConfigItem[] }>("/system/ai-config").then((r) => r.data),
  write: (updates: Record<string, string>) =>
    api.put<{ written: { key: string; action: string }[] }>("/system/ai-config", { updates }).then((r) => r.data),
  test: () => api.post<{ ok: boolean; model: string; reply_preview: string }>("/system/ai-config/test").then((r) => r.data),
};
