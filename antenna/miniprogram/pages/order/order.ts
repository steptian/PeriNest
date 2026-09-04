import { request } from "../../utils/request";

interface OrderItem { id: number; sku_name: string; quantity: number; unit_price: number }
interface Order {
  id: number; order_no: string; status: string; total_amount: string;
  items: OrderItem[]; created_at: string;
}

Page({
  data: {
    orders: [] as Order[],
    loading: true,
    statusLabel: { pending: "待支付", paid: "已支付", shipped: "已发货", completed: "已完成", cancelled: "已取消" } as Record<string, string>,
  },
  onShow() {
    request<Order[]>("/orders")
      .then((orders) => this.setData({ orders, loading: false }))
      .catch((e: Error) => {
        this.setData({ loading: false });
        wx.showToast({ title: e.message.slice(0, 30), icon: "none" });
      });
  },
});
