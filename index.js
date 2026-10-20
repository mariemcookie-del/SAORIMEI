import {
  ActivityType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
} from "discord.js";
import { readFileSync, writeFileSync } from "node:fs";

const PREFIX = "+";
const token = process.env.DISCORD_TOKEN;
const snipedMessages = new Map();
const lockedNames = new Set();
const laisseNames = new Map();
const guildConfigPath = new URL("../guild-config.json", import.meta.url);

function lireConfig() {
  try {
    const config = JSON.parse(readFileSync(guildConfigPath, "utf8"));
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new TypeError(
        "La configuration des serveurs doit être un objet JSON.",
      );
    }
    return config;
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function ecrireConfig(config) {
  writeFileSync(
    guildConfigPath,
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );
}

async function creerEmbedStats(guild) {
  const membres = await guild.members.fetch({ withPresences: true });
  const enLigne = membres.filter((member) =>
    ["online", "idle", "dnd"].includes(member.presence?.status),
  ).size;
  const enVocal = guild.voiceStates.cache.filter(
    (state) => state.channelId && state.member,
  );
  const actifs = membres.filter((member) =>
    member.presence?.activities?.some(
      (activity) => activity.type === ActivityType.Playing,
    ),
  ).size;
  const enStream = membres.filter((member) =>
    member.presence?.activities?.some(
      (activity) => activity.type === ActivityType.Streaming,
    ),
  ).size;
  const mute = enVocal.filter(
    (state) => state.selfMute || state.serverMute,
  ).size;

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(`Statistiques de ${guild.name} 🏯`)
    .setDescription(
      [
        `**Membres**\n${guild.memberCount.toLocaleString("fr-FR")}`,
        `**En ligne**\n${enLigne.toLocaleString("fr-FR")}`,
        `**En vocal**\n${enVocal.size.toLocaleString("fr-FR")}`,
        `**Actif**\n${actifs.toLocaleString("fr-FR")}`,
        `**En stream**\n${enStream.toLocaleString("fr-FR")}`,
        `**Mute**\n${mute.toLocaleString("fr-FR")}`,
      ].join("\n\n"),
    )
    .setFooter({
      text: `${guild.name.toUpperCase()} • Statistiques du serveur`,
    })
    .setTimestamp();

  const guildIcon = guild.iconURL({ size: 256 });
  if (guildIcon) {
    embed.setThumbnail(guildIcon);
  }

  return embed;
}

async function fetchStatsMessage(channel, messageId) {
  try {
    return await channel.messages.fetch(messageId);
  } catch (error) {
    if (error.code === 10008) {
      return null;
    }
    throw error;
  }
}

let statsRefreshRunning = false;

async function actualiserStatsConfigurees() {
  if (statsRefreshRunning) {
    return;
  }
  statsRefreshRunning = true;

  try {
    const config = lireConfig();
    let configModifiee = false;

    for (const [guildId, guildConfig] of Object.entries(config)) {
      const statsConfig = guildConfig?.statistiques;
      if (!statsConfig?.salonId) {
        continue;
      }

      try {
        const guild =
          client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId));
        const channel = await guild.channels
          .fetch(statsConfig.salonId)
          .catch(() => null);

        if (
          !channel ||
          channel.guildId !== guild.id ||
          !channel.isTextBased() ||
          typeof channel.send !== "function"
        ) {
          continue;
        }

        const permissions = channel.permissionsFor(client.user);
        if (
          !permissions?.has([
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ])
        ) {
          console.warn(
            `Permissions insuffisantes pour actualiser les stats dans ${channel.id}.`,
          );
          continue;
        }

        const embed = await creerEmbedStats(guild);
        const statsMessage = statsConfig.messageId
          ? await fetchStatsMessage(channel, statsConfig.messageId)
          : null;

        if (statsMessage) {
          await statsMessage.edit({ embeds: [embed] });
        } else {
          const newStatsMessage = await channel.send({ embeds: [embed] });
          config[guildId] = {
            ...guildConfig,
            statistiques: {
              ...statsConfig,
              salonId: channel.id,
              messageId: newStatsMessage.id,
            },
          };
          configModifiee = true;
        }
      } catch (error) {
        console.error(`Erreur stats pour ${guildId} :`, error);
      }
    }

    if (configModifiee) {
      ecrireConfig(config);
    }
  } catch (error) {
    console.error("Erreur de configuration des statistiques :", error);
  } finally {
    statsRefreshRunning = false;
  }
}

