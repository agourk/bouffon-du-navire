import { PrismaClient } from "../../src/prisma/generated/prisma-client/client";
import * as fs from "fs";
import * as path from "path";
import { Stimulus } from "./message-reaction/stimuli";
import { Product } from "./vending-machine/product";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({connectionString: process.env.DATABASE_URL!});
const prisma = new PrismaClient({adapter});

async function main() {
  // message-reaction
  const stimuli: Stimulus[] = JSON.parse(fs.readFileSync(`${path.dirname(require.main.filename)}/message-reaction/stimuli.json`, "utf-8")).stimuli;
  for (const stimulus of stimuli) {
    await prisma.messageReaction_Stimulus.upsert({
      where: {message: stimulus.message},
      update: {},
      create: {
        message: stimulus.message,
        keyword: stimulus.keyword,
        reactions: {
          create: stimulus.reactions.map(reaction => ({message: reaction})),
        },
      },
      include: {reactions: true},
    });
  }

  // vending-machine
  const products: Product[] = JSON.parse(fs.readFileSync(`${path.dirname(require.main.filename)}/vending-machine/products.json`, "utf-8")).products;
  for (const product of products) {
    await prisma.vendingMachine_Product.upsert({
      where: {name: product.name},
      update: {},
      create: {
        name: product.name,
      },
    });
  }
}

main()
  .catch(e => {
    throw e;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
