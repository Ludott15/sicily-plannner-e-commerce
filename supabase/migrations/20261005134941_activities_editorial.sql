ALTER TABLE "activities" DROP CONSTRAINT "activities_partner_product_unique";--> statement-breakpoint
ALTER TABLE "activities" DROP CONSTRAINT "activities_price_non_negative";--> statement-breakpoint
DROP INDEX "activities_is_active_partner_idx";--> statement-breakpoint
ALTER TABLE "activities" DROP COLUMN "price_from_eur";--> statement-breakpoint
ALTER TABLE "activities" DROP COLUMN "partner";--> statement-breakpoint
ALTER TABLE "activities" DROP COLUMN "partner_product_id";--> statement-breakpoint
ALTER TABLE "activities" DROP COLUMN "affiliate_url";