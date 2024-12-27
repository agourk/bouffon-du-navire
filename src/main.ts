import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { Logger, LogLevel } from "@nestjs/common";

const logger = new Logger("Main");

const PORT = process.env.PORT ?? 3000;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: [process.env.LOG_LEVEL as LogLevel ?? "debug"],
  });
  await app.listen(PORT);
}

bootstrap().then(() => {
  logger.log(`Bot started`);
});
