import { useMutation, useQuery } from "@tanstack/react-query";
import { authApi, type LoginPayload } from "@/api/auth";
import { useAuthStore } from "@/stores/auth";

export function useMe() {
  const token = useAuthStore((s) => s.token);
  return useQuery({ queryKey: ["me"], queryFn: authApi.me, enabled: !!token });
}

export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth);
  return useMutation({
    mutationFn: (payload: LoginPayload) => authApi.login(payload),
    onSuccess: async (data) => {
      const user = await authApi.me();
      setAuth(data.access_token, user);
    },
  });
}
