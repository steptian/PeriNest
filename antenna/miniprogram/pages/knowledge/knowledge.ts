/** 嗦囊知识库页 —— 问共生体（agentic 问答）/ 查原文（检索）双模式 */
import { request } from "../../utils/request";

interface CropHit {
  chunk_id: number;
  document_id: number;
  document_title: string;
  seq: number;
  content: string;
  score: number;
}

Page({
  data: {
    mode: "ask" as "ask" | "search",
    input: "",
    streaming: false,
    steps: [] as string[],
    answer: "",
    citations: [] as CropHit[],
    hits: [] as CropHit[],
    searched: false,
    error: "",
    bottomId: "",
  },
  switchMode(e: WechatMiniprogram.TouchEvent) {
    const mode = e.currentTarget.dataset.mode as "ask" | "search";
    this.setData({
      mode,
      steps: [],
      answer: "",
      citations: [],
      hits: [],
      searched: false,
      error: "",
    });
  },
  onInput(e: WechatMiniprogram.Input) {
    this.setData({ input: e.detail.value });
  },
  async send() {
    const text = (this.data.input || "").trim();
    if (!text || this.data.streaming) return;
    this.setData({ input: "", streaming: true, error: "", bottomId: "bottom" });
    if (this.data.mode === "search") {
      try {
        const res = await request<{ hits: CropHit[] }>("/crop/search", {
          data: { query: text, top_k: 5 },
        });
        this.setData({ hits: res.hits || [], searched: true, bottomId: "bottom" });
      } catch (e) {
        this.setData({ error: (e as Error).message });
      } finally {
        this.setData({ streaming: false });
      }
      return;
    }
    // 问共生体：SSE 流式问答
    this.setData({ steps: [], answer: "", citations: [] });
    const { streamChat } = require("../../utils/ai_stream");
    try {
      await streamChat(
        [],
        () => {},
        {
          url: "/crop/ask/stream",
          data: { query: text },
          onEvent: (data: Record<string, unknown>) => {
            if (data.tool_call) {
              const tc = data.tool_call as { round: number; query: string };
              this.setData({
                steps: [...this.data.steps, `检索知识库：${tc.query}（第 ${tc.round} 轮）`],
                bottomId: "bottom",
              });
            } else if (data.delta) {
              this.setData({ answer: this.data.answer + (data.delta as string), bottomId: "bottom" });
            } else if (data.citations) {
              this.setData({ citations: data.citations as CropHit[] });
            } else if (data.error) {
              this.setData({ error: data.error as string });
            }
          },
        }
      );
    } catch (e) {
      this.setData({ error: (e as Error).message });
    } finally {
      this.setData({ streaming: false });
    }
  },
});
