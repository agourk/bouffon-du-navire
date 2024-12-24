import { StringOption } from "necord";

export class ToggleKeywordCommandDto {
  @StringOption({
    name: "message",
    description: "The message reaction to toggle the keyword setting",
    required: true,
    autocomplete: true,
  })
  public message: string;
}
