import { Injectable } from "@nestjs/common";
import { Context, ContextOf, Modal, ModalContext, On, Once, SlashCommand, SlashCommandContext } from "necord";
import { SchedulerRegistry } from "@nestjs/schedule";
import {
  Client,
  LabelBuilder,
  MessageFlagsBitField,
  ModalBuilder,
  type Snowflake,
  StringSelectMenuBuilder,
  TextChannel,
  TextDisplayBuilder,
  TextInputBuilder,
} from "discord.js";
import { PrismaService } from "../prisma/prisma.service";
import { parseTimeInMinutes } from "../utils/datetime";
import { DiscordLoggerService } from "../logger/discord-logger.service";
import { throwError } from "../utils/interactions.utils";

/**
 * Service to handle tree watering notifications.
 * Users can configure their notification preferences via a modal.
 */
@Injectable()
export class TreeNotificationsService {
  // TODO: Move these IDs to config/env variables
  private readonly MESSAGE_ID: Snowflake = "1442870371106820186";
  private readonly CHANNEL_ID: Snowflake = "1442870041426133154";
  private readonly ROLE_ID: Snowflake = "1442870502522753075";

  private lastWateringUserId: string | null = null;
  private nextWateringDate: Date | null = null;

  constructor(private readonly logger: DiscordLoggerService, private readonly scheduler: SchedulerRegistry,
              private readonly db: PrismaService) {
    this.logger.setContext(TreeNotificationsService.name);
  }

  /**
   * Handles the client ready event to initialize tree notification tracking.
   *
   * Fetches the channel and message into the cache.
   *
   * @param client The Discord client instance.
   */
  @Once("clientReady")
  public async onReady(@Context() [client]: ContextOf<"clientReady">) {
    this.logger.debug("TreeNotifications loaded");

    const channel = (await client.channels.fetch(this.CHANNEL_ID)) as TextChannel;

    if (!channel) {
      this.logger.error("Channel not found");
    } else if (!channel.isSendable()) {
      this.logger.error("Channel is not sendable");
      return;
    }

    const message = await channel.messages.fetch(this.MESSAGE_ID);
    if (!message) {
      this.logger.error("Message not found");
      return;
    }

    const role = channel.guild.roles.cache.get(this.ROLE_ID);
    if (!role) {
      this.logger.error("Role not found");
      return;
    }

    if (!message.embeds.length) {
      this.logger.error("Tree message has no embeds");
      return;
    }
    this.logger.debug(`Fetched message: ${message.embeds[0]?.data.title || "No Title"}`);
    const description = message.embeds[0].data.description;

    await this.handleTreeMessage(description, client);
  }

  /**
   * Handles message updates to track tree watering information.
   *
   * @param oldMessage
   * @param newMessage
   */
  @On("messageUpdate")
  public async onMessageUpdate(@Context() [oldMessage, newMessage]: ContextOf<"messageUpdate">) {
    if (oldMessage.id === this.MESSAGE_ID) {
      if (!newMessage.embeds.length) {
        this.logger.error("Tree message has no embeds");
        return;
      }
      const description = newMessage.embeds[0].data.description;

      //const description = newMessage.content;
      this.logger.debug(`Message updated: ${description}`);

      await this.handleTreeMessage(description, oldMessage.client);
    }
  }

  @SlashCommand({
    name: "tree-notifications",
    description: "Configurer les notifications d'arrosage de l'arbre",
  })
  private async treeNotificationsCommand(@Context() [interaction]: SlashCommandContext) {
    this.logger.debug(`Opening tree notifications settings modal for user ${interaction.user.id}...`);

    const user = await this.db.user.findUnique({
      where: {
        discordId: interaction.user.id,
      },
      include: {
        treeNotifications_Preferences: true,
      },
    });
    if (user) {
      this.logger.debug(`Fetched user ${interaction.user.id} preferences: ${JSON.stringify(user.treeNotifications_Preferences)}`);
    } else {
      this.logger.debug(`No preferences found for user ${interaction.user.id}`);
    }

    return interaction.showModal(
      new ModalBuilder()
        .setTitle("Paramètres des notifications de l'arbre")
        .setCustomId("tree-notifications-settings")
        .addTextDisplayComponents([
          new TextDisplayBuilder({
            content: "Ces paramètres ne prendront effet que si le timing du prochain arrosage est supérieur à 30 secondes à partir de l'heure de soumission du formulaire.",
          }),
        ])
        .addLabelComponents([
          new LabelBuilder({
            label: "Activer les notifications",
            description: "Recevoir ou non les notifications pour arroser l'arbre",
          }).setStringSelectMenuComponent(new StringSelectMenuBuilder({
            customId: "enabled",
            required: true,
            options: [
              {
                label: "Activé",
                description: "Recevoir les notifications quand l'arbre est prêt à être arrosé",
                value: "true",
                default: user?.treeNotifications_Preferences.enabled ?? false,
              },
              {
                label: "Désactivé",
                description: "Ne pas recevoir de notifications",
                value: "false",
                default: !(user?.treeNotifications_Preferences.enabled ?? false),
              },
            ],
          })),
          new LabelBuilder({
            label: "Heure de début (HH:MM, 24h)",
            description: "Heure à partir de laquelle vous souhaitez recevoir des notifications",
          }).setTextInputComponent(new TextInputBuilder({
            customId: "start-time",
            style: 1,
            required: true,
            minLength: 5,
            maxLength: 5,
            value: user?.treeNotifications_Preferences.startTime ?? undefined,
          })),
          new LabelBuilder({
            label: "Heure de fin (HH:MM, 24h)",
            description: "Heure après laquelle vous ne souhaitez plus recevoir de notifications",
          }).setTextInputComponent(new TextInputBuilder({
            customId: "end-time",
            style: 1,
            required: true,
            minLength: 5,
            maxLength: 5,
            value: user?.treeNotifications_Preferences.endTime ?? undefined,
          })),
        ]),
    );
  }

