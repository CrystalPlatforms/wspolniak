CREATE TABLE "bookmarks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"post_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "bookmarks_user_id_post_id_idx" ON "bookmarks" USING btree ("user_id","post_id");--> statement-breakpoint
CREATE INDEX "bookmarks_user_id_created_at_idx" ON "bookmarks" USING btree ("user_id","created_at" desc);