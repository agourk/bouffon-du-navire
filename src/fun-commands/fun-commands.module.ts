import { Module } from "@nestjs/common";
import { FunCommandsService } from "./fun-commands.service";

@Module({
  providers: [FunCommandsService],
})
export class FunCommandsModule {
}
