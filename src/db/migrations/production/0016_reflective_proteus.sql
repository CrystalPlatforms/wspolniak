-- Video v2 (#194): backfill ręczny (drizzle-kit nie generuje DML) — przenosi
-- przypięcia post↔wideo do kolumny `posts.videos` zachowując tytuły oraz
-- kolejność (`position`), czyści martwe wideo z albumów, a dopiero potem
-- zrzuca legacy tabele. Uruchamiane razem z 0015 (kolumna z 0015 musi istnieć).
UPDATE "posts" SET "videos" = COALESCE((
	SELECT jsonb_agg(
		jsonb_build_object(
			'youtubeVideoId', v."youtube_video_id",
			'title', v."title",
			'thumbnailUrl', v."thumbnail_url"
		) ORDER BY pv."position"
	)
	FROM "post_videos" pv JOIN "videos" v ON v."id" = pv."video_id"
	WHERE pv."post_id" = "posts"."id"
), '[]'::jsonb)
WHERE EXISTS (SELECT 1 FROM "post_videos" pv WHERE pv."post_id" = "posts"."id");--> statement-breakpoint
DELETE FROM "album_items" WHERE "kind" = 'video';--> statement-breakpoint
DROP TABLE "post_videos" CASCADE;--> statement-breakpoint
DROP TABLE "videos" CASCADE;
