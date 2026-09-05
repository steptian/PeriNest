import { api } from "./client";

export interface LoginPayload { username: string; password: string }
export interface TokenResponse { access_token: string; token_type: string }
export interface UserResponse {
  id: number; username: string; email: string | null; role: string;
  is_active: boolean; created_at: string;
}

export const authApi = {
  login: (payload: LoginPayload) =>
    api.post<TokenResponse>("/auth/login", payload).then((r) => r.data),
  me: (token?: string) =>
    api.get<UserResponse>("/auth/me", token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
      .then((r) => r.data),
};
