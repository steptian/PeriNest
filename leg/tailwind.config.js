/** Leg 足 — 琥珀标本馆设计系统 */
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
      borderRadius: { xl: "0.875rem", "2xl": "1rem" },
    },
  },
  plugins: [],
}
