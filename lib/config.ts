/** Webhook HMAC secret. Override via WEBHOOK_HMAC_SECRET in production. */
export const webhookHmacSecret =
  process.env.WEBHOOK_HMAC_SECRET ?? "fluff-secret-abc123";
