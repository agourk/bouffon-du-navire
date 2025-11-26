import { ConsoleLogger, Injectable, Scope } from "@nestjs/common";
import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { ConfigService } from "@nestjs/config";

@Injectable({scope: Scope.TRANSIENT})
export class DiscordLoggerService extends ConsoleLogger {
  constructor(private readonly client: Client, private readonly config: ConfigService) {
    super();
  }

  /**
   * Write a 'verbose' level log, if the configured level allows for it.
   * Prints to stdout with newline, and also sends to Discord if `send` is true.
   *
   * @param message The message to log
   * @param context
   * @param send Whether to send the log to Discord (default: false)
   */
  override verbose(message: any, context?: string, send?: boolean) {
    send = send ?? false;
    if (send) {
      this.sendToDiscord(message, "verbose").then();
    }
    context ? super.verbose(message, context) : super.verbose(message);
  }

  /**
   * Write a 'debug' level log, if the configured level allows for it.
   * Prints to stdout with newline, and also sends to Discord if `send` is true.
   *
   * @param message The message to log
   * @param context
   * @param send Whether to send the log to Discord (default: false)
   */
  override debug(message: any, context?: string, send?: boolean) {
    send = send ?? false;
    if (send) {
      this.sendToDiscord(message, "debug").then();
    }
    context ? super.debug(message, context) : super.debug(message);
  }

  /**
   * Write a 'log' level log, if the configured level allows for it.
   * Prints to stdout with newline, and also sends to Discord if `send` is true.
   *
   * @param message The message to log
   * @param context
   * @param send Whether to send the log to Discord (default: false)
   */
  override log(message: any, context?: string, send?: boolean) {
    send = send ?? false;
    if (send) {
      this.sendToDiscord(message, "log").then();
    }
    context ? super.log(message, context) : super.log(message);
  }

  /**
   * Write a 'warn' level log, if the configured level allows for it.
   * Prints to stderr with newline, and also sends to Discord if `send` is true.
   *
   * @param message The message to log
   * @param context
   * @param send Whether to send the log to Discord (default: false)
   */
  override warn(message: any, context?: string, send?: boolean) {
    send = send ?? false;
    if (send) {
      this.sendToDiscord(message, "warn").then();
    }
    context ? super.warn(message, context) : super.warn(message);
  }

  /**
   * Write an 'error' level log, if the configured level allows for it.
   * Prints to stderr with newline, and also sends to Discord by default.
   *
   * @param message The message to log
   * @param trace
   * @param context
   * @param send Whether to send the log to Discord (default: true)
   */
  override error(message: any, trace?: string, context?: string, send?: boolean) {
    send = send ?? true;
    if (send) {
      this.sendToDiscord(message, "error").then();
    }
    context || trace ? super.error(message, trace, context) : super.error(message);
  }

  /**
   * Sends a log message to the Discord bugs channel.
   *
   * @param message The message to send
   * @param level The log level
   */
  private async sendToDiscord(message: string, level: "log" | "error" | "warn" | "debug" | "verbose") {
    // Build a message to send to the dev server
    const embed = new EmbedBuilder().setColor("Red").setTitle(level);

    embed.addFields([
      {
        name: "Log Message",
        value: message,
      },
    ]);

    // Send the message to the dev server
    const bugChannel = this.client.channels.cache.get(this.config.get("BUGS_CHANNEL_ID")) as TextChannel;
    if (!bugChannel.isTextBased()) {
      console.error("BUGS_CHANNEL_ID is not a text channel");
      return;
    }
    try {
      await bugChannel.send({embeds: [embed]});
    } catch (e) {
      console.error("Failed to send log message to Discord:", e);
    } finally {
      this.debug("Sent log message to Discord bugs channel");
    }
  }
}
