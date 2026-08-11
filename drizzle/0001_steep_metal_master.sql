CREATE TABLE `season_expected_sales` (
	`season_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`month` text NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`season_id`, `product_id`, `month`),
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `subscription_products`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "season_expected_sales_quantity_non_negative" CHECK("season_expected_sales"."quantity" >= 0),
	CONSTRAINT "season_expected_sales_month_format" CHECK("season_expected_sales"."month" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]')
);
--> statement-breakpoint
CREATE INDEX `season_expected_sales_season_idx` ON `season_expected_sales` (`season_id`);--> statement-breakpoint
ALTER TABLE `course_offerings` ADD `intake_mode` text DEFAULT 'DEDICATED' NOT NULL;--> statement-breakpoint
ALTER TABLE `course_offerings` ADD `pool_share_bp` integer DEFAULT 0 NOT NULL;