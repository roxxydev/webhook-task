import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies HMAC-SHA256 of the raw body against X-Signature.
 * Accepts versioned digests under scheme v1:
 *
 * - whole value: `v1,<hex>`, `v1=<hex>`, `v1:<hex>`, `v1 <hex>`
 * - comma-separated pairs: `t=1690000000,v1=<hex>` (only the v1 digest is used)
 *
 * The digest must be hex (any case) with even length (64 hex chars for SHA-256).
 */
export function verifyV1WebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;

  const providedHex = extractV1SignatureHex(signatureHeader);
  if (!providedHex) return false;

  const expectedHex = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  if (providedHex.length !== expectedHex.length) return false;

  try {
    return timingSafeEqual(
      Buffer.from(providedHex, "hex"),
      Buffer.from(expectedHex, "hex"),
    );
  } catch {
    return false;
  }
}

function extractV1SignatureHex(header: string): string | null {
  const trimmed = header.trim();
  const segments = trimmed.split(",").map((s) => s.trim()).filter(Boolean);

  for (const seg of segments) {
    const pairMatch = seg.match(/^v1\s*=\s*([0-9a-f]+)$/i);
    if (pairMatch) {
      const hex = normalizeHex(pairMatch[1]);
      if (hex) return hex;
    }
  }

  if (segments.length === 2 && segments[0].toLowerCase() === "v1") {
    const hex = normalizeHex(segments[1]);
    if (hex) return hex;
  }

  if (segments.length === 1) {
    const sole = segments[0];
    if (!sole.toLowerCase().startsWith("v1")) return null;
    const afterVersion = sole.slice(2).trim();
    const withoutDelimiter = afterVersion.replace(/^[,=:\s]+/, "").trim();
    return normalizeHex(withoutDelimiter);
  }

  return null;
}

function normalizeHex(raw: string): string | null {
  const hex = raw.toLowerCase();
  if (!/^[0-9a-f]+$/.test(hex)) return null;
  if (hex.length % 2 !== 0) return null;
  return hex;
}
