# AI Kanban Board

A portfolio-ready monorepo foundation for an AI-assisted Kanban application. The
workspace combines a server-rendered React frontend with a modular NestJS API.

## Stack

- TanStack Start, React, Vite, and Tailwind CSS
- NestJS with native ECMAScript modules and Clerk authentication
- TypeScript, Biome, Vitest, pnpm, and Turborepo

## Requirements

- Node.js 24.20.0 (24.15.0 or newer within the Node 24 release line)
- pnpm 11.24.0

Use `nvm use` to select the repository's Node.js version. Corepack can activate
the declared pnpm version with `corepack enable`.

## Getting started

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
docker compose -f infra/docker/docker-compose.yml up -d
pnpm --filter @repo/api db:migrate:deploy
pnpm --filter @repo/api db:seed
pnpm dev
```

The frontend runs at <http://localhost:3000> and the API runs at
<http://localhost:3001>. The API preserves `GET /health` for compatibility and
exposes `GET /api/v1/health/live` and `GET /api/v1/health/ready` for orchestrator
health checks. Interactive API docs are available at
<http://localhost:3001/docs> outside production.

API configuration, including the PostgreSQL connection and pool limits, is
validated before Nest finishes starting. The local Compose services bind only
to the loopback interface.

The API requires a Clerk secret key, JWT public key, webhook signing secret,
and an explicit list of authorized frontend origins. Copy these values from the
Clerk Dashboard into `apps/api/.env`; never commit that file. Configure the
Clerk webhook endpoint as `POST /api/v1/webhooks/clerk` and subscribe it to
`user.created`, `user.updated`, and `user.deleted`. Protected API requests must
send a Clerk session JWT as `Authorization: Bearer <token>`.

Clerk remains the profile source of truth. Signed webhooks update the local user
record, while the first authenticated request can provision a missing record if
the creation webhook is delayed. The API stores application roles locally and
never derives them from Clerk profile data.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start all application development servers |
| `pnpm generate` | Generate workspace-owned clients, including Prisma Client |
| `pnpm build` | Build all deployable applications |
| `pnpm check` | Check formatting and lint rules |
| `pnpm check:fix` | Apply safe formatting and lint fixes |
| `pnpm check-types` | Type-check every TypeScript workspace |
| `pnpm test` | Run all workspace smoke tests |
| `pnpm test:integration` | Run integration tests against the configured PostgreSQL database |

Prisma schema, migrations, and seed data are owned by `apps/api`. Useful
database commands are package-scoped:

```bash
pnpm --filter @repo/api db:validate
pnpm --filter @repo/api db:migrate:dev --name <migration-name>
pnpm --filter @repo/api db:migrate:deploy
pnpm --filter @repo/api db:seed
pnpm --filter @repo/api db:studio
```

Normal tests mock database access. To run the integration suite locally, start
PostgreSQL, deploy the migrations, seed the fixtures, and then run
`pnpm test:integration`.

## Workspace

```text
apps/
  api/                 NestJS API, Prisma schema, and migrations
  frontend/            TanStack Start frontend
packages/
  typescript-config/   Shared TypeScript configurations
```

Application dependencies belong to the application that uses them. Shared code
and reusable configuration should be introduced as focused packages under
`packages/` and referenced with the pnpm workspace protocol.
