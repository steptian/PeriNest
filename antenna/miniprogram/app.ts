/** PeriNest Antenna 应用入口 */
App({
  globalData: {
    token: "",
    userInfo: null as WechatMiniprogram.UserInfo | null,
  },
  onLaunch() {
    // 恢复登录态：缓存 token 直接用（文档 6.3：存自定义 Token 而非 code）
    const token = wx.getStorageSync("perinest_token");
    if (token) this.globalData.token = token;
  },
});
