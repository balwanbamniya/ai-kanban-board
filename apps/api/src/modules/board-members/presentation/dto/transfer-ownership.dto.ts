import { IsInt, IsUUID, Min } from "class-validator";

export class TransferOwnershipDto {
	@IsUUID("4")
	userId!: string;

	@IsInt()
	@Min(1)
	version!: number;
}
