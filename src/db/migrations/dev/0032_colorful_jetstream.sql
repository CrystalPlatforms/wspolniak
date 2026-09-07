CREATE TABLE "video_upload_events" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "videos" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "video_upload_events_created_at_idx" ON "video_upload_events" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "instance_config" DROP COLUMN "video_enabled";