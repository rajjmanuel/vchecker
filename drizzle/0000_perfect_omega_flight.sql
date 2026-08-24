CREATE TABLE `activity_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`username` varchar(80) NOT NULL,
	`role` varchar(40) NOT NULL,
	`module` varchar(80) NOT NULL,
	`action` varchar(80) NOT NULL,
	`description` text NOT NULL,
	`ip_address` varchar(80),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activity_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` int AUTO_INCREMENT NOT NULL,
	`student_number` varchar(40),
	`first_name` varchar(100) NOT NULL,
	`middle_name` varchar(100),
	`last_name` varchar(100) NOT NULL,
	`grade_level` varchar(50) NOT NULL,
	`section` varchar(80) NOT NULL,
	`status` enum('Active','Inactive','Archived') NOT NULL DEFAULT 'Active',
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `students_id` PRIMARY KEY(`id`),
	CONSTRAINT `students_student_number_unique` UNIQUE(`student_number`)
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`school_name` varchar(220) NOT NULL DEFAULT 'National College of Science & Technology',
	`app_subtitle` varchar(120) NOT NULL DEFAULT 'VIOLATION RECORDS',
	`login_title` varchar(120) NOT NULL DEFAULT 'Vchecker',
	`footer_notice` varchar(220) NOT NULL DEFAULT 'Confidential — Authorized Personnel Only',
	`primary_color` varchar(20) NOT NULL DEFAULT '#0f8b74',
	`accent_color` varchar(20) NOT NULL DEFAULT '#14a7b5',
	`sidebar_color` varchar(20) NOT NULL DEFAULT '#0d1b27',
	`font_family` varchar(120) NOT NULL DEFAULT 'Inter',
	`session_hours` int NOT NULL DEFAULT 12,
	`logo_data_url` longtext,
	`favicon_data_url` longtext,
	`login_image_data_url` longtext,
	`dashboard_image_data_url` longtext,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `system_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`full_name` varchar(160) NOT NULL,
	`username` varchar(80) NOT NULL,
	`email` varchar(160) NOT NULL,
	`password_hash` text NOT NULL,
	`role` enum('super_admin','staff','faculty') NOT NULL DEFAULT 'staff',
	`permissions` json NOT NULL DEFAULT ('{"students":{"view":true},"violations":{"view":true},"reports":{"view":true,"export":true},"logs":{}}'),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_username_unique` UNIQUE(`username`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `violations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`student_id` int NOT NULL,
	`category` enum('Major','Minor') NOT NULL,
	`violation_type` varchar(160) NOT NULL,
	`incident_date` date NOT NULL,
	`description` text,
	`action_taken` text,
	`remarks` text,
	`status` enum('Pending','Resolved','Escalated') NOT NULL DEFAULT 'Pending',
	`reported_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `violations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `activity_logs` ADD CONSTRAINT `activity_logs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `violations` ADD CONSTRAINT `violations_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `violations` ADD CONSTRAINT `violations_reported_by_users_id_fk` FOREIGN KEY (`reported_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;