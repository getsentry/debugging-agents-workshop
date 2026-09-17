// Fake AcmePay gateway client. Simulates the outbound call with jittered
// latency, so a refund shows a realistic gateway hop.
export async function issueRefund({
  chargeId,
  amount,
  currencyCode,
}: {
  chargeId: string;
  amount: string;
  currencyCode: string;
}): Promise<{ refundId: string; amount: string; currencyCode: string }> {
  await new Promise((resolve) =>
    setTimeout(resolve, 120 + Math.random() * 180),
  );
  return {
    refundId: `re_${chargeId.slice(3)}`,
    amount,
    currencyCode,
  };
}
