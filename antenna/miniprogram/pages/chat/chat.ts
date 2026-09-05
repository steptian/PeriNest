/** 神经索对话页（标本卡风格 + SSE 流式） */
interface ChatMsg { role: "user" | "assistant"; content: string }

Page({
  data: {
    messages: [{ role: "assistant", content: "你好，我是巢穴的神经索 🧠 有什么可以帮你？" } as ChatMsg],
    input: "",
    streaming: false,
    bottomId: "",
  },
  onInput(e: WechatMiniprogram.Input) {
    this.setData({ input: e.detail.value });
  },
  async send() {
    const text = (this.data.input || "").trim();
    if (!text || this.data.streaming) return;
    const next: ChatMsg[] = [...this.data.messages, { role: "user", content: text }];
    this.setData({ messages: [...next, { role: "assistant", content: "" }], input: "", streaming: true, bottomId: "bottom" });
    try {
      const { streamChat } = require("../../utils/ai_stream");
      await streamChat(next, (delta: string) => {
        const msgs = this.data.messages as ChatMsg[];
        const last = msgs[msgs.length - 1];
        this.setData({ [`messages[${msgs.length - 1}].content`]: last.content + delta, bottomId: "bottom" });
      });
    } catch (e) {
      const msgs = this.data.messages as ChatMsg[];
      this.setData({ [`messages[${msgs.length - 1}].content`]: `⚠️ ${(e as Error).message}` });
    } finally {
      this.setData({ streaming: false });
    }
  },
});
