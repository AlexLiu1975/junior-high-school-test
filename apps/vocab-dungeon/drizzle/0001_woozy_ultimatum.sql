ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','system_admin','teacher','student') NOT NULL DEFAULT 'student';--> statement-breakpoint
UPDATE `users` SET `role` = 'system_admin' WHERE `role` = 'admin';--> statement-breakpoint
UPDATE `users` SET `role` = 'student' WHERE `role` = 'user';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('system_admin','teacher','student') NOT NULL DEFAULT 'student';--> statement-breakpoint
ALTER TABLE `classrooms` ADD `updatedAt` timestamp DEFAULT (now()) NOT NULL ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `classrooms` ADD `isActive` boolean DEFAULT true NOT NULL;
