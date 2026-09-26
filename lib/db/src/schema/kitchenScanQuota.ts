import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const kitchenScanQuotaTable = pgTable("kitchen_scan_quota", {
  bucketKey: text("bucket_key").primaryKey(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true, mode: "date" }).notNull(),
  requestCount: integer("request_count").notNull(),
});