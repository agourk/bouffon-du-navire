import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { Logger } from "@nestjs/common";

const logger = new Logger("InteractionsUtils");

export async function throwError(message: string, interaction: ChatInputCommandInteraction) {
  const embed = new EmbedBuilder().setColor("Red").setDescription(message);
  await interaction.reply({embeds: [embed], ephemeral: true}).catch(() => {
    logger.error("Failed to send error message");
  });
}
