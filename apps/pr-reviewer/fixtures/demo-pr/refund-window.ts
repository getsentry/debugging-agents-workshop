export function canRefund(deliveredAt: Date, now = new Date()): boolean {
  const days = (now.getTime() - deliveredAt.getTime()) / 86400;
  return days <= 30;
}
