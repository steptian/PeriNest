import { useQuery } from "@tanstack/react-query";
import { orderApi } from "@/api/order";
import { systemApi } from "@/api/system";
import { ORDER_STATUS_LABEL, fmtMoney, fmtTime } from "@/utils/format";

/** 近 7 日趋势：演示数据（demo 环境订单集中同日，真实分日统计无意义） */
const TREND_DEMO = [3, 5, 2, 8, 6, 9, 4].map((v, i) => ({
  day: new Date(Date.now() - (6 - i) * 86400000).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }),
  value: v,
}));

/** 状态色带（琥珀系透明度梯度，cancelled 红例外） */
const STATUS_STYLE: Record<string, string> = {
  pending: "bg-primary/70",
  paid: "bg-primary/45",
  shipped: "bg-primary/30",
  completed: "bg-primary/15",
  cancelled: "bg-red-500/50",
};

export default function Dashboard() {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", "dashboard"],
    queryFn: () => orderApi.list(100),
  });
  const { data: version } = useQuery({
    queryKey: ["system-version"],
    queryFn: systemApi.version,
    staleTime: 60000,
  });

  const total = orders.reduce((sum, o) => sum + Number(o.total_amount), 0);
  const pending = orders.filter((o) => o.status === "pending").length;

  const byStatus = Object.entries(
    orders.reduce<Record<string, number>>((acc, o) => ((acc[o.status] = (acc[o.status] ?? 0) + 1), acc), {}),
  ).sort((a, b) => b[1] - a[1]);
  const recent = orders.slice(0, 5);
  const trendMax = Math.max(...TREND_DEMO.map((d) => d.value));

  return (
    <div className="space-y-7">
      <header className="flex items-end justify-between">
        <div>
          <p className="specimen-latin mb-1">specimen overview</p>
          <h2 className="font-specimen text-3xl font-bold tracking-tight">巢穴概况</h2>
        </div>
        <span className="specimen-latin hidden md:block">periplaneta americana</span>
      </header>

      {/* 统计带 */}
      <div className="grid grid-cols-3 gap-4">
        <Stat latin="count" title="标本总数" value={String(orders.length)} />
        <Stat latin="value" title="累计金额" value={fmtMoney(total)} />
        <Stat latin="pending" title="待支付" value={String(pending)} highlight={pending > 0} />
      </div>

      {/* 分布 + 趋势 */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="specimen-card p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="font-specimen text-sm font-bold">订单状态分布</h3>
            <span className="specimen-latin !text-[8px]">status spectrum</span>
          </div>
          {byStatus.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">嗉囊空空——暂无标本数据</p>
          ) : (
            <>
              <div className="mb-3 flex h-3 overflow-hidden rounded-full">
                {byStatus.map(([st, n]) => (
                  <div key={st} className={STATUS_STYLE[st] ?? "bg-muted"} style={{ width: `${(n / orders.length) * 100}%` }} title={`${ORDER_STATUS_LABEL[st] ?? st} × ${n}`} />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {byStatus.map(([st, n]) => (
                  <span key={st} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <i className={`inline-block h-2 w-2 rounded-full ${STATUS_STYLE[st] ?? "bg-muted"}`} />
                    {ORDER_STATUS_LABEL[st] ?? st} · {n}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="specimen-card p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="font-specimen text-sm font-bold">近 7 日订单量</h3>
            <span className="specimen-latin !text-[8px] opacity-60">trend · demo</span>
          </div>
          <div className="flex h-28 items-end gap-2">
            {TREND_DEMO.map((d, i) => (
              <div key={i} className="group flex flex-1 flex-col items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">{d.value}</span>
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-primary/25 to-primary/70 transition-all hover:to-primary"
                  style={{ height: `${Math.max((d.value / trendMax) * 88, 8)}%` }}
                  title={`${d.day} · ${d.value} 单`}
                />
                <span className="text-[9px] text-muted-foreground">{d.day}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 最新订单 + 系统状态 */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="specimen-card overflow-hidden !py-0 md:col-span-2">
          <div className="flex items-baseline justify-between px-5 pb-2 pt-4">
            <h3 className="font-specimen text-sm font-bold">最新标本</h3>
            <span className="specimen-latin !text-[8px]">recent specimens</span>
          </div>
          <table className="w-full text-sm">
            <thead className="border-y border-border/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-2 font-normal">订单号</th>
                <th className="px-4 py-2 font-normal">状态</th>
                <th className="px-4 py-2 text-right font-normal">金额</th>
                <th className="px-5 py-2 text-right font-normal">时间</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((o) => (
                <tr key={o.id} className="row-in border-b border-border/30 last:border-0">
                  <td className="px-5 py-2.5 font-specimen text-xs">#{o.order_no}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full border border-primary/35 px-2 py-0.5 text-[10px] text-primary">
                      {ORDER_STATUS_LABEL[o.status] ?? o.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-specimen text-xs">{fmtMoney(Number(o.total_amount))}</td>
                  <td className="px-5 py-2.5 text-right text-xs text-muted-foreground">{fmtTime(o.created_at)}</td>
                </tr>
              ))}
              {recent.length === 0 && !isLoading && (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-xs text-muted-foreground">暂无订单</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="specimen-card space-y-3.5 p-5">
          <div className="flex items-baseline justify-between">
            <h3 className="font-specimen text-sm font-bold">巢穴状态</h3>
            <span className="specimen-latin !text-[8px]">nest status</span>
          </div>
          <StatusRow label="Queen 后端" ok={version !== undefined} />
          <StatusRow label="当前版本" text={`v${version?.version ?? __APP_VERSION__}`} />
          <StatusRow label="更新记录" text={`${version?.changelog.length ?? 0} 个版本`} />
          <StatusRow label="终端" text="Wing · 管理端" ok />
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}
    </div>
  );
}

function Stat({ latin, title, value, highlight }: { latin: string; title: string; value: string; highlight?: boolean }) {
  return (
    <div className="specimen-card px-5 py-4 row-in">
      <span className="specimen-latin mb-1 block">{latin}</span>
      <div className={`font-specimen text-3xl font-bold ${highlight ? "text-primary" : ""}`}>{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{title}</div>
    </div>
  );
}

function StatusRow({ label, text, ok }: { label: string; text?: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      {ok !== undefined ? (
        <span className={`flex items-center gap-1.5 ${ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
          <i className={`inline-block h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"} animate-pulse`} />
          {text ?? (ok ? "在线" : "离线")}
        </span>
      ) : (
        <span className="font-specimen">{text}</span>
      )}
    </div>
  );
}
