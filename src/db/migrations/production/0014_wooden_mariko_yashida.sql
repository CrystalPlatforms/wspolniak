ALTER TABLE "instance_config" ADD COLUMN "ai_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ai_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ai_blocked" boolean DEFAULT false NOT NULL;