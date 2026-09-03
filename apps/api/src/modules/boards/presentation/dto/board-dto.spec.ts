import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { BoardRole } from "../../../access-control/domain/board-role.enum.js";
import { AcceptInvitationDto } from "../../../board-members/presentation/dto/accept-invitation.dto.js";
import { CreateInvitationDto } from "../../../board-members/presentation/dto/create-invitation.dto.js";
import { ListInvitationsQueryDto } from "../../../board-members/presentation/dto/list-invitations-query.dto.js";
import { UpdateMemberRoleDto } from "../../../board-members/presentation/dto/update-member-role.dto.js";
import { CreateBoardDto } from "./create-board.dto.js";
import { ListBoardsQueryDto } from "./list-boards-query.dto.js";
import { UpdateBoardDto } from "./update-board.dto.js";

describe("board transport validation", () => {
	it("parses only explicit boolean query values", async () => {
		const enabled = plainToInstance(ListBoardsQueryDto, {
			includeArchived: "true",
		});
		const disabled = plainToInstance(ListBoardsQueryDto, {
			includeArchived: "false",
		});
		const invalid = plainToInstance(ListBoardsQueryDto, {
			includeArchived: "yes",
		});

		expect(await validate(enabled)).toHaveLength(0);
		expect(enabled.includeArchived).toBe(true);
		expect(await validate(disabled)).toHaveLength(0);
		expect(disabled.includeArchived).toBe(false);
		expect(await validate(invalid)).not.toHaveLength(0);
	});

	it("accepts only whole-number pagination limits", async () => {
		const boards = plainToInstance(ListBoardsQueryDto, { limit: "2.5" });
		const invitations = plainToInstance(ListInvitationsQueryDto, {
			limit: "2.5",
		});

		expect(await validate(boards)).not.toHaveLength(0);
		expect(await validate(invitations)).not.toHaveLength(0);
	});

	it("normalizes board text and color while rejecting string versions", async () => {
		const create = plainToInstance(CreateBoardDto, {
			color: "#AABBCC",
			description: "  ",
			title: "  Planning  ",
		});
		expect(await validate(create)).toHaveLength(0);
		expect(create).toMatchObject({
			color: "#aabbcc",
			description: null,
			title: "Planning",
		});

		const update = plainToInstance(UpdateBoardDto, {
			title: "Changed",
			version: "1",
		});
		expect(await validate(update)).not.toHaveLength(0);
	});

	it("never accepts OWNER as an assignable membership role", async () => {
		const invitation = plainToInstance(CreateInvitationDto, {
			email: " USER@EXAMPLE.COM ",
			role: BoardRole.OWNER,
		});
		const update = plainToInstance(UpdateMemberRoleDto, {
			role: BoardRole.OWNER,
		});

		expect(await validate(invitation)).not.toHaveLength(0);
		expect(invitation.email).toBe("user@example.com");
		expect(await validate(update)).not.toHaveLength(0);
	});

	it("accepts only a complete base64url invitation token", async () => {
		const valid = plainToInstance(AcceptInvitationDto, {
			token: "a".repeat(43),
		});
		const invalid = plainToInstance(AcceptInvitationDto, {
			token: `${"a".repeat(42)}+`,
		});

		expect(await validate(valid)).toHaveLength(0);
		expect(await validate(invalid)).not.toHaveLength(0);
	});
});
