-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('error', 'processed');

-- AlterTable
ALTER TABLE "webhook_events" ADD COLUMN     "raw_body" TEXT,
ADD COLUMN     "status" "WebhookEventStatus" NOT NULL DEFAULT 'processed',
ALTER COLUMN "payload" DROP NOT NULL;
