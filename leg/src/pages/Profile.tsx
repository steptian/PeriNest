import { LogOut } from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { fmtTime } from "@/utils/format";

export default function Profile() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center gap-3 rounded-2xl border bg-white p-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-xl text-primary-foreground">
          {(user?.username ?? "?").charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="font-bold">{user?.username ?? "-"}</div>
          <div className="text-xs text-muted-foreground">
            {user?.email ?? "—"} · 注册于 {user ? fmtTime(user.created_at) : "—"}
          </div>
        </div>
      </div>

      <div className="mb-4 rounded-2xl border bg-white p-4 text-xs text-muted-foreground">
        PeriNest Leg v{__APP_VERSION__}
      </div>

      <button
        onClick={logout}
        className="flex w-full items-center justify-center gap-1 rounded-2xl border bg-white py-3 text-sm font-medium text-red-500 active:bg-muted"
      >
        <LogOut className="h-4 w-4" /> 退出登录
      </button>
    </div>
  );
}
