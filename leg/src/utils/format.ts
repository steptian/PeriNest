import dayjs from "dayjs";

/** 时间：ISO 8601 → 本地展示（文档 7.3 时间规范） */
export const fmtTime = (iso: string) => dayjs(iso).format("YYYY-MM-DD HH:mm");

export const fmtMoney = (n: number) =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(n);

/** 订单状态 → i18n key（文案在 i18n/*.json 的 status 段，三语） */
export const ORDER_STATUS_KEY: Record<string, string> = {
  pending: "status.pending", paid: "status.paid", shipped: "status.shipped",
  completed: "status.completed", cancelled: "status.cancelled",
};
