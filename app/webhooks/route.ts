import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { WebhookEventStatus } from "@prisma/client";
import { webhookHmacSecret } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { verifyV1WebhookSignature } from "@/lib/verify-webhook-signature";

const webhookListSelect = {
  id: true,
  receivedAt: true,
  status: true,
  payload: true,
  rawBody: true,
} as const;

type WebhookEventListRow = Prisma.WebhookEventGetPayload<{
  select: typeof webhookListSelect;
}>;

type WebhookEventListItem = {
  id: WebhookEventListRow["id"];
  receivedAt: string;
  status: WebhookEventListRow["status"];
  payload: WebhookEventListRow["payload"];
  rawBody: WebhookEventListRow["rawBody"];
};

function parseLimit(raw: string | null): number {
  const n = parseInt(raw ?? "50", 10);
  if (Number.isNaN(n)) return 50;
  return Math.min(100, Math.max(1, n));
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature =
    request.headers.get("x-signature") ?? request.headers.get("X-Signature");

  if (!verifyV1WebhookSignature(rawBody, signature, webhookHmacSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let parsedPayload: Prisma.InputJsonValue | undefined;
  try {
    parsedPayload = (rawBody.length === 0 ? {} : JSON.parse(rawBody)) as Prisma.InputJsonValue;
  } catch {}

  try {
    const event =
      parsedPayload !== undefined
        ? await prisma.webhookEvent.create({
            data: {
              status: WebhookEventStatus.processed,
              payload: parsedPayload,
              rawBody,
            },
          })
        : await prisma.webhookEvent.create({
            data: { status: WebhookEventStatus.error, rawBody },
          });

    return NextResponse.json(
      { id: event.id, receivedAt: event.receivedAt.toISOString() },
      { status: 201 }
    );
  } catch (err) {
    const ctx = parsedPayload === undefined ? "invalid json" : "persist";
    console.error(`webhook ${ctx} failed`, err);
    return NextResponse.json(
      { error: "Failed to store webhook event" },
      { status: 503 }
    );
  }
}

export async function GET(request: NextRequest) {
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));

  try {
    const events = await prisma.webhookEvent.findMany({
      orderBy: { receivedAt: "desc" },
      take: limit,
      select: webhookListSelect,
    });

    return NextResponse.json({
      events: events.map((e: WebhookEventListRow): WebhookEventListItem => ({
        id: e.id,
        receivedAt: e.receivedAt.toISOString(),
        status: e.status,
        payload: e.payload,
        rawBody: e.rawBody,
      })),
    });
  } catch (err) {
    console.error("webhook list failed", err);
    return NextResponse.json(
      { error: "Failed to load webhook events" },
      { status: 503 }
    );
  }
}
