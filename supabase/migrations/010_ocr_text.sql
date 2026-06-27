-- OCR extracted text from images (Google Vision DOCUMENT_TEXT_DETECTION)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS ocr_text TEXT;
