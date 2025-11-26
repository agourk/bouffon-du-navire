import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { Logger, LogLevel } from "@nestjs/common";
import { AllExceptionsFilter } from "./filters/all-exceptions.filter";
import { Client } from "discord.js";
import { ConfigService } from "@nestjs/config";
import { DiscordLoggerService } from "./logger/discord-logger.service";

const logger = new Logger("Main");

const PORT = process.env.PORT ?? 3000;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: [process.env.LOG_LEVEL as LogLevel ?? "debug"],
  });

  const client = app.get(Client);
  const config = app.get(ConfigService);
  app.useGlobalFilters(new AllExceptionsFilter(client, config));
  app.useLogger(await app.resolve(DiscordLoggerService));

  await app.listen(PORT);
}

bootstrap().then(() => {
  logger.log(`Bot started`);
});
