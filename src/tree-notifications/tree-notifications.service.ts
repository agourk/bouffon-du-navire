import { Injectable } from "@nestjs/common";
import { Context, ContextOf, Modal, ModalContext, On, Once, SlashCommand, SlashCommandContext } from "necord";
import { SchedulerRegistry } from "@nestjs/schedule";
import {
  Client,
  EmbedBuilder,
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
import { minutesToHHMM, parseTimeInMinutes } from "../utils/datetime";
import { DiscordLoggerService } from "../logger/discord-logger.service";
import { throwError } from "../utils/interactions.utils";
import { ConfigService } from "@nestjs/config";

/**
 * Service to handle tree watering notifications.
 * Users can configure their notification preferences via a modal.
 */
@Injectable()
export class TreeNotificationsService {
  // TODO: Move these IDs to config/env variables
  private readonly MESSAGE_ID: Snowflake;
  // Channel where the tree message is located
  private readonly MESSAGE_CHANNEL_ID: Snowflake;
  // Channel to send notifications to
  private readonly CHANNEL_ID: Snowflake;
  private readonly ROLE_ID: Snowflake;

  private lastWateringUserId: string | null = null;
  private nextWateringDate: Date | null = null;

  constructor(private readonly logger: DiscordLoggerService, private readonly scheduler: SchedulerRegistry,
              private readonly db: PrismaService, private readonly config: ConfigService) {
    this.logger.setContext(TreeNotificationsService.name);
    this.MESSAGE_ID = this.config.get<string>("TREE_NOTIF_MESSAGE_ID");
    this.MESSAGE_CHANNEL_ID = this.config.get<string>("TREE_NOTIF_MESSAGE_CHANNEL_ID");
    this.CHANNEL_ID = this.config.get<string>("TREE_NOTIF_CHANNEL_ID");
    this.ROLE_ID = this.config.get<string>("TREE_NOTIF_ROLE_ID");
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

    const channel = (await client.channels.fetch(this.MESSAGE_CHANNEL_ID)) as TextChannel;

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
    if (user && user.treeNotifications_Preferences) {
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
                default: user?.treeNotifications_Preferences?.enabled ?? false,
              },
              {
                label: "Désactivé",
                description: "Ne pas recevoir de notifications",
                value: "false",
                default: !(user?.treeNotifications_Preferences?.enabled ?? false),
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
            value: user?.treeNotifications_Preferences?.startTime ?? undefined,
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
            value: user?.treeNotifications_Preferences?.endTime ?? undefined,
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

    // Validate time format HH:MM
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime) || parseTimeInMinutes(startTime) === null || parseTimeInMinutes(endTime) === null) {
      await throwError("Format d'heure invalide ! Veuillez rentrer une heure en format HH:MM (par ex. 13:45).", interaction);
      return;
    }

    this.logger.debug(`User ${interaction.user.id} set tree notifications: enabled=${enabled}, startTime=${startTime}, endTime=${endTime}`);

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

      // Remove any existing role if notifications are disabled
      if (!enabled) {
        const guild = interaction.guild;
        const role = guild.roles.cache.get(this.ROLE_ID);
        const member = await guild.members.fetch(interaction.user.id);
        if (member.roles.cache.has(role.id)) {
          await member.roles.remove(role);
          this.logger.debug(`Removed tree notification role from user ${interaction.user.id} due to disabled notifications`);
        }
      }

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
      await channel.send(`L'arbre est prêt à être arrosé ! <@&${this.ROLE_ID}> :arrow_right: <#${this.MESSAGE_CHANNEL_ID}>`);
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

    const channel = (client.channels.cache.get(this.MESSAGE_CHANNEL_ID)) as TextChannel;
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


  @SlashCommand({
    name: "tree-notifications-info",
    description:
      "Afficher les statistiques des notifications d'arrosage de l'arbre",
  })
  private async treeNotificationsInfoCommand(
    @Context() [interaction]: SlashCommandContext,
  ) {
    this.logger.debug(
      `Fetching tree notifications info for user ${interaction.user.id}...`,
    );

    const allPreferences = await this.db.treeNotifications_Preferences.findMany(
      {
        include: {
          user: true,
        },
      },
    );
    const enabledUsers = allPreferences.filter((pref) => pref.enabled);
    const coverageCounts = this.calculateCoverageCounts(enabledUsers);
    const gaps = this.findCoverageGaps(coverageCounts);
    const embed = this.buildInfoEmbed(
      allPreferences.length,
      enabledUsers.length,
      gaps,
      coverageCounts,
    );

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlagsBitField.Flags.Ephemeral,
    });
  }

  /**
   * Calculates coverage counts for each minute of the day.
   * @param enabledUsers List of users with notifications enabled
   * @returns Array where each index represents coverage count for that minute
   */
  private calculateCoverageCounts(
    enabledUsers: Array<{
      startTime: string;
      endTime: string;
      enabled: boolean;
    }>,
  ): number[] {
    // Create array representing each minute of the day (0-1439)
    // Each element counts how many users have coverage during that minute
    const coverageCounts = new Array(24 * 60).fill(0);

    // Accumulate coverage from all enabled users
    for (const pref of enabledUsers) {
      this.incrementCoverageForRange(coverageCounts, pref.startTime, pref.endTime);
    }

    return coverageCounts;
  }

  /**
   * Calculates time coverage gaps based on enabled user preferences.
   * @param enabledUsers List of users with notifications enabled
   * @returns Array of time gaps with start and end times
   */
  private calculateTimeCoverageGaps(
    enabledUsers: Array<{
      startTime: string;
      endTime: string;
      enabled: boolean;
    }>,
  ): Array<{ start: string; end: string }> {
    const coverageCounts = this.calculateCoverageCounts(enabledUsers);
    return this.findCoverageGaps(coverageCounts);
  }

  /**
   * Increments coverage counts for a given time range.
   * Modifies the array in place to accumulate coverage from multiple users.
   * @param coverageCounts Array where each index represents a minute of the day (0-1439)
   * @param startTime Start time in HH:MM format
   * @param endTime End time in HH:MM format
   */
  private incrementCoverageForRange(
    coverageCounts: number[],
    startTime: string,
    endTime: string,
  ): void {
    const start = parseTimeInMinutes(startTime);
    const end = parseTimeInMinutes(endTime);

    if (start === null || end === null) return;

    if (start <= end) {
      // Normal case: 09:00 to 18:00
      for (let i = start; i <= end; i++) {
        coverageCounts[i]++;
      }
    } else {
      // Overnight case: 22:00 to 02:00
      for (let i = start; i < 24 * 60; i++) {
        coverageCounts[i]++;
      }
      for (let i = 0; i <= end; i++) {
        coverageCounts[i]++;
      }
    }
  }

  /**
   * Finds gaps in time slot coverage.
   * @param coverageCounts Array representing minutes in a day with coverage counts
   * @returns Array of gaps with start and end times
   */
  private findCoverageGaps(
    coverageCounts: number[],
  ): Array<{ start: string; end: string }> {
    const gaps: Array<{ start: string; end: string }> = [];
    let gapStart: number | null = null;

    for (let i = 0; i < coverageCounts.length; i++) {
      if (coverageCounts[i] === 0 && gapStart === null) {
        gapStart = i;
      } else if (coverageCounts[i] > 0 && gapStart !== null) {
        gaps.push(this.formatTimeGap(gapStart, i));
        gapStart = null;
      }
    }

    // Handle gap that wraps around midnight
    if (gapStart !== null) {
      gaps.push(this.formatTimeGap(gapStart, 0));
    }

    return gaps;
  }

  /**
   * Formats a time gap into HH:MM strings.
   * @param startMinute Start minute of the day
   * @param endMinute End minute of the day
   * @returns Object with formatted start and end times
   */
  private formatTimeGap(
    startMinute: number,
    endMinute: number,
  ): { start: string; end: string } {
    return {
      start: minutesToHHMM(startMinute),
      end: endMinute === 0 ? "00:00" : minutesToHHMM(endMinute),
    };
  }

  /**
   * Finds the least covered time ranges (lowest coverage counts).
   * @param coverageCounts Array of coverage counts for each minute
   * @returns Array of time ranges with lowest coverage (up to 3)
   */
  private findLeastCoveredRanges(
    coverageCounts: number[],
  ): Array<{ start: string; end: string; count: number }> {
    const minCoverage = Math.min(...coverageCounts.filter(count => count > 0));
    if (minCoverage === Infinity) return [];

    // Find all ranges with minimum coverage
    const ranges: Array<{ start: string; end: string; count: number }> = [];
    let rangeStart: number | null = null;

    for (let i = 0; i < coverageCounts.length; i++) {
      if (coverageCounts[i] === minCoverage && rangeStart === null) {
        rangeStart = i;
      } else if (coverageCounts[i] !== minCoverage && rangeStart !== null) {
        ranges.push({
          ...this.formatTimeGap(rangeStart, i),
          count: minCoverage,
        });
        rangeStart = null;
      }
    }

    // Handle range that wraps to end of day
    if (rangeStart !== null) {
      ranges.push({
        ...this.formatTimeGap(rangeStart, coverageCounts.length),
        count: minCoverage,
      });
    }

    // Return up to 3 longest ranges
    return ranges
      .sort((a, b) => {
        const durationA = this.calculateRangeDuration(a.start, a.end);
        const durationB = this.calculateRangeDuration(b.start, b.end);
        return durationB - durationA;
      })
      .slice(0, 3);
  }

  /**
   * Calculates duration of a time range in minutes.
   * @param start Start time in HH:MM format
   * @param end End time in HH:MM format
   * @returns Duration in minutes
   */
  private calculateRangeDuration(start: string, end: string): number {
    const startMinutes = parseTimeInMinutes(start) || 0;
    const endMinutes = parseTimeInMinutes(end) || 0;
    
    if (endMinutes >= startMinutes) {
      return endMinutes - startMinutes;
    } else {
      // Overnight range
      return (24 * 60 - startMinutes) + endMinutes;
    }
  }

  /**
   * Builds the info embed with statistics.
   * @param totalUsers Total number of users with preferences
   * @param enabledCount Number of users with notifications enabled
   * @param gaps Array of coverage gaps
   * @param coverageCounts Coverage count for each minute of the day
   * @returns Discord embed with statistics
   */
  private buildInfoEmbed(
    totalUsers: number,
    enabledCount: number,
    gaps: Array<{ start: string; end: string }>,
    coverageCounts: number[],
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor("#2ecc71")
      .setTitle("📊 Statistiques des notifications d'arrosage")
      .addFields([
        {
          name: "👥 Utilisateurs inscrits",
          value: `${totalUsers} utilisateur(s) ont configuré leurs préférences`,
          inline: true,
        },
        {
          name: "✅ Notifications activées",
          value: `${enabledCount} utilisateur(s) recevront des notifications`,
          inline: true,
        },
        {
          name: "\u200b",
          value: "\u200b",
          inline: true,
        },
      ]);

    this.addCoverageFields(embed, gaps, enabledCount, coverageCounts);
    this.addNextWateringField(embed);

    embed.setFooter({
      text: "Configurez vos préférences avec /tree-notifications",
    });

    return embed;
  }

  /**
   * Adds coverage-related fields to the embed.
   * @param embed Discord embed builder
   * @param gaps Array of coverage gaps
   * @param enabledCount Number of enabled users
   * @param coverageCounts Coverage count for each minute of the day
   */
  private addCoverageFields(
    embed: EmbedBuilder,
    gaps: Array<{ start: string; end: string }>,
    enabledCount: number,
    coverageCounts: number[],
  ): void {
    if (gaps.length > 0) {
      const gapText = gaps
        .map((gap) => `• ${gap.start} → ${gap.end}`)
        .join("\n");
      embed.addFields([
        {
          name: "⚠️ Périodes sans couverture",
          value: `Personne ne recevra de notifications pendant ces périodes:\n${gapText}`,
          inline: false,
        },
      ]);
    } else if (enabledCount > 0) {
      embed.addFields([
        {
          name: "✨ Couverture complète",
          value:
            "Au moins une personne recevra des notifications à tout moment de la journée !",
          inline: false,
        },
      ]);
      
      // Show least covered time ranges when full coverage exists
      const leastCovered = this.findLeastCoveredRanges(coverageCounts);
      if (leastCovered.length > 0) {
        const leastCoveredText = leastCovered
          .map((range) => `• ${range.start} → ${range.end} (${range.count} personne(s))`)
          .join("\n");
        embed.addFields([
          {
            name: "📉 Périodes les moins couvertes",
            value: leastCoveredText,
            inline: false,
          },
        ]);
      }
    }
  }

  /**
   * Adds next watering information to the embed if available.
   * @param embed Discord embed builder
   */
  private addNextWateringField(embed: EmbedBuilder): void {
    if (!this.nextWateringDate) return;

    const now = new Date();
    const timeUntil = Math.floor(
      (this.nextWateringDate.getTime() - now.getTime()) / 1000,
    );

    if (timeUntil > 0) {
      const hours = Math.floor(timeUntil / 3600);
      const minutes = Math.floor((timeUntil % 3600) / 60);
      embed.addFields([
        {
          name: "🕐 Prochain arrosage",
          value: `Dans ${hours}h ${minutes}min (<t:${Math.floor(this.nextWateringDate.getTime() / 1000)}:R>)`,
          inline: false,
        },
      ]);
    }
  }
}
