CREATE TYPE "public"."portal_invite_status" AS ENUM('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."reward_account_kind" AS ENUM('TENANT', 'FUNDING', 'REDEEMED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."reward_bucket" AS ENUM('PENDING', 'AVAILABLE');--> statement-breakpoint
CREATE TYPE "public"."reward_entry_type" AS ENUM('EARN', 'MATURE', 'REDEEM', 'EXPIRE', 'REVERSAL', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."reward_funding_model" AS ENUM('PLATFORM', 'ORGANIZATION', 'PARTNER');--> statement-breakpoint
CREATE TYPE "public"."reward_redemption_status" AS ENUM('REQUESTED', 'FULFILLED', 'FAILED', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."reward_redemption_type" AS ENUM('DEPOSIT_FUND', 'AIRTIME', 'VOUCHER', 'RENT_CREDIT');--> statement-breakpoint
CREATE TYPE "public"."stk_status" AS ENUM('PENDING', 'CONFIRMED', 'FAILED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."valuation_basis" AS ENUM('PROFESSIONAL', 'BANK', 'PURCHASE_PRICE', 'ESTIMATE');--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'TENANT';--> statement-breakpoint
CREATE TABLE "property_valuations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"property_id" text NOT NULL,
	"amount" numeric(16, 2) NOT NULL,
	"valued_at" timestamp with time zone NOT NULL,
	"basis" "valuation_basis" DEFAULT 'ESTIMATE' NOT NULL,
	"valuer_name" text,
	"reference" text,
	"note" text,
	"recorded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reward_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"programme_id" text NOT NULL,
	"kind" "reward_account_kind" NOT NULL,
	"tenant_id" text,
	"organization_id" text,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reward_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_group_id" text NOT NULL,
	"programme_id" text NOT NULL,
	"account_id" text NOT NULL,
	"organization_id" text,
	"tenant_id" text,
	"rule_version_id" text,
	"type" "reward_entry_type" NOT NULL,
	"bucket" "reward_bucket" DEFAULT 'AVAILABLE' NOT NULL,
	"points" integer NOT NULL,
	"narrative" text NOT NULL,
	"source_allocation_id" text,
	"source_payment_id" text,
	"source_invoice_id" text,
	"source_redemption_id" text,
	"reverses_group_id" text,
	"period_year" integer,
	"period_month" integer,
	"days_late" integer,
	"streak_months" integer,
	"transaction_date" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reward_programmes" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"peg_kes_per_point" numeric(10, 4) DEFAULT '1.0000' NOT NULL,
	"maturation_days" integer DEFAULT 30 NOT NULL,
	"expiry_months" integer DEFAULT 24 NOT NULL,
	"funding_model" "reward_funding_model" DEFAULT 'PLATFORM' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reward_redemptions" (
	"id" text PRIMARY KEY NOT NULL,
	"programme_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"organization_id" text,
	"type" "reward_redemption_type" NOT NULL,
	"status" "reward_redemption_status" DEFAULT 'REQUESTED' NOT NULL,
	"points" integer NOT NULL,
	"peg_kes_per_point" numeric(10, 4) NOT NULL,
	"value_amount" numeric(16, 2) NOT NULL,
	"entry_group_id" text,
	"invoice_id" text,
	"provider_reference" text,
	"request_key" text NOT NULL,
	"failure_reason" text,
	"requested_by_id" text,
	"requested_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_redemptions_request_key_uq" UNIQUE("programme_id","request_key")
);
--> statement-breakpoint
CREATE TABLE "reward_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"programme_id" text NOT NULL,
	"version" integer NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"earn_divisor_kes" integer DEFAULT 100 NOT NULL,
	"grace_days" integer DEFAULT 5 NOT NULL,
	"late_days" integer DEFAULT 15 NOT NULL,
	"on_time_bp" integer DEFAULT 10000 NOT NULL,
	"slightly_late_bp" integer DEFAULT 5000 NOT NULL,
	"late_bp" integer DEFAULT 2500 NOT NULL,
	"streak_3_bp" integer DEFAULT 1000 NOT NULL,
	"streak_6_bp" integer DEFAULT 2000 NOT NULL,
	"streak_12_bp" integer DEFAULT 3000 NOT NULL,
	"max_multiplier_bp" integer DEFAULT 13000 NOT NULL,
	"include_service_charge" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_rules_programme_version_uq" UNIQUE("programme_id","version")
);
--> statement-breakpoint
CREATE TABLE "stk_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"invoice_id" text,
	"checkout_request_id" text NOT NULL,
	"phone" text NOT NULL,
	"account_reference" text NOT NULL,
	"amount" numeric(16, 2) NOT NULL,
	"status" "stk_status" DEFAULT 'PENDING' NOT NULL,
	"simulate_after" timestamp with time zone,
	"is_simulated" boolean DEFAULT false NOT NULL,
	"provider_message" text,
	"mpesa_receipt" text,
	"payment_id" text,
	"payment_reference" text,
	"points_awarded" integer,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stk_requests_checkout_uq" UNIQUE("organization_id","checkout_request_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" "portal_invite_status" DEFAULT 'PENDING' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"invited_by_id" text,
	"invited_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_invites_token_uq" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "portal_self_signup" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "property_valuations" ADD CONSTRAINT "property_valuations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_valuations" ADD CONSTRAINT "property_valuations_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_valuations" ADD CONSTRAINT "property_valuations_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_accounts" ADD CONSTRAINT "reward_accounts_programme_id_reward_programmes_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."reward_programmes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_accounts" ADD CONSTRAINT "reward_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_accounts" ADD CONSTRAINT "reward_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_entries" ADD CONSTRAINT "reward_entries_programme_id_reward_programmes_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."reward_programmes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_entries" ADD CONSTRAINT "reward_entries_account_id_reward_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."reward_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_entries" ADD CONSTRAINT "reward_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_entries" ADD CONSTRAINT "reward_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_entries" ADD CONSTRAINT "reward_entries_rule_version_id_reward_rules_id_fk" FOREIGN KEY ("rule_version_id") REFERENCES "public"."reward_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_programmes" ADD CONSTRAINT "reward_programmes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_programme_id_reward_programmes_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."reward_programmes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_invoice_id_rent_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."rent_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_rules" ADD CONSTRAINT "reward_rules_programme_id_reward_programmes_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."reward_programmes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_requests" ADD CONSTRAINT "stk_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_requests" ADD CONSTRAINT "stk_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stk_requests" ADD CONSTRAINT "stk_requests_invoice_id_rent_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."rent_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_invites" ADD CONSTRAINT "tenant_invites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_invites" ADD CONSTRAINT "tenant_invites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "property_valuations_org_idx" ON "property_valuations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "property_valuations_property_idx" ON "property_valuations" USING btree ("property_id","valued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_accounts_tenant_uq" ON "reward_accounts" USING btree ("programme_id","tenant_id") WHERE kind = 'TENANT';--> statement-breakpoint
CREATE INDEX "reward_accounts_programme_idx" ON "reward_accounts" USING btree ("programme_id");--> statement-breakpoint
CREATE INDEX "reward_accounts_tenant_idx" ON "reward_accounts" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_entries_earn_idempotency_uq" ON "reward_entries" USING btree ("source_allocation_id",coalesce("rule_version_id", ''),"account_id") WHERE type = 'EARN';--> statement-breakpoint
CREATE INDEX "reward_entries_group_idx" ON "reward_entries" USING btree ("entry_group_id");--> statement-breakpoint
CREATE INDEX "reward_entries_account_idx" ON "reward_entries" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "reward_entries_tenant_idx" ON "reward_entries" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "reward_entries_origin_idx" ON "reward_entries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "reward_entries_type_idx" ON "reward_entries" USING btree ("type");--> statement-breakpoint
CREATE INDEX "reward_entries_date_idx" ON "reward_entries" USING btree ("transaction_date");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_programmes_platform_uq" ON "reward_programmes" USING btree ("name") WHERE organization_id is null;--> statement-breakpoint
CREATE INDEX "reward_programmes_org_idx" ON "reward_programmes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "reward_redemptions_tenant_idx" ON "reward_redemptions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "reward_redemptions_status_idx" ON "reward_redemptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reward_rules_effective_idx" ON "reward_rules" USING btree ("programme_id","effective_from");--> statement-breakpoint
CREATE INDEX "stk_requests_tenant_idx" ON "stk_requests" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "stk_requests_status_idx" ON "stk_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tenant_invites_org_idx" ON "tenant_invites" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tenant_invites_tenant_idx" ON "tenant_invites" USING btree ("tenant_id");