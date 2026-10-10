-- 予約の重なりを排他制約で防ぐための拡張（design.md「重なりの防ぎ方」）。手で足した
-- PGlite には extensions スキーマが無いので先に作る（Supabase ではすでにあり、害は無い）
create schema if not exists extensions;--> statement-breakpoint
create extension if not exists btree_gist with schema extensions;--> statement-breakpoint
CREATE TABLE "car_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"car_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"destination" text,
	"memo" text,
	"version" integer DEFAULT 1 NOT NULL,
	"request_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "car_reservations_member_id_request_id_unique" UNIQUE("member_id","request_id"),
	CONSTRAINT "car_reservations_starts_at_minute" CHECK (date_trunc('minute', "car_reservations"."starts_at") = "car_reservations"."starts_at"),
	CONSTRAINT "car_reservations_ends_at_minute" CHECK (date_trunc('minute', "car_reservations"."ends_at") = "car_reservations"."ends_at"),
	CONSTRAINT "car_reservations_period_valid" CHECK ("car_reservations"."ends_at" > "car_reservations"."starts_at"),
	CONSTRAINT "car_reservations_destination_valid" CHECK ("car_reservations"."destination" is null or ("car_reservations"."destination" = btrim("car_reservations"."destination", E' \t\r\n\u3000') and char_length("car_reservations"."destination") between 1 and 50)),
	CONSTRAINT "car_reservations_memo_valid" CHECK ("car_reservations"."memo" is null or ("car_reservations"."memo" = btrim("car_reservations"."memo", E' \t\r\n\u3000') and char_length("car_reservations"."memo") between 1 and 500))
);
--> statement-breakpoint
ALTER TABLE "car_reservations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cars_name_unique" UNIQUE("name"),
	CONSTRAINT "cars_name_valid" CHECK ("cars"."name" = btrim("cars"."name", E' \t\r\n\u3000') and char_length("cars"."name") between 1 and 20)
);
--> statement-breakpoint
ALTER TABLE "cars" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "car_reservations" ADD CONSTRAINT "car_reservations_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car_reservations" ADD CONSTRAINT "car_reservations_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "car_reservations_ends_at_idx" ON "car_reservations" USING btree ("ends_at");--> statement-breakpoint
-- 同じ車で [開始, 終了) が重なる予約を拒む（CAR-F-004）。Drizzle のスキーマでは書けないので手で足した
ALTER TABLE "car_reservations" ADD CONSTRAINT "car_reservations_no_overlap" EXCLUDE USING gist ("car_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&);--> statement-breakpoint
-- 最初の車（CAR-F-001/AC-6）。手で足した
INSERT INTO "cars" ("name") VALUES ('BMW');
