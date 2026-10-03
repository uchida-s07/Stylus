ALTER TABLE "members" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "display_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_auth_user_id_unique" UNIQUE("auth_user_id");--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_email_unique" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_email_not_empty" CHECK ("members"."email" <> '');--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_email_lowercase" CHECK ("members"."email" = lower("members"."email"));--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_display_name_not_blank" CHECK (btrim("members"."display_name", E' \t\r\n\u3000') <> '');