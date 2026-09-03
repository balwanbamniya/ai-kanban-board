-- Normalize historical column keys to the fractional-indexing key format.
-- The temporary mapping and two-phase update avoid unique-key collisions.
CREATE FUNCTION pg_temp.base62_padded(value bigint, width integer)
RETURNS text AS $$
DECLARE
  alphabet constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  remaining bigint := value;
  result text := '';
  position integer;
BEGIN
  FOR position IN 1..width LOOP
    result := substr(alphabet, (remaining % 62)::integer + 1, 1) || result;
    remaining := remaining / 62;
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

CREATE FUNCTION pg_temp.fractional_order_key(position bigint)
RETURNS text AS $$
DECLARE
  capacity bigint := 62;
  offset bigint := 0;
  width integer := 1;
BEGIN
  WHILE position >= offset + capacity LOOP
    offset := offset + capacity;
    width := width + 1;
    IF width > 10 THEN
      RAISE EXCEPTION 'too many ordered records to normalize';
    END IF;
    capacity := capacity * 62;
  END LOOP;
  RETURN chr(96 + width) || pg_temp.base62_padded(position - offset, width);
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

CREATE TEMPORARY TABLE column_sort_key_migration ON COMMIT DROP AS
SELECT
  id,
  pg_temp.fractional_order_key(
    row_number() OVER (PARTITION BY board_id ORDER BY sort_key, id) - 1
  ) AS sort_key
FROM columns;

UPDATE columns
SET sort_key = '~migrate:' || id::text;

UPDATE columns AS column_record
SET sort_key = migration.sort_key
FROM column_sort_key_migration AS migration
WHERE column_record.id = migration.id;
