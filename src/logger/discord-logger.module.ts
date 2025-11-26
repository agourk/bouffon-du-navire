import { Global, Module } from "@nestjs/common";
import { DiscordLoggerService } from "./discord-logger.service";

@Global()
@Module({
  providers: [DiscordLoggerService],
  exports: [DiscordLoggerService],
})
export class DiscordLoggerModule {
}
