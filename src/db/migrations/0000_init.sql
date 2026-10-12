CREATE TABLE "benchmark_history" (
	"key" text NOT NULL,
	"value_date" date NOT NULL,
	"value" double precision NOT NULL,
	CONSTRAINT "benchmark_history_key_value_date_pk" PRIMARY KEY("key","value_date")
);
--> statement-breakpoint
CREATE TABLE "benchmarks" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"source_type" text NOT NULL,
	"source_ref" text NOT NULL,
	"source_name" text,
	"is_tri_approx" boolean DEFAULT false NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"fallback_key" text,
	"show_in_market_strip" boolean DEFAULT false NOT NULL,
	"strip_order" integer
);
--> statement-breakpoint
CREATE TABLE "category_peers" (
	"sebi_category" text NOT NULL,
	"scheme_code" text NOT NULL,
	"scheme_name" text NOT NULL,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_peers_sebi_category_scheme_code_pk" PRIMARY KEY("sebi_category","scheme_code")
);
--> statement-breakpoint
CREATE TABLE "funds" (
	"scheme_code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"amc" text NOT NULL,
	"sebi_category" text NOT NULL,
	"peer_group" text NOT NULL,
	"asset_class" text NOT NULL,
	"benchmark_key" text,
	"monthly_sip" double precision,
	"units_held" double precision,
	"is_active" boolean DEFAULT true NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_name" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"details" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "market_context" (
	"week_ending" date PRIMARY KEY NOT NULL,
	"index_moves" jsonb NOT NULL,
	"headlines" jsonb NOT NULL,
	"news_provider" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nav_history" (
	"scheme_code" text NOT NULL,
	"nav_date" date NOT NULL,
	"nav" double precision NOT NULL,
	CONSTRAINT "nav_history_scheme_code_nav_date_pk" PRIMARY KEY("scheme_code","nav_date")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"week_ending" date PRIMARY KEY NOT NULL,
	"verdict" text NOT NULL,
	"verdict_reason" text NOT NULL,
	"worry_score" integer NOT NULL,
	"content" jsonb NOT NULL,
	"written_by" text NOT NULL,
	"model" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"latency_ms" integer,
	"retries" integer DEFAULT 0 NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_snapshots" (
	"week_ending" date NOT NULL,
	"scheme_code" text NOT NULL,
	"nav" double precision NOT NULL,
	"nav_date" date NOT NULL,
	"fund_ret_1w" double precision,
	"fund_ret_1m" double precision,
	"fund_ret_ytd" double precision,
	"bench_ret_1w" double precision,
	"bench_ret_1m" double precision,
	"bench_ret_ytd" double precision,
	"cat_ret_1w" double precision,
	"cat_ret_1m" double precision,
	"cat_ret_ytd" double precision,
	"market_1w" double precision,
	"similar_funds_1w" double precision,
	"fund_choices_1w" double precision,
	"market_1m" double precision,
	"similar_funds_1m" double precision,
	"fund_choices_1m" double precision,
	"peer_count" integer DEFAULT 0 NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provenance" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_snapshots_week_ending_scheme_code_pk" PRIMARY KEY("week_ending","scheme_code")
);
--> statement-breakpoint
ALTER TABLE "benchmark_history" ADD CONSTRAINT "benchmark_history_key_benchmarks_key_fk" FOREIGN KEY ("key") REFERENCES "public"."benchmarks"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funds" ADD CONSTRAINT "funds_benchmark_key_benchmarks_key_fk" FOREIGN KEY ("benchmark_key") REFERENCES "public"."benchmarks"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_peers_scheme_idx" ON "category_peers" USING btree ("scheme_code");--> statement-breakpoint
CREATE INDEX "job_runs_name_started_idx" ON "job_runs" USING btree ("job_name","started_at");