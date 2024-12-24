import { Module } from "@nestjs/common";
import { MessageReactionService } from "./message-reaction.service";
import { CacheModule } from "@nestjs/cache-manager";
import { MessageReactionInterceptor } from "./interceptors/message-reaction.interceptor";

@Module({
  imports: [CacheModule.register()],
  providers: [MessageReactionService, MessageReactionInterceptor],
  exports: [MessageReactionService],
})
export class MessageReactionModule {
}
