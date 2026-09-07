import { NavLink, Outlet } from "react-router-dom";
import { Bot, Home, Package, User } from "lucide-react";
import { useTranslation } from "react-i18next";

const tabs = [
  { to: "/", labelKey: "nav.home", icon: Home },
  { to: "/orders", labelKey: "nav.orders", icon: Package },
  { to: "/chat", labelKey: "nav.chat", icon: Bot },
  { to: "/profile", labelKey: "nav.profile", icon: User },
];

/** 底部 Tab 导航：细线 + 衬线小标 + 琥珀激活态 */
export default function BottomNav() {
  const { t } = useTranslation();
  return (
    <>
      <Outlet />
      <nav className="glass fixed bottom-0 left-1/2 z-10 flex w-full max-w-[480px] -translate-x-1/2 !rounded-none border-x-0 border-b-0">
        {tabs.map(({ to, labelKey, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 pb-2 pt-2.5 transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`h-[18px] w-[18px] ${isActive ? "drop-shadow-[0_0_6px_hsl(var(--glow)/0.6)]" : ""}`} />
                <span className="text-[10px] leading-none">{t(labelKey)}</span>
                <span
                  className={`mt-0.5 h-[2px] w-6 rounded-full transition-opacity ${
                    isActive ? "bg-primary opacity-100" : "opacity-0"
                  }`}
                />
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
