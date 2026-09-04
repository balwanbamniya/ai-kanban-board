import { ApiProperty } from "@nestjs/swagger";
import { IsInt, Min } from "class-validator";

export class ArchiveBoardDto {
	@IsInt()
	@Min(1)
	@ApiProperty({ type: Number })
	version!: number;
}
