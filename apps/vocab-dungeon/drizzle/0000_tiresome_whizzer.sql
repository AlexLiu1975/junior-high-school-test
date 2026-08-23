CREATE TABLE `classroomMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`classroomId` int NOT NULL,
	`studentId` int NOT NULL,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `classroomMembers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `classrooms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teacherId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`joinCode` varchar(24) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `classrooms_id` PRIMARY KEY(`id`),
	CONSTRAINT `classrooms_joinCode_unique` UNIQUE(`joinCode`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE TABLE `vocabWords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int,
	`volume` varchar(32) NOT NULL,
	`lesson` varchar(64) NOT NULL,
	`english` varchar(120) NOT NULL,
	`chinese` varchar(255) NOT NULL,
	`example` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `vocabWords_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wordAttempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`wordId` int NOT NULL,
	`classroomId` int,
	`correct` boolean NOT NULL,
	`questionType` varchar(32) NOT NULL,
	`answeredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wordAttempts_id` PRIMARY KEY(`id`)
);
