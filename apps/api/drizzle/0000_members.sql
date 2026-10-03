CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" uuid,
	"email" text,
	"display_name" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_parent" boolean DEFAULT false NOT NULL,
	"is_cook" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
