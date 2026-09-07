import { request } from "../../utils/request";
import {
  LANGS,
  applyNavTitle,
  applyTabBar,
  getLang,
  ns,
  setLang,
  t,
  type Lang,
} from "../../i18n/index";

interface Me {
  id: number;
  username: string;
  role: string;
}

Page({
  data: {
    appVersion: getApp().globalData.appVersion,
    isLoggedIn: false,
    username: "", // 后端权威身份（/auth/me），不再依赖本地 userInfo 快照
    i18n: {} as Record<string, string>,
    langs: LANGS,
    lang: "zh" as Lang,
    nickname: "",
  },
  onShow() {
    applyTabBar();
    const app = getApp();
    const token = app.globalData.token;
    this.setData({ isLoggedIn: !!token, username: "" });
    this.applyI18n();
    if (token) {
      // 拉后端权威：冷启动恢复 token 后 userInfo 为空导致"已登录却显示未入巢"
      request<Me>("/auth/me")
        .then((me) => {
          this.setData({ username: me.username });
          this.applyI18n();
        })
        .catch(() => {}); // 拉取失败不翻转登录态，下次 onShow 重试
    }
  },
  applyI18n() {
    applyNavTitle("profile.navTitle");
    const { username, isLoggedIn } = this.data;
    this.setData({
      i18n: ns("profile"),
      lang: getLang(),
      nickname: isLoggedIn ? (username || t("profile.member")) : t("profile.guest"),
    });
  },
  onSetLang(e: WechatMiniprogram.TouchEvent) {
    const code = e.currentTarget.dataset.code as Lang;
    setLang(code);
    this.applyI18n();
  },
  async logout() {
    wx.removeStorageSync("perinest_token");
    getApp().globalData.token = "";
    getApp().globalData.userInfo = null;
    wx.reLaunch({ url: "/pages/index/index" });
  },
});
