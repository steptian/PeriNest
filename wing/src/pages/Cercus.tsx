import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { RefreshCw, Radar as RadarIcon } from "lucide-react";
import Modal from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { cercusApi, type WecomContact } from "@/api/cercus";
import { fmtTime } from "@/utils/format";

const PAGE_SIZE = 15;

/** 尾须（Cercus）—— 企微私域客户域：镜像同步 / 标签 / 跟进时间线 */
export default function Cercus() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [tag, setTag] = useState("");
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<number | null>(null);

  const { data: health } = useQuery({ queryKey: ["cercus", "health"], queryFn: cercusApi.health });
  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["cercus", "contacts", keyword, tag, page],
    queryFn: () =>
      cercusApi.list({
        keyword: keyword || undefined,
        tag: tag || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
  });
  const sync = useMutation({
    mutationFn: cercusApi.sync,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cercus"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="specimen-latin mb-1">cercus · wecom crm</p>
          <h1 className="font-specimen text-2xl font-bold">{t("cercus.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("cercus.subtitle")}
            {health && (
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${health.wecom_enabled ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                {health.wecom_enabled ? t("cercus.enabled") : t("cercus.disabled")}
              </span>
            )}
          </p>
        </div>
        <Button size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
          <RefreshCw className={`mr-1 h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`} />
          {t("cercus.sync")}
        </Button>
      </div>

      <div className="flex gap-2">
        <input
          value={keyword}
          onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
          placeholder={t("cercus.placeholder")}
          className="w-64 rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-primary/60"
        />
        <input
          value={tag}
          onChange={(e) => { setTag(e.target.value); setPage(1); }}
          placeholder={t("cercus.tagPlaceholder")}
          className="w-48 rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-primary/60"
        />
        {sync.isSuccess && (
          <span className="self-center text-xs text-emerald-600">{t("cercus.synced", { n: sync.data?.synced })}</span>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl glass">
        <table className="w-full text-sm">
          <thead className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">{t("cercus.colCustomer")}</th>
              <th className="px-4 py-3">{t("cercus.colPhone")}</th>
              <th className="px-4 py-3">{t("cercus.colTags")}</th>
              <th className="px-4 py-3">{t("cercus.colOwner")}</th>
              <th className="px-4 py-3">{t("cercus.colSynced")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{t("common.loading")}</td></tr>}
            {!isLoading && contacts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  <RadarIcon className="mx-auto mb-2 h-6 w-6 opacity-40" />
                  {t("cercus.empty")}
                </td>
              </tr>
            )}
            {contacts.map((c) => (
              <tr key={c.id} className="row-in cursor-pointer border-b border-border/40 last:border-0 hover:bg-muted/40" onClick={() => setDetailId(c.id)}>
                <td className="px-4 py-3 font-medium">{c.name || c.external_userid.slice(0, 12)}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.remark_mobile || "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(c.tags ?? []).map((t) => (
                      <span key={t} className="rounded-full border border-primary/35 px-2 py-0.5 text-[10px] text-primary">{t}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{c.staff_userid}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.synced_at ? fmtTime(c.synced_at) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detailId !== null && <ContactDetail contactId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

function ContactDetail({ contactId, onClose }: { contactId: number; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [content, setContent] = useState("");
  const [nextAt, setNextAt] = useState("");
  const [newTag, setNewTag] = useState("");

  const { data } = useQuery({
    queryKey: ["cercus", "detail", contactId],
    queryFn: () => cercusApi.detail(contactId),
  });
  const addFollowup = useMutation({
    mutationFn: () => cercusApi.addFollowup(contactId, content, nextAt || undefined),
    onSuccess: () => { setContent(""); setNextAt(""); qc.invalidateQueries({ queryKey: ["cercus", "detail", contactId] }); },
  });
  const addTag = useMutation({
    mutationFn: (tags: string[]) => cercusApi.updateTags(contactId, tags),
    onSuccess: () => { setNewTag(""); qc.invalidateQueries({ queryKey: ["cercus", "detail", contactId] }); },
  });

  const contact: WecomContact | undefined = data?.contact;
  const tags = contact?.tags ?? [];

  return (
    <Modal open onClose={onClose} title={contact?.name || t("cercus.detailTitle")} width="w-[560px]">
      {!contact && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
      {contact && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Info label="external_userid" value={contact.external_userid} mono />
            <Info label={t("cercus.phoneLabel")} value={contact.remark_mobile || "—"} />
            <Info label={t("cercus.ownerLabel")} value={contact.staff_userid} />
            <Info label="unionid" value={contact.unionid || "—"} mono />
          </div>

          <div>
            <p className="specimen-latin mb-2">tags</p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {tags.map((tg) => (
                <button
                  key={tg}
                  title={t("cercus.removeTag")}
                  className="rounded-full border border-primary/35 px-2.5 py-0.5 text-xs text-primary hover:border-red-400 hover:text-red-500"
                  onClick={() => addTag.mutate(tags.filter((x) => x !== tg))}
                >{tg} ×</button>
              ))}
              {tags.length === 0 && <span className="text-xs text-muted-foreground">{t("cercus.noTags")}</span>}
            </div>
            <div className="flex gap-2">
              <input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder={t("cercus.newTag")}
                className="flex-1 rounded-xl border border-border bg-card px-3 py-1.5 text-sm outline-none focus:border-primary/60"
              />
              <Button size="sm" variant="outline" disabled={!newTag.trim()} onClick={() => addTag.mutate([...tags, newTag.trim()])}>
                {t("cercus.addTag")}
              </Button>
            </div>
          </div>

          <div>
            <p className="specimen-latin mb-2">followup timeline</p>
            <div className="mb-3 space-y-2">
              {(data?.followups ?? []).map((f, i) => (
                <div key={f.id ?? i} className="rounded-xl border border-border/60 bg-background/60 p-3">
                  <div className="mb-1 flex items-baseline justify-between text-xs text-muted-foreground">
                    <span>{f.staff_userid} · {f.created_at ? fmtTime(f.created_at) : ""}</span>
                    {f.next_at && <span className="text-primary">{t("cercus.followupNext", { date: f.next_at.slice(0, 10) })}</span>}
                  </div>
                  <p className="text-sm leading-relaxed">{f.content}</p>
                </div>
              ))}
              {(data?.followups ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">{t("cercus.noFollowups")}</p>
              )}
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t("cercus.followupPlaceholder")}
              rows={3}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary/60"
            />
            <div className="mt-2 flex items-center gap-2">
              <input
                type="date"
                value={nextAt}
                onChange={(e) => setNextAt(e.target.value)}
                className="rounded-xl border border-border bg-card px-3 py-1.5 text-sm outline-none"
              />
              <Button size="sm" disabled={!content.trim() || addFollowup.isPending} onClick={() => addFollowup.mutate()}>
                {t("cercus.recordFollowup")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="specimen-latin !text-[8px]">{label}</p>
      <p className={`truncate text-xs ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
