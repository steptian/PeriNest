/** Queen API 封装 — Axios 实例 + 拦截器（Leg 足端信使） */
import axios from "axios";
import { useAuthStore } from "@/stores/auth";

export const api = axios.create({
  baseURL: import.meta.env.VITE_QUEEN_API,
  timeout: 15_000,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers["X-Client"] = "Leg";
  return config;
});

api.interceptors.response.use(
  (resp) => resp,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);
