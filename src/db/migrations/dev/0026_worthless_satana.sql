DROP INDEX "chat_reactions_message_user_reaction_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "chat_reactions_message_user_idx" ON "chat_reactions" USING btree ("message_id","user_id");