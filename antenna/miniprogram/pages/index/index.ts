import { ensureLogin } from "../../utils/wx_auth";

Page({
  data: { version: "0.1.0" },
  onLoad() {
    // 首页静默登录，后续请求自动带 Token
    ensureLogin().catch(() => wx.showToast({ title: "登录失败", icon: "none" }));
  },
});
