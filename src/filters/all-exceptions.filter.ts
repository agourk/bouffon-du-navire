import { Catch, ExceptionFilter, Logger } from "@nestjs/common";
import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { NecordExecutionContext } from "necord";
import { ConfigService } from "@nestjs/config";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly client: Client, private readonly config: ConfigService) {
  }

  async catch(exception: unknown, host: NecordExecutionContext) {
    const channelId: string | undefined = host.getArgs().at(0).at(0)?.channelId;
    const channel = this.client.channels.cache.get(channelId);

    // Send a message to the dev server
    const embed = new EmbedBuilder().setColor("Red").setTitle("Error").setDescription(`An error occurred`);
    embed.addFields([
      {name: "Exception", value: exception.toString()},
      {name: "Channel", value: `${channel.isTextBased ? (channel as TextChannel).name : undefined} (${channel.id})`},
    ]);

    // Martin
    await (this.client.channels.cache.get(this.config.get("BUGS_CHANNEL_ID")) as TextChannel).send({embeds: [embed]});

    this.logger.error(exception);
    console.dir(host, {depth: null});
  }
}
