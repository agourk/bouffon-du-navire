import { Injectable, UseInterceptors } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Context, ContextOf, On, Once, Options, SlashCommand, SlashCommandContext } from "necord";
import { Prisma } from "../prisma/generated/prisma-client/client";
import { AddStimulusCommandDto } from "./dto/add-stimulus.command.dto";
import { MessageReaction_StimulusWithReactions } from "./types/stimulus.type";
import { throwError } from "../utils/interactions.utils";
import { MessageReactionInterceptor } from "./interceptors/message-reaction.interceptor";
import { RemoveStimulusCommandDto } from "./dto/remove-stimulus.command.dto";
import { AddReactionsCommandDto } from "./dto/add-reactions.command.dto";
import { APIEmbedField, EmbedBuilder } from "discord.js";
import { UpdateStimulusCommandDto } from "./dto/update-stimulus.command.dto";
import { arrayChoose } from "../utils/array.utils";
import { RemoveReactionCommandDto } from "./dto/remove-reaction.command.dto";
import { PlaceholdersLib } from "./libs/placeholders.lib";
import { DiscordLoggerService } from "../logger/discord-logger.service";

// TODO: Refactor, use interactions everywhere
// TODO: Fix case sensitivity issues
// TODO: Add pagination to list-stimuli command
// TODO: Add server-specific stimuli
// TODO: Fix bug where 2 stimuli with same prefix cause only first to trigger
/**
 * Service that reacts to messages based on predefined stimuli.
 */
@Injectable()
export class MessageReactionService {
  private stimuli: Array<MessageReaction_StimulusWithReactions>;

  constructor(private readonly logger: DiscordLoggerService, private readonly db: PrismaService) {
    this.logger.setContext(MessageReactionService.name);
  }

  @Once("clientReady")
  public async onReady() {
    this.stimuli = await this.db.messageReaction_Stimulus.findMany({include: {reactions: true}});

    this.logger.debug(`Stimuli loaded: [${this.stimuli.map(s => s.message).join(", ")}]`);
  }

  @On("messageCreate")
  public async onMessageCreate(@Context() [message]: ContextOf<"messageCreate">) {
    if (message.author.bot) return;

    this.logger.verbose(`Received message: ${message.content}`);

    // Check if one of the stimuli is in the message
    // If the stimuli is marked as not a keyword, check if the message only contains the stimulus
    // TODO: Case insensitive comparison
    const stimulus = this.stimuli.find(stimulus => {
      const content = message.content.toLowerCase();
      const stickers = message.stickers;

      if (stimulus.keyword) {
        // If the message contains stickers, and the stimulus allows stickers triggers, check if the sticker name contains the stimulus message
        if (stimulus.stickers && stickers.size > 0) {
          return stickers.some(sticker => sticker.name.includes(stimulus.message));
        }

        const contentWords = content.split(/\W+/g);
        return contentWords.includes(stimulus.message) ||
          contentWords.some((_, index) => contentWords.slice(index, index + stimulus.message.length).join("") === stimulus.message);
      } else {
        if (stimulus.stickers && stickers.size > 0) {
          return stickers.some(sticker => sticker.name == stimulus.message);
        }
        return content === stimulus.message;
        // || content.replace(/\W+/g, "") === stimulus.message;
      }
    });
    if (!stimulus) return;

    const answer = arrayChoose(stimulus.reactions).message;
    const placeholdersReplacements = new Map([
      ["USER", message.author.username],
      ["DISPLAY_NAME", message.author.displayName],
      ["MENTION", message.author.toString()],
    ]);
    await message.reply(PlaceholdersLib.parsePlaceholders(answer, placeholdersReplacements));
  }

