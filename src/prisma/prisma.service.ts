import { Injectable } from "@nestjs/common";
import { PrismaClient } from "./generated/prisma-client/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class PrismaService extends PrismaClient {
  constructor(private readonly configService: ConfigService) {
    const database = configService.getOrThrow("DATABASE_URL");
    const adapter = new PrismaPg({
      connectionString: database,
    });
    super({adapter});
  }
}
