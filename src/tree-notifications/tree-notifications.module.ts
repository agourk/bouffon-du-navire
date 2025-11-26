import { Module } from "@nestjs/common";
import { TreeNotificationsService } from "./tree-notifications.service";
import { CacheModule } from "@nestjs/cache-manager";

@Module({
  imports: [CacheModule.register()],
  providers: [TreeNotificationsService],
})
export class TreeNotificationsModule {
}