  // ==== Commands ====
  @SlashCommand({
    name: "add-stimulus",
    description: "Add a stimulus to the bot",
    defaultMemberPermissions: ["ManageGuild"],
  })
  public async addStimulus(@Context() [interaction]: SlashCommandContext, @Options() options: AddStimulusCommandDto) {
    try {
      const stimulus: MessageReaction_StimulusWithReactions | null = await this.db.messageReaction_Stimulus.create({
        data: {
          message: options.message,
          keyword: options.keyword ?? undefined,  // We have to use undefined if null so that the default value is used
          stickers: options.stickers ?? undefined,
          reactions: {
            create: options.reactions.split("|").map(reaction => ({message: reaction})),
          },
        },
        include: {reactions: true},
      });
      this.logger.debug(`Added stimulus: ${stimulus.message}`);

      this.stimuli.push(stimulus);

      await interaction.reply(`Stimulus added: ${stimulus.message}`);
    } catch (e) {
      this.logger.debug(`Failed to add stimulus: ${e.message}`);
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        await throwError("Stimulus already exists", interaction);
        return;
      }
      await throwError("Failed to add stimulus", interaction);
    }
  }

  @SlashCommand({
    name: "list-stimuli",
    description: "List all stimuli in the bot",
  })
  public async listStimuli(@Context() [interaction]: SlashCommandContext) {
    try {
      const stimuliField: APIEmbedField[] = this.stimuli.map((stimulus, index) => ({
        name: `${stimulus.message} ${stimulus.keyword ? "(🔤)" : ""} ${stimulus.stickers ? "(🪧)" : ""}`,
        value: stimulus.reactions.map(reaction => `• ${reaction.message}`).join("\n"),
        inline: index % 3 !== 2,
      }));
      const embed = new EmbedBuilder().setTitle("Stimuli List");
      if (stimuliField.length === 0) {
        embed.setDescription("No stimuli found");
      } else {
        embed.addFields(stimuliField);
      }

      return interaction.reply({embeds: [embed]});
    } catch (e) {
      this.logger.error(`Failed to list stimuli: ${e.message}`);
      await throwError("An error occurred while listing the stimuli", interaction);
    }
  }

  @UseInterceptors(MessageReactionInterceptor)
  @SlashCommand({
    name: "add-reactions",
    description: "Add reactions to a stimulus",
    defaultMemberPermissions: ["ManageGuild"],
  })
  public async addReactions(@Context() [interaction]: SlashCommandContext, @Options() options: AddReactionsCommandDto) {
    const stimulus = this.stimuli.find(s => s.message === options.message);
    if (!stimulus) {
      await throwError("Stimulus not found", interaction);
      return;
    }

    try {
      const reaction = await this.db.messageReaction_Response.create({
        data: {
          message: options.reactions,
          stimulus: {connect: {message: stimulus.message}},
        },
      });
      this.logger.debug(`Added reaction(s): ${reaction.message} to stimulus: ${stimulus.message}`);

      // Update by reference
      // TODO: Explicitly update the stimulus instead of relying on the reference
      stimulus.reactions.push(reaction);

      await interaction.reply(`Reaction(s) added: ${reaction.message} to stimulus: ${stimulus.message}`);
    } catch (e) {
      this.logger.debug(`Failed to add reaction(s): ${e.message}`);
      await throwError("Failed to add reaction(s)", interaction);
    }
  }

  @UseInterceptors(MessageReactionInterceptor)
  @SlashCommand({
    name: "remove-reaction",
    description: "Remove a reaction from a stimulus",
    defaultMemberPermissions: ["ManageGuild"],
  })
  public async removeReaction(@Context() [interaction]: SlashCommandContext, @Options() options: RemoveReactionCommandDto) {
    const stimulus = this.stimuli.find(s => s.message === options.message);
    if (!stimulus) {
      await throwError("Stimulus not found", interaction);
      return;
    }

    const reaction = stimulus.reactions[options.reaction];
    if (!reaction) {
      await throwError("Reaction not found", interaction);
      return;
    }

    try {
      await this.db.messageReaction_Response.delete({where: {id: reaction.id}});
      this.logger.debug(`Removed reaction: ${reaction.message} from stimulus: ${stimulus.message}`);

      stimulus.reactions = stimulus.reactions.filter(r => r.id !== reaction.id);

      await interaction.reply(`Reaction removed: ${reaction.message} from stimulus: ${stimulus.message}`);
    } catch (e) {
      this.logger.debug(`Failed to remove reaction: ${e.message}`);
      await throwError("Failed to remove reaction", interaction);
    }
  }

  @UseInterceptors(MessageReactionInterceptor)
  @SlashCommand({
    name: "update-stimulus",
    description: "Update a stimulus",
    defaultMemberPermissions: ["ManageGuild"],
  })
  public async updateStimulus(@Context() [interaction]: SlashCommandContext, @Options() options: UpdateStimulusCommandDto) {
    const stimulus = this.stimuli.find(s => s.message === options.message);
    if (!stimulus) {
      await throwError("Stimulus not found", interaction);
      return;
    }

    try {
      const updatedStimulus = await this.db.messageReaction_Stimulus.update({
        where: {message: stimulus.message},
        data: {
          message: options.newMessage ?? undefined,
          keyword: options.keyword ?? undefined,
          stickers: options.stickers ?? undefined,
        },
      });
      this.logger.debug(`Updated stimulus: ${stimulus.message}`);

      // Update the stimulus in the array
      Object.assign(stimulus, updatedStimulus);

      // Generate changes embed
      const changes = new EmbedBuilder()
        .setTitle("Stimulus Updated")
        .setDescription(`Updated stimulus: ${stimulus.message}`)
        .setColor("Green");

      if (options.newMessage) {
        changes.addFields({
          name: "Message",
          value: `⚠️ Changed from ${stimulus.message} to ${updatedStimulus.message}`,
        });
      }
      if (options.keyword) {
        changes.addFields({
          name: "Keyword",
          value: `${updatedStimulus.keyword ? "✅ Set" : "❌ Unset"}`,
        });
      }
      if (options.stickers) {
        changes.addFields({
          name: "Stickers",
          value: `${updatedStimulus.stickers ? "✅ Enabled" : "❌ Disabled"}`,
        });
      }

      await interaction.reply({embeds: [changes]});
    } catch (e) {
      this.logger.debug(`Failed to update stimulus: ${e.message}`);
      await throwError("Failed to update stimulus", interaction);
    }
  }

  @UseInterceptors(MessageReactionInterceptor)
  @SlashCommand({
    name: "remove-stimulus",
    description: "Remove a stimulus from the bot",
    defaultMemberPermissions: ["ManageGuild"],
  })
  public async removeStimulus(@Context() [interaction]: SlashCommandContext, @Options() options: RemoveStimulusCommandDto) {
    try {
      const stimulus = await this.db.messageReaction_Stimulus.delete({
        where: {message: options.message},
        include: {reactions: true},
      });
      this.logger.debug(`Removed stimulus: ${stimulus.message}`);

      this.stimuli = this.stimuli.filter(s => s.message !== stimulus.message);

      await interaction.reply(`Stimulus removed: ${stimulus.message}`);
    } catch (e) {
      this.logger.debug(`Failed to remove stimulus: ${e.message}`);
      await throwError("Failed to remove stimulus", interaction);
    }
  }
}
