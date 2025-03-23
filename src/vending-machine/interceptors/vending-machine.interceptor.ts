import { AutocompleteInterceptor } from "necord";
import { AutocompleteInteraction } from "discord.js";
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class VendingMachineInterceptor extends AutocompleteInterceptor {
  private readonly logger = new Logger(VendingMachineInterceptor.name);

  constructor(private readonly dbService: PrismaService) {
    super();
  }

  public async transformOptions(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused(true);
    this.logger.verbose(`Focused: ${focused.name} - ${focused.value}`);

    // Get all products
    if (focused.name == "product") {
      const products = await this.dbService.vendingMachine_Product.findMany();
      if (!products) return;

      return interaction.respond(products
        .filter(product => product.name.toLowerCase().includes(focused.value.toLowerCase()))
        .map(product => ({
            name: product.name,
            value: product.name,
          }),
        ));
    }

    return interaction.respond([]);
  }
}
