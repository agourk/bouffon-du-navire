import { Prisma } from "@prisma/client";

export type MessageReaction_StimulusWithReactions = Prisma.MessageReaction_StimulusGetPayload<{
  include: { reactions: true }
}>;
