CREATE TABLE "album_items" (
	"id" text PRIMARY KEY NOT NULL,
	"album_id" text NOT NULL,
	"kind" text NOT NULL,
	"ref" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "albums" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_id" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "album_items_album_id_kind_ref_idx" ON "album_items" USING btree ("album_id","kind","ref");--> statement-breakpoint
CREATE INDEX "album_items_album_id_created_at_idx" ON "album_items" USING btree ("album_id","created_at" asc);--> statement-breakpoint
CREATE INDEX "albums_created_at_idx" ON "albums" USING btree ("created_at" desc);