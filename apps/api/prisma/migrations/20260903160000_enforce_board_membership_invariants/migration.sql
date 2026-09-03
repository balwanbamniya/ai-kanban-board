UPDATE "board_invitations" SET "email" = lower(trim("email"));

WITH "ranked_pending" AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "board_id", lower("email")
    ORDER BY "created_at" DESC, "id" DESC
  ) AS "position"
  FROM "board_invitations"
  WHERE "status" = 'PENDING'
)
UPDATE "board_invitations" AS "invitation"
SET "status" = 'CANCELLED'
FROM "ranked_pending"
WHERE "invitation"."id" = "ranked_pending"."id"
  AND "ranked_pending"."position" > 1;

-- Preserve invitation history while allowing only one actionable invitation
-- for a normalized email address on each board.
CREATE UNIQUE INDEX "board_invitations_one_pending_email"
ON "board_invitations" ("board_id", lower("email"))
WHERE "status" = 'PENDING';

-- Board ownership is represented only by boards.owner_id. These triggers keep
-- accidental duplicate owner memberships out of the database regardless of
-- which application code performs the write.
CREATE FUNCTION "reject_owner_membership"() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "boards"
    WHERE "id" = NEW."board_id" AND "owner_id" = NEW."user_id"
  ) THEN
    RAISE EXCEPTION 'a board owner cannot also be a board member'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "board_members_reject_owner"
BEFORE INSERT OR UPDATE OF "board_id", "user_id" ON "board_members"
FOR EACH ROW EXECUTE FUNCTION "reject_owner_membership"();

CREATE FUNCTION "reject_member_as_owner"() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "board_members"
    WHERE "board_id" = NEW."id" AND "user_id" = NEW."owner_id"
  ) THEN
    RAISE EXCEPTION 'a board member must be removed before becoming its owner'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "boards_reject_member_owner"
BEFORE INSERT OR UPDATE OF "owner_id" ON "boards"
FOR EACH ROW EXECUTE FUNCTION "reject_member_as_owner"();
