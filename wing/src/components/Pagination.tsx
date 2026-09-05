/** 标本馆分页器：页码 + 总数（X-Total-Count 元数据驱动） */
export default function Pagination({
  total, page, pageSize, onChange,
}: { total: number; page: number; pageSize: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return <p className="px-1 text-xs text-muted-foreground">共 {total} 条</p>;
  const nums: number[] = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) nums.push(i);
  return (
    <div className="flex items-center justify-end gap-1.5 px-1 text-xs text-muted-foreground">
      <span className="mr-2">共 {total} 条 · {page}/{pages} 页</span>
      <button
        className="rounded-lg border px-2.5 py-1 disabled:opacity-40 hover:bg-muted"
        disabled={page <= 1} onClick={() => onChange(page - 1)}
      >上一页</button>
      {nums[0] > 1 && <span>…</span>}
      {nums.map((n) => (
        <button
          key={n}
          className={`rounded-lg px-2.5 py-1 ${n === page ? "btn-amber" : "border hover:bg-muted"}`}
          onClick={() => onChange(n)}
        >{n}</button>
      ))}
      {nums[nums.length - 1] < pages && <span>…</span>}
      <button
        className="rounded-lg border px-2.5 py-1 disabled:opacity-40 hover:bg-muted"
        disabled={page >= pages} onClick={() => onChange(page + 1)}
      >下一页</button>
    </div>
  );
}
