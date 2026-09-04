import { useQuery } from "@tanstack/react-query";
import { orderApi } from "@/api/order";
import { fmtMoney } from "@/utils/format";

export default function Dashboard() {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", "dashboard"],
    queryFn: () => orderApi.list(100),
  });

  const total = orders.reduce((sum, o) => sum + Number(o.total_amount), 0);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">仪表盘</h2>
      <div className="grid grid-cols-3 gap-4">
        <StatCard title="订单总数" value={String(orders.length)} />
        <StatCard title="累计金额" value={fmtMoney(total)} />
        <StatCard title="待支付" value={String(orders.filter((o) => o.status === "pending").length)} />
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
