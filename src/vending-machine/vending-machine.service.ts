import { Inject, Injectable, Logger, UseInterceptors } from "@nestjs/common";
import { Cache, CACHE_MANAGER } from "@nestjs/cache-manager";
import { Context, createCommandGroupDecorator, On, Options, SlashCommandContext, Subcommand } from "necord";
import { PrismaService } from "../prisma/prisma.service";
import { VendingMachine_Product } from "@prisma/client";
import { SchedulerRegistry } from "@nestjs/schedule";
import { type createClient, PhotosWithTotalResults } from "pexels";
import { throwError } from "src/utils/interactions.utils";
import { EmbedBuilder } from "discord.js";
import { VendingMachineInterceptor } from "./interceptors/vending-machine.interceptor";
import { AddProductCommandDto } from "./dto/add-product-command.dto";
import { BuyProductCommandDto } from "./dto/buy-product-command.dto";
import { RemoveProductCommandDto } from "./dto/remove-product-command.dto";

export const VendingMachineCommandDecorator = createCommandGroupDecorator({
  name: "vending-machine",
  description: "Vending Machine Commands",
});

@Injectable()
@VendingMachineCommandDecorator()
export class VendingMachineService {
  private readonly logger = new Logger(VendingMachineService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache, private readonly prisma: PrismaService,
              private readonly schedulerRegistry: SchedulerRegistry, @Inject("Pexels") private readonly pexels: ReturnType<typeof createClient>) {
  }

  @On("ready")
  public async onReady() {
    await this.cacheManager.set("vending-machine:products", await this.prisma.vendingMachine_Product.findMany());
  }

  @UseInterceptors(VendingMachineInterceptor)
  @Subcommand({
    name: "buy",
    description: "Buy a product from the vending machine",
  })
  public async buy(@Context() [interaction]: SlashCommandContext, @Options() options: BuyProductCommandDto) {
    try {
      const products = await this.cacheManager.get("vending-machine:products") as VendingMachine_Product[];
      const product = options.product;

      if (!products.map((product) => product.name).includes(product)) {
        return throwError("Product not found!", interaction);
      }

      if (await this.cacheManager.get(`vending-machine:timeout:${interaction.user.id}`)) {
        this.logger.verbose(`User ${interaction.user.id} tried to buy on timeout`);
        return throwError("Doucement mon gourmand, attend un peu !", interaction);
      }

      // Log the purchase
      await this.prisma.vendingMachine_Buy.create({
        data: {
          product: {
            connect: {
              id: products.find((p) => p.name === product).id,
            },
          },
          user: {
            connectOrCreate: {
              where: {
                discordId: interaction.user.id,
              },
              create: {
                discordId: interaction.user.id,
              },
            },
          },
        },
      });
      this.logger.log(`User ${interaction.user.id} bought a ${product}`);

      // Cache the fact that the user has bought a product
      await this.cacheManager.set(`vending-machine:timeout:${interaction.user.id}`, true);
      this.schedulerRegistry.addTimeout(`vending-machine:timeout:${interaction.user.id}`, setTimeout(async () => {
        this.logger.verbose(`User ${interaction.user.id} can buy again`);
        await this.cacheManager.del(`vending-machine:timeout:${interaction.user.id}`);
        this.schedulerRegistry.deleteTimeout(`vending-machine:timeout:${interaction.user.id}`);
      }, 1000 * 10));

      /// Get random picture
      // Check if the pictures are already cached, if not, fetch them
      if (!await this.cacheManager.get(`vending-machine:pictures:${product}`)) {
        let photos = await this.pexels.photos.search({query: product, per_page: 80});
        if ("error" in photos && photos.error) {
          this.logger.error(photos.error);
          await throwError("An error occurred while fetching the pictures!", interaction);
        }
        photos = photos as PhotosWithTotalResults;

        await this.cacheManager.set(`vending-machine:pictures:${product}`, photos);
      }

      const photos = (await this.cacheManager.get(`vending-machine:pictures:${product}`) as PhotosWithTotalResults).photos;
      const randomPhoto = photos[Math.floor(Math.random() * photos.length)];

      const embed = new EmbedBuilder()
        .setTitle("Vending Machine")
        .setDescription(`**${interaction.user.displayName} bought a ${product}!**`)
        .setColor("Gold")
        .setImage(randomPhoto.src.original)
        .setFooter({text: `Picture by ${randomPhoto.photographer}, provided by Pexels (https://www.pexels.com)`});

      return interaction.reply({embeds: [embed]});
    } catch (e) {
      this.logger.error(`Failed to buy product: ${e}`);
      return throwError("An error occurred while buying the product!", interaction);
    }
  }

  @Subcommand({
    name: "products",
    description: "List all products available in the vending machine",
  })
  public async listProducts(@Context() [interaction]: SlashCommandContext) {
    try {
      const products = await this.cacheManager.get("vending-machine:products") as VendingMachine_Product[];
      const embed = new EmbedBuilder()
        .setTitle("Vending Machine Products")
        .setColor("Gold")
        .setDescription(products.reduce(
          (acc, product) => acc + `- ${product.name}\n`,
          "",
        ));

      return interaction.reply({embeds: [embed]});
    } catch (e) {
      this.logger.error(`Failed to fetch products: ${e}`);
      return throwError("An error occurred while listing the products!", interaction);
    }
  }
}

@Injectable()
@VendingMachineCommandDecorator({
  name: "admin",
  description: "Vending Machine Admin Commands",
  defaultMemberPermissions: ["ManageGuild"],
})
export class VendingMachineAdminService {
  private readonly logger = new Logger(VendingMachineAdminService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache, private readonly prisma: PrismaService) {
  }

  @Subcommand({
    name: "add-product",
    description: "Add a product to the vending machine",
  })
  public async addProduct(@Context() [interaction]: SlashCommandContext, @Options() options: AddProductCommandDto) {
    try {
      await this.prisma.vendingMachine_Product.create({
        data: {
          name: options.name,
        },
      });

      const products = await this.cacheManager.get("vending-machine:products") as VendingMachine_Product[];
      products.push({name: options.name} as VendingMachine_Product);
      await this.cacheManager.set("vending-machine:products", products);

      this.logger.log(`Product added: "${options.name}"`);

      return interaction.reply(`[Vending Machine] Product "${options.name}" added!`);
    } catch (e) {
      this.logger.error(`Failed to add product: ${e}`);
      return throwError("An error occurred while adding the product!", interaction);
    }
  }

  @UseInterceptors(VendingMachineInterceptor)
  @Subcommand({
    name: "remove-product",
    description: "Remove a product from the vending machine",
  })
  public async removeProduct(@Context() [interaction]: SlashCommandContext, @Options() options: RemoveProductCommandDto) {
    try {
      const product = (await this.cacheManager.get("vending-machine:products") as VendingMachine_Product[]).find((product) => product.name === options.name);
      if (!product) {
        return throwError("Product not found!", interaction);
      }

      await this.prisma.vendingMachine_Product.delete({where: {id: product.id}});

      const products = await this.cacheManager.get("vending-machine:products") as VendingMachine_Product[];
      await this.cacheManager.set("vending-machine:products", products.filter((p) => p.name !== options.name));

      this.logger.log(`Product removed: "${options.name}"`);

      return interaction.reply(`[Vending Machine] Product "${options.name}" removed!`);
    } catch (e) {
      this.logger.error(`Failed to remove product: ${e}`);
      return throwError("An error occurred while removing the product!", interaction);
    }
  }
}
