import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ShieldAlert, UserPlus } from "lucide-react";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import Modal from "@/components/Modal";
import Pagination from "@/components/Pagination";
import { api } from "@/api/client";
import { usersApi, type UserWithLogin } from "@/api/users";
import { fmtTime } from "@/utils/format";

const ROLES = [
  { value: "admin", label: "管理员" },
  { value: "operator", label: "运营" },
  { value: "wing", label: "终端(Web)" },
  { value: "antenna", label: "终端(微信)" },
];
const PAGE_SIZE = 20;

export default function Users() {
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
    setError(`${prefix}：${typeof detail === "string" ? detail : "操作失败"}`);
  };

  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) => usersApi.setRole(id, role),
    onSuccess: invalidate, onError: onErr("角色变更失败"),
  });
  const statusMut = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => usersApi.setStatus(id, active),
    onSuccess: () => { setDisabling(null); invalidate(); },
    onError: onErr("状态变更失败"),
  });
  const createMut = useMutation({
    mutationFn: (p: { username: string; password: string; email?: string; role: string }) =>
      api.post("/users", p),
    onSuccess: () => { setCreateOpen(false); invalidate(); },
    onError: onErr("新增失败"),
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
          <h2 className="font-specimen text-3xl font-bold tracking-tight">巢穴成员</h2>
        </div>
        <button className="btn-amber flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> 新增成员
        </button>
      </header>

      <input
        className="w-72 rounded-xl border bg-card px-4 py-2.5 text-sm outline-none focus:border-primary"
        placeholder="搜索用户名 / 邮箱，回车确认…"
        value={keyword}
        onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
      />

      <div className="specimen-card overflow-hidden !py-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/70 text-left">
              {["成员", "角色", "状态", "最后登录", "操作"].map((h) => (
                <th key={h} className="px-5 py-3.5 font-normal"><span className="specimen-latin">{h}</span></th>
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
                    <span className="specimen-latin !text-primary">admin · 锁定</span>
                  ) : (
                    <select
                      className="rounded-lg border bg-card px-2 py-1 text-xs outline-none focus:border-primary"
                      value={u.role}
                      onChange={(e) => roleMut.mutate({ id: u.id, role: e.target.value })}
                    >
                      {ROLES.filter((r) => r.value !== "admin").map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <span className={u.is_active ? "text-emerald-600" : "text-red-500"}>
                    {u.is_active ? "● 活跃" : "○ 禁用"}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-xs text-muted-foreground">
                  {u.last_login_at ? fmtTime(u.last_login_at) : "从未"}
                </td>
                <td className="px-5 py-3.5">
                  {u.role !== "admin" && (
                    <div className="flex gap-1.5">
                      <button className="rounded-lg border px-2.5 py-1 text-xs hover:bg-muted" onClick={() => setEditing(u)}>编辑</button>
                      {u.is_active && (
                        <button
                          className="rounded-lg border border-red-500/30 px-2.5 py-1 text-xs text-red-500 hover:bg-red-500/5"
                          onClick={() => setDisabling(u)}
                        >禁用</button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {isLoading && <p className="p-5 text-sm text-muted-foreground">加载中…</p>}
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
      <EditModal user={editing} onClose={() => setEditing(null)} onChanged={invalidate} />
      {/* 禁用确认 */}
      <ConfirmDialog
        open={!!disabling}
        title="禁用成员"
        message={`确认禁用「${disabling?.username ?? ""}」？禁用后该账号立即无法登录，其数据保留。可随时重新启用。`}
        confirmText="确认禁用"
        onCancel={() => setDisabling(null)}
        onConfirm={() => disabling && statusMut.mutate({ id: disabling.id, active: false })}
      />
    </div>
  );
}

function CreateModal({
  open, loading, onClose, onSubmit,
}: { open: boolean; loading: boolean; onClose: () => void; onSubmit: (v: { username: string; password: string; email?: string; role: string }) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("wing");
  if (!open) return null;
  return (
    <Modal open={open} title="新增巢穴成员" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (username && password.length >= 8) onSubmit({ username, password, email: email || undefined, role });
        }}
      >
        <LabeledInput label="用户名 · username" value={username} onChange={setUsername} placeholder="member-001" />
        <LabeledInput label="密码 · password" type="password" value={password} onChange={setPassword} placeholder="至少 8 位，非纯数字" />
        <LabeledInput label="邮箱 · email（可选）" value={email} onChange={setEmail} placeholder="a@example.com" />
        <div>
          <span className="specimen-latin mb-1.5 block">role · 角色</span>
          <select className="w-full rounded-xl border bg-card px-3.5 py-2.5 text-sm outline-none focus:border-primary" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.filter((r) => r.value !== "admin").map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <p className="mt-1.5 text-xs text-muted-foreground">admin 由引导流程创建（make admin），此处不可选。</p>
        </div>
        <div className="flex justify-end gap-2.5 pt-2">
          <button type="button" className="rounded-xl border px-4 py-2 text-sm hover:bg-muted" onClick={onClose}>取消</button>
          <button type="submit" className="btn-amber flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium" disabled={loading || !username || password.length < 8}>
            <UserPlus className="h-4 w-4" /> {loading ? "创建中…" : "创建成员"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditModal({ user, onClose, onChanged }: { user: UserWithLogin | null; onClose: () => void; onChanged: () => void }) {
  const [role, setRole] = useState(user?.role ?? "wing");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  if (!user) return null;
  const save = async () => {
    setSaving(true); setErr("");
    try {
      await usersApi.setRole(user.id, role);
      onChanged(); onClose();
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setErr(typeof detail === "string" ? detail : "保存失败");
    } finally { setSaving(false); }
  };
  return (
    <Modal open title={`编辑成员 · ${user.username}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl bg-muted/50 p-3.5 text-xs text-muted-foreground">
          <div>ID：{user.id} · 注册于 {fmtTime(user.created_at)}</div>
          <div>最后登录：{user.last_login_at ? fmtTime(user.last_login_at) : "从未"} {user.last_login_ip ?? ""}</div>
        </div>
        <div>
          <span className="specimen-latin mb-1.5 block">role · 角色</span>
          <select className="w-full rounded-xl border bg-card px-3.5 py-2.5 text-sm outline-none focus:border-primary" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.filter((r) => r.value !== "admin" || user.role === "admin").map((r) => (
              <option key={r.value} value={r.value} disabled={r.value === "admin"}>{r.label}{r.value === "admin" ? "（锁定）" : ""}</option>
            ))}
          </select>
        </div>
        {err && <p className="text-sm text-red-500">{err}</p>}
        <div className="flex justify-end gap-2.5">
          <button className="rounded-xl border px-4 py-2 text-sm hover:bg-muted" onClick={onClose}>取消</button>
          <button className="btn-amber rounded-xl px-5 py-2 text-sm font-medium" onClick={save} disabled={saving}>{saving ? "保存中…" : "保存"}</button>
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
