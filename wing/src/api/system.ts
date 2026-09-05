import { api } from "./client";

export interface ChangelogSection { title: string; items: string[] }
export interface ChangelogEntry { version: string; date: string; sections: ChangelogSection[] }
export interface VersionInfo { version: string; source: string; changelog: ChangelogEntry[] }

export const systemApi = {
  version: () => api.get<VersionInfo>("/system/version").then((r) => r.data),
};
