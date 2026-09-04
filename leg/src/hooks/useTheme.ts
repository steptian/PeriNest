/** 暗色模式切换 — localStorage 持久化 + html.dark class */
import { useEffect, useState } from "react";

const KEY = "perinest-leg-theme";

export function useTheme() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem(KEY);
    if (saved) return saved === "dark";
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(KEY, dark ? "dark" : "light");
  }, [dark]);

  return { dark, toggle: () => setDark((v) => !v) };
}
