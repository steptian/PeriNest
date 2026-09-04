import { useAuthStore } from "@/stores/auth";

export default function Home() {
  const user = useAuthStore((s) => s.user);
  return (
    <div className="p-5">
      {/* 琥珀 hero：树脂深处的光 */}
      <div
        className="relative mb-5 overflow-hidden rounded-2xl px-5 py-6 text-primary-foreground"
        style={{
          background:
            "linear-gradient(150deg, hsl(24 80% 34%), hsl(28 88% 42%) 55%, hsl(32 92% 50%))",
        }}
      >
        <p className="specimen-latin mb-2 !text-[9px] opacity-75">welcome back</p>
        <p className="text-sm opacity-85">欢迎回巢，</p>
        <p className="font-specimen text-2xl font-bold">{user?.username ?? "-"}</p>
        <p className="mt-3 text-[11px] italic opacity-70">
          Built to survive, designed to adapt.
        </p>
      </div>

      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-specimen text-base font-bold">巢穴入口</h2>
        <span className="specimen-latin">entries</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Card latin="no.01" title="神经索" desc="AI 流式对话 · 点开即聊" to="/chat" />
        <Card latin="no.02" title="订单巢" desc="查看全部订单状态" to="/orders" />
      </div>
    </div>
  );
}

function Card({ latin, title, desc, to }: { latin: string; title: string; desc: string; to: string }) {
  return (
    <a href={to} className="specimen-card block p-4 active:brightness-95">
      <span className="specimen-latin mb-2 block">{latin}</span>
      <div className="mb-1 font-specimen text-lg font-bold">{title}</div>
      <div className="text-xs leading-relaxed text-muted-foreground">{desc}</div>
    </a>
  );
}
