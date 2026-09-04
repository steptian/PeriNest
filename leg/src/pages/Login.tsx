import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { authApi } from "@/api/auth";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr("");
    try {
      const { access_token } = await authApi.login({ username, password });
      const user = await authApi.me();
      setAuth(access_token, user);
      navigate("/", { replace: true });
    } catch {
      setErr("用户名或密码错误");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center p-6">
      <h1 className="mb-1 text-2xl font-bold">🪳 PeriNest</h1>
      <p className="mb-8 text-sm text-muted-foreground">Leg · 移动端 H5</p>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          className="w-full rounded-xl border bg-background px-4 py-3 text-base"
          placeholder="用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="password"
          className="w-full rounded-xl border bg-background px-4 py-3 text-base"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {err && <p className="text-sm text-red-500">{err}</p>}
        <button
          className="w-full rounded-xl bg-primary py-3 font-medium text-primary-foreground active:opacity-80"
          disabled={loading}
        >
          {loading ? "登录中…" : "登录"}
        </button>
      </form>
    </div>
  );
}
