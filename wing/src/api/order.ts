import { api } from "./client";

export interface OrderItem { id: number; sku_name: string; quantity: number; unit_price: number }
export interface Order {
  id: number; order_no: string; user_id: number; status: string;
  total_amount: number; remark: string | null; items: OrderItem[]; created_at: string;
}

export const orderApi = {
  list: (limit = 20, offset = 0) =>
    api.get<Order[]>("/orders", { params: { limit, offset } }).then((r) => r.data),
  detail: (id: number) => api.get<Order>(`/orders/${id}`).then((r) => r.data),
};
