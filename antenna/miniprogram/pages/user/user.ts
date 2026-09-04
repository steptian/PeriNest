Page({
  data: {
    userInfo: null as WechatMiniprogram.UserInfo | null,
    appVersion: getApp().globalData.appVersion,
  },
  onShow() {
    this.setData({ userInfo: getApp().globalData.userInfo });
  },
  async logout() {
    wx.removeStorageSync("perinest_token");
    getApp().globalData.token = "";
    getApp().globalData.userInfo = null;
    wx.reLaunch({ url: "/pages/index/index" });
  },
});
