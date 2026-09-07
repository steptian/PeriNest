import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ShieldAlert, UserPlus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import ConfirmDialog from "@/components/ConfirmDialog";
import Modal from "@/components/Modal";
import Pagination from "@/components/Pagination";
import { api } from "@/api/client";
import { rbacApi, usersApi, type UserWithLogin } from "@/api/users";
import { fmtTime } from "@/utils/format";

const PAGE_SIZE = 20;

export default function Users() {
  const { t } = useTranslation();
  // 角色下拉动态化：运行时从 /roles 拉（角色定义不再写死）
  const { data: roleData } = useQuery({ queryKey: ["roles"], queryFn: rbacApi.roles });
  const ROLES = (roleData?.roles ?? []).map((r) => ({ value: r.role, label: r.name, locked: r.locked }));

  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  // 弹窗状态
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UserWithLogin | null>(null);
  const [disabling, setDisabling] = useState<UserWithLogin | null>(null);

  const qc = useQueryClient();
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users", keyword, page],
    queryFn: async () => {
      const resp = await api.get<UserWithLogin[]>("/users", {
        params: { keyword, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
      });
      setTotal(Number(resp.headers["x-total-count"] ?? resp.data.length));
      return resp.data;
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["users"] });
  const onErr = (prefix: string) => (e: unknown) => {
    const detail = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail;
    setError(`${prefix}：${typeof detail === "string" ? detail : t("users.fail")}`);
  };

  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) => usersApi.setRole(id, role),
    onSuccess: invalidate, onError: onErr(t("users.roleChangeFail")),
  });
  const statusMut = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => usersApi.setStatus(id, active),
    onSuccess: () => { setDisabling(null); invalidate(); },
    onError: onErr(t("users.statusChangeFail")),
  });
  const createMut = useMutation({
    mutationFn: (p: { username: string; password: string; email?: string; role: string }) =>
      api.post("/users", p),
    onSuccess: () => { setCreateOpen(false); invalidate(); },
    onError: onErr(t("users.createFail")),
  });

  if (error) {
    return (
      <div className="specimen-card flex items-center gap-3 p-6 text-sm text-muted-foreground">
        <ShieldAlert className="h-5 w-5 text-primary" />{error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <p className="specimen-latin mb-1">colony members</p>
          <h2 className="font-specimen text-3xl font-bold tracking-tight">{t("users.title")}</h2>
        </div>
        <button className="btn-amber flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> {t("users.add")}
        </button>
      </header>

      <input
        className="w-72 rounded-xl border bg-card px-4 py-2.5 text-sm outline-none focus:border-primary"
        placeholder={t("users.placeholder")}
        value={keyword}
        onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
      />

      <div className="specimen-card overflow-hidden !py-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/70 text-left">
              {["users.colMember", "users.colRole", "users.colStatus", "users.colLastLogin", "users.colOp"].map((hk) => (
                <th key={hk} className="px-5 py-3.5 font-normal"><span className="specimen-latin">{t(hk)}</span></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={u.id} className="row-in border-b border-border/40 last:border-0" style={{ animationDelay: `${i * 30}ms` }}>
                <td className="px-5 py-3.5">
                  <div className="font-medium">{u.username}</div>
                  <div className="text-xs text-muted-foreground">{u.email ?? "—"}</div>
                </td>
                <td className="px-5 py-3.5">
                  {u.role === "admin" ? (
                    <span className="specimen-latin !text-primary">{t("users.adminLocked")}</span>
                  ) : (
                    <select
                      className="rounded-lg border bg-card px-2 py-1 text-xs outline-none focus:border-primary"
                      value={u.role}
                      onChange={(e) => roleMut.mutate({ id: u.id, role: e.target.value })}
                    >
                      {ROLES.filter((r) => !r.locked).map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <span className={u.is_active ? "text-emerald-600" : "text-red-500"}>
                    {u.is_active ? t("users.active") : t("users.disabled")}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-xs text-muted-foreground">
                  {u.last_login_at ? fmtTime(u.last_login_at) : t("users.never")}
                </td>
                <td className="px-5 py-3.5">
                  {u.role !== "admin" && (
                    <div className="flex gap-1.5">
                      <button className="rounded-lg border px-2.5 py-1 text-xs hover:bg-muted" onClick={() => setEditing(u)}>{t("users.edit")}</button>
                      {u.is_active && (
                        <button
                          className="rounded-lg border border-red-500/30 px-2.5 py-1 text-xs text-red-500 hover:bg-red-500/5"
                          onClick={() => setDisabling(u)}
                        >{t("users.disable")}</button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {isLoading && <p className="p-5 text-sm text-muted-foreground">{t("common.loading")}</p>}
      </div>
      <Pagination total={total} page={page} pageSize={PAGE_SIZE} onChange={setPage} />

      {/* 新增弹窗 */}
      <CreateModal
        open={createOpen}
        loading={createMut.isPending}
        onClose={() => setCreateOpen(false)}
        onSubmit={(v) => createMut.mutate(v)}
      />
      {/* 编辑弹窗 */}
      <EditModal key={editing?.id ?? "none"} user={editing} onClose={() => setEditing(null)} onChanged={invalidate} />
      {/* 禁用确认 */}
      <ConfirmDialog
        open={!!disabling}
        title={t("users.disableTitle")}
        message={t("users.disableMsg", { name: disabling?.username ?? "" })}
        confirmText={t("users.disableConfirm")}
        onCancel={() => setDisabling(null)}
        onConfirm={() => disabling && statusMut.mutate({ id: disabling.id, active: false })}
      />
    </div>
  );
}

function CreateModal({
  open, loading, onClose, onSubmit,
}: { open: boolean; loading: boolean; onClose: () => void; onSubmit: (v: { username: string; password: string; email?: string; role: string }) => void }) {
  const { data: roleData } = useQuery({ queryKey: ["roles"], queryFn: rbacApi.roles });
  const ROLES = (roleData?.roles ?? []).map((r) => ({ value: r.role, label: r.name, locked: r.locked }));
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("wing");
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <Modal open={open} title={t("users.createTitle")} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (username && password.length >= 8) onSubmit({ username, password, email: email || undefined, role });
        }}
      >
        <LabeledInput label={t("users.labelUsername")} value={username} onChange={setUsername} placeholder="member-001" />
        <LabeledInput label={t("users.labelPassword")} type="password" value={password} onChange={setPassword} placeholder={t("users.pwPlaceholder")} />
        <LabeledInput label={t("users.labelEmail")} value={email} onChange={setEmail} placeholder="a@example.com" />
        <div>
          <span className="specimen-latin mb-1.5 block">{t("users.roleLabel")}</span>
          <select className="w-full rounded-xl border bg-card px-3.5 py-2.5 text-sm outline-none focus:border-primary" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.filter((r) => !r.locked).map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <p className="mt-1.5 text-xs text-muted-foreground">{t("users.adminNote")}</p>
        </div>
        <div className="flex justify-end gap-2.5 pt-2">
          <button type="button" className="rounded-xl border px-4 py-2 text-sm hover:bg-muted" onClick={onClose}>{t("users.cancel")}</button>
          <button type="submit" className="btn-amber flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium" disabled={loading || !username || password.length < 8}>
            <UserPlus className="h-4 w-4" /> {loading ? t("users.creating") : t("users.createBtn")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditModal({ user, onClose, onChanged }: { user: UserWithLogin | null; onClose: () => void; onChanged: () => void }) {
  const { t } = useTranslation();
  const { data: roleData } = useQuery({ queryKey: ["roles"], queryFn: rbacApi.roles });
  const ROLES = (roleData?.roles ?? []).map((r) => ({ value: r.role, label: r.name, locked: r.locked }));
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState(user?.role ?? "wing");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const { data: perm } = useQuery({
    queryKey: ["perm-overview", user?.id],
    queryFn: () => rbacApi.permOverview(user!.id),
    enabled: !!user && user.role !== "admin",
  });

  const [newPerm, setNewPerm] = useState("");
  const [newEffect, setNewEffect] = useState<"grant" | "deny">("grant");

  const save = async () => {
    setSaving(true); setErr("");
    try {
      if (email !== (user?.email ?? "")) await rbacApi.updateProfile(user!.id, email || null);
      if (role !== user?.role) await usersApi.setRole(user!.id, role);
      onChanged(); onClose();
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setErr(typeof detail === "string" ? detail : t("users.saveFail"));
    } finally { setSaving(false); }
  };

  const addOverride = async () => {
    if (!newPerm) return;
    try {
      await usersApi.setPermOverride(user!.id, newPerm, newEffect);
      qc.invalidateQueries({ queryKey: ["perm-overview", user?.id] });
      setNewPerm("");
    } catch (e) { setErr(t("users.overrideFail")); }
  };
  const removeOverride = async (perm: string) => {
    await rbacApi.deleteOverride(user!.id, perm);
    qc.invalidateQueries({ queryKey: ["perm-overview", user?.id] });
  };

  if (!user) return null;
  return (
    <Modal open title={t("users.editTitle", { name: user.username })} onClose={onClose} width="w-[560px]">
      <div className="space-y-5">
        <div className="rounded-xl bg-muted/50 p-3.5 text-xs text-muted-foreground">
          <div>{t("users.metaId", { id: user.id, time: fmtTime(user.created_at) })}</div>
          <div>{t("users.metaLogin", { time: user.last_login_at ? fmtTime(user.last_login_at) : t("users.never"), ip: user.last_login_ip ?? "" })}</div>
        </div>

        <LabeledInput label={t("users.emailLabel")} value={email} onChange={setEmail} placeholder="a@example.com" />

        <div>
          <span className="specimen-latin mb-1.5 block">{t("users.roleLabel")}</span>
          <select className="w-full rounded-xl border bg-card px-3.5 py-2.5 text-sm outline-none focus:border-primary" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.filter((r) => !r.locked || r.value === user.role).map((r) => (
              <option key={r.value} value={r.value} disabled={r.locked}>{r.label}{r.locked ? t("users.lockedSuffix") : ""}</option>
            ))}
          </select>
        </div>

        {user.role !== "admin" && perm && (
          <div className="rounded-xl border p-4">
            <span className="specimen-latin mb-2 block">{t("users.permTitle")}</span>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {perm.permissions.map((p) => (
                <span key={p} className="rounded-full border border-primary/40 px-2.5 py-0.5 text-[11px] text-primary">{p}</span>
              ))}
            </div>
            <p className="mb-2 text-xs text-muted-foreground">
              {t("users.permSummary", { base: perm.base_permissions.length, ov: perm.overrides.length, final: perm.permissions.length })}
            </p>
            {perm.overrides.length > 0 && (
              <div className="mb-3 space-y-1.5">
                {perm.overrides.map((o) => (
                  <div key={o.perm} className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-1.5 text-xs">
                    <span>
                      <span className={o.effect === "deny" ? "text-red-500" : "text-emerald-600"}>{o.effect}</span>{" "}
                      <span className="font-mono">{o.perm}</span>
                    </span>
                    <button className="text-muted-foreground hover:text-red-500" onClick={() => removeOverride(o.perm)}>{t("users.remove")}</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-lg border bg-card px-3 py-1.5 text-xs outline-none focus:border-primary"
                placeholder={t("users.permPlaceholder")}
                value={newPerm}
                onChange={(e) => setNewPerm(e.target.value)}
              />
              <select className="rounded-lg border bg-card px-2 py-1.5 text-xs" value={newEffect} onChange={(e) => setNewEffect(e.target.value as "grant" | "deny")}>
                <option value="grant">{t("users.grant")}</option>
                <option value="deny">{t("users.deny")}</option>
              </select>
              <button className="btn-amber rounded-lg px-3 text-xs" onClick={addOverride}>{t("users.add")}</button>
            </div>
          </div>
        )}

        {err && <p className="text-sm text-red-500">{err}</p>}
        <div className="flex justify-end gap-2.5">
          <button className="rounded-xl border px-4 py-2 text-sm hover:bg-muted" onClick={onClose}>{t("users.cancel")}</button>
          <button className="btn-amber rounded-xl px-5 py-2 text-sm font-medium" onClick={save} disabled={saving}>{saving ? t("users.saving") : t("users.save")}</button>
        </div>
      </div>
    </Modal>
  );
}

function LabeledInput({
  label, value, onChange, placeholder, type = "text",
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <span className="specimen-latin mb-1.5 block">{label}</span>
      <input
        type={type}
        className="w-full rounded-xl border bg-card px-3.5 py-2.5 text-sm outline-none focus:border-primary"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
