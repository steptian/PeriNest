import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { rbacApi } from "@/api/users";

/** 权限矩阵总览：角色 × 域（只读——矩阵是代码级事实源，变更走 git） */
export default function Roles() {
  const { data } = useQuery({ queryKey: ["roles"], queryFn: rbacApi.roles });
  if (!data) return <p className="text-sm text-muted-foreground">加载中…</p>;

  const { domains, roles } = data;
  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <p className="specimen-latin mb-1">exoskeleton · rbac matrix</p>
          <h2 className="font-specimen text-3xl font-bold tracking-tight">权限矩阵</h2>
        </div>
        <span className="specimen-latin">{roles.length} roles × {domains.length} domains</span>
      </header>

      <div className="specimen-card overflow-x-auto !py-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/70 text-left">
              <th className="px-5 py-3.5"><span className="specimen-latin">角色 / 域</span></th>
              {domains.map((d) => (
                <th key={d} className="px-5 py-3.5 text-center"><span className="specimen-latin">{d}</span></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.role} className="border-b border-border/40 last:border-0">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-1.5 font-medium">
                    {r.name}
                    {r.locked && <Lock className="h-3 w-3 text-primary" />}
                  </div>
                  <div className="specimen-latin !text-[8px]">{r.role}</div>
                </td>
                {domains.map((d) => {
                  const full = r.permissions.includes(d);
                  const rw = r.permissions.find((p) => p === `${d}:read` || p === `${d}:write`);
                  return (
                    <td key={d} className="px-5 py-3.5 text-center">
                      {full ? (
                        <span className="text-primary">✅ 读写</span>
                      ) : rw ? (
                        <span className="text-amber-600">{rw.endsWith(":read") ? "👁 只读" : "✍ 可写"}</span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="specimen-card p-5 text-sm leading-relaxed text-muted-foreground">
        <p className="mb-2 font-medium text-foreground">两条铁律</p>
        <p>1. <b>矩阵是代码级事实源</b>（<code className="rounded bg-muted px-1.5 py-0.5 text-xs">queen/app/core/permissions.py</code>）——改矩阵 = 同时改后端矩阵 + 测试 + 前端展示，走 git 审查，不提供 UI 增删角色。</p>
        <p className="mt-1.5">2. <b>账号级覆盖</b>（grant/deny，deny 优先）在「巢穴成员 → 编辑」里按账号微调；admin 全域锁死不可覆盖。</p>
        <p className="mt-2 text-xs italic">权限域管"能不能用"，数据归属管"能看谁的"——两层分离，各自唯一事实源。</p>
      </div>
    </div>
  );
}
