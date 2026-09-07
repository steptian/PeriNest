import dayjs from "dayjs";

/** 时间：ISO 8601 → 本地展示（文档 7.3 时间规范） */
export const fmtTime = (iso: string) => dayjs(iso).format("YYYY-MM-DD HH:mm");

/** 字节数 → 人类可读（B/KB/MB） */
export const fmtSize = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};


export const fmtMoney = (n: number) =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(n);

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "待支付", paid: "已支付", shipped: "已发货",
  completed: "已完成", cancelled: "已取消",
};
