CREATE INDEX "card_statement_user_period_idx" ON "card_statement" USING btree ("user_id","period");--> statement-breakpoint
CREATE INDEX "installment_user_paid_date_idx" ON "installment" USING btree ("user_id","paid_date") WHERE "paid" = true;--> statement-breakpoint
CREATE INDEX "installment_user_unpaid_due_idx" ON "installment" USING btree ("user_id","due_date") WHERE "paid" = false;