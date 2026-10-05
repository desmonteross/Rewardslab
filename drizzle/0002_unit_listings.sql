CREATE TYPE "public"."listing_status" AS ENUM('LISTED', 'DELISTED');--> statement-breakpoint
CREATE TYPE "public"."listing_sync" AS ENUM('QUEUED', 'SYNCED', 'FAILED');--> statement-breakpoint
CREATE TABLE "unit_listings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"property_id" text NOT NULL,
	"status" "listing_status" DEFAULT 'LISTED' NOT NULL,
	"headline" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"asking_rent" numeric(16, 2) NOT NULL,
	"available_from" timestamp with time zone NOT NULL,
	"sync_status" "listing_sync" DEFAULT 'QUEUED' NOT NULL,
	"sync_message" text,
	"external_ref" text,
	"listed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"listed_by_id" text,
	"listed_by_name" text,
	"delisted_at" timestamp with time zone,
	"delisted_by_id" text,
	"delisted_by_name" text,
	"delist_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "unit_listings" ADD CONSTRAINT "unit_listings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_listings" ADD CONSTRAINT "unit_listings_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_listings" ADD CONSTRAINT "unit_listings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "unit_listings_org_idx" ON "unit_listings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "unit_listings_unit_idx" ON "unit_listings" USING btree ("unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unit_listings_one_live_uq" ON "unit_listings" USING btree ("unit_id") WHERE status = 'LISTED';