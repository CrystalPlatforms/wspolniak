CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"text" text NOT NULL,
	"reply_to_id" text,
	"reply_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp DEFAULT now() + interval '24 hours' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_reactions" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reaction" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "chat_messages_expires_at_idx" ON "chat_messages" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "chat_messages_created_at_idx" ON "chat_messages" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_reactions_message_user_reaction_idx" ON "chat_reactions" USING btree ("message_id","user_id","reaction");