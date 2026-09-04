import { useQuery } from "@tanstack/react-query";
import { orderApi } from "@/api/order";
import { ORDER_STATUS_LABEL, fmtMoney, fmtTime } from "@/utils/format";

export default function Orders() {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", "leg"],
    queryFn: () => orderApi.list(50),
  });

  return (
    <div className="p-4">
      <h2 className="mb-3 text-lg font-bold">我的订单</h2>
      {isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}
      {!isLoading && orders.length === 0 && (
        <div className="rounded-2xl border bg-white p-8 text-center text-sm text-muted-foreground">
          暂无订单
        </div>
      )}
      <div className="space-y-3">
        {orders.map((o) => (
          <div key={o.id} className="rounded-2xl border bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                {ORDER_STATUS_LABEL[o.status] ?? o.status}
              </span>
              <span className="font-bold text-primary">{fmtMoney(Number(o.total_amount))}</span>
            </div>
            <div className="mt-2 space-y-1">
              {o.items.map((it) => (
                <div key={it.id} className="flex justify-between text-sm text-muted-foreground">
                  <span>{it.sku_name} × {it.quantity}</span>
                  <span>{fmtMoney(Number(it.unit_price))}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span className="font-mono">{o.order_no}</span>
              <span>{fmtTime(o.created_at)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
