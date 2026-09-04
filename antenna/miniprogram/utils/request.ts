/** Pheromone 发射器 — wx.request 统一封装。
 * - 自动携带 Authorization + X-Client: Antenna
 * - 401 时自动 wx.login 刷新 Token 重放（登录态管理见 wx_auth.ts）
 */
const BASE_URL = "https://api.yourdomain.com/api/v1";

type Method = "GET" | "POST" | "PUT" | "DELETE";

interface RequestOptions {
  method?: Method;
  data?: Record<string, unknown>;
  auth?: boolean; // 默认 true
}

export function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", data, auth = true } = options;
  return new Promise((resolve, reject) => {
    const doRequest = (token: string) => {
      wx.request({
        url: `${BASE_URL}${url}`,
        method,
        data,
        header: {
          "Content-Type": "application/json",
          "X-Client": "Antenna",
          ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
        },
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data as T);
          } else if (res.statusCode === 401 && auth) {
            // 登录态过期 → 静默重登后重放一次
            silentLogin().then(() => doRequest(getApp().globalData.token)).catch(reject);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(res.data)}`));
          }
        },
        fail: (err) => reject(new Error(err.errMsg)),
      });
    };
    doRequest(getApp().globalData.token);
  });
}

export async function silentLogin(): Promise<void> {
  const { code } = await wx.login();
  // POST /auth/wx-login 换取自定义 Token（文档 6.3：不透传 code 到业务请求）
  const app = getApp();
  const resp = await request<{ access_token: string }>("/auth/wx-login", {
    method: "POST",
    data: { code },
    auth: false,
  });
  app.globalData.token = resp.access_token;
  wx.setStorageSync("perinest_token", resp.access_token);
}