  @Modal("tree-notifications-settings")
  private async onModal(@Context() [interaction]: ModalContext) {
    this.logger.debug("Processing tree notifications settings modal...");

    const enabled = interaction.fields.getStringSelectValues("enabled")[0] === "true";
    const startTime = interaction.fields.getTextInputValue("start-time");
    const endTime = interaction.fields.getTextInputValue("end-time");
    this.logger.debug(`User ${interaction.user.id} set tree notifications: enabled=${enabled}, startTime=${startTime}, endTime=${endTime}`);

    // Validate time format HH:MM
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime) || parseTimeInMinutes(startTime) === null || parseTimeInMinutes(endTime) === null) {
      await throwError("Format d'heure invalide ! Veuillez rentrer une heure en format HH:MM (par ex. 13:45).", interaction);
      return;
    }

    try {
      await this.db.user.upsert({
        where: {
          discordId: interaction.user.id,
        },
        create: {
          discordId: interaction.user.id,
          treeNotifications_Preferences: {
            create: {
              enabled,
              startTime,
              endTime,
            },
          },
        },
        update: {
          treeNotifications_Preferences: {
            upsert: {
              create: {
                enabled,
                startTime,
                endTime,
              },
              update: {
                enabled,
                startTime,
                endTime,
              },
            },
          },
        },
      });

      await interaction.reply({
        content: "Vos préférences de notification ont bien été sauvegardées.",
        flags: MessageFlagsBitField.Flags.Ephemeral,
      });
    } catch (e) {
      this.logger.error(`Failed to save tree notification preferences for user ${interaction.user.id}: ${e}`);
      await throwError("Une erreur est survenue lors de la sauvegarde de vos préférences.", interaction);
    }
  }

  /**
   * Handles the tree message to extract watering information.
   *
   * @param description The message containing tree information.
   * @param client The Discord client instance.
   * @returns The time until the next watering in milliseconds, or null if not applicable.
   */
  private async handleTreeMessage(description: string, client: Client): Promise<number | null> {
    this.logger.debug("Handling tree message...");

    const isTreeGrowing = description?.includes("It's growing right now");
    if (!isTreeGrowing) {
      this.logger.debug("Tree is not growing!");
      return null;
    }

    const lastWateringMatchArray = description?.match(/Thanks <@!?(\d+)> for watering the tree!/);
    if (lastWateringMatchArray && lastWateringMatchArray[1]) {
      const lastWateringUserId = lastWateringMatchArray[1];
      if (isNaN(parseInt(lastWateringUserId))) {
        this.logger.error("Failed to parse last watering user ID");
        return null;
      }
      if (this.lastWateringUserId !== lastWateringUserId) {
        this.lastWateringUserId = lastWateringUserId;
        this.logger.debug(`New watering user detected: ${lastWateringUserId}`);
      }
    } else {
      this.logger.error("Last watering user ID not found in message");
      return null;
    }

    const nextWateringMatchArray = description?.match(/<t:(\d+):R>/);
    if (nextWateringMatchArray && nextWateringMatchArray[1]) {
      const nextWateringTimestamp = parseInt(nextWateringMatchArray[1]) * 1000;
      if (isNaN(nextWateringTimestamp)) {
        this.logger.error("Failed to parse next watering timestamp");
        return null;
      }
      if (nextWateringTimestamp <= Date.now()) {
        this.logger.error("Next watering timestamp is in the past");
        return null;
      }
      if (this.scheduler.doesExist("timeout", "tree-watering")) {
        this.logger.debug("Tree watering timeout already exists, skipping scheduling");
        return null;
      }

      const nextWateringDate = new Date(nextWateringTimestamp);
      this.nextWateringDate = nextWateringDate;
      this.logger.debug(`Next tree growth at: ${nextWateringDate.toLocaleString()}`);
      const diff = nextWateringTimestamp - Date.now();

      const wateringTimeout = setTimeout(() => {
        this.logger.debug("Tree is ready for watering!");
        this.handleTreeWatering(client).then();
        this.scheduler.deleteTimeout("tree-watering");
      }, diff);
      this.scheduler.addTimeout("tree-watering", wateringTimeout);

      if (diff > 30_000) {
        const roleHandlingTimeout = setTimeout(() => {
          this.handleTreeRoles(client).then();
          this.scheduler.deleteTimeout("tree-role-handling");
        }, diff - 30_000); // 30 seconds before watering
        this.scheduler.addTimeout("tree-role-handling", roleHandlingTimeout);
      } else {
        this.logger.debug("Less than 30s until watering — handling roles immediately");
        await this.handleTreeRoles(client);
      }

      return diff;
    }
    this.logger.error("Next watering timestamp not found in message");
    return null;
  }

  /**
   * Handles the tree watering event. Sends a notification to the designated channel.
   *
   * @param client The Discord client instance.
   */
  private async handleTreeWatering(client: Client) {
    this.logger.debug("Handling tree watering...");

    // Implementation for handling tree watering
    const channel = client.channels.cache.get(this.CHANNEL_ID) as TextChannel;
    try {
      await channel.send(`L'arbre est prêt à être arrosé ! <@&${this.ROLE_ID}>`);
      this.logger.debug("Sent watering notification.");
      this.nextWateringDate = null;
    } catch (e) {
      this.logger.error(`Failed to send watering notification: ${e}`);
    }
  }

  /**
   * Handles the tree roles to mention users based on their notification preferences.
   * Only called 30s before watering notifications.
   *
   * @param client The Discord client instance.
   */
  private async handleTreeRoles(client: Client) {
    this.logger.debug("Handling tree roles...");

    const mentionableUsers = await this.db.user.findMany({
      where: {
        treeNotifications_Preferences: {
          enabled: {equals: true},
        },
      },
      include: {
        treeNotifications_Preferences: true,
      },
    });

    const channel = (client.channels.cache.get(this.CHANNEL_ID)) as TextChannel;
    const guild = channel.guild;
    const role = guild.roles.cache.get(this.ROLE_ID);

    // We only want to mention users if the next watering time is within their preferred notification window.
    if (!this.nextWateringDate) {
      this.logger.error("No next watering date set.");
      return;
    }
    const toMention = mentionableUsers.filter((user) => {
      // Don't mention the user who watered the tree last.
      if (user.discordId === this.lastWateringUserId) {
        return false;
      }

      const startHour = parseTimeInMinutes(user.treeNotifications_Preferences.startTime);
      const endHour = parseTimeInMinutes(user.treeNotifications_Preferences.endTime);

      const nextWateringHour = this.nextWateringDate.getHours() * 60 + this.nextWateringDate.getMinutes();

      if (startHour <= endHour) {
        return nextWateringHour >= startHour && nextWateringHour <= endHour;
      } else {
        return nextWateringHour >= startHour || nextWateringHour <= endHour;
      }
    });

    if (toMention.length === 0) {
      this.logger.debug("No users to mention for tree notification.");
      return;
    }

    // We now want to give the role only to users who will be mentioned, and remove it from others.
    // Essentially: give role to toMention, remove from mentionableUsers - toMention.
    const toRemove = mentionableUsers.filter(user => !toMention.includes(user));

    for (const user of toMention) {
      try {
        const member = await guild.members.fetch(user.discordId);
        if (!member.roles.cache.has(role.id)) {
          await member.roles.add(role);
          this.logger.debug(`Added tree notification role to user ${user.discordId}`);
        }
      } catch (e) {
        this.logger.error(`Failed to add role to user ${user.discordId}: ${e}`);
      }
    }

    for (const user of toRemove) {
      try {
        const member = await guild.members.fetch(user.discordId);
        if (member.roles.cache.has(role.id)) {
          await member.roles.remove(role);
          this.logger.debug(`Removed tree notification role from user ${user.discordId}`);
        }
      } catch (e) {
        this.logger.error(`Failed to remove role from user ${user.discordId}: ${e}`);
      }
    }
  }
}
