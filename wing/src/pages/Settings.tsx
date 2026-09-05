import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { FlaskConical, RotateCcw, Save, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { configApi, type ConfigItem } from "@/api/config";
import Roles from "@/pages/Roles";
import Users from "@/pages/Users";
import { useAuthStore } from "@/stores/auth";

const LABELS: Record<string, { label: string; hint: string }> = {
  "ai.api_base": { label: "API Base", hint: "OpenAI 兼容端点" },
  "ai.api_key": { label: "API Key", hint: "敏感——留空不改，填新值覆盖" },
  "ai.model": { label: "模型", hint: "如 deepseek-chat" },
  "ai.timeout": { label: "超时(秒)", hint: "默认 60" },
  "embedding.api_base": { label: "Embedding Base", hint: "需有 /embeddings 端点" },
  "embedding.api_key": { label: "Embedding Key", hint: "敏感；留空=mock 伪向量" },
  "embedding.model": { label: "Embedding 模型", hint: "如 text-embedding-v3" },
  "embedding.dim": { label: "维度", hint: "改维度需重建向量投影" },
  "wecom.corp_id": { label: "Corp ID", hint: "企业 ID（ww 开头）" },
  "wecom.corp_secret": { label: "应用 Secret", hint: "敏感——留空不改" },
  "wecom.agent_id": { label: "Agent ID", hint: "自建应用数字 ID" },
  "wecom.token": { label: "回调 Token", hint: "回调验签用" },
  "wecom.aes_key": { label: "回调 EncodingAESKey", hint: "敏感；43 字符" },
  "wecom.sync_staff": { label: "同步种子员工", hint: "逗号分隔 userid" },
};

type Tab = "credentials" | "users" | "rbac";

export default function Settings() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("credentials");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const permissions = useAuthStore((s) => s.permissions);
  // 域简写=读写全有；域:read 只读。admin 走 system 全域
  const has = (domain: string) =>
    permissions.some((p) => p === domain || p.startsWith(domain + ":"));
  const canSystem = has("system");
  const canUsers = has("users");
  // 兜底：当前 tab 越权（如 operator 默认 credentials）时落到首个可见 tab
  const activeTab: Tab =
    (tab === "credentials" && !canSystem) || (tab !== "credentials" && !canUsers)
      ? canSystem ? "credentials" : "users"
      : tab;
  const [msg, setMsg] = useState("");

  const { data } = useQuery({ queryKey: ["ai-config"], queryFn: configApi.read });
  const save = useMutation({
    mutationFn: () => configApi.write(edits),
    onSuccess: (r) => {
      setMsg(`已保存 ${r.written.length} 项（即时生效）`);
      setEdits({});
      qc.invalidateQueries({ queryKey: ["ai-config"] });
    },
    onError: (e) => setMsg(`保存失败：${String(e).slice(0, 120)}`),
  });
  const test = useMutation({
    mutationFn: configApi.test,
    onSuccess: (r) => setMsg(`连接测试通过（${r.model}）：${r.reply_preview.slice(0, 40)}`),
    onError: (e) => setMsg(`测试失败：${String(e).slice(0, 140)}`),
  });

  const configs = data?.configs ?? [];
  const group = (prefix: string) => configs.filter((c) => c.key.startsWith(prefix));
  const dirty = Object.values(edits).some((v) => v !== "");

  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(""), 6000); return () => clearTimeout(t); } }, [msg]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="specimen-latin mb-1">runtime config</p>
          <h1 className="font-specimen text-2xl font-bold">系统设置</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            全部凭证与模型集中配置（AI / 向量 / 企微私域），DB 优先于 .env，改完即时生效免重启
          </p>
        </div>
        <div className="flex gap-2">
          {activeTab === "credentials" && (
          <>
          <Button size="sm" variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
            <FlaskConical className="mr-1 h-4 w-4" /> 测试连接
          </Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
            <Save className="mr-1 h-4 w-4" /> 保存 {dirty ? `(${Object.values(edits).filter(Boolean).length})` : ""}
          </Button>
          </>
          )}
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-1.5">
        {([
          ...(canSystem ? ([["credentials", "模型与凭证"]] as [Tab, string][]) : []),
          ...(canUsers ? ([["users", "巢穴成员"], ["rbac", "权限矩阵"]] as [Tab, string][]) : []),
        ]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
              activeTab === k ? "btn-amber" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {msg && activeTab === "credentials" && <div className="glass rounded-2xl px-4 py-2.5 text-sm">{msg}</div>}

      {activeTab === "credentials" && (
        <>
          <ConfigCard title="对话模型（Nerve）" latin="chat · deepseek compatible" items={group("ai.")} edits={edits} setEdits={setEdits} />
          <ConfigCard title="向量模型（Crop 嗦囊）" latin="embedding · rag" items={group("embedding.")} edits={edits} setEdits={setEdits} />
          <ConfigCard title="企微私域（Cercus 尾须）" latin="wecom · crm" items={group("wecom.")} edits={edits} setEdits={setEdits} />
        </>
      )}

      {activeTab === "users" && <Users />}
      {activeTab === "rbac" && <Roles />}
    </div>
  );
}

function ConfigCard({
  title, latin, items, edits, setEdits,
}: {
  title: string; latin: string; items: ConfigItem[];
  edits: Record<string, string>; setEdits: (v: Record<string, string>) => void;
}) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 font-specimen text-base font-bold">
          <Settings2 className="h-4 w-4 text-primary" /> {title}
        </h2>
        <span className="specimen-latin !text-[8px]">{latin}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((c) => (
          <div key={c.key}>
            <div className="mb-1 flex items-baseline justify-between">
              <label className="text-sm font-medium">{LABELS[c.key]?.label ?? c.key}</label>
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${c.source === "db" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                {c.source === "db" ? "DB 覆盖" : "env"}
              </span>
            </div>
            <input
              value={edits[c.key] ?? ""}
              placeholder={c.value || LABELS[c.key]?.hint || ""}
              onChange={(e) => setEdits({ ...edits, [c.key]: e.target.value })}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 font-mono text-xs outline-none focus:border-primary/60"
            />
            <p className="mt-0.5 text-[10px] text-muted-foreground">{LABELS[c.key]?.hint}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground">
        <RotateCcw className="h-3 w-3" /> 留空保存 = 清除 DB 覆盖、回落 .env
      </p>
    </div>
  );
}
