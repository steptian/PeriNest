/** 微信登录/授权工具 */
import { silentLogin } from "./request";

export function ensureLogin(): Promise<string> {
  const app = getApp();
  if (app.globalData.token) return Promise.resolve(app.globalData.token);
  return silentLogin().then(() => app.globalData.token);
}
