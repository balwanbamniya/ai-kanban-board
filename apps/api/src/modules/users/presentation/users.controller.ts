import { Controller, Get, Inject, Query } from "@nestjs/common";
import {
	ApiBearerAuth,
	ApiExtraModels,
	ApiOkResponse,
	ApiTags,
} from "@nestjs/swagger";
import { CurrentUser } from "../../identity/presentation/current-user.decorator.js";
import type { CurrentUser as CurrentUserModel } from "../application/user-sync.service.js";
import { UsersService } from "../application/users.service.js";
import { ResolveUserQueryDto } from "./dto/resolve-user-query.dto.js";
import {
	CurrentUserDto,
	ResolveUserResponseDto,
} from "./dto/user-response.dto.js";

@ApiTags("users")
@ApiBearerAuth()
@ApiExtraModels(ResolveUserQueryDto)
@Controller("users")
export class UsersController {
	constructor(@Inject(UsersService) private readonly users: UsersService) {}

	@Get("me")
	@ApiOkResponse({ type: CurrentUserDto })
	me(@CurrentUser() user: CurrentUserModel): CurrentUserDto {
		return user;
	}

	@Get("resolve")
	@ApiOkResponse({ type: ResolveUserResponseDto })
	async resolve(
		@Query() query: ResolveUserQueryDto,
	): Promise<ResolveUserResponseDto> {
		return { user: await this.users.resolveByEmail(query.email) };
	}
}
