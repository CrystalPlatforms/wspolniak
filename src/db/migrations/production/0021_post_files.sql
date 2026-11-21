CREATE TABLE "post_files" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "post_files_key_idx" ON "post_files" USING btree ("key");--> statement-breakpoint
CREATE INDEX "post_files_post_id_idx" ON "post_files" USING btree ("post_id");