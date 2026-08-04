CREATE TABLE "credit_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"available_cents" integer DEFAULT 0 NOT NULL,
	"reserved_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "credit_accounts_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "credit_accounts_available_non_negative" CHECK ("credit_accounts"."available_cents" >= 0),
	CONSTRAINT "credit_accounts_reserved_non_negative" CHECK ("credit_accounts"."reserved_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "credit_ledger_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"user_id" text NOT NULL,
	"generation_id" text,
	"kind" text NOT NULL,
	"available_delta_cents" integer NOT NULL,
	"reserved_delta_cents" integer NOT NULL,
	"available_balance_cents" integer NOT NULL,
	"reserved_balance_cents" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"reason" text,
	"actor_user_id" text,
	"request_id" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "credit_ledger_kind_check" CHECK ("credit_ledger_entries"."kind" in ('grant', 'recharge', 'reserve', 'settle', 'refund', 'adjustment'))
);
--> statement-breakpoint
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_action_check";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_account_id_credit_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."credit_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_generation_id_generation_records_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generation_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_account_idempotency_idx" ON "credit_ledger_entries" USING btree ("account_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "credit_ledger_account_created_idx" ON "credit_ledger_entries" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "credit_ledger_generation_idx" ON "credit_ledger_entries" USING btree ("generation_id");--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_action_check" CHECK ("audit_logs"."action" in ('auth.register', 'auth.login', 'auth.logout', 'generation.create', 'generation.cancel', 'generation.retry', 'artifact.read', 'share.create', 'share.revoke', 'points.grant'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("users"."role" in ('user', 'admin'));