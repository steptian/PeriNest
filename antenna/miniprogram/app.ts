/** PeriNest Antenna 应用入口 */
// 注意：唯一版本源是仓库根 VERSION 文件；小程序读不到仓库文件，发版时需手动同步（见 /CHANGELOG.md）
const APP_VERSION = "0.8.4";

App({
  globalData: {
    appVersion: APP_VERSION,
    /** 开发默认连本地 Queen；生产改为 https://api.yourdomain.com/api/v1 */
    apiBase: "http://127.0.0.1:8000/api/v1",
    token: "",
    userInfo: null as WechatMiniprogram.UserInfo | null,
  },
  onLaunch() {
    // 恢复登录态：缓存 token 直接用（文档 6.3：存自定义 Token 而非 code）
    const token = wx.getStorageSync("perinest_token");
    if (token) this.globalData.token = token;
  },
});
