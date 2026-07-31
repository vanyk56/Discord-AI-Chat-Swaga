# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Discord Bot**: discord.js v14 + OpenRouter API
- **Bot status**: Discord bot writes `.bot-status.json`; API exposes `/api/bot/status`; dashboard polls it for real online/offline status
- **Production runtime**: API Server artifact starts both the Express API and the Discord bot so the bot runs after publishing
- **Production resilience**: API stays up if the Discord bot child process exits; the bot is automatically restarted with backoff
- **Voice features**: Discord voice/broadcast/transcription modules are lazy-loaded only when used to avoid optional native voice bindings blocking production startup

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/discord-bot run dev` — run Discord bot locally

## Discord Bot

Located in `artifacts/discord-bot/src/index.ts`.

### AI Models (OpenRouter)
- **Основной чат / общение**: `qwen/qwen3.7-flash`
- **Утилиты, кодинг, факты, игры, транскрипция**: `qwen/qwen3.7-flash`
- **Генерация и редактирование картинок**: `krea/krea-2-large`

### Environment Variables Required
- `DISCORD_BOT_TOKEN` — Discord bot token (secret)
- `OPENROUTER_API_KEY` — OpenRouter API Key

### Discord Setup
1. Go to https://discord.com/developers/applications
2. Create application → Bot → Enable "Message Content Intent"
3. Invite bot with permissions: `Send Messages`, `Read Message History`, `View Channels`

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