if (!token) {
  throw new Error(
    "DISCORD_TOKEN is missing. Add it to Replit Secrets before starting the bot.",
  );
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel],
});

const commands = new Map([
  [
    "ping",
    async (message) => {
      const sent = await message.reply("Pinging...");
      const latency = sent.createdTimestamp - message.createdTimestamp;
      await sent.edit(`Pong! Message latency: ${latency}ms.`);
    },
  ],
  [
    "help",
    (message) => {
      const embed = new EmbedBuilder()
        .setTitle("_*Commandes*_")
        .setDescription("Voici les commandes disponibles :")
        .setColor(0x2b2d31)
        .addFields(
          {
            name: "🖼️ Avatar",
            value: "`+pic @membre` — Affiche l'avatar d'un membre.",
            inline: false,
          },
          {
            name: "🔎 Snipe",
            value: "`+snipe` — Affiche le dernier message supprimé.",
            inline: false,
          },
          {
            name: "🔒 Modération",
            value:
              "`+lock` — Verrouille le salon.\n" +
              "`+unlock` — Déverrouille le salon.\n" +
              "`+lock name` — Verrouille les pseudos.\n" +
              "`+unlock name` — Déverrouille les pseudos.\n" +
              "`+rename @membre pseudo` — Change un pseudo.\n" +
              "`+laisse @membre` — Donne le surnom spécial.\n" +
              "`+unlaisse @membre` — Retire le surnom spécial.\n" +
              "`+addrole @membre @rôle` — Ajoute un rôle.\n" +
              "`+unrole @membre @rôle` — Retire un rôle.\n" +
              "`+reset` — Recrée le salon à l'identique.\n" +
              "`+clear` — Nettoie le salon.\n" +
              "`+ban @membre` — Bannit un membre.",
            inline: false,
          },
          {
            name: "🎫 Support",
            value: "`+ticket` — Affiche le panneau de création de ticket.",
            inline: false,
          },
          {
            name: "👋 Bienvenue",
            value:
              "`+setwelcome [#salon]` — Choisit le salon des messages de bienvenue (permission Gérer le serveur).",
            inline: false,
          },
          {
            name: "📊 Statistiques",
            value:
              "`+stats #salon` — Publie les statistiques et actualise le même message chaque jour (permission Gérer le serveur).",
            inline: false,
          },
        )
        .setFooter({
          text: `Demandé par @${
            message.member?.displayName ?? message.author.username
          }`,
        });

      return message.reply({ embeds: [embed] });
    },
  ],
  [
    "setwelcome",
    (message) => {
      if (
        !message.guild ||
        !message.member?.permissions.has(
          PermissionsBitField.Flags.ManageGuild,
        )
      ) {
        return message.reply(
          "❌ Tu dois avoir la permission `Gérer le serveur` pour configurer le salon de bienvenue.",
        );
      }

      const channel =
        message.mentions.channels.first() ?? message.channel;
      if (
        channel.guildId !== message.guild.id ||
        !channel.isTextBased() ||
        typeof channel.send !== "function"
      ) {
        return message.reply(
          "❌ Mentionne un salon textuel de ce serveur, ou utilise la commande dans un salon textuel.",
        );
      }

      if (
        !channel
          .permissionsFor(client.user)
          ?.has(PermissionsBitField.Flags.SendMessages)
      ) {
        return message.reply(
          "❌ Je n'ai pas la permission d'envoyer des messages dans ce salon.",
        );
      }

      try {
        const config = lireConfig();
        const guildConfig = config[message.guild.id];
        config[message.guild.id] = {
          ...(guildConfig &&
          typeof guildConfig === "object" &&
          !Array.isArray(guildConfig)
            ? guildConfig
            : {}),
          salonBienvenue: channel.id,
        };
        ecrireConfig(config);
      } catch (error) {
        console.error("Erreur de configuration du salon de bienvenue :", error);
        return message.reply(
          "❌ Impossible d'enregistrer le salon de bienvenue.",
        );
      }

      return message.reply(
        `✅ Les messages de bienvenue seront envoyés dans ${channel}.`,
      );
    },
  ],
  [
    "stats",
    async (message) => {
      if (
        !message.guild ||
        !message.member?.permissions.has(
          PermissionsBitField.Flags.ManageGuild,
        )
      ) {
        return message.reply(
          "❌ Tu dois avoir la permission `Gérer le serveur` pour configurer les statistiques.",
        );
      }

      const channel = message.mentions.channels.first();
      if (
        !channel ||
        channel.guildId !== message.guild.id ||
        !channel.isTextBased() ||
        typeof channel.send !== "function"
      ) {
        return message.reply("Utilise `+stats #salon` avec un salon textuel.");
      }

      const permissions = channel.permissionsFor(client.user);
      if (
        !permissions?.has([
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
        ])
      ) {
        return message.reply(
          "❌ J'ai besoin des permissions Voir le salon, Envoyer des messages et Lire l'historique dans ce salon.",
        );
      }

      try {
        const config = lireConfig();
        const guildConfig = config[message.guild.id];
        const previousStats = guildConfig?.statistiques;
        const embed = await creerEmbedStats(message.guild);

        let statsMessage = null;
        if (
          previousStats?.salonId === channel.id &&
          previousStats.messageId
        ) {
          statsMessage = await fetchStatsMessage(
            channel,
            previousStats.messageId,
          );
        }

        if (statsMessage) {
          await statsMessage.edit({ embeds: [embed] });
        } else {
          statsMessage = await channel.send({ embeds: [embed] });
        }

        config[message.guild.id] = {
          ...(guildConfig &&
          typeof guildConfig === "object" &&
          !Array.isArray(guildConfig)
            ? guildConfig
            : {}),
          statistiques: {
            salonId: channel.id,
            messageId: statsMessage.id,
          },
        };
        ecrireConfig(config);

        return message.reply(
          "✅ Statistiques configurées. Le même message sera actualisé chaque jour.",
        );
      } catch (error) {
        console.error("Erreur de configuration des statistiques :", error);
        return message.reply(
          "❌ Impossible de créer les statistiques. Vérifie les intents et les permissions du bot.",
        );
      }
    },
  ],
  [
    "about",
    (message) =>
      message.reply(
        "I'm a discord.js bot built with Node.js. Use `+help` to see what I can do.",
      ),
  ],
  [
    "ticket",
    (message) => {
      const embed = new EmbedBuilder()
        .setTitle("🎫 Support")
        .setDescription(
          "Clique sur le bouton ci-dessous pour créer un ticket.",
        )
        .setColor(0x5865f2);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("create_ticket")
          .setLabel("Créer un ticket")
          .setEmoji("🎫")
          .setStyle(ButtonStyle.Primary),
      );

      return message.channel.send({
        embeds: [embed],
        components: [row],
      });
    },
  ],
  [
    "pic",
    (message) => {
      const member = message.mentions.members.first() ?? message.member;

      if (!member) {
        return message.reply("Je n'ai pas trouvé l'avatar de ce membre.");
      }

      const embed = new EmbedBuilder()
        .setTitle("_*Avatar*_")
        .setDescription(`Voici l'avatar de ${member}`)
        .setColor(0x2b2d31)
        .setImage(member.displayAvatarURL({ extension: "png", size: 1024 }))
        .setFooter({
          text: `Demande de @${
            message.member?.displayName ?? message.author.username
          }`,
        });

      return message.reply({ embeds: [embed] });
    },
  ],
  [
    "snipe",
    (message) => {
      const deletedMessage = snipedMessages.get(message.channelId);

      if (!deletedMessage) {
        return message.reply("❌ Aucun message supprimé à afficher.");
      }

      const embed = new EmbedBuilder()
        .setTitle("_*Snipe*_")
        .setDescription(deletedMessage.content || "*Message sans texte*")
        .setColor(0x2b2d31)
        .setAuthor({
          name: deletedMessage.author?.displayName ?? "Utilisateur inconnu",
          iconURL: deletedMessage.author?.displayAvatarURL({
            extension: "png",
            size: 256,
          }),
        })
        .setFooter({
          text: `Demandé par @${
            message.member?.displayName ?? message.author.username
          }`,
        });

      return message.reply({ embeds: [embed] });
    },
  ],
  [
    "lock",
    async (message, args) => {
      if (args[0]?.toLowerCase() === "name") {
        if (
          !message.guild ||
          !message.member?.permissions.has(
            PermissionsBitField.Flags.ManageNicknames,
          )
        ) {
          return message.reply(
            "❌ Tu dois avoir la permission `Gérer les pseudos` pour utiliser cette commande.",
          );
        }

        lockedNames.add(message.guild.id);
        return message.reply("🔒 Les pseudos sont maintenant verrouillés.");
      }

      if (
        !message.guild ||
        !message.member?.permissions.has(
          PermissionsBitField.Flags.ManageChannels,
        )
      ) {
        return message.reply(
          "❌ Tu dois avoir la permission `Gérer les salons` pour utiliser cette commande.",
        );
      }

      await message.channel.permissionOverwrites.edit(
        message.guild.roles.everyone,
        { SendMessages: false },
      );

      return message.reply("🔒 Le salon a été verrouillé.");
    },
  ],
  [
    "unlock",
    async (message, args) => {
      if (args[0]?.toLowerCase() === "name") {
        if (
          !message.guild ||
          !message.member?.permissions.has(
            PermissionsBitField.Flags.ManageNicknames,
          )
        ) {
          return message.reply(
            "❌ Tu dois avoir la permission `Gérer les pseudos` pour utiliser cette commande.",
          );
        }

        lockedNames.delete(message.guild.id);
        return message.reply("🔓 Les pseudos sont maintenant déverrouillés.");
      }

      if (
        !message.guild ||
        !message.member?.permissions.has(
          PermissionsBitField.Flags.ManageChannels,
        )
      ) {
        return message.reply(
          "❌ Tu dois avoir la permission `Gérer les salons` pour utiliser cette commande.",
        );
      }

      await message.channel.permissionOverwrites.edit(
        message.guild.roles.everyone,
        { SendMessages: null },
      );

      return message.reply("🔓 Le salon a été déverrouillé.");
    },
  ],
  [
    "clear",
    async (message) => {
      if (
        !message.guild ||
        !message.member?.permissions.has(
          PermissionsBitField.Flags.ManageMessages,
        )
      ) {
        return message.reply(
          "❌ Tu dois avoir la permission `Gérer les messages` pour utiliser cette commande.",
        );
      }

      if (typeof message.channel.bulkDelete !== "function") {
        return message.reply(
          "❌ Cette commande ne peut pas être utilisée dans ce type de salon.",
        );
      }

      let deletedCount = 0;

      while (true) {
        const deleted = await message.channel.bulkDelete(100, true);
        deletedCount += deleted.size;

        if (deleted.size < 100) {
          break;
        }
      }

      const confirmation = await message.channel.send(
        `🧹 **${deletedCount} messages supprimés.**`,
      );

      await new Promise((resolve) => setTimeout(resolve, 3000));
      await confirmation.delete();
    },
  ],
  [
    "reset",
    async (message) => {
      if (
        !message.guild ||
        !message.member?.permissions.has(
          PermissionsBitField.Flags.ManageChannels,
        )
      ) {
        return message.reply("❌ Tu n'as pas la permission de faire ça.");
      }

      const oldChannel = message.channel;
      if (typeof oldChannel.clone !== "function") {
        return message.reply("❌ Ce type de salon ne peut pas être recréé.");
      }

      try {
        const newChannel = await oldChannel.clone({
          name: oldChannel.name,
          reason: `Reset par ${message.author.tag}`,
        });

        await newChannel.setPosition(oldChannel.position);
        await oldChannel.delete(`Reset par ${message.author.tag}`);
        await newChannel.send("🔄 Le salon a été réinitialisé.");
      } catch (error) {
        console.error("Channel reset failed:", error);
        if (!message.deleted) {
          await message.reply(
            "❌ Je ne peux pas réinitialiser ce salon. Vérifie mes permissions.",
          );
        }
      }
    },
  ],
  [
    "addrole",
    async (message) => {
      if (
        !message.guild ||
        !message.member?.permissions.has(
          PermissionsBitField.Flags.ManageRoles,
        )
      ) {
        return message.reply(
          "❌ Tu dois avoir la permission `Gérer les rôles` pour utiliser cette commande.",
        );
      }

      let member = message.mentions.members.first();
      if (!member && message.reference?.messageId) {
        try {
          const repliedMessage = await message.channel.messages.fetch(
            message.reference.messageId,
          );
          member = repliedMessage.member;
        } catch (error) {
          console.error("Replied message fetch failed:", error);
        }
      }

      if (!member) {
        return message.reply(
          "❌ Mentionne une personne ou réponds à son message.",
        );
      }

      const role = message.mentions.roles.first();
      if (!role) {
        return message.reply("❌ Mentionne le rôle à ajouter.");
      }

      try {
        await member.roles.add(role);
        return message.reply(
          `✅ Le rôle ${role} a été ajouté à ${member}.`,
        );
      } catch (error) {
        console.error("Role add failed:", error);
        return message.reply(
          "❌ Je ne peux pas ajouter ce rôle. Vérifie la hiérarchie des rôles.",
        );
      }
    },
  ],
  [
    "unrole",
    async (message) => {
      if (
        !message.guild ||
        !message.member?.permissions.has(
          PermissionsBitField.Flags.ManageRoles,
        )
      ) {
        return message.reply(
          "❌ Tu dois avoir la permission `Gérer les rôles` pour utiliser cette commande.",
        );
      }

      let member = message.mentions.members.first();
      if (!member && message.reference?.messageId) {
        try {
          const repliedMessage = await message.channel.messages.fetch(
            message.reference.messageId,
          );
          member = repliedMessage.member;
        } catch (error) {
          console.error("Replied message fetch failed:", error);
        }
      }

      if (!member) {
        return message.reply(
          "❌ Mentionne une personne ou réponds à son message.",
        );
      }

      const role = message.mentions.roles.first();
      if (!role) {
        return message.reply("❌ Mentionne le rôle à retirer.");
      }

      try {
        await member.roles.remove(role);
        return message.reply(
          `✅ Le rôle ${role} a été retiré de ${member}.`,
        );
      } catch (error) {
        console.error("Role remove failed:", error);
        return message.reply(
          "❌ Je ne peux pas retirer ce rôle. Vérifie la hiérarchie des rôles.",
        );
      }
    },
  ],
  [
    "rename",
    async (message, args) => {
      if (
        !message.guild ||
        !message.member?.permissions.has(
          PermissionsBitField.Flags.ManageNicknames,
        )
      ) {
        return message.reply(
          "❌ Tu dois avoir la permission `Gérer les pseudos` pour utiliser cette commande.",
        );
      }

      const member = message.mentions.members.first();
      if (!member) {
        return message.reply("❌ Mentionne la personne à renommer.");
      }

      const newName = args.slice(1).join(" ").trim();
      if (!newName) {
        return message.reply("❌ Indique le nouveau pseudo.");
      }

      try {
        await member.setNickname(newName);
        return message.reply(
          `✅ Le pseudo de ${member} est maintenant **${newName}**.`,
        );
      } catch (error) {
        console.error("Nickname update failed:", error);
        return message.reply(
          "❌ Je ne peux pas changer ce pseudo. Vérifie mes permissions et la hiérarchie des rôles.",
        );
      }
    },
  ],
  [
    "laisse",
    async (message) => {
      if (
        !message.guild ||
        !message.member?.permissions.has(
          PermissionsBitField.Flags.ManageNicknames,
        )
      ) {
        return message.reply(
          "❌ Tu dois avoir la permission `Gérer les pseudos` pour utiliser cette commande.",
        );
      }

      const member = message.mentions.members.first();
      if (!member) {
        return message.reply("❌ Mentionne une personne.");
      }

      const key = `${message.guild.id}:${member.id}`;
      if (!laisseNames.has(key)) {
        laisseNames.set(key, member.nickname);
      }

      try {
        await member.setNickname("🦮2 eru");
        return message.reply(
          `✅ ${member} a maintenant le surnom **🦮2 eru**.`,
        );
      } catch (error) {
        console.error("Special nickname update failed:", error);
        return message.reply(
          "❌ Je ne peux pas changer son pseudo. Vérifie mes permissions.",
        );
      }
    },
  ],
  [
    "unlaisse",
    async (message) => {
      if (
        !message.guild ||
        !message.member?.permissions.has(
          PermissionsBitField.Flags.ManageNicknames,
        )
      ) {
        return message.reply(
          "❌ Tu dois avoir la permission `Gérer les pseudos` pour utiliser cette commande.",
        );
      }

      const member = message.mentions.members.first();
      if (!member) {
        return message.reply("❌ Mentionne une personne.");
      }

      const key = `${message.guild.id}:${member.id}`;
      const oldName = laisseNames.get(key);

      try {
        await member.setNickname(oldName ?? null);
        laisseNames.delete(key);

        return message.reply(`✅ Le surnom de ${member} a été retiré.`);
      } catch (error) {
        console.error("Special nickname removal failed:", error);
        return message.reply("❌ Je ne peux pas retirer son surnom.");
      }
    },
  ],
  [
    "ban",
    async (message) => {
      if (
        !message.guild ||
        !message.member?.permissions.has(PermissionsBitField.Flags.BanMembers)
      ) {
        return message.reply(
          "❌ Tu dois avoir la permission `Bannir des membres` pour utiliser cette commande.",
        );
      }

      // Si on mentionne la personne
      let member = message.mentions.members.first();

      // Si on répond au message de la personne
      if (!member && message.reference) {
        try {
          const repliedMessage = await message.channel.messages.fetch(
            message.reference.messageId,
          );
          member = repliedMessage.member;
        } catch (error) {
          console.error("Replied message fetch failed:", error);
        }
      }

      if (!member) {
        return message.reply(
          "❌ Mentionne une personne ou réponds à son message.",
        );
      }

      if (!member.bannable) {
        return message.reply("❌ Je ne peux pas bannir cette personne.");
      }

      try {
        await member.ban({
          reason: `Banni par ${message.author.tag}`,
        });

        message.reply(`🔨 ${member.user.tag} a été banni.`);
      } catch (error) {
        console.error(error);
        message.reply("❌ Impossible de bannir cette personne.");
      }
    },
  ],
]);

