import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlaskConical, RotateCcw, Save, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { configApi, type ConfigItem } from "@/api/config";
import Roles from "@/pages/Roles";
import Users from "@/pages/Users";
import { useAuthStore } from "@/stores/auth";

// 配置项 label/hint 的 i18n 前缀：翻译在 JSON settings.opt.<key>.label|hint
const OPT_NS = "settings.opt.";

type Tab = "credentials" | "users" | "rbac";

export default function Settings() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("users");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const permissions = useAuthStore((s) => s.permissions);
  // 域简写=读写全有；域:read 只读。admin 走 system 全域
  const has = (domain: string) =>
    permissions.some((p) => p === domain || p.startsWith(domain + ":"));
  const canSystem = has("system");
  const canUsers = has("users");
  // 兜底：当前 tab 越权时落到首个可见 tab
  const tabs: [Tab, string][] = [
    ...(canUsers ? ([["users", "settings.tabUsers"], ["rbac", "settings.tabRbac"]] as [Tab, string][]) : []),
    ...(canSystem ? ([["credentials", "settings.tabCredentials"]] as [Tab, string][]) : []),
  ];
  const activeTab: Tab = tabs.some(([k]) => k === tab) ? tab : (tabs[0]?.[0] ?? "users");
  const [msg, setMsg] = useState("");

  const { data } = useQuery({ queryKey: ["ai-config"], queryFn: configApi.read });
  const save = useMutation({
    mutationFn: () => configApi.write(edits),
    onSuccess: (r) => {
      setMsg(t("settings.savedMsg", { n: r.written.length }));
      setEdits({});
      qc.invalidateQueries({ queryKey: ["ai-config"] });
    },
    onError: (e) => setMsg(t("settings.saveFail", { msg: String(e).slice(0, 120) })),
  });
  const test = useMutation({
    mutationFn: configApi.test,
    onSuccess: (r) => setMsg(t("settings.testOk", { model: r.model, preview: r.reply_preview.slice(0, 40) })),
    onError: (e) => setMsg(t("settings.testFail", { msg: String(e).slice(0, 140) })),
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
          <h1 className="font-specimen text-2xl font-bold">{t("settings.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("settings.subtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          {activeTab === "credentials" && (
          <>
          <Button size="sm" variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
            <FlaskConical className="mr-1 h-4 w-4" /> {t("settings.test")}
          </Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
            <Save className="mr-1 h-4 w-4" /> {t("settings.save")} {dirty ? `(${Object.values(edits).filter(Boolean).length})` : ""}
          </Button>
          </>
          )}
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-1.5">
        {tabs.map(([k, labelKey]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
              activeTab === k ? "btn-amber" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {msg && activeTab === "credentials" && <div className="glass rounded-2xl px-4 py-2.5 text-sm">{msg}</div>}

      {activeTab === "credentials" && (
        <>
          <ConfigCard title={t("settings.cardChat")} latin={t("settings.cardChatLatin")} items={group("ai.")} edits={edits} setEdits={setEdits} />
          <ConfigCard title={t("settings.cardEmbed")} latin={t("settings.cardEmbedLatin")} items={group("embedding.")} edits={edits} setEdits={setEdits} />
          <ConfigCard title={t("settings.cardWecom")} latin={t("settings.cardWecomLatin")} items={group("wecom.")} edits={edits} setEdits={setEdits} />
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
  const { t } = useTranslation();
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
              <label className="text-sm font-medium">{t(`${OPT_NS}${c.key}.label`)}</label>
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${c.source === "db" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                {c.source === "db" ? t("settings.srcDb") : "env"}
              </span>
            </div>
            <input
              value={edits[c.key] ?? ""}
              placeholder={c.value || t(`${OPT_NS}${c.key}.hint`) || ""}
              onChange={(e) => setEdits({ ...edits, [c.key]: e.target.value })}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 font-mono text-xs outline-none focus:border-primary/60"
            />
            <p className="mt-0.5 text-[10px] text-muted-foreground">{t(`${OPT_NS}${c.key}.hint`)}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground">
        <RotateCcw className="h-3 w-3" /> {t("settings.clearHint")}
      </p>
    </div>
  );
}
