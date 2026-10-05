CREATE TABLE "bill_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_categories_name_unique" UNIQUE("name"),
	CONSTRAINT "bill_categories_name_valid" CHECK ("bill_categories"."name" = btrim("bill_categories"."name", E' \t\r\n\u3000') and char_length("bill_categories"."name") between 1 and 20)
);
--> statement-breakpoint
ALTER TABLE "bill_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bill_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"actor_member_id" uuid NOT NULL,
	"reason" text,
	"settlement_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_events_kind_valid" CHECK ("bill_events"."kind" in ('created', 'edited', 'resubmitted', 'canceled', 'paid', 'returned', 'confirmed', 'payment_canceled', 'not_received', 'settled_paid', 'settled_confirmed', 'settlement_payment_canceled', 'settlement_not_received')),
	CONSTRAINT "bill_events_reason_valid" CHECK (case when "bill_events"."kind" = 'returned' then "bill_events"."reason" is not null and ("bill_events"."reason" = btrim("bill_events"."reason", E' \t\r\n\u3000') and char_length("bill_events"."reason") between 1 and 200) else "bill_events"."reason" is null end),
	CONSTRAINT "bill_events_settlement_valid" CHECK (("bill_events"."kind" like 'settle%') = ("bill_events"."settlement_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "bill_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_member_id" uuid,
	"to_member_id" uuid,
	"amount" integer NOT NULL,
	"category_id" uuid NOT NULL,
	"title" text NOT NULL,
	"memo" text,
	"occurred_on" date NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"settlement_id" uuid,
	"created_by" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bills_created_by_request_id_unique" UNIQUE("created_by","request_id"),
	CONSTRAINT "bills_parties_valid" CHECK ("bills"."from_member_id" is distinct from "bills"."to_member_id"),
	CONSTRAINT "bills_amount_valid" CHECK ("bills"."amount" between 1 and 9999999),
	CONSTRAINT "bills_title_valid" CHECK ("bills"."title" = btrim("bills"."title", E' \t\r\n\u3000') and char_length("bills"."title") between 1 and 50),
	CONSTRAINT "bills_memo_valid" CHECK ("bills"."memo" is null or ("bills"."memo" = btrim("bills"."memo", E' \t\r\n\u3000') and char_length("bills"."memo") between 1 and 500)),
	CONSTRAINT "bills_occurred_on_valid" CHECK ("bills"."occurred_on" >= '2020-01-01'),
	CONSTRAINT "bills_status_valid" CHECK ("bills"."status" in ('requested', 'returned', 'paid', 'confirmed', 'canceled')),
	CONSTRAINT "bills_settlement_status" CHECK ("bills"."settlement_id" is null or "bills"."status" in ('paid', 'confirmed'))
);
--> statement-breakpoint
ALTER TABLE "bills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payer_member_id" uuid,
	"receiver_member_id" uuid,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'paid' NOT NULL,
	"paid_by" uuid NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"reverted_by" uuid,
	"reverted_at" timestamp with time zone,
	CONSTRAINT "settlements_parties_valid" CHECK ("settlements"."payer_member_id" is distinct from "settlements"."receiver_member_id"),
	CONSTRAINT "settlements_amount_valid" CHECK ("settlements"."amount" >= 0),
	CONSTRAINT "settlements_status_valid" CHECK ("settlements"."status" in ('paid', 'confirmed', 'reverted')),
	CONSTRAINT "settlements_confirmed_consistent" CHECK (("settlements"."status" = 'confirmed') = ("settlements"."confirmed_by" is not null and "settlements"."confirmed_at" is not null)),
	CONSTRAINT "settlements_reverted_consistent" CHECK (("settlements"."status" = 'reverted') = ("settlements"."reverted_by" is not null and "settlements"."reverted_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "settlements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bill_events" ADD CONSTRAINT "bill_events_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_events" ADD CONSTRAINT "bill_events_actor_member_id_members_id_fk" FOREIGN KEY ("actor_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_events" ADD CONSTRAINT "bill_events_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_from_member_id_members_id_fk" FOREIGN KEY ("from_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_to_member_id_members_id_fk" FOREIGN KEY ("to_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_category_id_bill_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."bill_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_created_by_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_payer_member_id_members_id_fk" FOREIGN KEY ("payer_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_receiver_member_id_members_id_fk" FOREIGN KEY ("receiver_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_paid_by_members_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_confirmed_by_members_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_reverted_by_members_id_fk" FOREIGN KEY ("reverted_by") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bill_events_bill_idx" ON "bill_events" USING btree ("bill_id","created_at");--> statement-breakpoint
CREATE INDEX "bills_from_idx" ON "bills" USING btree ("from_member_id","status");--> statement-breakpoint
CREATE INDEX "bills_to_idx" ON "bills" USING btree ("to_member_id","status");--> statement-breakpoint
CREATE INDEX "bills_settlement_idx" ON "bills" USING btree ("settlement_id");--> statement-breakpoint
CREATE INDEX "settlements_payer_idx" ON "settlements" USING btree ("payer_member_id","status");--> statement-breakpoint
CREATE INDEX "settlements_receiver_idx" ON "settlements" USING btree ("receiver_member_id","status");--> statement-breakpoint
-- 最初のカテゴリー5つ（MONEY-F-013/AC-2）。手で足した。並びを決めるため登録の日時を1マイクロ秒ずつずらす
INSERT INTO "bill_categories" ("name", "created_at") VALUES
	('医療費', now()),
	('食費', now() + interval '1 microsecond'),
	('交通費', now() + interval '2 microseconds'),
	('日用品', now() + interval '3 microseconds'),
	('その他', now() + interval '4 microseconds');
