import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import VersionSheet from "@/components/VersionSheet";
import { api } from "@/api/client";
import { ORDER_STATUS_KEY, fmtMoney } from "@/utils/format";
import { useAuthStore } from "@/stores/auth";

interface Order { id: number; order_no: string; status: string; total_amount: number }

export default function Home() {
  const { t } = useTranslation();
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
        <p className="text-sm opacity-85">{t("home.welcome")}</p>
        <p className="font-specimen text-2xl font-bold">{user?.username ?? "-"}</p>
        <p className="mt-3 text-[11px] italic opacity-70">
          Built to survive, designed to adapt.
        </p>
      </div>

      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-specimen text-base font-bold">{t("home.entries")}</h2>
        <span className="specimen-latin">entries</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Card latin="no.01" titleKey="home.kbTitle" descKey="home.kbDesc" to="/chat" />
        <Card latin="no.02" titleKey="home.ordersTitle" descKey="home.ordersDesc" to="/orders" />
      </div>

      {/* 最近订单（向 Antenna 看齐） */}
      <div className="specimen-card mt-5 p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="font-specimen text-sm font-bold">{t("home.recent")}</h3>
          <span className="specimen-latin !text-[8px]">recent specimens</span>
        </div>
        {recent.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">{t("home.empty")}</p>
        )}
        {recent.map((o) => (
          <a key={o.id} href="/orders" className="flex items-center gap-2 border-t border-border/50 py-2.5 first:border-0">
            <span className="font-specimen flex-1 truncate text-xs">#{o.order_no}</span>
            <span className="rounded-full border border-primary/40 px-2 py-0.5 text-[10px] text-primary">
              {t(ORDER_STATUS_KEY[o.status] ?? o.status)}
            </span>
            <span className="font-specimen text-xs">{fmtMoney(o.total_amount)}</span>
          </a>
        ))}
        {recent.length > 0 && (
          <a href="/orders" className="mt-1 block text-center text-[11px] text-primary/80">{t("home.viewAll")}</a>
        )}
      </div>

      {/* 图鉴脚注（向 Antenna 看齐） */}
      <div className="mt-5 rounded-2xl border border-dashed border-border p-4">
        <p className="specimen-latin !text-[8px]">compendium</p>
        <p className="mt-1 text-[13px] leading-relaxed">{t("home.quote")}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          {t("home.quoteSub")}
        </p>
      </div>

      <button
        onClick={() => setVersionOpen(true)}
        className="specimen-latin mt-6 block w-full text-center !text-[9px] hover:text-primary"
      >
        v{__APP_VERSION__} · {t("home.version")}
      </button>
      <VersionSheet open={versionOpen} onClose={() => setVersionOpen(false)} />
    </div>
  );
}

function Card({ latin, titleKey, descKey, to }: { latin: string; titleKey: string; descKey: string; to: string }) {
  const { t } = useTranslation();
  return (
    <a href={to} className="specimen-card block p-4 active:brightness-95">
      <span className="specimen-latin mb-2 block">{latin}</span>
      <div className="mb-1 font-specimen text-lg font-bold">{t(titleKey)}</div>
      <div className="text-xs leading-relaxed text-muted-foreground">{t(descKey)}</div>
    </a>
  );
}
