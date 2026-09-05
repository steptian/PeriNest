"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.request = request;
exports.silentLogin = silentLogin;
const BASE_URL = () => getApp().globalData.apiBase;
function request(url, options = {}) {
    const { method = "GET", data, auth = true } = options;
    return new Promise((resolve, reject) => {
        const doRequest = (token) => {
            wx.request({
                url: `${BASE_URL()}${url}`,
                method,
                data,
                header: {
                    "Content-Type": "application/json",
                    "X-Client": "Antenna",
                    ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
                },
                success: (res) => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(res.data);
                    }
                    else if (res.statusCode === 401 && auth) {
                        silentLogin().then(() => doRequest(getApp().globalData.token)).catch(reject);
                    }
                    else {
                        reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(res.data)}`));
                    }
                },
                fail: (err) => reject(new Error(err.errMsg)),
            });
        };
        doRequest(getApp().globalData.token);
    });
}
async function silentLogin() {
    const { code } = await wx.login();
    const app = getApp();
    const resp = await request("/auth/wx-login", {
        method: "POST",
        data: { code },
        auth: false,
    });
    app.globalData.token = resp.access_token;
    wx.setStorageSync("perinest_token", resp.access_token);
}
