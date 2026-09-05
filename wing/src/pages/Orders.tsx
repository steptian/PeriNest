import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Modal from "@/components/Modal";
import Pagination from "@/components/Pagination";
import { api } from "@/api/client";
import type { Order } from "@/api/order";
import { ORDER_STATUS_LABEL, fmtMoney, fmtTime } from "@/utils/format";

const PAGE_SIZE = 15;
const STATUS_OPTIONS = ["", "pending", "paid", "shipped", "completed", "cancelled"];

export default function Orders() {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [detail, setDetail] = useState<Order | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", "list", keyword, status, page],
    queryFn: async () => {
      const resp = await api.get<Order[]>("/orders", {
        params: {
          keyword, status: status || undefined,
          limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
        },
      });
      setTotal(Number(resp.headers["x-total-count"] ?? resp.data.length));
      return resp.data;
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <p className="specimen-latin mb-1">specimen archive</p>
          <h2 className="font-specimen text-3xl font-bold tracking-tight">订单档案</h2>
        </div>
        <span className="specimen-latin">{total} records</span>
      </header>

      {/* 搜索表单 */}
      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={(e) => { e.preventDefault(); setPage(1); }}
      >
        <input
          className="w-64 rounded-xl border bg-card px-4 py-2.5 text-sm outline-none focus:border-primary"
          placeholder="订单号搜索，如 PN20260904…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <select
          className="rounded-xl border bg-card px-3.5 py-2.5 text-sm outline-none focus:border-primary"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s ? ORDER_STATUS_LABEL[s] : "全部状态"}</option>
          ))}
        </select>
        <button type="submit" className="btn-amber rounded-xl px-5 py-2.5 text-sm font-medium">检索</button>
        {(keyword || status) && (
          <button
            type="button"
            className="rounded-xl border px-4 py-2.5 text-sm hover:bg-muted"
            onClick={() => { setKeyword(""); setStatus(""); setPage(1); }}
          >重置</button>
        )}
      </form>

      <div className="specimen-card overflow-hidden !py-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/70 text-left">
              {["档案号", "状态", "金额", "商品", "入库时间", "操作"].map((h) => (
                <th key={h} className="px-5 py-3.5 font-normal"><span className="specimen-latin">{h}</span></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((o, i) => (
              <tr key={o.id} className="row-in border-b border-border/40 last:border-0 hover:bg-muted/40" style={{ animationDelay: `${i * 30}ms` }}>
                <td className="font-specimen px-5 py-3.5 text-xs tracking-wide">{o.order_no}</td>
                <td className="px-5 py-3.5">
                  <span className="rounded-full border border-primary/40 px-2.5 py-0.5 text-[11px] text-primary">
                    {ORDER_STATUS_LABEL[o.status] ?? o.status}
                  </span>
                </td>
                <td className="font-specimen px-5 py-3.5 font-bold">{fmtMoney(Number(o.total_amount))}</td>
                <td className="px-5 py-3.5 text-muted-foreground">{o.items.length} 件</td>
                <td className="px-5 py-3.5 text-xs text-muted-foreground">{fmtTime(o.created_at)}</td>
                <td className="px-5 py-3.5">
                  <button className="rounded-lg border px-2.5 py-1 text-xs hover:bg-muted" onClick={() => setDetail(o)}>详情</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {isLoading && <p className="p-5 text-sm text-muted-foreground">加载中…</p>}
        {!isLoading && orders.length === 0 && (
          <p className="p-5 text-sm text-muted-foreground">无匹配档案</p>
        )}
      </div>
      <Pagination total={total} page={page} pageSize={PAGE_SIZE} onChange={setPage} />

      {/* 详情弹窗 */}
      <Modal open={!!detail} title={`档案 · ${detail?.order_no ?? ""}`} onClose={() => setDetail(null)}>
        {detail && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-muted/50 p-4">
              <div>
                <span className="specimen-latin block">status</span>
                <span className="text-sm font-medium">{ORDER_STATUS_LABEL[detail.status] ?? detail.status}</span>
              </div>
              <div className="text-right">
                <span className="specimen-latin block">total</span>
                <span className="font-specimen text-xl font-bold text-primary">{fmtMoney(Number(detail.total_amount))}</span>
              </div>
            </div>
            {detail.remark && (
              <div className="rounded-xl border p-4 text-sm text-muted-foreground">备注：{detail.remark}</div>
            )}
            <div>
              <span className="specimen-latin mb-2 block">items · 标本清单</span>
              <div className="space-y-2">
                {detail.items.map((it) => (
                  <div key={it.id} className="flex justify-between rounded-xl border p-3 text-sm">
                    <span>{it.sku_name} × {it.quantity}</span>
                    <span className="font-specimen">{fmtMoney(Number(it.unit_price))}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-right text-xs text-muted-foreground">入库时间 {fmtTime(detail.created_at)}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
