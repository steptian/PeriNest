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
