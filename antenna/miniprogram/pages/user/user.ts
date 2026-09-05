Page({
  data: {
    userInfo: null as WechatMiniprogram.UserInfo | null,
    appVersion: getApp().globalData.appVersion,
    isLoggedIn: false,
  },
  onShow() {
    const app = getApp();
    this.setData({ userInfo: app.globalData.userInfo, isLoggedIn: !!app.globalData.token });
  },
  async logout() {
    wx.removeStorageSync("perinest_token");
    getApp().globalData.token = "";
    getApp().globalData.userInfo = null;
    wx.reLaunch({ url: "/pages/index/index" });
  },
});
