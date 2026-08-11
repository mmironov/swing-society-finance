CREATE TABLE `activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'GENERAL' NOT NULL,
	`course_id` integer,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activities_name_unique` ON `activities` (`name`);--> statement-breakpoint
CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`sort_order` integer DEFAULT 100 NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_code_unique` ON `categories` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_id_type_unique` ON `categories` (`id`,`type`);--> statement-breakpoint
CREATE TABLE `course_offerings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_id` integer NOT NULL,
	`season_id` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`classes_per_week` integer DEFAULT 1 NOT NULL,
	`weeks` integer DEFAULT 0 NOT NULL,
	`capacity` integer DEFAULT 0 NOT NULL,
	`expected_students` integer DEFAULT 0 NOT NULL,
	`minutes_per_class` integer DEFAULT 90 NOT NULL,
	`studio_hourly_rate_cents` integer,
	`status` text DEFAULT 'PLANNED' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "offerings_dates_ordered" CHECK("course_offerings"."end_date" >= "course_offerings"."start_date"),
	CONSTRAINT "offerings_classes_per_week_non_negative" CHECK("course_offerings"."classes_per_week" >= 0),
	CONSTRAINT "offerings_weeks_non_negative" CHECK("course_offerings"."weeks" >= 0),
	CONSTRAINT "offerings_capacity_non_negative" CHECK("course_offerings"."capacity" >= 0),
	CONSTRAINT "offerings_expected_students_non_negative" CHECK("course_offerings"."expected_students" >= 0),
	CONSTRAINT "offerings_minutes_per_class_non_negative" CHECK("course_offerings"."minutes_per_class" >= 0),
	CONSTRAINT "offerings_studio_rate_non_negative" CHECK("course_offerings"."studio_hourly_rate_cents" IS NULL OR "course_offerings"."studio_hourly_rate_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `course_offerings_course_season_unique` ON `course_offerings` (`course_id`,`season_id`);--> statement-breakpoint
CREATE INDEX `course_offerings_season_idx` ON `course_offerings` (`season_id`);--> statement-breakpoint
CREATE TABLE `courses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 100 NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `courses_name_unique` ON `courses` (`name`);--> statement-breakpoint
CREATE TABLE `financial_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`category_id` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`season_id` integer,
	`activity_id` integer,
	`payment_method` text DEFAULT 'BANK' NOT NULL,
	`status` text DEFAULT 'SETTLED' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`category_id`,`type`) REFERENCES `categories`(`id`,`type`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transactions_amount_positive" CHECK("financial_transactions"."amount_cents" > 0),
	CONSTRAINT "transactions_date_iso" CHECK("financial_transactions"."date" LIKE '____-__-__')
);
--> statement-breakpoint
CREATE INDEX `transactions_date_idx` ON `financial_transactions` (`date`);--> statement-breakpoint
CREATE INDEX `transactions_season_idx` ON `financial_transactions` (`season_id`);--> statement-breakpoint
CREATE INDEX `transactions_category_idx` ON `financial_transactions` (`category_id`);--> statement-breakpoint
CREATE TABLE `offering_expected_sales` (
	`offering_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`offering_id`, `product_id`),
	FOREIGN KEY (`offering_id`) REFERENCES `course_offerings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `subscription_products`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "expected_sales_quantity_non_negative" CHECK("offering_expected_sales"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE `offering_teacher_costs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`offering_id` integer NOT NULL,
	`teacher_id` integer NOT NULL,
	`classes` integer DEFAULT 0 NOT NULL,
	`rate_per_class_cents` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`offering_id`) REFERENCES `course_offerings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "teacher_costs_classes_non_negative" CHECK("offering_teacher_costs"."classes" >= 0),
	CONSTRAINT "teacher_costs_rate_non_negative" CHECK("offering_teacher_costs"."rate_per_class_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `offering_teacher_unique` ON `offering_teacher_costs` (`offering_id`,`teacher_id`);--> statement-breakpoint
CREATE TABLE `season_forecast_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	`type` text NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`,`type`) REFERENCES `categories`(`id`,`type`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "forecast_lines_amount_non_negative" CHECK("season_forecast_lines"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `forecast_lines_season_category_unique` ON `season_forecast_lines` (`season_id`,`category_id`);--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'PLANNING' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT "seasons_dates_ordered" CHECK("seasons"."end_date" >= "seasons"."start_date"),
	CONSTRAINT "seasons_start_date_iso" CHECK("seasons"."start_date" LIKE '____-__-__'),
	CONSTRAINT "seasons_end_date_iso" CHECK("seasons"."end_date" LIKE '____-__-__')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seasons_name_unique` ON `seasons` (`name`);--> statement-breakpoint
CREATE TABLE `students` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subscription_course_offerings` (
	`subscription_id` integer NOT NULL,
	`offering_id` integer NOT NULL,
	PRIMARY KEY(`subscription_id`, `offering_id`),
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`offering_id`) REFERENCES `course_offerings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `subscription_products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`classes_per_week` integer,
	`duration_months` integer,
	`price_cents` integer NOT NULL,
	`is_unlimited` integer DEFAULT false NOT NULL,
	`kind` text DEFAULT 'SUBSCRIPTION' NOT NULL,
	`sort_order` integer DEFAULT 100 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	CONSTRAINT "products_price_non_negative" CHECK("subscription_products"."price_cents" >= 0),
	CONSTRAINT "products_classes_per_week_non_negative" CHECK("subscription_products"."classes_per_week" IS NULL OR "subscription_products"."classes_per_week" >= 0),
	CONSTRAINT "products_duration_positive" CHECK("subscription_products"."duration_months" IS NULL OR "subscription_products"."duration_months" > 0),
	CONSTRAINT "products_unlimited_has_no_frequency" CHECK("subscription_products"."is_unlimited" = 0 OR "subscription_products"."classes_per_week" IS NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_products_name_unique` ON `subscription_products` (`name`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`season_id` integer,
	`purchased_on` text NOT NULL,
	`start_date` text,
	`end_date` text,
	`price_paid_cents` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `subscription_products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "subscriptions_price_non_negative" CHECK("subscriptions"."price_paid_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE `teachers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`default_rate_per_class_cents` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	CONSTRAINT "teachers_default_rate_non_negative" CHECK("teachers"."default_rate_per_class_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teachers_name_unique` ON `teachers` (`name`);