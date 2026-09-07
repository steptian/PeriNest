import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Eye, Lock, PenLine, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import ConfirmDialog from "@/components/ConfirmDialog";
import Modal from "@/components/Modal";
import { api } from "@/api/client";
import { rbacApi, type RoleInfo } from "@/api/users";

/** 权限矩阵：可视化 + 可编辑（角色存 pn_role，运行时配置；admin 锁定） */
export default function Roles() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["roles"], queryFn: rbacApi.roles });
  const [editing, setEditing] = useState<RoleInfo | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<RoleInfo | null>(null);
  const [err, setErr] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["roles"] });
  const onErr = (e: unknown) => {
    const d = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail;
    setErr(typeof d === "string" ? d : t("roles.fail"));
  };

  const delMut = useMutation({
    mutationFn: (key: string) => api.delete(`/roles/${key}`),
    onSuccess: () => { setDeleting(null); invalidate(); },
    onError: onErr,
  });

  if (!data) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
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
          <h2 className="font-specimen text-3xl font-bold tracking-tight">{t("roles.title")}</h2>
        </div>
        <button className="btn-amber flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> {t("roles.add")}
        </button>
      </header>

      {err && <p className="text-sm text-red-500">{err}</p>}

      <div className="specimen-card overflow-x-auto !py-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/70 text-left">
              <th className="px-5 py-3.5"><span className="specimen-latin">{t("roles.colDomain")}</span></th>
              {domains.map((d) => (
                <th key={d} className="px-5 py-3.5 text-center"><span className="specimen-latin">{d}</span></th>
              ))}
              <th className="px-5 py-3.5"><span className="specimen-latin">{t("roles.colUser")}</span></th>
              <th className="px-5 py-3.5"><span className="specimen-latin">{t("roles.colOp")}</span></th>
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
                      {st === "rw" ? <span className="flex items-center justify-center gap-1 text-primary"><Check className="h-3.5 w-3.5" />{t("roles.rw")}</span>
                        : st === "r" ? <span className="flex items-center justify-center gap-1 text-amber-600"><Eye className="h-3.5 w-3.5" />{t("roles.r")}</span>
                        : st === "w" ? <span className="flex items-center justify-center gap-1 text-amber-600"><PenLine className="h-3.5 w-3.5" />{t("roles.w")}</span>
                        : <span className="text-muted-foreground/40">—</span>}
                    </td>
                  );
                })}
                <td className="px-5 py-3.5 text-xs text-muted-foreground">{r.user_count}</td>
                <td className="px-5 py-3.5">
                  <div className="flex gap-1.5">
                    <button className="rounded-lg border px-2.5 py-1 text-xs hover:bg-muted" onClick={() => setEditing(r)}>{t("roles.edit")}</button>
                    {!r.locked && r.user_count === 0 && (
                      <button className="rounded-lg border border-red-500/30 px-2.5 py-1 text-xs text-red-500 hover:bg-red-500/5 flex items-center gap-1" onClick={() => setDeleting(r)}>
                        <Trash2 className="h-3 w-3" />{t("roles.del")}
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
        <p className="mb-2 font-medium text-foreground">{t("roles.guardTitle")}</p>
        <p>{t("roles.guard1", { a: "pn_role / pn_role_perm", b: "permissions.py" })}</p>
        <p className="mt-1">{t("roles.guard2", { bold: t("roles.guard2Bold") })}</p>
        <p className="mt-1">{t("roles.guard3")}</p>
      </div>

      <RoleFormModal
        open={creating} title={t("roles.createTitle")}
        domains={domains}
        onClose={() => setCreating(false)}
        onSubmit={async (v) => {
          await api.post("/roles", v); setCreating(false); invalidate();
        }}
        onError={onErr}
      />
      {editing && (
        <RoleFormModal
          open title={t("roles.editTitle", { name: editing.name })} role={editing}
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
        title={t("roles.delTitle")}
        message={t("roles.delMsg", { name: deleting?.name ?? "" })}
        confirmText={t("roles.delConfirm")}
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
  const { t } = useTranslation();
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
              <span className="specimen-latin mb-1.5 block">{t("roles.keyLabel")}</span>
              <input className="w-full rounded-xl border bg-card px-3.5 py-2.5 text-sm outline-none focus:border-primary"
                placeholder={t("roles.keyPlaceholder")} value={key} onChange={(e) => setKey(e.target.value)} />
            </div>
            <div>
              <span className="specimen-latin mb-1.5 block">{t("roles.nameLabel")}</span>
              <input className="w-full rounded-xl border bg-card px-3.5 py-2.5 text-sm outline-none focus:border-primary"
                placeholder={t("roles.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
        )}
        {role && (
          <div>
            <span className="specimen-latin mb-1.5 block">{t("roles.nameLabel")}</span>
            <input className="w-full rounded-xl border bg-card px-3.5 py-2.5 text-sm outline-none focus:border-primary"
              value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        )}
        <div>
          <span className="specimen-latin mb-2 block">{t("roles.permHint")}</span>
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
                <span className="block opacity-70">{state[d] === "rw" ? t("roles.rw") : state[d] === "r" ? t("roles.r") : t("roles.none")}</span>
              </button>
            ))}
          </div>
          {role?.locked && <p className="mt-2 text-xs text-muted-foreground">{t("roles.lockedMsg")}</p>}
        </div>
        <div className="flex justify-end gap-2.5">
          <button className="rounded-xl border px-4 py-2 text-sm hover:bg-muted" onClick={onClose}>{t("roles.cancel")}</button>
          <button className="btn-amber rounded-xl px-5 py-2 text-sm font-medium" onClick={submit} disabled={saving || (!role && (!key || !name))}>
            {saving ? t("roles.saving") : t("roles.save")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
