const REFUND_WINDOW_DAYS = 30;
const GRACE_PERIOD_DAYS = 2;

export function canRefund(deliveredAt: Date, now = new Date()): boolean {
  const days = (now.getTime() - deliveredAt.getTime()) / 86_400_000;
  return days <= REFUND_WINDOW_DAYS + GRACE_PERIOD_DAYS;
}
