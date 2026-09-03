-- Normalize historical task keys to the fractional-indexing key format.
-- The temporary mapping and two-phase update avoid unique-key collisions.
CREATE FUNCTION pg_temp.task_base62_padded(value bigint, width integer)
RETURNS text AS $$
DECLARE
  alphabet constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  remaining bigint := value;
  result text := '';
  ordinal integer;
BEGIN
  FOR ordinal IN 1..width LOOP
    result := substr(alphabet, (remaining % 62)::integer + 1, 1) || result;
    remaining := remaining / 62;
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

CREATE FUNCTION pg_temp.task_fractional_order_key(ordinal bigint)
RETURNS text AS $$
DECLARE
  capacity bigint := 62;
  key_offset bigint := 0;
  width integer := 1;
BEGIN
  WHILE ordinal >= key_offset + capacity LOOP
    key_offset := key_offset + capacity;
    width := width + 1;
    IF width > 10 THEN
      RAISE EXCEPTION 'too many ordered records to normalize';
    END IF;
    capacity := capacity * 62;
  END LOOP;
  RETURN chr(96 + width) || pg_temp.task_base62_padded(ordinal - key_offset, width);
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

CREATE TEMPORARY TABLE task_sort_key_migration AS
SELECT
  id,
  pg_temp.task_fractional_order_key(
    row_number() OVER (PARTITION BY column_id ORDER BY sort_key, id) - 1
  ) AS sort_key
FROM tasks;

UPDATE tasks
SET sort_key = '~migrate:' || id::text;

UPDATE tasks AS task_record
SET sort_key = migration.sort_key
FROM task_sort_key_migration AS migration
WHERE task_record.id = migration.id;

DROP TABLE task_sort_key_migration;
