import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Eye, Lock, PenLine, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import Modal from "@/components/Modal";
import { api } from "@/api/client";
import { rbacApi, type RoleInfo } from "@/api/users";

/** 权限矩阵：可视化 + 可编辑（角色存 pn_role，运行时配置；admin 锁定） */
export default function Roles() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["roles"], queryFn: rbacApi.roles });
  const [editing, setEditing] = useState<RoleInfo | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<RoleInfo | null>(null);
  const [err, setErr] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["roles"] });
  const onErr = (e: unknown) => {
    const d = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail;
    setErr(typeof d === "string" ? d : "操作失败");
  };

  const delMut = useMutation({
    mutationFn: (key: string) => api.delete(`/roles/${key}`),
    onSuccess: () => { setDeleting(null); invalidate(); },
    onError: onErr,
  });

  if (!data) return <p className="text-sm text-muted-foreground">加载中…</p>;
  const { domains, roles } = data;
  const cellState = (perms: string[], domain: string) => {
    if (perms.includes(domain)) return "rw" as const;
    if (perms.includes(`${domain}:read`)) return "r" as const;
    if (perms.includes(`${domain}:write`)) return "w" as const;
    return null;
  };

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <p className="specimen-latin mb-1">exoskeleton · rbac matrix</p>
          <h2 className="font-specimen text-3xl font-bold tracking-tight">权限矩阵</h2>
        </div>
        <button className="btn-amber flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> 新增角色
        </button>
      </header>

      {err && <p className="text-sm text-red-500">{err}</p>}

      <div className="specimen-card overflow-x-auto !py-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/70 text-left">
              <th className="px-5 py-3.5"><span className="specimen-latin">角色 / 域</span></th>
              {domains.map((d) => (
                <th key={d} className="px-5 py-3.5 text-center"><span className="specimen-latin">{d}</span></th>
              ))}
              <th className="px-5 py-3.5"><span className="specimen-latin">用户</span></th>
              <th className="px-5 py-3.5"><span className="specimen-latin">操作</span></th>
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
                  const st = cellState(r.permissions, d);
                  return (
                    <td key={d} className="px-5 py-3.5 text-center">
                      {st === "rw" ? <span className="flex items-center justify-center gap-1 text-primary"><Check className="h-3.5 w-3.5" />读写</span>
                        : st === "r" ? <span className="flex items-center justify-center gap-1 text-amber-600"><Eye className="h-3.5 w-3.5" />只读</span>
                        : st === "w" ? <span className="flex items-center justify-center gap-1 text-amber-600"><PenLine className="h-3.5 w-3.5" />可写</span>
                        : <span className="text-muted-foreground/40">—</span>}
                    </td>
                  );
                })}
                <td className="px-5 py-3.5 text-xs text-muted-foreground">{r.user_count}</td>
                <td className="px-5 py-3.5">
                  <div className="flex gap-1.5">
                    <button className="rounded-lg border px-2.5 py-1 text-xs hover:bg-muted" onClick={() => setEditing(r)}>编辑</button>
                    {!r.locked && r.user_count === 0 && (
                      <button className="rounded-lg border border-red-500/30 px-2.5 py-1 text-xs text-red-500 hover:bg-red-500/5 flex items-center gap-1" onClick={() => setDeleting(r)}>
                        <Trash2 className="h-3 w-3" />删除
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="specimen-card p-5 text-sm leading-relaxed text-muted-foreground">
        <p className="mb-2 font-medium text-foreground">守卫规则</p>
        <p>· 角色定义存储于 <code className="rounded bg-muted px-1.5 py-0.5 text-xs">pn_role / pn_role_perm</code>，运行时可配置（内置种子见 <code className="rounded bg-muted px-1.5 py-0.5 text-xs">permissions.py</code>）</p>
        <p className="mt-1">· <b>admin 角色锁定</b>全域不可删改（防自锁）· 有用户引用的角色不可删除（先迁移成员）</p>
        <p className="mt-1">· 账号级 grant/deny 覆盖在「巢穴成员 → 编辑」· 权限域管"能不能用"，数据归属管"能看谁的"</p>
      </div>

      <RoleFormModal
        open={creating} title="新增角色"
        domains={domains}
        onClose={() => setCreating(false)}
        onSubmit={async (v) => {
          await api.post("/roles", v); setCreating(false); invalidate();
        }}
        onError={onErr}
      />
      {editing && (
        <RoleFormModal
          open title={`编辑角色 · ${editing.name}`} role={editing}
          domains={domains}
          onClose={() => setEditing(null)}
          onSubmit={async (v) => {
            await api.patch(`/roles/${editing.role}`, { name: v.name, perms: v.perms });
            setEditing(null); invalidate();
          }}
          onError={onErr}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        title="删除角色"
        message={`确认删除角色「${deleting?.name ?? ""}」？该操作不可撤销。`}
        confirmText="确认删除"
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && delMut.mutate(deleting.role)}
      />
    </div>
  );
}

function RoleFormModal({
  open, title, role, domains, onClose, onSubmit, onError,
}: {
  open: boolean; title: string; role?: RoleInfo; domains: string[];
  onClose: () => void;
  onSubmit: (v: { key?: string; name: string; perms: string[] }) => Promise<void>;
  onError: (e: unknown) => void;
}) {
  const [key, setKey] = useState("");
  const [name, setName] = useState(role?.name ?? "");
  // 域 → rw/r/none 三态
  const [state, setState] = useState<Record<string, "rw" | "r" | "none">>(() => {
    const init: Record<string, "rw" | "r" | "none"> = {};
    for (const d of domains) {
      init[d] = role?.permissions.includes(d) ? "rw"
        : role?.permissions.includes(`${d}:read`) ? "r" : "none";
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const cycle = (d: string) =>
    setState((s) => ({ ...s, [d]: s[d] === "none" ? "r" : s[d] === "r" ? "rw" : "none" }));

  const submit = async () => {
    setSaving(true);
    try {
      const perms = domains.flatMap((d) =>
        state[d] === "rw" ? [d] : state[d] === "r" ? [`${d}:read`] : []);
      await onSubmit(role ? { name, perms } : { key, name, perms });
    } catch (e) { onError(e); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="space-y-5">
        {!role && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="specimen-latin mb-1.5 block">key · 标识</span>
              <input className="w-full rounded-xl border bg-card px-3.5 py-2.5 text-sm outline-none focus:border-primary"
                placeholder="如 auditor" value={key} onChange={(e) => setKey(e.target.value)} />
            </div>
            <div>
              <span className="specimen-latin mb-1.5 block">name · 名称</span>
              <input className="w-full rounded-xl border bg-card px-3.5 py-2.5 text-sm outline-none focus:border-primary"
                placeholder="如 审计员" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
        )}
        {role && (
          <div>
            <span className="specimen-latin mb-1.5 block">name · 名称</span>
            <input className="w-full rounded-xl border bg-card px-3.5 py-2.5 text-sm outline-none focus:border-primary"
              value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        )}
        <div>
          <span className="specimen-latin mb-2 block">permissions · 点击切换（无 → 只读 → 读写）</span>
          <div className="grid grid-cols-5 gap-2">
            {domains.map((d) => (
              <button key={d} type="button"
                className={`rounded-xl border px-3 py-2.5 text-xs transition-colors ${
                  state[d] === "rw" ? "btn-amber border-transparent"
                  : state[d] === "r" ? "border-amber-500/50 bg-amber-500/5 text-amber-700"
                  : "hover:bg-muted"
                }`}
                onClick={() => cycle(d)}
                disabled={role?.locked}
              >
                <span className="block font-medium">{d}</span>
                <span className="block opacity-70">{state[d] === "rw" ? "读写" : state[d] === "r" ? "只读" : "无"}</span>
              </button>
            ))}
          </div>
          {role?.locked && <p className="mt-2 text-xs text-muted-foreground">admin 角色锁定，权限不可修改。</p>}
        </div>
        <div className="flex justify-end gap-2.5">
          <button className="rounded-xl border px-4 py-2 text-sm hover:bg-muted" onClick={onClose}>取消</button>
          <button className="btn-amber rounded-xl px-5 py-2 text-sm font-medium" onClick={submit} disabled={saving || (!role && (!key || !name))}>
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
