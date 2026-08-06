CREATE TABLE "post_videos" (
	"post_id" text NOT NULL,
	"video_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "post_videos_post_id_video_id_pk" PRIMARY KEY("post_id","video_id")
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" text PRIMARY KEY NOT NULL,
	"youtube_video_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"author_id" text NOT NULL,
	"thumbnail_url" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "videos_youtube_video_id_unique" UNIQUE("youtube_video_id")
);
--> statement-breakpoint
ALTER TABLE "instance_config" ADD COLUMN "youtube_channel_id" text;--> statement-breakpoint
ALTER TABLE "instance_config" ADD COLUMN "youtube_channel_title" text;--> statement-breakpoint
ALTER TABLE "instance_config" ADD COLUMN "youtube_refresh_token" text;--> statement-breakpoint
ALTER TABLE "instance_config" ADD COLUMN "youtube_connected_at" timestamp;--> statement-breakpoint
ALTER TABLE "instance_config" ADD COLUMN "youtube_connected_by" text;--> statement-breakpoint
CREATE INDEX "post_videos_post_id_idx" ON "post_videos" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "videos_created_at_idx" ON "videos" USING btree ("created_at");