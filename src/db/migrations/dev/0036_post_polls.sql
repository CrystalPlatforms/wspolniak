CREATE TABLE "post_poll_votes" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"user_id" text NOT NULL,
	"option_index" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "poll" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "post_poll_votes_post_user_idx" ON "post_poll_votes" USING btree ("post_id","user_id");