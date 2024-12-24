import { StringOption } from "necord";

export class RemoveReactionCommandDto {
  @StringOption({
    name: "message",
    description: "The message to remove a reaction to",
    required: true,
    autocomplete: true,
  })
  public message: string;

  @StringOption({
    name: "reaction",
    description: "The reaction to remove",
    required: true,
    autocomplete: true,
  })
  public reaction: number;
}
