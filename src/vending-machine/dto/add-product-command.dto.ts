import { StringOption } from "necord";

export class AddProductCommandDto {
  @StringOption({
    name: "name",
    description: "The name of the product to add",
    required: true,
  })
  public name: string;
}
