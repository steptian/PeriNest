"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureLogin = ensureLogin;
const request_1 = require("./request");
function ensureLogin() {
    const app = getApp();
    if (app.globalData.token)
        return Promise.resolve(app.globalData.token);
    return (0, request_1.silentLogin)().then(() => app.globalData.token);
}
