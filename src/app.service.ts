import { Injectable } from "@nestjs/common";
import { ActivityType } from "discord.js";
import { Context, ContextOf, On, Once } from "necord";
import { DiscordLoggerService } from "./logger/discord-logger.service";

@Injectable()
export class AppService {
  constructor(private readonly logger: DiscordLoggerService) {
    this.logger.setContext(AppService.name);
  }

  @Once("clientReady")
  public onReady(@Context() [client]: ContextOf<"clientReady">) {
    this.logger.log(`Bot logged in as ${client.user.username}`);
    client.user.setActivity("les Fragilités Loliennes", {type: ActivityType.Listening});
  }

  @On("warn")
  public onWarn(@Context() [info]: ContextOf<"warn">) {
    this.logger.warn(info, undefined, true);
  }
}
