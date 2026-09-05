/** 用户管理 API（RBAC · Carapace 权限域） */
import { api } from "./client";
import type { UserResponse } from "./auth";

export interface UserWithLogin extends UserResponse {
  last_login_at: string | null;
  last_login_ip: string | null;
}

export interface MyPermissions {
  role: string;
  permissions: string[];
}

export const usersApi = {
  list: (keyword = "", limit = 50, offset = 0) =>
    api.get<UserWithLogin[]>("/users", { params: { keyword, limit, offset } }).then((r) => r.data),
  myPermissions: () =>
    api.get<MyPermissions>("/auth/me/permissions").then((r) => r.data),
  setRole: (userId: number, role: string) =>
    api.patch<UserResponse>(`/users/${userId}/role`, { role }).then((r) => r.data),
  setStatus: (userId: number, isActive: boolean) =>
    api.patch<UserResponse>(`/users/${userId}/status`, { is_active: isActive }).then((r) => r.data),
  setPermOverride: (userId: number, perm: string, effect: "grant" | "deny") =>
    api.put(`/users/${userId}/perms`, { perm, effect }).then((r) => r.data),
};

export interface RoleInfo {
  role: string;
  name: string;
  permissions: string[];
  locked: boolean;
}

export interface PermOverview {
  user_id: number;
  role: string;
  base_permissions: string[];
  overrides: { perm: string; effect: string }[];
  permissions: string[];
}

export const rbacApi = {
  roles: () => api.get<{ domains: string[]; roles: RoleInfo[] }>("/roles").then((r) => r.data),
  permOverview: (userId: number) =>
    api.get<PermOverview>(`/users/${userId}/permissions`).then((r) => r.data),
  deleteOverride: (userId: number, perm: string) =>
    api.delete(`/users/${userId}/perms/${perm}`).then((r) => r.data),
  updateProfile: (userId: number, email: string | null) =>
    api.patch<UserResponse>(`/users/${userId}`, { email }).then((r) => r.data),
};
