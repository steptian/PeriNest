import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/api/client";
import { useAuthStore } from "@/stores/auth";
import { fmtTime } from "@/utils/format";

interface Contact {
  id: number; external_userid: string; name: string; remark_mobile: string;
  tags: string[]; staff_userid: string;
}
interface Followup { content: string; next_at?: string | null; created_at?: string }

/** 企微侧边栏 H5（Cercus 尾须）：嵌入企微聊天工具栏，员工查客户档案+快速跟进。
 *  URL: /wecom/sidebar?external_userid=wmXxx（企微侧边栏配置此地址） */
export default function WecomSidebar() {
  const { t } = useTranslation();
  const params = new URLSearchParams(window.location.search);
  const eid = params.get("external_userid") ?? "";
  const code = params.get("code") ?? "";
  const [content, setContent] = useState("");
  const [exchanging, setExchanging] = useState(!!code);

  // 企微 OAuth 免登：带 code 进入 → 换 token 存登录态（约定：企微 userid=系统用户名）。
  // 一次性动作走 useEffect（非查询缓存语义）
  useEffect(() => {
    if (!code || useAuthStore.getState().token) { setExchanging(false); return; }
    api
      .post<{ access_token: string; username: string }>("/cercus/wecom/oauth-login", { code })
      .then((r) => {
        if (r.data?.access_token) {
          useAuthStore.getState().setAuth(r.data.access_token, {
            id: 0, username: r.data.username, email: null, role: "operator",
            is_active: true, created_at: "",
          } as import("@/api/auth").UserResponse);
          // role 为占位展示；真实权限由后端 JWT 解析决定
        }
      })
      .catch(() => {/* 免登失败回退手动登录态 */})
      .finally(() => setExchanging(false));
  }, [code]);

  const { data, isLoading } = useQuery({
    queryKey: ["cercus-sidebar", eid],
    queryFn: () =>
      api
        .get<{ contact: Contact | null; followups: Followup[]; hint?: string }>("/cercus/sidebar/profile", {
          params: { external_userid: eid },
        })
        .then((r) => r.data),
    enabled: !!eid,
  });

  const add = useMutation({
    mutationFn: () =>
      api.post(`/cercus/contacts/${data?.contact?.id}/followup`, { content }),
    onSuccess: () => setContent(""),
  });

  return (
    <div className="p-4">
      <p className="specimen-latin mb-1">cercus · sidebar</p>
      <h1 className="font-specimen mb-4 text-xl font-bold">{t("wecom.title")}</h1>

      {exchanging && <p className="text-sm text-muted-foreground">{t("wecom.oauth")}</p>}
      {!eid && !exchanging && <p className="text-sm text-muted-foreground">{t("wecom.missingParam")}</p>}
      {isLoading && <p className="text-sm text-muted-foreground">{t("wecom.sensing")}</p>}
      {data?.contact === null && (
        <div className="specimen-card p-4 text-sm text-muted-foreground">{data.hint}</div>
      )}

      {data?.contact && (
        <>
          <div className="specimen-card mb-3 p-4">
            <div className="font-specimen mb-1 text-lg font-bold">{data.contact.name || t("wecom.unnamed")}</div>
            <div className="mb-2 text-sm text-muted-foreground">{data.contact.remark_mobile || t("wecom.noPhone")}</div>
            <div className="flex flex-wrap gap-1.5">
              {data.contact.tags.map((t) => (
                <span key={t} className="rounded-full border border-primary/35 px-2 py-0.5 text-[10px] text-primary">{t}</span>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">{t("wecom.followupBy", { staff: data.contact.staff_userid })}</p>
          </div>

          <div className="specimen-card mb-3 p-4">
            <p className="specimen-latin mb-2">quick followup</p>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              placeholder={t("wecom.recordPlaceholder")}
              className="w-full resize-none rounded-xl border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              disabled={!content.trim() || add.isPending}
              onClick={() => add.mutate()}
              className="btn-amber mt-2 w-full rounded-xl py-2 text-sm"
            >
              {t("wecom.record")}
            </button>
          </div>

          <p className="specimen-latin mb-2">timeline</p>
          <div className="space-y-2">
            {data.followups.map((f, i) => (
              <div key={i} className="specimen-card p-3">
                <div className="mb-1 flex items-baseline justify-between text-[10px] text-muted-foreground">
                  <span>{f.created_at ? fmtTime(f.created_at) : ""}</span>
                  {f.next_at && <span className="text-primary">{t("wecom.next", { date: f.next_at.slice(0, 10) })}</span>}
                </div>
                <p className="text-sm leading-relaxed">{f.content}</p>
              </div>
            ))}
            {data.followups.length === 0 && <p className="text-xs text-muted-foreground">{t("wecom.noFollowups")}</p>}
          </div>
        </>
      )}
    </div>
  );
}
