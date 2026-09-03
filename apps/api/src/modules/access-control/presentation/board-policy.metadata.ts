import { Reflector } from "@nestjs/core";
import type { BoardPermissionRequirement } from "../domain/board-permission.enum.js";

export interface BoardPolicyMetadata {
	boardIdParam: string;
	permissions: BoardPermissionRequirement;
}

export const BoardPolicy = Reflector.createDecorator<BoardPolicyMetadata>();
