import { Catch, ExceptionFilter, Logger } from "@nestjs/common";
import { Channel, Client, EmbedBuilder, TextChannel } from "discord.js";
import { NecordExecutionContext } from "necord";
import { ConfigService } from "@nestjs/config";
import { ExecutionContextHost } from "@nestjs/core/helpers/execution-context-host";

// TODO: Use webhooks to send the error message in case the bot cannot even connect to Discord
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly client: Client, private readonly config: ConfigService) {
  }

  async catch(exception: unknown, host: ExecutionContextHost | NecordExecutionContext) {
    this.logger.error(exception);
    //console.dir(host, {depth: null});

    // Build a message to send to the dev server
    const embed = new EmbedBuilder().setColor("Red").setTitle("Error").setDescription(`An error occurred`);

    embed.addFields([
      {
        name: "Exception",
        value: exception.toString(),
      },
    ]);

    if (host instanceof NecordExecutionContext) {
      //@ts-ignore
      const channelId: string | undefined = host.getArgs().at(0).at(0)?.channelId;
      const channel: Channel | undefined = this.client.channels.cache.get(channelId);

      embed.addFields([
        {
          name: "Channel",
          value: `${channel?.isTextBased ? (channel as TextChannel).name : undefined} (${channel?.id})`,
        },
      ]);
    }

    // Send the message to the dev server
    try {
      await (this.client.channels.cache.get(this.config.get("BUGS_CHANNEL_ID")) as TextChannel).send({embeds: [embed]});
    } catch (e) {
      this.logger.error("Failed to send error message to Discord channel", e);
    }
  }
}
