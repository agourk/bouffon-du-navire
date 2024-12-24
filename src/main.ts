import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { Logger } from "@nestjs/common";

const logger = new Logger("Main");
const VERBOSE = false;

const PORT = process.env.PORT ?? 3000;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ["log", "error", "warn", "debug", VERBOSE ? "verbose" : undefined],
  });
  await app.listen(PORT);
}

bootstrap().then(() => {
  logger.log(`Server started on port ${PORT}`);
});
