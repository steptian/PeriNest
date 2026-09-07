import { useState } from "react";
import { BookOpenText, FlaskConical, MessagesSquare } from "lucide-react";
import { ManagePane } from "./manage";
import { AskPane } from "./ask";
import { LabPane } from "./lab";

type CropTab = "manage" | "ask" | "lab";

const TABS: { k: CropTab; label: string; latin: string }[] = [
  { k: "manage", label: "知识库管理", latin: "documents" },
  { k: "ask", label: "智能问答", latin: "ask · rag" },
  { k: "lab", label: "检索试验", latin: "retrieval lab" },
];

const ICONS: Record<CropTab, typeof BookOpenText> = {
  manage: BookOpenText,
  ask: MessagesSquare,
  lab: FlaskConical,
};

const SUBTITLES: Record<CropTab, string> = {
  manage: "文档的入库、分块浏览与删除，向量投影可从权威库一键重建",
  ask: "AI 自主检索知识库后作答，支持多轮续聊与历史会话回溯",
  lab: "语义检索命中测试——验证向量投影质量与 embedding 模式",
};

/** 知识库（Crop）：管理 / 问答 / 试验三区用 tab 分离，互不混排 */
export default function Crop() {
  const [tab, setTab] = useState<CropTab>("manage");

  return (
    <div className="space-y-5">
      {/* 标题区 */}
      <div>
        <p className="specimen-latin mb-1">crop · knowledge base</p>
        <h1 className="font-specimen text-2xl font-bold">知识库</h1>
        <p className="mt-1 text-sm text-muted-foreground">{SUBTITLES[tab]}</p>
      </div>

      {/* Tab 切换 */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map(({ k, label, latin }) => {
          const Icon = ICONS[k];
          const active = tab === k;
          return (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`group flex items-center gap-2 rounded-full px-4 py-1.5 text-sm transition-colors ${
                active ? "btn-amber" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              <span className={`specimen-latin !text-[8px] opacity-60 ${active ? "" : "hidden group-hover:inline"}`}>
                {latin}
              </span>
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
