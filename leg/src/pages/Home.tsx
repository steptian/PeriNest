import { useAuthStore } from "@/stores/auth";

export default function Home() {
  const user = useAuthStore((s) => s.user);
  return (
    <div className="p-4">
      <div className="mb-4 rounded-2xl bg-primary p-5 text-primary-foreground">
        <p className="text-sm opacity-80">你好，</p>
        <p className="text-xl font-bold">{user?.username ?? "-"}</p>
        <p className="mt-2 text-xs opacity-70">Built to Survive, Designed to Adapt.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Card title="🧠 AI 助手" desc="神经索流式对话" to="/chat" />
        <Card title="🛒 去下单" desc="浏览商品，创建订单" to="/orders" />
        <Card title="📦 我的订单" desc="查看全部订单状态" to="/orders" />
      </div>
    </div>
  );
}

function Card({ title, desc, to }: { title: string; desc: string; to: string }) {
  return (
    <a href={to} className="block rounded-2xl border bg-white p-4 active:bg-muted">
      <div className="font-medium">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{desc}</div>
    </a>
  );
}
