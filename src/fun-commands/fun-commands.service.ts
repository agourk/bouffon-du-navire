import { Injectable } from "@nestjs/common";
import { Context, Options, SlashCommand, SlashCommandContext } from "necord";
import { SayCommandDto } from "./dto/say.command.dto";
import { MessageFlagsBitField } from "discord.js";
import { DiscordLoggerService } from "../logger/discord-logger.service";

@Injectable()
export class FunCommandsService {
  constructor(private readonly logger: DiscordLoggerService) {
    this.logger.setContext(FunCommandsService.name);
  }

  @SlashCommand({
    name: "say",
    description: "Make the bot say something",
    defaultMemberPermissions: ["ManageGuild"],
  })
  async say(@Context() [interaction]: SlashCommandContext, @Options() options: SayCommandDto) {
    if (options.reply) {
      const replyMessage = await interaction.channel.messages.fetch(options.reply);
      await replyMessage.reply(options.message);
    } else {
      await interaction.channel.send(options.message);
    }
    await interaction.reply({content: "Message sent!", flags: MessageFlagsBitField.Flags.Ephemeral});
  }
}
