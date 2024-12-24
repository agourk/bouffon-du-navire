import { StringOption } from "necord";

export class RemoveStimulusCommandDto {
  @StringOption({
    name: "message",
    description: "The message reaction to remove",
    required: true,
    autocomplete: true,
  })
  public message: string;
}
