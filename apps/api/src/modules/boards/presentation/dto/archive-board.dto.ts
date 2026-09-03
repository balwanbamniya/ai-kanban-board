import { IsInt, Min } from "class-validator";

export class ArchiveBoardDto {
	@IsInt()
	@Min(1)
	version!: number;
}
