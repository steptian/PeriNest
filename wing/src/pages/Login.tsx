import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useLogin } from "@/hooks/useAuth";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();
  const navigate = useNavigate();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login.mutateAsync({ username, password });
      navigate("/", { replace: true });
    } catch {
      // 错误提示；骨架阶段 alert，正式版换 sonner toast
      alert("用户名或密码错误");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <form onSubmit={onSubmit} className="w-80 space-y-4 rounded-xl border bg-background p-6 shadow-sm">
        <h1 className="text-center text-xl font-bold">PeriNest · Wing</h1>
        <input
          className="w-full rounded-lg border px-3 py-2 text-sm"
          placeholder="用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="password"
          className="w-full rounded-lg border px-3 py-2 text-sm"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button className="w-full" disabled={login.isPending}>
          {login.isPending ? "登录中…" : "登录"}
        </Button>
      </form>
    </div>
  );
}
