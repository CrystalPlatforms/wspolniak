CREATE TABLE "chat_poll_votes" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"user_id" text NOT NULL,
	"option_index" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "kind" text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "payload" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_poll_votes_message_user_idx" ON "chat_poll_votes" USING btree ("message_id","user_id");