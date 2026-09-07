import { request } from "../../utils/request";
import { applyNavTitle, applyTabBar, ns, statusLabels } from "../../i18n/index";

interface OrderItem { id: number; sku_name: string; quantity: number; unit_price: number }
interface Order {
  id: number; order_no: string; status: string; total_amount: string;
  items: OrderItem[]; created_at: string;
}

Page({
  data: {
    orders: [] as Order[],
    isLoggedIn: false,
    loading: true,
    statusLabel: {} as Record<string, string>,
    i18n: {} as Record<string, string>,
  },
  onShow() {
    applyTabBar();
    this.applyI18n();
    const token = getApp().globalData.token;
    if (!token) {
      this.setData({ isLoggedIn: false, loading: false, orders: [] });
      return;
    }
    this.setData({ isLoggedIn: true, loading: true });
    request<Order[]>("/orders")
      .then((orders) => this.setData({ orders, loading: false }))
      .catch((e: Error) => {
        this.setData({ loading: false });
        wx.showToast({ title: e.message.slice(0, 30), icon: "none" });
      });
  },
  applyI18n() {
    applyNavTitle("orders.navTitle");
    this.setData({ i18n: ns("orders"), statusLabel: statusLabels() });
  },
});
