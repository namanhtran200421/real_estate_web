-- The screenshot check: OCR reads each transfer screenshot for signs of a bank transfer (the
-- transfer note, the amount, banking words). An image showing none is sent back to the guest with a
-- warning; a guest may still send it, and the owner sees it flagged.
ALTER TABLE transfer_screenshots ADD COLUMN shows_transfer boolean;

COMMENT ON COLUMN transfer_screenshots.shows_transfer IS
  'Screenshot check: true = transfer text found, false = none found (the guest sent it anyway), null = not checked (unreadable image or check unavailable)';
