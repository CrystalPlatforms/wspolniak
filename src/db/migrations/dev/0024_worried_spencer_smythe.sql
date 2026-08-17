CREATE TABLE "upload_failures" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"step" text NOT NULL,
	"kind" text NOT NULL,
	"detail" text,
	"file_name" text,
	"file_size" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "upload_failures_created_at_idx" ON "upload_failures" USING btree ("created_at" desc);