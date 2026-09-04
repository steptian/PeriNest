import { useQuery } from "@tanstack/react-query";
import { orderApi } from "@/api/order";
import { fmtMoney } from "@/utils/format";

export default function Dashboard() {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", "dashboard"],
    queryFn: () => orderApi.list(100),
  });

  const total = orders.reduce((sum, o) => sum + Number(o.total_amount), 0);
  const pending = orders.filter((o) => o.status === "pending").length;

  return (
    <div className="space-y-7">
      <header className="flex items-end justify-between">
        <div>
          <p className="specimen-latin mb-1">specimen overview</p>
          <h2 className="font-specimen text-3xl font-bold tracking-tight">巢穴概况</h2>
        </div>
        <span className="specimen-latin hidden md:block">periplaneta americana</span>
      </header>

      <div className="grid grid-cols-3 gap-4">
        <Stat latin="count" title="标本总数" value={String(orders.length)} />
        <Stat latin="value" title="累计金额" value={fmtMoney(total)} />
        <Stat latin="pending" title="待支付" value={String(pending)} highlight={pending > 0} />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}
    </div>
  );
}

function Stat({
  latin,
  title,
  value,
  highlight,
}: {
  latin: string;
  title: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="specimen-card px-5 py-4 row-in">
      <span className="specimen-latin mb-1 block">{latin}</span>
      <div className={`font-specimen text-3xl font-bold ${highlight ? "text-primary" : ""}`}>
        {value}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{title}</div>
    </div>
  );
}
