# AI Kanban Board

A portfolio-ready monorepo foundation for an AI-assisted Kanban application. The
workspace combines a server-rendered React frontend with a modular NestJS API.

## Stack

- TanStack Start, React, Vite, and Tailwind CSS
- NestJS with native ECMAScript modules
- TypeScript, Biome, Vitest, pnpm, and Turborepo

## Requirements

- Node.js 24.20.0 (24.15.0 or newer within the Node 24 release line)
- pnpm 11.24.0

Use `nvm use` to select the repository's Node.js version. Corepack can activate
the declared pnpm version with `corepack enable`.

## Getting started

```bash
pnpm install
pnpm dev
```

The frontend runs at <http://localhost:3000> and the API runs at
<http://localhost:3001>. The API preserves `GET /health` for compatibility and
exposes `GET /api/v1/health/live` and `GET /api/v1/health/ready` for orchestrator
health checks. Interactive API docs are available at
<http://localhost:3001/docs> outside production.

Copy `apps/api/.env.example` to `apps/api/.env` to customize validated API
configuration. The checked-in defaults run without external secrets.

Local PostgreSQL and Redis services can be started with:

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start all application development servers |
| `pnpm build` | Build all deployable applications |
| `pnpm check` | Check formatting and lint rules |
| `pnpm check:fix` | Apply safe formatting and lint fixes |
| `pnpm check-types` | Type-check every TypeScript workspace |
| `pnpm test` | Run all workspace smoke tests |

## Workspace

```text
apps/
  api/                 NestJS API
  frontend/            TanStack Start frontend
packages/
  typescript-config/   Shared TypeScript configurations
```

Application dependencies belong to the application that uses them. Shared code
and reusable configuration should be introduced as focused packages under
`packages/` and referenced with the pnpm workspace protocol.
