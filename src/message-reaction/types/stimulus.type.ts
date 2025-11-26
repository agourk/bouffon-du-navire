import { Prisma } from "../../prisma/generated/prisma-client/client";

export type MessageReaction_StimulusWithReactions = Prisma.MessageReaction_StimulusGetPayload<{
  include: { reactions: true }
}>;
