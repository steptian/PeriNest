import { useQuery } from "@tanstack/react-query";
import { orderApi } from "@/api/order";
import { ORDER_STATUS_LABEL, fmtMoney, fmtTime } from "@/utils/format";

export default function Orders() {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", "list"],
    queryFn: () => orderApi.list(50),
  });

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <p className="specimen-latin mb-1">specimen archive</p>
          <h2 className="font-specimen text-3xl font-bold tracking-tight">订单档案</h2>
        </div>
        <span className="specimen-latin">{orders.length} records</span>
      </header>

      <div className="specimen-card overflow-hidden !py-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/70 text-left">
              {["档案号", "状态", "金额", "商品", "入库时间"].map((h) => (
                <th key={h} className="px-5 py-3.5 font-normal">
                  <span className="specimen-latin">{h}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((o, i) => (
              <tr key={o.id} className="row-in border-b border-border/40 last:border-0 hover:bg-muted/40" style={{ animationDelay: `${i * 40}ms` }}>
                <td className="px-5 py-3.5 font-specimen text-xs tracking-wide">
                  {o.order_no}
                </td>
                <td className="px-5 py-3.5">
                  <span className="rounded-full border border-primary/40 px-2.5 py-0.5 text-[11px] text-primary">
                    {ORDER_STATUS_LABEL[o.status] ?? o.status}
                  </span>
                </td>
                <td className="font-specimen px-5 py-3.5 font-bold">
                  {fmtMoney(Number(o.total_amount))}
                </td>
                <td className="px-5 py-3.5 text-muted-foreground">{o.items.length} 件</td>
                <td className="px-5 py-3.5 text-xs text-muted-foreground">{fmtTime(o.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {isLoading && <p className="p-5 text-sm text-muted-foreground">加载中…</p>}
        {!isLoading && orders.length === 0 && (
          <p className="p-5 text-sm text-muted-foreground">档案柜暂无标本</p>
        )}
      </div>
    </div>
  );
}
