/** 三端契约类型 — 与 Queen 的 Pydantic Schema 严格对齐。
 * 正式开发可用 `npm run types:openapi` 自动生成 api.d.ts 后替换本文件。
 */
export type { Order, OrderItem } from "@/api/order";
export type { UserResponse } from "@/api/auth";
export type OrderStatus = "pending" | "paid" | "shipped" | "completed" | "cancelled";
