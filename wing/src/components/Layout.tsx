import { NavLink, Outlet } from "react-router-dom";
import { BookOpenText, ChevronLeft, ChevronRight, LayoutDashboard, LogOut, Moon, Package, Radar, Settings2, Sun, Users as UsersIcon } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AiAssistant from "@/components/AiAssistant";
import { useTheme } from "@/hooks/useTheme";
import ConfirmDialog from "@/components/ConfirmDialog";
import Modal from "@/components/Modal";
import { systemApi, type ChangelogEntry } from "@/api/system";
import { useAuthStore } from "@/stores/auth";

// 菜单按 Carapace 最终权限渲染：无对应权限不显示入口
const navItems = [
  { to: "/", label: "仪表盘", latin: "overview", icon: LayoutDashboard, perm: null },
  { to: "/orders", label: "订单档案", latin: "specimens", icon: Package, perm: "orders" },
  { to: "/users", label: "巢穴成员", latin: "members", icon: UsersIcon, perm: "users" },
  { to: "/crop", label: "嗦囊知识库", latin: "crop", icon: BookOpenText, perm: "crop" },
  { to: "/cercus", label: "尾须企微私域", latin: "cercus", icon: Radar, perm: "wecom" },
  { to: "/settings", label: "系统设置", latin: "config", icon: Settings2, perm: "system" },
];

/** 侧栏收放状态（localStorage 持久化，刷新保持） */
function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("wing-sidebar-collapsed") === "1",
  );
  const toggle = () => {
    setCollapsed((v) => {
      localStorage.setItem("wing-sidebar-collapsed", v ? "0" : "1");
      return !v;
    });
  };
  return { collapsed, toggle };
}

export default function Layout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { dark, toggle } = useTheme();
  const permissions = useAuthStore((s) => s.permissions);
  const { collapsed, toggle: toggleSidebar } = useSidebarCollapsed();
  const [versionOpen, setVersionOpen] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const { data: versionInfo } = useQuery({
    queryKey: ["system-version"],
    queryFn: systemApi.version,
    enabled: versionOpen,
  });
  const canSee = (perm: string | null) =>
    perm === null || permissions.some((p) => p === perm);

  return (
    <div className="flex h-screen">
      {/* 侧边栏：档案柜（可收放） */}
      <aside
        className={`glass relative flex shrink-0 flex-col px-4 py-5 transition-[width] duration-300 ease-out ${
          collapsed ? "w-[72px]" : "w-60"
        }`}
        style={{ borderRight: "1px solid hsl(var(--glass-border))" }}
      >
        {/* 收放把手：骑在玻璃边框上，垂直居中 */}
        <button
          onClick={toggleSidebar}
          className="glass absolute top-1/2 -right-3.5 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-primary"
          title={collapsed ? "展开侧栏" : "收起侧栏"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>

        {/* 品牌区 */}
        <div className={`mb-8 min-h-[76px] ${collapsed ? "flex items-center justify-center px-0" : "flex items-center gap-3 px-2"}`}>
          <img src="/favicon.svg" alt="PeriNest" className="h-10 w-10 shrink-0" />
          {collapsed ? null : (
            <div>
              <p className="specimen-latin mb-1">periplaneta · wing</p>
              <h1 className="font-specimen text-xl font-bold tracking-tight">PeriNest</h1>
              <p className="mt-0.5 text-[11px] italic text-muted-foreground">
                built to survive
              </p>
            </div>
          )}
        </div>
        <nav className="flex-1 space-y-1.5">
          {navItems.filter((n) => canSee(n.perm)).map(({ to, label, latin, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `group flex items-center rounded-xl py-2.5 transition-colors ${
                  collapsed ? "justify-center px-2" : "gap-3 px-3"
                } ${
                  isActive
                    ? "btn-amber"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span
                className={`overflow-hidden whitespace-nowrap text-sm transition-all duration-200 ${
                  collapsed ? "max-w-0 opacity-0" : "max-w-[140px] flex-1 opacity-100"
                }`}
              >
                {label}
              </span>
              <span
                className={`specimen-latin !text-[8px] overflow-hidden whitespace-nowrap transition-all duration-200 ${
                  collapsed ? "max-w-0 opacity-0" : "max-w-[60px] opacity-50"
                }`}
              >
                {latin}
              </span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border/60 pt-3 text-xs text-muted-foreground">
          {/* 一行收纳：用户名 + 主题切换 + 离巢（图标化，省一整行） */}
          <div className={`flex items-center gap-1 ${collapsed ? "justify-center" : ""}`}>
            <div className={`min-w-0 flex-1 truncate ${collapsed ? "hidden" : ""}`}>{user?.username ?? "-"}</div>
            <button
              onClick={toggle}
              className="shrink-0 rounded-lg p-1.5 hover:bg-muted"
              title={dark ? "切到亮色" : "切到暗色"}
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setLogoutConfirm(true)}
              className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
              title="离巢"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={() => setVersionOpen(true)}
            title="版本说明"
            className={`specimen-latin mt-2 !text-[8px] block overflow-hidden whitespace-nowrap transition-all duration-200 hover:text-primary ${
              collapsed ? "max-h-0 opacity-0" : "max-h-4 opacity-100"
            }`}
          >
            v{__APP_VERSION__}
          </button>
        </div>
      </aside>

      <ConfirmDialog
        open={logoutConfirm}
        title="确认离巢？"
        message={`巢穴将忘记 ${user?.username ?? "你"} 的本次登录——需要再次进入时重新登录即可。`}
        confirmText="离巢"
        onCancel={() => setLogoutConfirm(false)}
        onConfirm={logout}
      />

      <Modal open={versionOpen} onClose={() => setVersionOpen(false)} title="版本说明" width="w-[720px]">
        <div className="space-y-5">
          <div className="flex items-baseline justify-between">
            <span className="font-specimen text-2xl font-bold text-primary">v{versionInfo?.version ?? __APP_VERSION__}</span>
            <span className="specimen-latin !text-[9px]">changelog · {versionInfo?.source ?? "…"}</span>
          </div>
          {!versionInfo && <p className="text-sm text-muted-foreground">加载中…</p>}
          {versionInfo?.changelog.map((entry: ChangelogEntry) => (
            <div key={entry.version} className="border-t border-border/60 pt-4 first:border-0">
              <div className="mb-2 flex items-baseline gap-2">
                <span className="font-specimen text-sm font-bold">v{entry.version}</span>
                <span className="text-xs text-muted-foreground">{entry.date}</span>
              </div>
              {entry.sections.map((sec) => (
                <div key={sec.title} className="mb-2">
                  <p className="specimen-latin !text-[8px]">{sec.title}</p>
                  <ul className="mt-1 space-y-1.5">
                    {sec.items.map((item, i) => (
                      <li key={i} className="whitespace-pre-line text-xs leading-relaxed text-foreground/80">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Modal>

      <main className="flex-1 overflow-auto p-7">
        <Outlet />
      </main>
      <AiAssistant />
    </div>
  );
}
