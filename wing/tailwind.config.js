/** Wing 翅翼 — Tailwind 配置（shadcn 兼容 + CSS 变量支持暗色） */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", strong: "hsl(var(--primary-strong))", foreground: "hsl(var(--primary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        card: "hsl(var(--card))",
        glow: "hsl(var(--glow))",
      },
      borderRadius: { lg: "0.5rem" },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
