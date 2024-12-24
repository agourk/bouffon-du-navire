import { AutocompleteInterceptor } from "necord";
import { AutocompleteInteraction } from "discord.js";
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class MessageReactionInterceptor extends AutocompleteInterceptor {
  private readonly logger = new Logger(MessageReactionInterceptor.name);

  constructor(private readonly dbService: PrismaService) {
    super();
  }

  public async transformOptions(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused(true);
    this.logger.verbose(`Focused: ${focused.name} - ${focused.value}`);

    // Get all stimuli
    if (focused.name == "message") {
      const stimuli = await this.dbService.messageReaction_Stimulus.findMany({include: {reactions: true}});
      if (!stimuli) return;

      return interaction.respond(stimuli
        .filter(stimulus => stimulus.message.toLowerCase().startsWith(focused.value.toLowerCase()))
        .map(stimulus => ({name: stimulus.message, value: stimulus.message})),
      );
    }

    // Remove reaction command
    if (interaction.commandName == "remove-reaction" && focused.name == "reaction") {
      const message = interaction.options.getString("message");
      const stimulus = await this.dbService.messageReaction_Stimulus.findUnique({
        where: {message},
        include: {reactions: true},
      });
      if (!stimulus) return interaction.respond([]);

      return interaction.respond(stimulus.reactions
        .filter(reaction => reaction.message.toLowerCase().startsWith(focused.value.toLowerCase()))
        .map((reaction, index) => ({name: reaction.message, value: `${index}`})),
      );
    }

    return interaction.respond([]);
  }
}
