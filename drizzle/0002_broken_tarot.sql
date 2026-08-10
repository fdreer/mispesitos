CREATE TABLE "category" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "installment" (
	"id" text PRIMARY KEY NOT NULL,
	"movement_id" text NOT NULL,
	"user_id" text NOT NULL,
	"number" integer NOT NULL,
	"amount_cents" bigint NOT NULL,
	"due_date" date NOT NULL,
	"paid" boolean DEFAULT false NOT NULL,
	"paid_date" date
);
--> statement-breakpoint
CREATE TABLE "movement" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"category_id" text,
	"date" date NOT NULL,
	"currency" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"rate" numeric(12, 4) NOT NULL,
	"direction" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"initial_balance_ars_cents" bigint DEFAULT 0 NOT NULL,
	"initial_balance_usd_cents" bigint DEFAULT 0 NOT NULL,
	"initial_balance_usd_rate" numeric(12, 4) DEFAULT '0' NOT NULL,
	"initial_balance_date" date NOT NULL,
	"preferred_rate" text DEFAULT 'blue' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment" ADD CONSTRAINT "installment_movement_id_movement_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment" ADD CONSTRAINT "installment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement" ADD CONSTRAINT "movement_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement" ADD CONSTRAINT "movement_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_active_unique" ON "category" USING btree ("user_id","name","kind") WHERE archived = false;--> statement-breakpoint
CREATE INDEX "category_user_idx" ON "category" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "installment_user_due_idx" ON "installment" USING btree ("user_id","due_date");--> statement-breakpoint
CREATE INDEX "installment_movement_idx" ON "installment" USING btree ("movement_id");--> statement-breakpoint
CREATE INDEX "movement_user_date_idx" ON "movement" USING btree ("user_id","date");