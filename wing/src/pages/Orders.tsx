import { useQuery } from "@tanstack/react-query";
import { orderApi } from "@/api/order";
import { ORDER_STATUS_LABEL, fmtMoney, fmtTime } from "@/utils/format";

export default function Orders() {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", "list"],
    queryFn: () => orderApi.list(50),
  });

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">订单管理</h2>
      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-2">订单号</th>
              <th className="px-4 py-2">状态</th>
              <th className="px-4 py-2">金额</th>
              <th className="px-4 py-2">商品数</th>
              <th className="px-4 py-2">创建时间</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t">
                <td className="px-4 py-2 font-mono text-xs">{o.order_no}</td>
                <td className="px-4 py-2">{ORDER_STATUS_LABEL[o.status] ?? o.status}</td>
                <td className="px-4 py-2">{fmtMoney(Number(o.total_amount))}</td>
                <td className="px-4 py-2">{o.items.length}</td>
                <td className="px-4 py-2">{fmtTime(o.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {isLoading && <p className="p-4 text-sm text-muted-foreground">加载中…</p>}
        {!isLoading && orders.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">暂无订单</p>
        )}
      </div>
    </div>
  );
}
