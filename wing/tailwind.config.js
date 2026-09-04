/** Wing 翅翼 — Tailwind 配置（shadcn 兼容） */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(214.3 31.8% 91.4%)",
        background: "hsl(0 0% 100%)",
        foreground: "hsl(222.2 84% 4.9%)",
        primary: { DEFAULT: "hsl(20 82% 44%)", foreground: "hsl(0 0% 98%)" }, // 蜚蠊琥珀
        muted: { DEFAULT: "hsl(210 40% 96.1%)", foreground: "hsl(215.4 16.3% 46.9%)" },
      },
      borderRadius: { lg: "0.5rem" },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
