import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, LogOut, Moon, Package, Sun } from "lucide-react";
import AiAssistant from "@/components/AiAssistant";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/stores/auth";

const navItems = [
  { to: "/", label: "仪表盘", icon: LayoutDashboard },
  { to: "/orders", label: "订单管理", icon: Package },
];

export default function Layout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { dark, toggle } = useTheme();

  return (
    <div className="flex h-screen">
      <aside className="w-56 shrink-0 border-r bg-muted/40 p-4 flex flex-col">
        <h1 className="mb-6 px-2 text-lg font-bold">🪳 PeriNest</h1>
        <nav className="flex-1 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`
              }
            >
              <Icon className="h-4 w-4" /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t pt-3 text-xs text-muted-foreground">
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
          <div className="mb-2 text-[10px] opacity-60">v{__APP_VERSION__}</div>
          <Button variant="ghost" size="sm" className="w-full" onClick={logout}>
            <LogOut className="mr-1 h-4 w-4" /> 退出
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
      <AiAssistant />
    </div>
  );
}
