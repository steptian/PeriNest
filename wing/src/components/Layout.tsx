import { NavLink, Outlet } from "react-router-dom";
import { BookOpenText, ChevronLeft, ChevronRight, Languages, LayoutDashboard, LogOut, Moon, Package, Radar, Settings2, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import AiAssistant from "@/components/AiAssistant";
import { useTheme } from "@/hooks/useTheme";
import { useLang } from "@/hooks/useLang";
import { LANGS } from "@/i18n";
import ConfirmDialog from "@/components/ConfirmDialog";
import Modal from "@/components/Modal";
import { systemApi, type ChangelogEntry } from "@/api/system";
import { useAuthStore } from "@/stores/auth";

// 菜单按 Carapace 最终权限渲染：无对应权限不显示入口
const navItems = [
  { to: "/", labelKey: "nav.dashboard", latin: "overview", icon: LayoutDashboard, perm: null },
  { to: "/orders", labelKey: "nav.orders", latin: "specimens", icon: Package, perm: "orders" },
  { to: "/crop", labelKey: "nav.crop", latin: "crop", icon: BookOpenText, perm: "crop" },
  { to: "/cercus", labelKey: "nav.cercus", latin: "cercus", icon: Radar, perm: "wecom" },
  { to: "/settings", labelKey: "nav.settings", latin: "config", icon: Settings2, perm: "users" },  // users 或 system 任一可见；页内 tab 按权限分层
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


function Runs({ runs }: { runs: { t: string; s: string }[] }) {
  return (
    <>
      {runs.map((r, j) =>
        r.t === "bold" ? (
          <strong key={j} className="font-semibold text-foreground">{r.s}</strong>
        ) : r.t === "code" ? (
          <code key={j} className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">{r.s}</code>
        ) : (
          <span key={j}>{r.s}</span>
        )
      )}
    </>
  );
}

export default function Layout() {
  const { t } = useTranslation();
  const { lang, setLang } = useLang();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { dark, toggle } = useTheme();
  const permissions = useAuthStore((s) => s.permissions);
  const { collapsed, toggle: toggleSidebar } = useSidebarCollapsed();
  const [versionOpen, setVersionOpen] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement | null>(null);
  // 语言弹层：点击外部关闭
  useEffect(() => {
    if (!langOpen) return;
    const onDown = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [langOpen]);
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
        className={`glass relative z-40 flex shrink-0 flex-col px-4 py-5 transition-[width] duration-300 ease-out ${
          collapsed ? "w-[72px]" : "w-60"
        }`}
        style={{ borderRight: "1px solid hsl(var(--glass-border))" }}
      >
        {/* 收放把手：骑在玻璃边框上，垂直居中 */}
        <button
          onClick={toggleSidebar}
          className="glass absolute top-1/2 -right-3.5 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-primary"
          title={collapsed ? t("nav.expand") : t("nav.collapse")}
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
          {navItems.filter((n) => canSee(n.perm)).map(({ to, labelKey, latin, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              title={collapsed ? t(labelKey) : undefined}
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
                {t(labelKey)}
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
              title={dark ? t("shell.light") : t("shell.dark")}
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <div ref={langRef} className="relative">
              <button
                onClick={() => setLangOpen((v) => !v)}
                className={`shrink-0 rounded-lg p-1.5 hover:bg-muted ${langOpen ? "bg-muted text-primary" : "text-muted-foreground"}`}
                title={`${t("shell.language")} · ${LANGS.find((l) => l.code === lang)?.label ?? "中文"}`}
              >
                <Languages className="h-4 w-4" />
              </button>
              {langOpen && (
                <div className="absolute bottom-full left-0 z-50 mb-1.5 w-32 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg">
                  {LANGS.map(({ code, label }) => (
                    <button
                      key={code}
                      onClick={() => { setLang(code); setLangOpen(false); }}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors ${
                        lang === code ? "font-medium text-primary" : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {label}
                      {lang === code && <span className="text-primary">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setLogoutConfirm(true)}
              className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
              title={t("shell.logout")}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={() => setVersionOpen(true)}
            title={t("shell.version")}
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
        title={t("shell.logoutTitle")}
        message={t("shell.logoutMsg", { user: user?.username ?? "-" })}
        confirmText={t("shell.logoutConfirm")}
        onCancel={() => setLogoutConfirm(false)}
        onConfirm={logout}
      />

      <Modal open={versionOpen} onClose={() => setVersionOpen(false)} title={t("shell.version")} width="w-[720px]">
        <div className="space-y-5">
          <div className="flex items-baseline justify-between">
            <span className="font-specimen text-2xl font-bold text-primary">v{versionInfo?.version ?? __APP_VERSION__}</span>
            <span className="specimen-latin !text-[9px]">changelog · {versionInfo?.source ?? "…"}</span>
          </div>
          {!versionInfo && <p className="text-sm text-muted-foreground">{t("shell.loading")}</p>}
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
                    {sec.items.map((runs, i) => (
                      <li key={i} className="whitespace-pre-line text-xs leading-relaxed text-foreground/80">
                        <Runs runs={runs} />
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
