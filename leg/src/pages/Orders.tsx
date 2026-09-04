import { useQuery } from "@tanstack/react-query";
import { orderApi } from "@/api/order";
import { ORDER_STATUS_LABEL, fmtMoney, fmtTime } from "@/utils/format";

export default function Orders() {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", "leg"],
    queryFn: () => orderApi.list(50),
  });

  return (
    <div className="p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h2 className="font-specimen text-lg font-bold">订单巢</h2>
          <p className="text-[11px] text-muted-foreground">全部订单 · 按时间倒序</p>
        </div>
        <span className="specimen-latin">specimens</span>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}
      {!isLoading && orders.length === 0 && (
        <div className="specimen-card p-8 text-center text-sm text-muted-foreground">
          巢穴暂无标本
        </div>
      )}

      <div className="space-y-3.5">
        {orders.map((o, idx) => (
          <div key={o.id} className="specimen-card msg-in px-4 pb-3.5 pt-4">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="specimen-latin">no.{String(orders.length - idx).padStart(3, "0")}</span>
              <span className="font-specimen text-base font-bold text-primary">
                {fmtMoney(Number(o.total_amount))}
              </span>
            </div>

            <div className="space-y-1">
              {o.items.map((it) => (
                <div key={it.id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {it.sku_name} × {it.quantity}
                  </span>
                  <span>{fmtMoney(Number(it.unit_price))}</span>
                </div>
              ))}
            </div>

            <div className="mt-2.5 flex items-center justify-between border-t border-border/60 pt-2.5">
              <span className="rounded-full border border-primary/40 px-2.5 py-0.5 text-[11px] text-primary">
                {ORDER_STATUS_LABEL[o.status] ?? o.status}
              </span>
              <span className="font-specimen text-[11px] text-muted-foreground">
                {o.order_no.slice(-8)} · {fmtTime(o.created_at)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
