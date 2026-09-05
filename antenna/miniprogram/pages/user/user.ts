import { request } from "../../utils/request";

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
  },
  onShow() {
    const app = getApp();
    const token = app.globalData.token;
    this.setData({ isLoggedIn: !!token, username: "" });
    if (token) {
      // 拉后端权威：冷启动恢复 token 后 userInfo 为空导致"已登录却显示未入巢"
      request<Me>("/auth/me")
        .then((me) => this.setData({ username: me.username }))
        .catch(() => {}); // 拉取失败不翻转登录态，下次 onShow 重试
    }
  },
  async logout() {
    wx.removeStorageSync("perinest_token");
    getApp().globalData.token = "";
    getApp().globalData.userInfo = null;
    wx.reLaunch({ url: "/pages/index/index" });
  },
});
