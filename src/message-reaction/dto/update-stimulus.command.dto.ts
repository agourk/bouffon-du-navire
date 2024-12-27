import { BooleanOption, StringOption } from "necord";

export class UpdateStimulusCommandDto {
  @StringOption({
    name: "message",
    description: "The stimulus to update",
    required: true,
    autocomplete: true,
  })
  public message: string;

  @StringOption({
    name: "new-message",
    description: "The new message to set",
    required: false,
  })
  public newMessage?: string;

  @BooleanOption({
    name: "keyword",
    description: "Whether the stimulus should be a keyword",
    required: false,
  })
  public keyword?: boolean;

  @BooleanOption({
    name: "stickers",
    description: "Whether the stimulus should be triggered by stickers",
    required: false,
  })
  public stickers?: boolean;
}
