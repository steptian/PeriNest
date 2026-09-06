import { api } from "./client";

export interface InlineRun { t: "text" | "bold" | "code"; s: string }
export interface ChangelogSection { title: string; items: InlineRun[][] }
export interface ChangelogEntry { version: string; date: string; sections: ChangelogSection[] }
export interface VersionInfo { version: string; source: string; changelog: ChangelogEntry[] }

export const systemApi = {
  version: () => api.get<VersionInfo>("/system/version").then((r) => r.data),
};
