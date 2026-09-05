import { useState } from "react";
import { LogOut, Moon, Sun } from "lucide-react";
import VersionSheet from "@/components/VersionSheet";
import { useAuthStore } from "@/stores/auth";
import { useTheme } from "@/hooks/useTheme";

export default function Profile() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { dark, toggle } = useTheme();
  const [versionOpen, setVersionOpen] = useState(false);

  return (
    <div className="p-5">
      {/* 标本框头像 */}
      <div className="specimen-card mb-4 flex items-center gap-4 px-4 py-5">
        <div className="btn-amber flex h-14 w-14 items-center justify-center rounded-xl font-specimen text-2xl font-bold">
          {(user?.username ?? "?").charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="font-specimen truncate text-lg font-bold">{user?.username ?? "-"}</div>
          <div className="truncate text-xs text-muted-foreground">{user?.email ?? "—"}</div>
        </div>
      </div>

      <button
        onClick={toggle}
        className="specimen-card mb-3 flex w-full items-center justify-between px-4 py-3.5 text-sm"
      >
        <span>
          <span className="specimen-latin mb-0.5 block">illumination</span>
          {dark ? "树脂深处 · 暗色" : "琥珀白昼 · 亮色"}
        </span>
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <button
        onClick={() => setVersionOpen(true)}
        className="specimen-card mb-4 flex w-full items-center justify-between px-4 py-3.5"
      >
        <span className="specimen-latin">version</span>
        <span className="font-specimen text-sm">
          PeriNest Leg v{__APP_VERSION__} · 版本说明 →
        </span>
      </button>
      <VersionSheet open={versionOpen} onClose={() => setVersionOpen(false)} />

      <button
        onClick={logout}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/5 py-3 text-sm font-medium text-red-500 active:bg-red-500/10"
      >
        <LogOut className="h-4 w-4" /> 离巢
      </button>
    </div>
  );
}
