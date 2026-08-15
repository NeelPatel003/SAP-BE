-- AlterEnum TraceLinkType for dispatch/customer and FG
ALTER TYPE "TraceLinkType" ADD VALUE 'production_to_fg';
ALTER TYPE "TraceLinkType" ADD VALUE 'batch_to_dispatch';
ALTER TYPE "TraceLinkType" ADD VALUE 'dispatch_to_customer';
