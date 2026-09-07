import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { systemApi, type ChangelogEntry } from "@/api/system";

/** 版本说明底部抽屉（受控组件，Home / Profile 共用） */

function Runs({ runs }: { runs: { t: string; s: string }[] }) {
  return (
    <>
      {runs.map((r, j) =>
        r.t === "bold" ? (
          <strong key={j} className="font-semibold text-foreground">{r.s}</strong>
        ) : r.t === "code" ? (
          <code key={j} className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">{r.s}</code>
        ) : (
          <span key={j}>{r.s}</span>
        )
      )}
    </>
  );
}

export default function VersionSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: versionInfo } = useQuery({
    queryKey: ["system-version"],
    queryFn: systemApi.version,
    enabled: open,
  });
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="glass max-h-[70vh] w-full overflow-y-auto rounded-t-3xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-baseline justify-between">
          <span className="font-specimen text-xl font-bold text-primary">
            v{versionInfo?.version ?? __APP_VERSION__}
          </span>
          <button onClick={onClose} className="text-xs text-muted-foreground">{t("common.close")}</button>
        </div>
        {!versionInfo && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
        {versionInfo?.changelog.map((entry: ChangelogEntry) => (
          <div key={entry.version} className="border-t border-border/60 py-3 first:border-0">
            <div className="mb-1.5 flex items-baseline gap-2">
              <span className="font-specimen text-sm font-bold">v{entry.version}</span>
              <span className="text-[11px] text-muted-foreground">{entry.date}</span>
            </div>
            {entry.sections.map((sec) => (
              <div key={sec.title} className="mb-2">
                <p className="specimen-latin !text-[8px]">{sec.title}</p>
                <ul className="mt-1 space-y-1">
                  {sec.items.map((runs, i) => (
                    <li key={i} className="whitespace-pre-line text-[11px] leading-relaxed text-foreground/80">
                      <Runs runs={runs} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
