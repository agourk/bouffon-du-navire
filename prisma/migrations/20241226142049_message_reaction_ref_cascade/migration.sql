-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MessageReaction_Response" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "message" TEXT NOT NULL,
    "stimulusId" TEXT NOT NULL,
    CONSTRAINT "MessageReaction_Response_stimulusId_fkey" FOREIGN KEY ("stimulusId") REFERENCES "MessageReaction_Stimulus" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MessageReaction_Response" ("createdAt", "id", "message", "stimulusId", "updatedAt") SELECT "createdAt", "id", "message", "stimulusId", "updatedAt" FROM "MessageReaction_Response";
DROP TABLE "MessageReaction_Response";
ALTER TABLE "new_MessageReaction_Response" RENAME TO "MessageReaction_Response";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
