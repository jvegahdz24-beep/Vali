CREATE TABLE `ImportJob` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `fileName` VARCHAR(191) NOT NULL,
    `fileSize` INTEGER NULL,
    `fileType` VARCHAR(191) NULL,
    `rowsTotal` INTEGER NOT NULL DEFAULT 0,
    `rowsProcessed` INTEGER NOT NULL DEFAULT 0,
    `rowsCreated` INTEGER NOT NULL DEFAULT 0,
    `rowsUpdated` INTEGER NOT NULL DEFAULT 0,
    `rowsSkipped` INTEGER NOT NULL DEFAULT 0,
    `errors` TEXT NOT NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ImportJob_workspaceId_idx`(`workspaceId`),
    INDEX `ImportJob_status_idx`(`status`),
    INDEX `ImportJob_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ImportJob`
    ADD CONSTRAINT `ImportJob_workspaceId_fkey`
    FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
