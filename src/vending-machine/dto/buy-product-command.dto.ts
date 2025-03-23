import { StringOption } from "necord";

export class BuyProductCommandDto {
  @StringOption({
    name: "product",
    description: "The product you want to buy",
    required: true,
    autocomplete: true,
  })
  public product: string;
}
