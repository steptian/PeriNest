import { ensureLogin } from "../../utils/wx_auth";
import { request } from "../../utils/request";
import { applyNavTitle, applyTabBar, ns, statusLabels, t } from "../../i18n/index";

interface Me { id: number; username: string; role: string }
interface Order {
  id: number; order_no: string; status: string;
  total_amount: number; created_at: string;
}

Page({
  data: {
    version: "0.1.0",
    username: "",
    today: "",
    recentOrders: [] as Array<Order & { statusLabel: string }>,
    welcomeTitle: "",
    i18n: {} as Record<string, string>,
  },
  onLoad() {
    // 首页静默登录，后续请求自动带 Token
    ensureLogin()
      .then(() => this.refresh())
      .catch(() => wx.showToast({ title: t("home.loginFail"), icon: "none" }));
    const d = new Date();
    this.setData({
      today: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`,
    });
  },
  onShow() {
    applyTabBar();
    this.applyI18n();
  },
  applyI18n() {
    applyNavTitle("home.navTitle");
    const labels = statusLabels();
    const username = this.data.username;
    this.setData({
      i18n: ns("home"),
      welcomeTitle: username ? t("home.welcomeName", { name: username }) : t("home.welcome"),
      recentOrders: this.data.recentOrders.map((o) => ({
        ...o,
        statusLabel: labels[o.status] || o.status,
      })),
    });
  },
  goOrders() {
    wx.switchTab({ url: "/pages/order/order" });
  },
  async refresh() {
    try {
      const me = await request<Me>("/auth/me");
      this.setData({ username: me.username });
    } catch { /* 下次再拉 */ }
    try {
      const orders = await request<Order[]>("/orders", { data: { limit: 2 } });
      const labels = statusLabels();
      this.setData({
        recentOrders: orders.map((o) => ({ ...o, statusLabel: labels[o.status] || o.status })),
      });
    } catch { /* 空态兜底 */ }
    this.applyI18n();
  },
});
