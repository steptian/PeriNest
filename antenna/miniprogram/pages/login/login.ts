/** 登录页：账号密码（开发）+ 微信一键（生产需真实 appid） */
import { request } from "../../utils/request";
import { applyNavTitle, ns, t } from "../../i18n/index";

Page({
  data: {
    username: "",
    password: "",
    error: "",
    loading: false,
    i18n: {} as Record<string, string>,
  },
  onShow() {
    this.applyI18n();
  },
  applyI18n() {
    applyNavTitle("login.navTitle");
    this.setData({ i18n: ns("login") });
  },
  onUser(e: WechatMiniprogram.Input) { this.setData({ username: e.detail.value }); },
  onPwd(e: WechatMiniprogram.Input) { this.setData({ password: e.detail.value }); },

  async pwdLogin() {
    const { username, password } = this.data;
    if (!username || !password) {
      this.setData({ error: t("login.required") });
      return;
    }
    this.setData({ loading: true, error: "" });
    try {
      const resp = await request<{ access_token: string }>("/auth/login", {
        method: "POST",
        data: { username, password },
        auth: false,
      });
      const app = getApp();
      app.globalData.token = resp.access_token;
      wx.setStorageSync("perinest_token", resp.access_token);
      wx.showToast({ title: t("login.nested"), icon: "success" });
      setTimeout(() => wx.reLaunch({ url: "/pages/index/index" }), 600);
    } catch (e) {
      this.setData({ error: (e as Error).message.slice(0, 50) });
    } finally {
      this.setData({ loading: false });
    }
  },

  async wxLogin() {
    this.setData({ loading: true, error: "" });
    try {
      const { silentLogin } = require("../../utils/request");
      await silentLogin();
      wx.showToast({ title: t("login.nested"), icon: "success" });
      setTimeout(() => wx.reLaunch({ url: "/pages/index/index" }), 600);
    } catch (e) {
      this.setData({ error: t("login.wxFail", { message: (e as Error).message.slice(0, 40) }) });
    } finally {
      this.setData({ loading: false });
    }
  },
});
