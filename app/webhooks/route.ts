import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { webhookHmacSecret } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { verifyV1WebhookSignature } from "@/lib/verify-webhook-signature";

const webhookListSelect = {
  id: true,
  receivedAt: true,
  payload: true,
} as const;

type WebhookEventListRow = Prisma.WebhookEventGetPayload<{
  select: typeof webhookListSelect;
}>;

type WebhookEventListItem = {
  id: WebhookEventListRow["id"];
  receivedAt: string;
  payload: WebhookEventListRow["payload"];
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

  let payload: unknown;
  try {
    payload = rawBody.length === 0 ? {} : JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const event = await prisma.webhookEvent.create({
      data: { payload: payload as Prisma.InputJsonValue },
    });

    return NextResponse.json(
      { id: event.id, receivedAt: event.receivedAt.toISOString() },
      { status: 201 }
    );
  } catch (err) {
    console.error("webhook persist failed", err);
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
        payload: e.payload,
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
