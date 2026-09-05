import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import VersionSheet from "@/components/VersionSheet";
import { api } from "@/api/client";
import { ORDER_STATUS_LABEL, fmtMoney } from "@/utils/format";
import { useAuthStore } from "@/stores/auth";

interface Order { id: number; order_no: string; status: string; total_amount: number }

export default function Home() {
  const user = useAuthStore((s) => s.user);
  const [versionOpen, setVersionOpen] = useState(false);
  const { data: recent = [] } = useQuery({
    queryKey: ["orders", "recent"],
    queryFn: () => api.get<Order[]>("/orders", { params: { limit: 2 } }).then((r) => r.data),
  });

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

      {/* 最近订单（向 Antenna 看齐） */}
      <div className="specimen-card mt-5 p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="font-specimen text-sm font-bold">最近订单</h3>
          <span className="specimen-latin !text-[8px]">recent specimens</span>
        </div>
        {recent.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">嗉囊空空——还没有标本入巢</p>
        )}
        {recent.map((o) => (
          <a key={o.id} href="/orders" className="flex items-center gap-2 border-t border-border/50 py-2.5 first:border-0">
            <span className="font-specimen flex-1 truncate text-xs">#{o.order_no}</span>
            <span className="rounded-full border border-primary/40 px-2 py-0.5 text-[10px] text-primary">
              {ORDER_STATUS_LABEL[o.status] ?? o.status}
            </span>
            <span className="font-specimen text-xs">{fmtMoney(o.total_amount)}</span>
          </a>
        ))}
        {recent.length > 0 && (
          <a href="/orders" className="mt-1 block text-center text-[11px] text-primary/80">查看全部 →</a>
        )}
      </div>

      {/* 图鉴脚注（向 Antenna 看齐） */}
      <div className="mt-5 rounded-2xl border border-dashed border-border p-4">
        <p className="specimen-latin !text-[8px]">compendium</p>
        <p className="mt-1 text-[13px] leading-relaxed">鹰要风，狼要群，鲸要海——蜚蠊什么都不需要。</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          它靠一整套生存系统活过了三亿年、四次大灭绝。PeriNest 把这套系统翻译成了软件。
        </p>
      </div>

      <button
        onClick={() => setVersionOpen(true)}
        className="specimen-latin mt-6 block w-full text-center !text-[9px] hover:text-primary"
      >
        v{__APP_VERSION__} · 版本说明
      </button>
      <VersionSheet open={versionOpen} onClose={() => setVersionOpen(false)} />
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
