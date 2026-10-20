# Discord Prefix Bot

A Node.js Discord bot built with `discord.js`. It responds to commands that
start with `+`.

## Commands

- `+ping` checks the bot's response latency.
- `+setwelcome [#channel]` sets the welcome-message channel for this server (requires Manage Server); without a mention, it uses the current text channel.
- `+stats #channel` posts server statistics and updates the same message daily (requires Manage Server; the bot needs View Channel, Send Messages, and Read Message History).
- `+pic [@member]` shows the mentioned member's display avatar, or your own when no member is mentioned.
- `+snipe` shows the latest deleted message in the current channel.
- `+lock` locks the current channel for `@everyone` (requires Manage Channels).
- `+unlock` restores sending permissions for `@everyone` (requires Manage Channels).
- `+lock name` locks member nicknames (requires Manage Nicknames).
- `+unlock name` unlocks member nicknames (requires Manage Nicknames).
- `+rename [@member] name` changes a member's nickname (requires Manage Nicknames).
- `+laisse [@member]` applies the special `🦮2 myr` nickname (requires Manage Nicknames).
- - `+chien [@member]` applies the special `🦮2 TheWife` nickname (requires Manage Nicknames).
- `+unlaisse [@member]` restores the nickname saved before `+laisse` (requires Manage Nicknames).
- - `+delaisse [@member]` restores the nickname saved before `+chien` (requires Manage Nicknames).
- `+addrole [@member]` adds the `Membre` role (requires Manage Roles).
- `+unrole [@member]` removes the `Membre` role (requires Manage Roles).
- `+ticket` posts a support panel; clicking it creates a private ticket channel.
- `+reset` clones the current channel in the same position, then deletes the original (requires Manage Channels).
- `+clear` deletes all deletable messages from the current channel (requires Manage Messages), then removes its confirmation after three seconds.
- `+help` lists available commands.
- `+about` describes the bot.

## Setup

1. Create an application and bot in the [Discord Developer Portal](https://discord.com/developers/applications).
2. Enable the **Message Content Intent**, **Server Members Intent**, and **Presence Intent** under the bot's privileged gateway intents. The bot also requests Guild Voice States for voice statistics.
3. Invite the bot to a server with the `bot` scope and permission to send messages.
4. Add the bot token to Replit Secrets with the key `DISCORD_TOKEN`.
5. Start it with:

   ```sh
   pnpm --filter @workspace/discord-bot run start
   ```

For local iteration, use `pnpm --filter @workspace/discord-bot run dev`.

Never commit the bot token or place it in source files.