-- Add progress_count column to prtimes_uploads table for real-time progress tracking
-- Created: 2025-08-31

ALTER TABLE prtimes_uploads ADD COLUMN IF NOT EXISTS progress_count INTEGER DEFAULT 0;

-- Update any existing records to have progress_count equal to success_records + error_records
UPDATE prtimes_uploads 
SET progress_count = COALESCE(success_records, 0) + COALESCE(error_records, 0) 
WHERE progress_count IS NULL OR progress_count = 0;