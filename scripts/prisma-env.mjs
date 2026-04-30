/**
 * Loads DATABASE_URL for Prisma CLI (generate, migrate, studio).
 * Order: `.env` → `.env.example` → non-connecting placeholder + stderr warning.
 */
import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();

config({ path: resolve(root, ".env") });

if (!process.env.DATABASE_URL?.trim()) {
  config({ path: resolve(root, ".env.example") });
}

if (!process.env.DATABASE_URL?.trim()) {
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@127.0.0.1:5432/prisma_cli_placeholder?schema=public";
  console.warn(
    "[prisma-env] DATABASE_URL was unset; using a placeholder so Prisma CLI can run. Copy .env.example to .env and set a real URL for your database.",
  );
}

const result = spawnSync(
  "npx",
  ["prisma", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  },
);

process.exit(result.status === null ? 1 : result.status);
