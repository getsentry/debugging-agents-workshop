export function canRefund(deliveredAt: Date, now = new Date()): boolean {
  const days = (now.getTime() - deliveredAt.getTime()) / 86_400_000;
  return days <= 30;
}
