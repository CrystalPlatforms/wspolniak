DROP TABLE "chat_messages" CASCADE;--> statement-breakpoint
DROP TABLE "chat_poll_votes" CASCADE;--> statement-breakpoint
DROP TABLE "chat_reactions" CASCADE;--> statement-breakpoint
ALTER TABLE "instance_config" DROP COLUMN "chat_enabled";