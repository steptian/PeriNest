import { NavLink, Outlet } from "react-router-dom";
import { Bot, Home, Package, User } from "lucide-react";

const tabs = [
  { to: "/", label: "首页", icon: Home },
  { to: "/orders", label: "订单", icon: Package },
  { to: "/chat", label: "AI", icon: Bot },
  { to: "/profile", label: "我的", icon: User },
];

/** 底部 Tab 导航（H5 经典形态），内容区由 Outlet 渲染 */
export default function BottomNav() {
  return (
    <>
      <Outlet />
      <nav className="fixed bottom-0 left-1/2 z-10 flex w-full max-w-[480px] -translate-x-1/2 border-t bg-background/95 backdrop-blur">
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
