import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PlatformRole } from "../../../../generated/prisma/enums.js";
import type { CurrentUser } from "../../application/user-sync.service.js";
import type { UserSummary } from "../../application/users.service.js";

export class UserSummaryDto implements UserSummary {
	@ApiPropertyOptional()
	avatarUrl?: string;

	@ApiProperty({ format: "email" })
	email!: string;

	@ApiProperty({ format: "uuid" })
	id!: string;

	@ApiProperty()
	name!: string;
}

export class CurrentUserDto extends UserSummaryDto implements CurrentUser {
	@ApiProperty({ enum: PlatformRole, enumName: "PlatformRole" })
	platformRole!: PlatformRole;
}

export class ResolveUserResponseDto {
	@ApiProperty({ nullable: true, type: UserSummaryDto })
	user!: UserSummaryDto | null;
}
