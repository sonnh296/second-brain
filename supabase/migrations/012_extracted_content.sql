-- Unified extracted text: OCR, PDF parse, DOCX, notes, etc.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS extracted_content TEXT;

-- Migrate existing OCR text
UPDATE documents
SET extracted_content = ocr_text
WHERE extracted_content IS NULL AND ocr_text IS NOT NULL;