client.once("clientReady", (readyClient) => {
  console.info(`Logged in as ${readyClient.user.tag}`);
  console.info(`Prefix: ${PREFIX}`);
  void actualiserStatsConfigurees();
  setInterval(() => {
    void actualiserStatsConfigurees();
  }, 24 * 60 * 60 * 1000);
});

client.on("messageDelete", (message) => {
  if (message.author?.bot) {
    return;
  }

  snipedMessages.set(message.channelId, message);
});

client.on("guildMemberAdd", async (member) => {
  let salonId;

  try {
    salonId = lireConfig()[member.guild.id]?.salonBienvenue;
  } catch (error) {
    console.error("Erreur de lecture de la configuration de bienvenue :", error);
    return;
  }

  if (!salonId) return;

  const salon = await member.guild.channels.fetch(salonId).catch(() => null);
  if (
    !salon ||
    salon.guildId !== member.guild.id ||
    !salon.isTextBased() ||
    typeof salon.send !== "function"
  ) {
    return;
  }

  const nombreMembres = member.guild.memberCount;

  try {
    await salon.send(
      `Bienvenue ${member} ! Tu es le ${nombreMembres}ème membre 🎉`,
    );
  } catch (error) {
    console.error("Erreur du message de bienvenue :", error);
  }
});

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  if (
    !lockedNames.has(newMember.guild.id) ||
    oldMember.nickname === newMember.nickname
  ) {
    return;
  }

  try {
    await newMember.setNickname(oldMember.nickname);
  } catch (error) {
    console.error("Locked nickname restore failed:", error);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) {
    return;
  }

  if (interaction.customId === "create_ticket") {
    if (!interaction.guild) {
      await interaction.reply({
        content: "❌ Les tickets doivent être créés depuis un serveur.",
        ephemeral: true,
      });
      return;
    }

    const existingTicket = interaction.guild.channels.cache.find(
      (channel) =>
        channel.type === ChannelType.GuildText &&
        channel.topic === `ticket-owner:${interaction.user.id}`,
    );

    if (existingTicket) {
      await interaction.reply({
        content: `❌ Tu as déjà un ticket ouvert : ${existingTicket}.`,
        ephemeral: true,
      });
      return;
    }

    try {
      const ticketChannel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-")
          .slice(0, 20)}`,
        type: ChannelType.GuildText,
        topic: `ticket-owner:${interaction.user.id}`,
        permissionOverwrites: [
          {
            id: interaction.guild.roles.everyone.id,
            deny: [PermissionsBitField.Flags.ViewChannel],
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
            ],
          },
          {
            id: interaction.client.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.ManageChannels,
            ],
          },
        ],
      });

      const ticketEmbed = new EmbedBuilder()
        .setTitle("🎫 Ticket")
        .setDescription(
          `Bienvenue ${interaction.user} !\n\n` +
            "Explique ton problème et attends qu'un membre du staff prenne ton ticket.\n\n" +
            "👤 **Claim** → prendre le ticket\n" +
            "🔓 **Unclaim** → libérer le ticket\n" +
            "🔒 **Fermer** → fermer le ticket",
        )
        .setColor(0x5865f2);

      const ticketButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("claim_ticket")
          .setLabel("Claim")
          .setEmoji("👤")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("unclaim_ticket")
          .setLabel("Unclaim")
          .setEmoji("🔓")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("close_ticket")
          .setLabel("Fermer")
          .setEmoji("🔒")
          .setStyle(ButtonStyle.Danger),
      );

      await ticketChannel.send({
        content: `${interaction.user}`,
        embeds: [ticketEmbed],
        components: [ticketButtons],
      });
      await interaction.reply({
        content: `✅ Ton ticket a été créé : ${ticketChannel}.`,
        ephemeral: true,
      });
    } catch (error) {
      console.error("Ticket creation failed:", error);
      await interaction.reply({
        content:
          "❌ Je ne peux pas créer le ticket. Vérifie que le bot possède la permission `Gérer les salons`.",
        ephemeral: true,
      });
    }
    return;
  }

  if (
    !["claim_ticket", "unclaim_ticket", "close_ticket"].includes(
      interaction.customId,
    )
  ) {
    return;
  }

  if (
    !interaction.channel ||
    interaction.channel.type !== ChannelType.GuildText ||
    !interaction.channel.topic?.startsWith("ticket-owner:")
  ) {
    await interaction.reply({
      content: "❌ Cette action est disponible uniquement dans un ticket.",
      ephemeral: true,
    });
    return;
  }

  if (interaction.customId === "claim_ticket") {
    await interaction.reply({
      content: `👤 **${interaction.user.username}** a pris en charge ce ticket.`,
    });
    return;
  }

  if (interaction.customId === "unclaim_ticket") {
    await interaction.reply({
      content: `🔓 **${interaction.user.username}** a libéré ce ticket.`,
    });
    return;
  }

  await interaction.reply("🔒 Fermeture du ticket...");
  setTimeout(() => {
    interaction.channel?.delete().catch((error) => {
      console.error("Ticket deletion failed:", error);
    });
  }, 3000);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) {
    return;
  }

  const [commandName, ...args] = message.content
    .slice(PREFIX.length)
    .trim()
    .split(/\s+/);

  if (!commandName) {
    return;
  }

  const command = commands.get(commandName.toLowerCase());
  if (!command) {
    return;
  }

  try {
    await command(message, args);
  } catch (error) {
    console.error(`Command "${commandName}" failed:`, error);
    await message.reply(
      "Something went wrong while running that command. Please try again.",
    );
  }
});

client.on("error", (error) => {
  console.error("Discord client error:", error);
});

process.on("SIGINT", () => {
  client.destroy();
  process.exit(0);
});

process.on("SIGTERM", () => {
  client.destroy();
  process.exit(0);
});

await client.login(token);
