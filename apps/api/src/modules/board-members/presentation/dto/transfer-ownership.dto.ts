import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsUUID, Min } from "class-validator";

export class TransferOwnershipDto {
	@IsUUID("4")
	@ApiProperty({ type: String })
	userId!: string;

	@IsInt()
	@Min(1)
	@ApiProperty({ type: Number })
	version!: number;
}
