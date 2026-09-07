import { useState } from "react";
import { BookOpenText, FlaskConical, MessagesSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ManagePane } from "./manage";
import { AskPane } from "./ask";
import { LabPane } from "./lab";

type CropTab = "manage" | "ask" | "lab";

const TABS: { k: CropTab; labelKey: string }[] = [
  { k: "manage", labelKey: "crop.tabManage" },
  { k: "ask", labelKey: "crop.tabAsk" },
  { k: "lab", labelKey: "crop.tabLab" },
];

const ICONS: Record<CropTab, typeof BookOpenText> = {
  manage: BookOpenText,
  ask: MessagesSquare,
  lab: FlaskConical,
};

const SUBTITLE_KEYS: Record<CropTab, string> = {
  manage: "crop.subManage",
  ask: "crop.subAsk",
  lab: "crop.subLab",
};

/** 知识库（Crop）：管理 / 问答 / 试验三区用 tab 分离，互不混排 */
export default function Crop() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<CropTab>("manage");

  return (
    <div className="space-y-5">
      {/* 标题区 */}
      <div>
        <p className="specimen-latin mb-1">crop · knowledge base</p>
        <h1 className="font-specimen text-2xl font-bold">{t("crop.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t(SUBTITLE_KEYS[tab])}</p>
      </div>

      {/* Tab 切换 */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map(({ k, labelKey }) => {
          const Icon = ICONS[k];
          const active = tab === k;
          return (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm transition-colors ${
                active ? "btn-amber" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(labelKey)}
            </button>
          );
        })}
      </div>
        {/* 内容区：固定视口高度，各面板内部滚动——切 tab 页面高度恒定不跳 */}
        <div className="h-[calc(100vh-224px)] min-h-[520px]">
          {tab === "manage" && <ManagePane />}
          {tab === "ask" && <AskPane />}
          {tab === "lab" && <LabPane />}
        </div>
      </div>
    );
  }
