CREATE TABLE "user_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"role" "user_role" NOT NULL,
	"landlord_id" text,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" "portal_invite_status" DEFAULT 'PENDING' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"invited_by_id" text,
	"invited_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_invites_token_uq" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "user_invites" ADD CONSTRAINT "user_invites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invites" ADD CONSTRAINT "user_invites_landlord_id_landlords_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."landlords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_invites_org_idx" ON "user_invites" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "user_invites_landlord_idx" ON "user_invites" USING btree ("landlord_id");