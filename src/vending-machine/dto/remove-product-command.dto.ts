import { StringOption } from "necord";

export class RemoveProductCommandDto {
  @StringOption({
    name: "name",
    description: "The name of the product to remove",
    required: true,
    autocomplete: true,
  })
  public name: string;
}
