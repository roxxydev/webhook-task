# Webhook receiver

A small [Next.js 14](https://nextjs.org/) app that accepts signed webhook `POST` requests, stores the JSON payload in PostgreSQL via [Prisma](https://www.prisma.io/), and exposes a simple listing endpoint. Intended for deployment on [Fly.io](https://fly.io/).

## Database structure

Events are stored in the `webhook_events` table (model `WebhookEvent` in Prisma).

| Column        | Type        | Description |
|---------------|-------------|-------------|
| `id`          | `UUID`      | Primary key; generated when the row is inserted. |
| `received_at` | `TIMESTAMP` | Server time when the event was accepted and stored (UTC in the API as ISO 8601). |
| `payload`     | `JSONB`     | Parsed JSON body of the webhook. |

There is an index on `received_at` descending to make listing recent events efficient.

## `POST /webhooks`

Receives the raw webhook body and verifies authenticity before persisting.

- **Headers**
  - `X-Signature`: HMAC-SHA256 of the **exact raw request body** (as UTF-8 bytes), using the shared secret. Only the **v1** scheme is accepted; the digest must be hex (64 characters for SHA-256). Examples of accepted shapes include `v1=<hex>`, `v1,<hex>`, and comma-separated forms such as `t=1234567890,v1=<hex>`.
  - `Content-Type`: typically `application/json` (the body is still verified as raw text before parsing).
- **Body**: JSON. An empty body is treated as `{}` after verification.

**Responses**

| Status | Meaning |
|--------|---------|
| `201`  | Event stored. JSON: `{ "id": "<uuid>", "receivedAt": "<iso8601>" }`. |
| `400`  | Body is not valid JSON. |
| `401`  | Missing or invalid signature. |
| `503`  | Database error while saving; callers should retry (nothing is committed). |

The shared secret is read from `WEBHOOK_HMAC_SECRET` (see [Environment variables](#environment-variables)).

## `GET /webhooks`

Returns stored events, newest first.

- **Query**
  - `limit` (optional): number of rows, between `1` and `100`; default `50`.
- **Response**: `200` with JSON `{ "events": [ { "id", "receivedAt", "payload" }, ... ] }`.
- **Errors**: `503` if the database read fails.

## Environment variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string for Prisma and the running app. |
| `WEBHOOK_HMAC_SECRET` | Secret used to verify `X-Signature`. If unset, the app defaults to `fluff-secret-abc123` (override this in production via Fly secrets or `.env`). |

Copy `.env.example` to `.env` in the **project root** and set a real `DATABASE_URL` for local development and for [Next.js](https://nextjs.org/docs/app/building-your-application/configuring/environment-variables) (`next dev` / `next start`). Root `.env` is gitignored.

### Prisma and `DATABASE_URL`

Prisma’s schema uses `env("DATABASE_URL")`, so the Prisma CLI and editor tooling need that variable to be defined.

- **`prisma/.env`** (committed) holds a **localhost placeholder** `DATABASE_URL` so the Prisma language server and raw `npx prisma` invocations work when you have not created a root `.env` yet. It is **not** a substitute for your real database URL in day-to-day work.
- **`scripts/prisma-env.mjs`** loads root `.env`, then `.env.example`; if `DATABASE_URL` is still missing, it sets a safe placeholder and prints a warning. All npm scripts that run Prisma (`build`, `db:*`) use this wrapper.
- **`dotenv`** (dev dependency) is used only by that wrapper.

Precedence in practice: use **root `.env`** for your actual Postgres URL when developing; the app and migrations should target that database. The committed `prisma/.env` is mainly for tooling defaults. Root `.env` stays out of git; **`prisma/.env` is committed** (see the `!prisma/.env` rule in `.gitignore`) so clones have a minimal default for Prisma.

## Run locally

You need Node.js 20+ and a reachable PostgreSQL instance.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env` with at least:

   ```bash
   DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/DATABASE?schema=public"
   WEBHOOK_HMAC_SECRET="fluff-secret-abc123"
   ```

3. Apply migrations and start the dev server:

   ```bash
   npm run db:migrate
   npm run dev
   ```

   (`db:migrate` runs `prisma migrate dev` via `scripts/prisma-env.mjs`, which picks up `.env` / `.env.example` as described above.)

The app serves on [http://localhost:3000](http://localhost:3000). Webhook routes are at `http://localhost:3000/webhooks`.

## Deploy to Fly.io

Prerequisites: [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/) installed and logged in (`fly auth login`).

1. **Create or select an app**  
   From the repo root, either run `fly launch` (interactive) or ensure `fly.toml` `app` matches the app name you create. Replace the placeholder `app = "webhook-receiver"` in `fly.toml` if you use a different name.

2. **PostgreSQL**  
   Create a cluster and attach it so `DATABASE_URL` is set on the app, for example:

   ```bash
   fly postgres create --name webhook-receiver-db --region iad
   fly postgres attach --app webhook-receiver webhook-receiver-db
   ```

   Use your real app and database names in place of the examples.

3. **Secrets**  
   Set the webhook secret (and confirm `DATABASE_URL` exists after attach):

   ```bash
   fly secrets set --app webhook-receiver WEBHOOK_HMAC_SECRET='fluff-secret-abc123'
   ```

4. **Deploy**  
   The image is built from the `Dockerfile` (`npm run build`, which runs Prisma generate with the same env resolution as locally—typically from **`.env.example`** in the image when root `.env` is not copied). Migrations run on each deploy via `release_command` in `fly.toml`:

   ```bash
   npm run deploy
   ```

   This runs `fly deploy`.

For a short checklist of Fly commands, run `npm run fly:bootstrap` (prints `scripts/fly-bootstrap.sh` guidance).

After deploy, call `https://<your-app>.fly.dev/webhooks` (or your custom domain) with the same paths as locally.

## Testing with `curl`

The signature must be computed over the **exact** bytes sent as the body. For a compact JSON string with no extra spaces, the body and the string passed into HMAC must match.

**Quick signature for testing** (prints a `v1=<hex>` value for the sample body `{"a":1}` and the default secret):

```bash
node -e "const c=require('crypto');const b='{\"a\":1}';const s='fluff-secret-abc123';console.log('v1='+c.createHmac('sha256',s).update(b,'utf8').digest('hex'))"
```

**Sample `POST` with `curl`** (set the same `BODY` for both the HMAC and `-d`):

```bash
export BODY='{"a":1}'
export SIG=$(node -e "const c=require('crypto');process.stdout.write('v1='+c.createHmac('sha256','fluff-secret-abc123').update(process.env.BODY,'utf8').digest('hex'))")

curl -sS -X POST "http://localhost:3000/webhooks" \
  -H "Content-Type: application/json" \
  -H "X-Signature: $SIG" \
  -d "$BODY"
```

**List stored events:**

```bash
curl -sS "http://localhost:3000/webhooks?limit=10"
```

Replace `http://localhost:3000` with your Fly app URL when testing a deployed instance.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Next.js development server (loads root `.env` automatically). |
| `npm run build` | Runs `scripts/prisma-env.mjs generate`, then production Next build. |
| `npm run db:generate` | `prisma generate` with env loaded via `scripts/prisma-env.mjs`. |
| `npm run db:migrate` | `prisma migrate dev` (local). |
| `npm run db:migrate:deploy` | `prisma migrate deploy` (e.g. CI or production database). |
| `npm run db:studio` | Prisma Studio with the same env resolution. |
| `npm run deploy` | `fly deploy`. |
| `npm run fly:bootstrap` | Prints Fly.io bootstrap hints. |
