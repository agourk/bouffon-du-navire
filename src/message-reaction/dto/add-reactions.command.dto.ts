import { StringOption } from "necord";

export class AddReactionsCommandDto {
  @StringOption({
    name: "message",
    description: "The message to add reaction(s) to",
    required: true,
    autocomplete: true,
  })
  public message: string;

  @StringOption({
    name: "reactions",
    description: "The reaction(s) to add to the message, separated by vertical bars",
    required: true,
  })
  public reactions: string;
}
