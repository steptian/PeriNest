import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { systemApi, type ChangelogEntry } from "@/api/system";
import { useAuthStore } from "@/stores/auth";

export default function Home() {
  const user = useAuthStore((s) => s.user);
  const [versionOpen, setVersionOpen] = useState(false);
  const { data: versionInfo } = useQuery({
    queryKey: ["system-version"],
    queryFn: systemApi.version,
    enabled: versionOpen,
  });
  return (
    <div className="p-5">
      {/* 琥珀 hero：树脂深处的光 */}
      <div
        className="relative mb-5 overflow-hidden rounded-2xl px-5 py-6 text-primary-foreground"
        style={{
          background:
            "linear-gradient(150deg, hsl(24 80% 34%), hsl(28 88% 42%) 55%, hsl(32 92% 50%))",
        }}
      >
        <p className="specimen-latin mb-2 !text-[9px] opacity-75">welcome back</p>
        <p className="text-sm opacity-85">欢迎回巢，</p>
        <p className="font-specimen text-2xl font-bold">{user?.username ?? "-"}</p>
        <p className="mt-3 text-[11px] italic opacity-70">
          Built to survive, designed to adapt.
        </p>
      </div>

      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-specimen text-base font-bold">巢穴入口</h2>
        <span className="specimen-latin">entries</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Card latin="no.01" title="神经索" desc="AI 流式对话 · 点开即聊" to="/chat" />
        <Card latin="no.02" title="订单巢" desc="查看全部订单状态" to="/orders" />
      </div>

      {/* 版本说明入口 + 弹层 */}
      <button
        onClick={() => setVersionOpen(true)}
        className="specimen-latin mt-6 block w-full text-center !text-[9px] hover:text-primary"
      >
        v{__APP_VERSION__} · 版本说明
      </button>
      {versionOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 backdrop-blur-sm" onClick={() => setVersionOpen(false)}>
          <div className="glass max-h-[70vh] w-full overflow-y-auto rounded-t-3xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-baseline justify-between">
              <span className="font-specimen text-xl font-bold text-primary">v{versionInfo?.version ?? __APP_VERSION__}</span>
              <button onClick={() => setVersionOpen(false)} className="text-xs text-muted-foreground">关闭</button>
            </div>
            {!versionInfo && <p className="text-sm text-muted-foreground">加载中…</p>}
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
                      {sec.items.map((item, i) => (
                        <li key={i} className="whitespace-pre-line text-[11px] leading-relaxed text-muted-foreground">{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ latin, title, desc, to }: { latin: string; title: string; desc: string; to: string }) {
  return (
    <a href={to} className="specimen-card block p-4 active:brightness-95">
      <span className="specimen-latin mb-2 block">{latin}</span>
      <div className="mb-1 font-specimen text-lg font-bold">{title}</div>
      <div className="text-xs leading-relaxed text-muted-foreground">{desc}</div>
    </a>
  );
}
