/** 全局状态（Zustand）— 登录态 + 用户信息 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserResponse } from "@/api/auth";

interface AuthState {
  token: string | null;
  user: UserResponse | null;
  permissions: string[];  // Carapace 最终权限（角色⊕覆盖），菜单按此渲染
  setAuth: (token: string, user: UserResponse) => void;
  setPermissions: (perms: string[]) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      permissions: [],
      setAuth: (token, user) => set({ token, user }),
      setPermissions: (permissions) => set({ permissions }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: "perinest-wing-auth" }
  )
);
