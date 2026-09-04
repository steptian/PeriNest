/** PeriNest Antenna 应用入口 */
// ⚠️ 唯一版本源是仓库根 VERSION 文件；小程序读不到仓库文件，发版时需手动同步（见 /CHANGELOG.md）
const APP_VERSION = "0.4.0";

App({
  globalData: {
    appVersion: APP_VERSION,
    token: "",
    userInfo: null as WechatMiniprogram.UserInfo | null,
  },
  onLaunch() {
    // 恢复登录态：缓存 token 直接用（文档 6.3：存自定义 Token 而非 code）
    const token = wx.getStorageSync("perinest_token");
    if (token) this.globalData.token = token;
  },
});
