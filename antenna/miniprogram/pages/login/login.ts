/** 登录页：账号密码（开发）+ 微信一键（生产需真实 appid） */
import { request } from "../../utils/request";

Page({
  data: { username: "", password: "", error: "", loading: false },
  onUser(e: WechatMiniprogram.Input) { this.setData({ username: e.detail.value }); },
  onPwd(e: WechatMiniprogram.Input) { this.setData({ password: e.detail.value }); },

  async pwdLogin() {
    const { username, password } = this.data;
    if (!username || !password) {
      this.setData({ error: "请输入用户名和密码" });
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
      wx.showToast({ title: "已入巢", icon: "success" });
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
      wx.showToast({ title: "已入巢", icon: "success" });
      setTimeout(() => wx.reLaunch({ url: "/pages/index/index" }), 600);
    } catch (e) {
      this.setData({ error: `微信登录失败：${(e as Error).message.slice(0, 40)}（需配置 appid）` });
    } finally {
      this.setData({ loading: false });
    }
  },
});
