import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, LogOut, Moon, Package, Sun, Users as UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import AiAssistant from "@/components/AiAssistant";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/stores/auth";

// 菜单按 Carapace 最终权限渲染：无对应权限不显示入口
const navItems = [
  { to: "/", label: "仪表盘", latin: "overview", icon: LayoutDashboard, perm: null },
  { to: "/orders", label: "订单档案", latin: "specimens", icon: Package, perm: "orders" },
  { to: "/users", label: "巢穴成员", latin: "members", icon: UsersIcon, perm: "users" },
];

export default function Layout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { dark, toggle } = useTheme();
  const permissions = useAuthStore((s) => s.permissions);
  const canSee = (perm: string | null) =>
    perm === null || permissions.some((p) => p === perm);

  return (
    <div className="flex h-screen">
      {/* 侧边栏：档案柜 */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-border/70 bg-card/60 px-4 py-5">
        <div className="mb-8 px-2">
          <p className="specimen-latin mb-1">periplaneta · wing</p>
          <h1 className="font-specimen text-xl font-bold tracking-tight">PeriNest</h1>
          <p className="mt-0.5 text-[11px] italic text-muted-foreground">
            built to survive
          </p>
        </div>
        <nav className="flex-1 space-y-1.5">
          {navItems.filter((n) => canSee(n.perm)).map(({ to, label, latin, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                  isActive
                    ? "btn-amber"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`
              }
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1 text-sm">{label}</span>
              <span
                className={`specimen-latin !text-[8px] transition-opacity ${
                  true ? "opacity-50" : "opacity-0"
                }`}
              >
                {latin}
              </span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border/60 pt-3 text-xs text-muted-foreground">
          <div className="mb-2 flex items-center justify-between">
            <div className="truncate">{user?.username ?? "-"}</div>
            <button
              onClick={toggle}
              className="rounded-lg p-1.5 hover:bg-muted"
              title={dark ? "切到亮色" : "切到暗色"}
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
          <Button variant="ghost" size="sm" className="w-full" onClick={logout}>
            <LogOut className="mr-1 h-4 w-4" /> 离巢
          </Button>
          <p className="specimen-latin mt-3 !text-[8px]">v{__APP_VERSION__}</p>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-7">
        <Outlet />
      </main>
      <AiAssistant />
    </div>
  );
}
