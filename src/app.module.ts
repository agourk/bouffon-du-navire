import { Module } from "@nestjs/common";
import { AppService } from "./app.service";
import { PrismaModule } from "./prisma/prisma.module";
import { NecordModule } from "necord";
import { ConfigModule, ConfigService } from "@nestjs/config";
import * as joi from "joi";
import { IntentsBitField } from "discord.js";
import { MessageReactionModule } from "./message-reaction/message-reaction.module";
import { VendingMachineModule } from './vending-machine/vending-machine.module';
import { ScheduleModule } from "@nestjs/schedule";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: joi.object({
        DISCORD_TOKEN: joi.string().required(),
        DISCORD_DEVELOPMENT_GUILD_ID: joi.string(),
        BUGS_CHANNEL_ID: joi.string().required(),
        PEXELS_API_KEY: joi.string().required(),
      }),
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    NecordModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        token: configService.get("DISCORD_TOKEN"),
        intents: [
          IntentsBitField.Flags.Guilds,
          IntentsBitField.Flags.GuildMessages,
          IntentsBitField.Flags.MessageContent,
          IntentsBitField.Flags.GuildMembers,
        ],
        development: configService.get("DISCORD_DEVELOPMENT_GUILD_ID") ?? undefined,
      }),
    }),
    MessageReactionModule,
    VendingMachineModule],
  providers: [AppService],
})
export class AppModule {
}
