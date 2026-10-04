CREATE TYPE "public"."approval_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."billing_run_status" AS ENUM('RUNNING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."charge_frequency" AS ENUM('MONTHLY', 'QUARTERLY', 'ANNUAL', 'ONE_OFF');--> statement-breakpoint
CREATE TYPE "public"."charge_type" AS ENUM('RENT', 'SERVICE_CHARGE', 'UTILITY', 'WATER', 'ELECTRICITY', 'PARKING', 'PENALTY', 'DEPOSIT', 'CREDIT', 'ADJUSTMENT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."commission_scope" AS ENUM('GLOBAL', 'ORGANIZATION', 'LANDLORD', 'PROPERTY');--> statement-breakpoint
CREATE TYPE "public"."commission_status" AS ENUM('PENDING', 'EARNED', 'SETTLED', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('LEASE', 'NATIONAL_ID', 'KRA_PIN', 'RECEIPT', 'INVOICE', 'EXPENSE', 'PROPERTY', 'INSPECTION', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."erits_period_status" AS ENUM('OPEN', 'READY_FOR_REVIEW', 'UNDER_REVIEW', 'SUBMITTED', 'ACCEPTED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."erits_status" AS ENUM('NOT_REGISTERED', 'PENDING', 'REGISTERED', 'REQUIRES_ATTENTION', 'SYNC_FAILED');--> statement-breakpoint
CREATE TYPE "public"."exception_severity" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."exception_status" AS ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'IGNORED');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('MAINTENANCE', 'SECURITY', 'CLEANING', 'UTILITIES', 'INSURANCE', 'RATES', 'REPAIRS', 'MANAGEMENT', 'PROFESSIONAL_FEES', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."expense_payment_status" AS ENUM('UNPAID', 'PARTIALLY_PAID', 'PAID');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('CONNECTED', 'SANDBOX', 'AVAILABLE', 'COMING_SOON', 'DISCONNECTED', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('DRAFT', 'DUE', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."landlord_type" AS ENUM('INDIVIDUAL', 'COMPANY');--> statement-breakpoint
CREATE TYPE "public"."lease_status" AS ENUM('DRAFT', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'TERMINATED', 'RENEWED');--> statement-breakpoint
CREATE TYPE "public"."ledger_account" AS ENUM('CASH_MPESA', 'CASH_BANK', 'CASH_ON_HAND', 'RENT_RECEIVABLE', 'RENT_INCOME', 'SERVICE_CHARGE_INCOME', 'PENALTY_INCOME', 'COMMISSION_INCOME', 'LANDLORD_PAYABLE', 'SECURITY_DEPOSIT_LIABILITY', 'PROPERTY_EXPENSE', 'SUSPENSE', 'ADJUSTMENTS');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_type" AS ENUM('DEBIT', 'CREDIT');--> statement-breakpoint
CREATE TYPE "public"."ledger_source_type" AS ENUM('INVOICE', 'PAYMENT', 'COMMISSION', 'SETTLEMENT', 'EXPENSE', 'ADJUSTMENT', 'REVERSAL');--> statement-breakpoint
CREATE TYPE "public"."maintenance_category" AS ENUM('PLUMBING', 'ELECTRICAL', 'WATER', 'STRUCTURAL', 'SECURITY', 'APPLIANCE', 'INTERNET', 'CLEANING', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."move_status" AS ENUM('SCHEDULED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."move_type" AS ENUM('MOVE_IN', 'MOVE_OUT');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('IN_APP', 'SMS', 'EMAIL');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('QUEUED', 'SENT', 'FAILED', 'READ');--> statement-breakpoint
CREATE TYPE "public"."org_status" AS ENUM('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('MPESA', 'BANK_TRANSFER', 'CASH', 'CHEQUE', 'CARD', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('INITIATED', 'PENDING', 'CONFIRMED', 'FAILED', 'REVERSED', 'UNMATCHED');--> statement-breakpoint
CREATE TYPE "public"."payout_method" AS ENUM('MPESA', 'BANK');--> statement-breakpoint
CREATE TYPE "public"."penalty_type" AS ENUM('NONE', 'FIXED', 'PERCENT');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT');--> statement-breakpoint
CREATE TYPE "public"."property_status" AS ENUM('ACTIVE', 'INACTIVE', 'UNDER_CONSTRUCTION', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('RESIDENTIAL', 'COMMERCIAL', 'MIXED_USE', 'APARTMENT', 'BEDSITTER_COMPLEX', 'MAISONETTE', 'HOSTEL', 'OFFICE', 'RETAIL', 'INDUSTRIAL', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_status" AS ENUM('UNRECONCILED', 'AUTO_MATCHED', 'MANUALLY_MATCHED', 'PARTIALLY_ALLOCATED', 'EXCEPTION');--> statement-breakpoint
CREATE TYPE "public"."settlement_status" AS ENUM('PENDING', 'SCHEDULED', 'PROCESSING', 'SETTLED', 'FAILED', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('SIMULATED', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."subscription_plan" AS ENUM('STARTER', 'PROFESSIONAL', 'ENTERPRISE');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('SUCCESS', 'FAILED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."taxpayer_type" AS ENUM('INDIVIDUAL', 'COMPANY', 'ANY');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('PROSPECT', 'ACTIVE', 'NOTICE', 'VACATED', 'BLACKLISTED');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('REPORTED', 'ACKNOWLEDGED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."unit_status" AS ENUM('OCCUPIED', 'VACANT', 'RESERVED', 'MAINTENANCE', 'UNAVAILABLE');--> statement-breakpoint
CREATE TYPE "public"."unit_type" AS ENUM('BEDSITTER', 'STUDIO', 'ONE_BEDROOM', 'TWO_BEDROOM', 'THREE_BEDROOM', 'FOUR_BEDROOM', 'MAISONETTE', 'SHOP', 'OFFICE_SPACE', 'HOSTEL_ROOM', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('SUPER_ADMIN', 'ORG_ADMIN', 'PROPERTY_MANAGER', 'ACCOUNTANT', 'LANDLORD', 'CARETAKER', 'MAINTENANCE', 'AUDITOR');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"user_id" text,
	"user_name" text,
	"user_role" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"reference" text,
	"previous_value" jsonb,
	"new_value" jsonb,
	"ip_address" text,
	"user_agent" text,
	"session_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"label" text NOT NULL,
	"invoices_created" integer DEFAULT 0 NOT NULL,
	"invoices_skipped" integer DEFAULT 0 NOT NULL,
	"total_billed" numeric(16, 2) DEFAULT '0' NOT NULL,
	"status" "billing_run_status" DEFAULT 'RUNNING' NOT NULL,
	"message" text,
	"run_by_id" text,
	"run_by_name" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "commission_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"name" text NOT NULL,
	"scope" "commission_scope" NOT NULL,
	"landlord_id" text,
	"property_id" text,
	"rate" numeric(6, 3) NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_until" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commissions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"payment_id" text NOT NULL,
	"landlord_id" text NOT NULL,
	"property_id" text NOT NULL,
	"rule_id" text,
	"scope" "commission_scope" NOT NULL,
	"rate" numeric(6, 3) NOT NULL,
	"gross_amount" numeric(16, 2) NOT NULL,
	"commission_amount" numeric(16, 2) NOT NULL,
	"net_amount" numeric(16, 2) NOT NULL,
	"status" "commission_status" DEFAULT 'EARNED' NOT NULL,
	"settlement_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commissions_payment_id_unique" UNIQUE("payment_id")
);
--> statement-breakpoint
CREATE TABLE "compliance_exceptions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"code" text NOT NULL,
	"severity" "exception_severity" DEFAULT 'MEDIUM' NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"property_id" text,
	"landlord_id" text,
	"tenant_id" text,
	"payment_id" text,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"recommended_action" text NOT NULL,
	"status" "exception_status" DEFAULT 'OPEN' NOT NULL,
	"resolved_by_id" text,
	"resolved_by_name" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compliance_exceptions_uq" UNIQUE("organization_id","code","entity_type","entity_id")
);
--> statement-breakpoint
CREATE TABLE "document_counters" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"key" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_counters_org_key_uq" UNIQUE("organization_id","key")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"type" "document_type" DEFAULT 'OTHER' NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"mime_type" text,
	"size_bytes" integer,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"uploaded_by_id" text,
	"uploaded_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erits_period_properties" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"period_id" text NOT NULL,
	"property_id" text NOT NULL,
	"gross_rental_income" numeric(16, 2) DEFAULT '0' NOT NULL,
	"payment_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "erits_period_property_uq" UNIQUE("period_id","property_id")
);
--> statement-breakpoint
CREATE TABLE "erits_periods" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"landlord_id" text NOT NULL,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"label" text NOT NULL,
	"gross_rental_income" numeric(16, 2) DEFAULT '0' NOT NULL,
	"allowable_deductions" numeric(16, 2) DEFAULT '0' NOT NULL,
	"taxable_amount" numeric(16, 2) DEFAULT '0' NOT NULL,
	"tax_rule_id" text,
	"tax_rule_name" text,
	"tax_rate" numeric(6, 3) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(16, 2) DEFAULT '0' NOT NULL,
	"property_count" integer DEFAULT 0 NOT NULL,
	"payment_count" integer DEFAULT 0 NOT NULL,
	"unreconciled_count" integer DEFAULT 0 NOT NULL,
	"exception_count" integer DEFAULT 0 NOT NULL,
	"status" "erits_period_status" DEFAULT 'OPEN' NOT NULL,
	"prepared_by_id" text,
	"prepared_by_name" text,
	"prepared_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "erits_periods_uq" UNIQUE("organization_id","landlord_id","period_year","period_month")
);
--> statement-breakpoint
CREATE TABLE "erits_properties" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"property_id" text NOT NULL,
	"landlord_id" text NOT NULL,
	"kra_pin" text,
	"erits_property_ref" text,
	"property_type" "property_type" NOT NULL,
	"county" text NOT NULL,
	"town" text NOT NULL,
	"unit_count" integer DEFAULT 0 NOT NULL,
	"estimated_annual_rent" numeric(16, 2) DEFAULT '0' NOT NULL,
	"actual_rental_income" numeric(16, 2) DEFAULT '0' NOT NULL,
	"registration_status" "erits_status" DEFAULT 'NOT_REGISTERED' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_sync_status" "sync_status",
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "erits_properties_property_id_unique" UNIQUE("property_id")
);
--> statement-breakpoint
CREATE TABLE "erits_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"period_id" text NOT NULL,
	"landlord_id" text NOT NULL,
	"reference" text NOT NULL,
	"mode" text DEFAULT 'SIMULATED' NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "submission_status" DEFAULT 'SIMULATED' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"acknowledgement_ref" text,
	"response_message" text,
	"submitted_by_id" text,
	"submitted_by_name" text,
	CONSTRAINT "erits_submissions_org_reference_uq" UNIQUE("organization_id","reference")
);
--> statement-breakpoint
CREATE TABLE "erits_sync_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"property_id" text,
	"period_id" text,
	"operation" text NOT NULL,
	"status" "sync_status" NOT NULL,
	"message" text,
	"request" jsonb,
	"response" jsonb,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"reference" text NOT NULL,
	"property_id" text NOT NULL,
	"landlord_id" text NOT NULL,
	"unit_id" text,
	"vendor_id" text,
	"ticket_id" text,
	"category" "expense_category" NOT NULL,
	"amount" numeric(16, 2) NOT NULL,
	"expense_date" timestamp with time zone NOT NULL,
	"description" text NOT NULL,
	"document_url" text,
	"approval_status" "approval_status" DEFAULT 'PENDING' NOT NULL,
	"approved_by_id" text,
	"approved_by_name" text,
	"approved_at" timestamp with time zone,
	"payment_status" "expense_payment_status" DEFAULT 'UNPAID' NOT NULL,
	"recharge_to_landlord" boolean DEFAULT true NOT NULL,
	"settlement_id" text,
	"created_by_id" text,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_org_reference_uq" UNIQUE("organization_id","reference")
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"provider" text NOT NULL,
	"status" "integration_status" DEFAULT 'AVAILABLE' NOT NULL,
	"phase" text DEFAULT 'Phase 1' NOT NULL,
	"description" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integrations_org_key_uq" UNIQUE("organization_id","key")
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"type" charge_type NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_amount" numeric(16, 2) NOT NULL,
	"amount" numeric(16, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "landlords" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"code" text NOT NULL,
	"type" "landlord_type" DEFAULT 'INDIVIDUAL' NOT NULL,
	"full_name" text NOT NULL,
	"company_name" text,
	"national_id" text,
	"registration_number" text,
	"kra_pin" text,
	"phone" text NOT NULL,
	"email" text,
	"address" text,
	"county" text,
	"town" text,
	"payout_method" "payout_method" DEFAULT 'MPESA' NOT NULL,
	"mpesa_number" text,
	"bank_name" text,
	"bank_branch" text,
	"bank_account_name" text,
	"bank_account_number" text,
	"taxpayer_type" "taxpayer_type" DEFAULT 'INDIVIDUAL' NOT NULL,
	"erits_status" "erits_status" DEFAULT 'NOT_REGISTERED' NOT NULL,
	"erits_taxpayer_ref" text,
	"commission_rate" numeric(6, 3),
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "landlords_org_code_uq" UNIQUE("organization_id","code")
);
--> statement-breakpoint
CREATE TABLE "lease_charges" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"lease_id" text NOT NULL,
	"type" charge_type NOT NULL,
	"label" text NOT NULL,
	"amount" numeric(16, 2) NOT NULL,
	"frequency" charge_frequency DEFAULT 'MONTHLY' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leases" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"code" text NOT NULL,
	"tenant_id" text NOT NULL,
	"property_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"monthly_rent" numeric(16, 2) NOT NULL,
	"deposit" numeric(16, 2) DEFAULT '0' NOT NULL,
	"service_charge" numeric(16, 2) DEFAULT '0' NOT NULL,
	"due_day_of_month" integer DEFAULT 5 NOT NULL,
	"grace_period_days" integer DEFAULT 5 NOT NULL,
	"penalty_type" "penalty_type" DEFAULT 'PERCENT' NOT NULL,
	"penalty_value" numeric(16, 2) DEFAULT '0' NOT NULL,
	"escalation_percent" numeric(6, 3) DEFAULT '0' NOT NULL,
	"escalation_months" integer DEFAULT 12 NOT NULL,
	"notice_period_days" integer DEFAULT 60 NOT NULL,
	"status" "lease_status" DEFAULT 'ACTIVE' NOT NULL,
	"move_in_date" timestamp with time zone,
	"move_out_date" timestamp with time zone,
	"termination_reason" text,
	"renewed_from_id" text,
	"document_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leases_org_code_uq" UNIQUE("organization_id","code")
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entry_group_id" text NOT NULL,
	"account" "ledger_account" NOT NULL,
	"entry_type" "ledger_entry_type" NOT NULL,
	"amount" numeric(16, 2) NOT NULL,
	"currency" text DEFAULT 'KES' NOT NULL,
	"narrative" text NOT NULL,
	"source_type" "ledger_source_type" NOT NULL,
	"source_id" text NOT NULL,
	"source_reference" text,
	"landlord_id" text,
	"property_id" text,
	"unit_id" text,
	"tenant_id" text,
	"transaction_date" timestamp with time zone NOT NULL,
	"created_by_id" text,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"number" text NOT NULL,
	"property_id" text NOT NULL,
	"unit_id" text,
	"tenant_id" text,
	"category" "maintenance_category" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"priority" "priority" DEFAULT 'MEDIUM' NOT NULL,
	"status" "ticket_status" DEFAULT 'REPORTED' NOT NULL,
	"reported_by_id" text,
	"reported_by_name" text,
	"assigned_to_id" text,
	"vendor_id" text,
	"estimated_cost" numeric(16, 2) DEFAULT '0' NOT NULL,
	"actual_cost" numeric(16, 2) DEFAULT '0' NOT NULL,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_date" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"resolution_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_org_number_uq" UNIQUE("organization_id","number")
);
--> statement-breakpoint
CREATE TABLE "maintenance_updates" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"author_id" text,
	"author_name" text,
	"status" "ticket_status",
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "move_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"type" "move_type" NOT NULL,
	"lease_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"property_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"scheduled_date" timestamp with time zone NOT NULL,
	"completed_date" timestamp with time zone,
	"status" "move_status" DEFAULT 'SCHEDULED' NOT NULL,
	"inspection_notes" text,
	"deposit_held" numeric(16, 2) DEFAULT '0' NOT NULL,
	"deductions" numeric(16, 2) DEFAULT '0' NOT NULL,
	"deposit_refunded" numeric(16, 2) DEFAULT '0' NOT NULL,
	"handled_by_id" text,
	"handled_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mpesa_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"transaction_id" text NOT NULL,
	"transaction_type" text DEFAULT 'Pay Bill' NOT NULL,
	"msisdn" text NOT NULL,
	"payer_name" text,
	"amount" numeric(16, 2) NOT NULL,
	"bill_ref_number" text NOT NULL,
	"short_code" text NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"reconciliation_status" "reconciliation_status" DEFAULT 'UNRECONCILED' NOT NULL,
	"matched_payment_id" text,
	"failure_reason" text,
	"raw_payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "mpesa_transactions_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text,
	"channel" "notification_channel" DEFAULT 'IN_APP' NOT NULL,
	"status" "notification_status" DEFAULT 'QUEUED' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"recipient" text,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"legal_name" text,
	"kra_pin" text,
	"status" "org_status" DEFAULT 'TRIAL' NOT NULL,
	"plan" "subscription_plan" DEFAULT 'STARTER' NOT NULL,
	"contact_email" text,
	"contact_phone" text,
	"county" text,
	"town" text,
	"address" text,
	"logo_url" text,
	"commission_rate" numeric(6, 3) DEFAULT '1.000' NOT NULL,
	"currency" text DEFAULT 'KES' NOT NULL,
	"timezone" text DEFAULT 'Africa/Nairobi' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"payment_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"amount" numeric(16, 2) NOT NULL,
	"allocated_by_id" text,
	"allocated_by_name" text,
	"is_automatic" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"reference" text NOT NULL,
	"external_reference" text,
	"method" "payment_method" DEFAULT 'MPESA' NOT NULL,
	"status" "payment_status" DEFAULT 'CONFIRMED' NOT NULL,
	"reconciliation_status" "reconciliation_status" DEFAULT 'UNRECONCILED' NOT NULL,
	"tenant_id" text,
	"lease_id" text,
	"property_id" text,
	"unit_id" text,
	"landlord_id" text,
	"payer_name" text,
	"payer_phone" text,
	"account_reference" text,
	"gross_amount" numeric(16, 2) NOT NULL,
	"commission_amount" numeric(16, 2) DEFAULT '0' NOT NULL,
	"net_amount" numeric(16, 2) DEFAULT '0' NOT NULL,
	"allocated_amount" numeric(16, 2) DEFAULT '0' NOT NULL,
	"unallocated_amount" numeric(16, 2) DEFAULT '0' NOT NULL,
	"settlement_status" "settlement_status" DEFAULT 'PENDING' NOT NULL,
	"settlement_id" text,
	"paid_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"narrative" text,
	"raw_payload" jsonb,
	"created_by_id" text,
	"created_by_name" text,
	"reversed_at" timestamp with time zone,
	"reversal_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_org_reference_uq" UNIQUE("organization_id","reference")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"module" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "property_type" DEFAULT 'APARTMENT' NOT NULL,
	"landlord_id" text NOT NULL,
	"manager_id" text,
	"kra_pin" text,
	"erits_property_ref" text,
	"county" text NOT NULL,
	"town" text NOT NULL,
	"area" text,
	"address" text,
	"unit_count" integer DEFAULT 0 NOT NULL,
	"expected_monthly_rent" numeric(16, 2) DEFAULT '0' NOT NULL,
	"management_fee_rate" numeric(6, 3) DEFAULT '0' NOT NULL,
	"commission_rate" numeric(6, 3),
	"settlement_account" text,
	"status" "property_status" DEFAULT 'ACTIVE' NOT NULL,
	"year_built" integer,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "properties_org_code_uq" UNIQUE("organization_id","code")
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"number" text NOT NULL,
	"payment_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"property_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"landlord_id" text NOT NULL,
	"invoice_id" text,
	"period_label" text NOT NULL,
	"amount" numeric(16, 2) NOT NULL,
	"method" "payment_method" NOT NULL,
	"mpesa_reference" text,
	"paid_at" timestamp with time zone NOT NULL,
	"balance_after" numeric(16, 2) DEFAULT '0' NOT NULL,
	"issued_by_id" text,
	"issued_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipts_payment_id_unique" UNIQUE("payment_id"),
	CONSTRAINT "receipts_org_number_uq" UNIQUE("organization_id","number")
);
--> statement-breakpoint
CREATE TABLE "rent_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"number" text NOT NULL,
	"lease_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"property_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"landlord_id" text NOT NULL,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"period_label" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"issue_date" timestamp with time zone NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"subtotal" numeric(16, 2) DEFAULT '0' NOT NULL,
	"penalty_amount" numeric(16, 2) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(16, 2) DEFAULT '0' NOT NULL,
	"total" numeric(16, 2) DEFAULT '0' NOT NULL,
	"amount_paid" numeric(16, 2) DEFAULT '0' NOT NULL,
	"balance" numeric(16, 2) DEFAULT '0' NOT NULL,
	"status" "invoice_status" DEFAULT 'DUE' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rent_invoices_org_number_uq" UNIQUE("organization_id","number"),
	CONSTRAINT "rent_invoices_lease_period_uq" UNIQUE("lease_id","period_year","period_month")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"permissions" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_org_key_uq" UNIQUE("organization_id","key")
);
--> statement-breakpoint
CREATE TABLE "settlement_items" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"settlement_id" text NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"property_id" text,
	"payment_id" text,
	"expense_id" text,
	"gross_amount" numeric(16, 2) DEFAULT '0' NOT NULL,
	"commission_amount" numeric(16, 2) DEFAULT '0' NOT NULL,
	"net_amount" numeric(16, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"reference" text NOT NULL,
	"landlord_id" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"gross_amount" numeric(16, 2) DEFAULT '0' NOT NULL,
	"commission_amount" numeric(16, 2) DEFAULT '0' NOT NULL,
	"management_fee" numeric(16, 2) DEFAULT '0' NOT NULL,
	"expense_amount" numeric(16, 2) DEFAULT '0' NOT NULL,
	"adjustment_amount" numeric(16, 2) DEFAULT '0' NOT NULL,
	"net_amount" numeric(16, 2) DEFAULT '0' NOT NULL,
	"status" "settlement_status" DEFAULT 'PENDING' NOT NULL,
	"method" "payout_method" DEFAULT 'MPESA' NOT NULL,
	"destination" text,
	"external_reference" text,
	"scheduled_for" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"failure_reason" text,
	"created_by_id" text,
	"created_by_name" text,
	"approved_by_id" text,
	"approved_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlements_org_reference_uq" UNIQUE("organization_id","reference")
);
--> statement-breakpoint
CREATE TABLE "tax_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"landlord_id" text NOT NULL,
	"kra_pin" text,
	"taxpayer_type" "taxpayer_type" DEFAULT 'INDIVIDUAL' NOT NULL,
	"tax_obligation" text DEFAULT 'Monthly Rental Income' NOT NULL,
	"erits_registered" boolean DEFAULT false NOT NULL,
	"erits_taxpayer_ref" text,
	"registration_date" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_profiles_landlord_id_unique" UNIQUE("landlord_id")
);
--> statement-breakpoint
CREATE TABLE "tax_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"rate" numeric(6, 3) NOT NULL,
	"threshold_min" numeric(16, 2),
	"threshold_max" numeric(16, 2),
	"property_type" "property_type",
	"taxpayer_type" "taxpayer_type" DEFAULT 'ANY' NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_until" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"source" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"author_id" text,
	"author_name" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"code" text NOT NULL,
	"full_name" text NOT NULL,
	"national_id" text,
	"passport_number" text,
	"kra_pin" text,
	"phone" text NOT NULL,
	"email" text,
	"emergency_name" text,
	"emergency_phone" text,
	"emergency_relationship" text,
	"occupation" text,
	"employer" text,
	"status" "tenant_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_org_code_uq" UNIQUE("organization_id","code")
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"property_id" text NOT NULL,
	"unit_number" text NOT NULL,
	"floor" integer DEFAULT 0 NOT NULL,
	"type" "unit_type" DEFAULT 'ONE_BEDROOM' NOT NULL,
	"bedrooms" integer DEFAULT 1 NOT NULL,
	"bathrooms" integer DEFAULT 1 NOT NULL,
	"size_sqm" integer,
	"monthly_rent" numeric(16, 2) DEFAULT '0' NOT NULL,
	"deposit" numeric(16, 2) DEFAULT '0' NOT NULL,
	"service_charge" numeric(16, 2) DEFAULT '0' NOT NULL,
	"status" "unit_status" DEFAULT 'VACANT' NOT NULL,
	"current_lease_id" text,
	"current_tenant_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "units_property_number_uq" UNIQUE("property_id","unit_number")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"role" "user_role" NOT NULL,
	"role_id" text,
	"landlord_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"contact_name" text,
	"phone" text,
	"email" text,
	"kra_pin" text,
	"rating" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_runs" ADD CONSTRAINT "billing_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_landlord_id_landlords_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."landlords"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_landlord_id_landlords_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."landlords"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_rule_id_commission_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."commission_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_exceptions" ADD CONSTRAINT "compliance_exceptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_exceptions" ADD CONSTRAINT "compliance_exceptions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_exceptions" ADD CONSTRAINT "compliance_exceptions_landlord_id_landlords_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."landlords"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_exceptions" ADD CONSTRAINT "compliance_exceptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_exceptions" ADD CONSTRAINT "compliance_exceptions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_counters" ADD CONSTRAINT "document_counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erits_period_properties" ADD CONSTRAINT "erits_period_properties_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erits_period_properties" ADD CONSTRAINT "erits_period_properties_period_id_erits_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."erits_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erits_period_properties" ADD CONSTRAINT "erits_period_properties_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erits_periods" ADD CONSTRAINT "erits_periods_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erits_periods" ADD CONSTRAINT "erits_periods_landlord_id_landlords_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."landlords"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erits_properties" ADD CONSTRAINT "erits_properties_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erits_properties" ADD CONSTRAINT "erits_properties_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erits_properties" ADD CONSTRAINT "erits_properties_landlord_id_landlords_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."landlords"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erits_submissions" ADD CONSTRAINT "erits_submissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erits_submissions" ADD CONSTRAINT "erits_submissions_period_id_erits_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."erits_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erits_submissions" ADD CONSTRAINT "erits_submissions_landlord_id_landlords_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."landlords"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erits_sync_logs" ADD CONSTRAINT "erits_sync_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_landlord_id_landlords_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."landlords"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_rent_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."rent_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landlords" ADD CONSTRAINT "landlords_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_charges" ADD CONSTRAINT "lease_charges_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_charges" ADD CONSTRAINT "lease_charges_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_updates" ADD CONSTRAINT "maintenance_updates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_updates" ADD CONSTRAINT "maintenance_updates_ticket_id_maintenance_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."maintenance_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_events" ADD CONSTRAINT "move_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_events" ADD CONSTRAINT "move_events_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_events" ADD CONSTRAINT "move_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_events" ADD CONSTRAINT "move_events_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_events" ADD CONSTRAINT "move_events_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mpesa_transactions" ADD CONSTRAINT "mpesa_transactions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_rent_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."rent_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_landlord_id_landlords_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."landlords"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_landlord_id_landlords_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."landlords"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_landlord_id_landlords_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."landlords"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_invoice_id_rent_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."rent_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_invoices" ADD CONSTRAINT "rent_invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_invoices" ADD CONSTRAINT "rent_invoices_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_invoices" ADD CONSTRAINT "rent_invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_invoices" ADD CONSTRAINT "rent_invoices_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_invoices" ADD CONSTRAINT "rent_invoices_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_invoices" ADD CONSTRAINT "rent_invoices_landlord_id_landlords_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."landlords"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_landlord_id_landlords_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."landlords"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_profiles" ADD CONSTRAINT "tax_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_profiles" ADD CONSTRAINT "tax_profiles_landlord_id_landlords_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."landlords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_notes" ADD CONSTRAINT "tenant_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_notes" ADD CONSTRAINT "tenant_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_org_idx" ON "audit_logs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "billing_runs_org_period_idx" ON "billing_runs" USING btree ("organization_id","period_year","period_month");--> statement-breakpoint
CREATE INDEX "commission_rules_org_idx" ON "commission_rules" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "commission_rules_scope_idx" ON "commission_rules" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "commissions_org_idx" ON "commissions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "commissions_landlord_idx" ON "commissions" USING btree ("landlord_id");--> statement-breakpoint
CREATE INDEX "commissions_status_idx" ON "commissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "compliance_exceptions_org_idx" ON "compliance_exceptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "compliance_exceptions_status_idx" ON "compliance_exceptions" USING btree ("status","severity");--> statement-breakpoint
CREATE INDEX "documents_org_idx" ON "documents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "documents_entity_idx" ON "documents" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "erits_period_properties_org_idx" ON "erits_period_properties" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "erits_periods_org_idx" ON "erits_periods" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "erits_periods_status_idx" ON "erits_periods" USING btree ("status");--> statement-breakpoint
CREATE INDEX "erits_properties_org_idx" ON "erits_properties" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "erits_properties_status_idx" ON "erits_properties" USING btree ("registration_status");--> statement-breakpoint
CREATE INDEX "erits_submissions_org_idx" ON "erits_submissions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "erits_submissions_status_idx" ON "erits_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "erits_sync_logs_org_idx" ON "erits_sync_logs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "erits_sync_logs_status_idx" ON "erits_sync_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "expenses_org_idx" ON "expenses" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "expenses_property_idx" ON "expenses" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "expenses_approval_idx" ON "expenses" USING btree ("approval_status");--> statement-breakpoint
CREATE INDEX "integrations_org_idx" ON "integrations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invoice_items_org_idx" ON "invoice_items" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_idx" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "landlords_org_idx" ON "landlords" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "lease_charges_org_idx" ON "lease_charges" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "lease_charges_lease_idx" ON "lease_charges" USING btree ("lease_id");--> statement-breakpoint
CREATE INDEX "leases_org_idx" ON "leases" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "leases_tenant_idx" ON "leases" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "leases_unit_idx" ON "leases" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "leases_status_idx" ON "leases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ledger_org_idx" ON "ledger_entries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ledger_group_idx" ON "ledger_entries" USING btree ("entry_group_id");--> statement-breakpoint
CREATE INDEX "ledger_account_idx" ON "ledger_entries" USING btree ("account");--> statement-breakpoint
CREATE INDEX "ledger_source_idx" ON "ledger_entries" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "ledger_date_idx" ON "ledger_entries" USING btree ("transaction_date");--> statement-breakpoint
CREATE INDEX "tickets_org_idx" ON "maintenance_tickets" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tickets_status_idx" ON "maintenance_tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tickets_priority_idx" ON "maintenance_tickets" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "ticket_updates_org_idx" ON "maintenance_updates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ticket_updates_ticket_idx" ON "maintenance_updates" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "move_events_org_idx" ON "move_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "move_events_type_status_idx" ON "move_events" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "mpesa_tx_org_idx" ON "mpesa_transactions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "mpesa_tx_reconciliation_idx" ON "mpesa_transactions" USING btree ("reconciliation_status");--> statement-breakpoint
CREATE INDEX "mpesa_tx_billref_idx" ON "mpesa_transactions" USING btree ("bill_ref_number");--> statement-breakpoint
CREATE INDEX "notifications_org_idx" ON "notifications" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "organizations_status_idx" ON "organizations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_allocations_org_idx" ON "payment_allocations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_payment_idx" ON "payment_allocations" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_invoice_idx" ON "payment_allocations" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payments_org_idx" ON "payments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payments_reconciliation_idx" ON "payments" USING btree ("reconciliation_status");--> statement-breakpoint
CREATE INDEX "payments_settlement_status_idx" ON "payments" USING btree ("settlement_status");--> statement-breakpoint
CREATE INDEX "payments_paid_at_idx" ON "payments" USING btree ("paid_at");--> statement-breakpoint
CREATE INDEX "permissions_module_idx" ON "permissions" USING btree ("module");--> statement-breakpoint
CREATE INDEX "properties_org_idx" ON "properties" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "properties_landlord_idx" ON "properties" USING btree ("landlord_id");--> statement-breakpoint
CREATE INDEX "receipts_org_idx" ON "receipts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "receipts_tenant_idx" ON "receipts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "rent_invoices_org_idx" ON "rent_invoices" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rent_invoices_status_idx" ON "rent_invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rent_invoices_due_idx" ON "rent_invoices" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "roles_org_idx" ON "roles" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "settlement_items_org_idx" ON "settlement_items" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "settlement_items_settlement_idx" ON "settlement_items" USING btree ("settlement_id");--> statement-breakpoint
CREATE INDEX "settlements_org_idx" ON "settlements" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "settlements_landlord_idx" ON "settlements" USING btree ("landlord_id");--> statement-breakpoint
CREATE INDEX "settlements_status_idx" ON "settlements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tax_profiles_org_idx" ON "tax_profiles" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tax_rules_org_idx" ON "tax_rules" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tax_rules_code_idx" ON "tax_rules" USING btree ("code");--> statement-breakpoint
CREATE INDEX "tenant_notes_org_idx" ON "tenant_notes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tenant_notes_tenant_idx" ON "tenant_notes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenants_org_idx" ON "tenants" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tenants_phone_idx" ON "tenants" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "units_org_idx" ON "units" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "units_property_idx" ON "units" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "units_status_idx" ON "units" USING btree ("status");--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "vendors_org_idx" ON "vendors" USING btree ("organization_id");