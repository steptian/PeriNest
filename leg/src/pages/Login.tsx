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
      // 时序：此刻 token 尚未入 store，me 必须显式携带，否则拦截器读不到 → 401
      const user = await authApi.me(access_token);
      setAuth(access_token, user);
      navigate("/", { replace: true });
    } catch {
      setErr("用户名或密码错误");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col justify-center px-8">
      <p className="specimen-latin mb-1">Periplaneta · since 300 Ma</p>
      <h1 className="font-specimen mb-1 text-[42px] font-bold leading-none tracking-tight">
        PeriNest
      </h1>
      <p className="mb-2 text-sm text-muted-foreground">蜚蠊巢穴 · Leg 足端</p>
      <p className="mb-10 text-xs italic text-muted-foreground">
        Built to survive, designed to adapt.
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="specimen-latin mb-1.5 block">Username · 用户名</span>
          <input
            className="w-full rounded-xl border bg-card px-4 py-3 text-base outline-none transition-colors focus:border-primary"
            placeholder="your-name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="specimen-latin mb-1.5 block">Password · 密码</span>
          <input
            type="password"
            className="w-full rounded-xl border bg-card px-4 py-3 text-base outline-none transition-colors focus:border-primary"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {err && <p className="text-sm text-red-500">{err}</p>}
        <button
          className="btn-amber w-full rounded-xl py-3.5 font-medium"
          disabled={loading}
        >
          {loading ? "登录中…" : "进入巢穴"}
        </button>
      </form>

      <p className="specimen-latin mt-14 text-center">— specimen access —</p>
    </div>
  );
}
