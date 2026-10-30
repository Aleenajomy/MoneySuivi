-- Additive: existing devices default to false, so they stop receiving push until the installed app re-registers.
ALTER TABLE "PushSubscription" ADD COLUMN "installedApp" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FcmToken" ADD COLUMN "installedApp" BOOLEAN NOT NULL DEFAULT false;
