import { NavLink, Outlet } from "react-router-dom";
import { Bot, Home, Package, User } from "lucide-react";

const tabs = [
  { to: "/", label: "巢穴", icon: Home },
  { to: "/orders", label: "订单", icon: Package },
  { to: "/chat", label: "神经索", icon: Bot },
  { to: "/profile", label: "我的", icon: User },
];

/** 底部 Tab 导航：细线 + 衬线小标 + 琥珀激活态 */
export default function BottomNav() {
  return (
    <>
      <Outlet />
      <nav className="glass fixed bottom-0 left-1/2 z-10 flex w-full max-w-[480px] -translate-x-1/2 !rounded-none border-x-0 border-b-0">
        {tabs.map(({ to, label, icon: Icon }) => (
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
                <span className="text-[10px] leading-none">{label}</span>
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
