CREATE TABLE "post_videos" (
	"post_id" text NOT NULL,
	"video_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "post_videos_post_id_video_id_pk" PRIMARY KEY("post_id","video_id")
);
--> statement-breakpoint
CREATE INDEX "post_videos_post_id_idx" ON "post_videos" USING btree ("post_id");