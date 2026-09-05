import { ensureLogin } from "../../utils/wx_auth";
import { request } from "../../utils/request";

interface Me { id: number; username: string; role: string }
interface Order {
  id: number; order_no: string; status: string;
  total_amount: number; created_at: string;
}
const STATUS_LABEL: Record<string, string> = {
  pending: "待处理", paid: "已支付", shipped: "已发货",
  completed: "已完成", cancelled: "已取消",
};

Page({
  data: {
    version: "0.1.0",
    username: "",
    today: "",
    recentOrders: [] as Array<Order & { statusLabel: string }>,
  },
  onLoad() {
    // 首页静默登录，后续请求自动带 Token
    ensureLogin()
      .then(() => this.refresh())
      .catch(() => wx.showToast({ title: "登录失败", icon: "none" }));
    const d = new Date();
    this.setData({
      today: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`,
    });
  },
  async refresh() {
    try {
      const me = await request<Me>("/auth/me");
      this.setData({ username: me.username });
    } catch { /* 下次再拉 */ }
    try {
      const orders = await request<Order[]>("/orders", { data: { limit: 2 } });
      this.setData({
        recentOrders: orders.map((o) => ({ ...o, statusLabel: STATUS_LABEL[o.status] || o.status })),
      });
    } catch { /* 空态兜底 */ }
  },
});
