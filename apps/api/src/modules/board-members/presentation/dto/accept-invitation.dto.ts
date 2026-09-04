import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches } from "class-validator";

export class AcceptInvitationDto {
	@IsString()
	@Matches(/^[A-Za-z0-9_-]{43}$/)
	@ApiProperty({ type: String })
	token!: string;
}
