-- Adjust the owner's listing copy without replacing any other paragraph edits.
UPDATE apartments
SET description = ARRAY(
  SELECT replace(paragraph, 'Xóm Lèo; ban công', 'Xóm Lèo, ban công')
  FROM unnest(description) WITH ORDINALITY AS paragraphs(paragraph, position)
  ORDER BY position
)
WHERE slug = 'sun-garden-a04-12';
