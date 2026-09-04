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
    <div className="flex min-h-screen items-center justify-center bg-muted/40">
      <form onSubmit={onSubmit} className="specimen-card w-96 space-y-5 p-8">
        <p className="specimen-latin">periplaneta · wing</p>
        <h1 className="font-specimen -mt-2 text-3xl font-bold tracking-tight">PeriNest</h1>
        <p className="-mt-2 text-xs italic text-muted-foreground">
          built to survive, designed to adapt.
        </p>

        <label className="block">
          <span className="specimen-latin mb-1.5 block">username · 用户名</span>
          <input
            className="w-full rounded-xl border bg-card px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-primary"
            placeholder="your-name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="specimen-latin mb-1.5 block">password · 密码</span>
          <input
            type="password"
            className="w-full rounded-xl border bg-card px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-primary"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {err && <p className="text-sm text-red-500">{err}</p>}
        <button className="btn-amber w-full rounded-xl py-3 font-medium" disabled={loading}>
          {loading ? "登录中…" : "进入巢穴"}
        </button>
      </form>
    </div>
  );
}
