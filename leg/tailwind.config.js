/** Leg 足 — Tailwind 配置（移动端优先 H5） */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(20 5.9% 90%)",
        background: "hsl(30 20% 99%)",
        foreground: "hsl(20 14.3% 4.1%)",
        primary: { DEFAULT: "hsl(20 82% 44%)", foreground: "hsl(0 0% 98%)" }, // 蜚蠊琥珀
        muted: { DEFAULT: "hsl(30 25% 95%)", foreground: "hsl(25 5.3% 44.7%)" },
      },
      borderRadius: { xl: "0.875rem", "2xl": "1rem" },
    },
  },
  plugins: [],
}
