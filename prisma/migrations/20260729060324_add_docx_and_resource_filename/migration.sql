-- AlterEnum
ALTER TYPE "SyllabusSourceType" ADD VALUE 'docx';

-- AlterTable
ALTER TABLE "CourseResource" ADD COLUMN     "fileName" TEXT;
