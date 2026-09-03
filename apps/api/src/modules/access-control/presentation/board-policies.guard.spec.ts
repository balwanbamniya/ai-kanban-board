import { InternalServerErrorException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { BoardAccessContext } from "../domain/board-access-context.js";
import { BoardPermission } from "../domain/board-permission.enum.js";
import { BoardRole } from "../domain/board-role.enum.js";
import { BoardPoliciesGuard } from "./board-policies.guard.js";

const boardId = "10000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000001";
const policy = {
	boardIdParam: "boardId",
	permissions: [BoardPermission.BOARD_READ],
};
const boardAccess: BoardAccessContext = {
	boardId,
	ownerId: userId,
	role: BoardRole.OWNER,
	userId,
};

function executionContext(request: Record<string, unknown>) {
	return {
		getClass: vi.fn(),
		getHandler: vi.fn(),
		switchToHttp: () => ({ getRequest: () => request }),
	} as never;
}

describe("BoardPoliciesGuard", () => {
	it("does nothing when a route has no board policy", async () => {
		const assertPermissions = vi.fn();
		const guard = new BoardPoliciesGuard(
			{ getAllAndOverride: vi.fn().mockReturnValue(undefined) } as never,
			{ assertPermissions } as never,
		);

		await expect(guard.canActivate(executionContext({}))).resolves.toBe(true);
		expect(assertPermissions).not.toHaveBeenCalled();
	});

	it("loads and attaches the authorized board context", async () => {
		const request = {
			params: { boardId },
			user: { id: userId },
		};
		const assertPermissions = vi.fn().mockResolvedValue(boardAccess);
		const guard = new BoardPoliciesGuard(
			{ getAllAndOverride: vi.fn().mockReturnValue(policy) } as never,
			{ assertPermissions } as never,
		);

		await expect(guard.canActivate(executionContext(request))).resolves.toBe(
			true,
		);
		expect(assertPermissions).toHaveBeenCalledWith(
			userId,
			boardId,
			policy.permissions,
		);
		expect(request).toMatchObject({ boardAccess });
	});

	it("fails closed when authentication context is unavailable", async () => {
		const guard = new BoardPoliciesGuard(
			{ getAllAndOverride: vi.fn().mockReturnValue(policy) } as never,
			{ assertPermissions: vi.fn() } as never,
		);

		await expect(
			guard.canActivate(executionContext({ params: { boardId } })),
		).rejects.toBeInstanceOf(InternalServerErrorException);
	});

	it("reports a policy without its configured route parameter as a server error", async () => {
		const guard = new BoardPoliciesGuard(
			{ getAllAndOverride: vi.fn().mockReturnValue(policy) } as never,
			{ assertPermissions: vi.fn() } as never,
		);

		await expect(
			guard.canActivate(executionContext({ params: {}, user: { id: userId } })),
		).rejects.toBeInstanceOf(InternalServerErrorException);
	});
});
