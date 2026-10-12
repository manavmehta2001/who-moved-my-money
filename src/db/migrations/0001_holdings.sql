ALTER TABLE "funds" ADD COLUMN "invested_amount" double precision;--> statement-breakpoint
ALTER TABLE "funds" ADD COLUMN "holdings_sample" boolean DEFAULT false NOT NULL;