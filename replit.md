# Discord Prefix Bot

A Node.js Discord bot that responds to `+`-prefixed commands using discord.js.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/discord-bot run start` — run the Discord bot
- `pnpm --filter @workspace/discord-bot run dev` — run the Discord bot with file watching
- `pnpm --filter @workspace/discord-bot run check` — syntax-check the bot
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required secrets: `DISCORD_TOKEN` for the Discord bot; `DATABASE_URL` for the API server

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `bot/src/index.js` — Discord client, prefix parser, and command handlers
- `bot/README.md` — Discord Developer Portal setup and bot usage
- `bot/.env.example` — documentation for the required secret name

## Architecture decisions

- The bot uses `+` as a fixed command prefix.
- The Discord token is read only from `DISCORD_TOKEN`; it is never hardcoded.
- The initial command set is intentionally small and easy to extend through the command map.

## Product

The bot responds to `+ping`, `+help`, and `+about` in Discord servers where it has been invited.

## User preferences

No additional preferences recorded.

## Gotchas

- Discord's Message Content Intent must be enabled in the Developer Portal for prefix commands to work.
- Do not commit `DISCORD_TOKEN`; store it in Replit Secrets.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
