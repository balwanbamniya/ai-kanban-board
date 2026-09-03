import {
	BadRequestException,
	HttpException,
	Inject,
	Logger,
	type OnModuleDestroy,
} from "@nestjs/common";
import {
	ConnectedSocket,
	MessageBody,
	type OnGatewayConnection,
	type OnGatewayDisconnect,
	type OnGatewayInit,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { z } from "zod";
import { BoardAccessService } from "../access-control/application/board-access.service.js";
import { BoardPermission } from "../access-control/domain/board-permission.enum.js";
import { AuthenticationService } from "../identity/application/authentication.service.js";
import type { CurrentUser } from "../users/application/user-sync.service.js";
import {
	type PresenceUser,
	RedisPresenceService,
} from "./redis-presence.service.js";

const joinSchema = z.object({ boardId: z.uuid() }).strict();
const cursorSchema = z
	.object({
		boardId: z.uuid(),
		x: z.number().finite(),
		y: z.number().finite(),
	})
	.strict();
const CURSOR_LIMIT_PER_SECOND = 20;
const PRESENCE_REFRESH_MS = 20_000;

type RealtimeSocketData = {
	cursorTimestamps: number[];
	joinedBoards: Set<string>;
	user: CurrentUser;
};

type RealtimeSocket = Socket<
	Record<string, never>,
	Record<string, never>,
	Record<string, never>,
	RealtimeSocketData
>;

type ErrorAck = { error: { code: string }; ok: false };
type SuccessAck<T extends object = object> = T & { ok: true };

@WebSocketGateway({ namespace: "/realtime" })
export class RealtimeGateway
	implements
		OnGatewayInit,
		OnGatewayConnection,
		OnGatewayDisconnect,
		OnModuleDestroy
{
	@WebSocketServer() server!: Server;
	private readonly logger = new Logger(RealtimeGateway.name);
	private readonly sockets = new Map<string, RealtimeSocket>();
	private heartbeat?: NodeJS.Timeout;

	constructor(
		@Inject(AuthenticationService)
		private readonly authentication: AuthenticationService,
		@Inject(BoardAccessService)
		private readonly boardAccess: BoardAccessService,
		@Inject(RedisPresenceService)
		private readonly presence: RedisPresenceService,
	) {}

	afterInit(server: Server): void {
		server.use((socket, next) => {
			void this.authenticateSocket(socket as RealtimeSocket).then(
				() => next(),
				() => next(new Error("unauthorized")),
			);
		});
		this.heartbeat = setInterval(() => {
			void this.refreshLocalPresence();
		}, PRESENCE_REFRESH_MS);
		this.heartbeat.unref();
	}

	handleConnection(socket: RealtimeSocket): void {
		this.sockets.set(socket.id, socket);
	}

	async handleDisconnect(socket: RealtimeSocket): Promise<void> {
		this.sockets.delete(socket.id);
		const joinedBoards = [...(socket.data.joinedBoards ?? [])];
		await Promise.allSettled(
			joinedBoards.map(async (boardId) => {
				const becameOffline = await this.presence.leave(
					boardId,
					socket.id,
					socket.data.user.id,
				);
				if (becameOffline) {
					this.server
						.to(this.room(boardId))
						.emit("presence:left", { userId: socket.data.user.id });
				}
			}),
		);
	}

	@SubscribeMessage("board:join")
	async join(
		@ConnectedSocket() socket: RealtimeSocket,
		@MessageBody() body: unknown,
	): Promise<
		SuccessAck<{ boardId: string; presence: PresenceUser[] }> | ErrorAck
	> {
		const parsed = joinSchema.safeParse(body);
		if (!parsed.success) return this.error("invalid_payload");
		const { boardId } = parsed.data;
		try {
			await this.boardAccess.assertPermissions(socket.data.user.id, boardId, [
				BoardPermission.BOARD_READ,
			]);
			if (socket.data.joinedBoards.has(boardId)) {
				return {
					boardId,
					ok: true,
					presence: await this.presence.snapshot(boardId),
				};
			}
			const result = await this.presence.join(
				boardId,
				socket.id,
				socket.data.user,
			);
			try {
				await socket.join(this.room(boardId));
			} catch (error) {
				await this.presence.leave(boardId, socket.id, socket.data.user.id);
				throw error;
			}
			socket.data.joinedBoards.add(boardId);
			if (result.becameOnline) {
				socket.to(this.room(boardId)).emit("presence:joined", {
					user: this.toPresenceUser(socket.data.user),
				});
			}
			return { boardId, ok: true, presence: result.users };
		} catch (error) {
			return this.toErrorAck(error);
		}
	}

	@SubscribeMessage("board:leave")
	async leave(
		@ConnectedSocket() socket: RealtimeSocket,
		@MessageBody() body: unknown,
	): Promise<SuccessAck | ErrorAck> {
		const parsed = joinSchema.safeParse(body);
		if (!parsed.success) return this.error("invalid_payload");
		const { boardId } = parsed.data;
		if (!socket.data.joinedBoards.has(boardId)) {
			return this.error("not_joined");
		}
		try {
			await socket.leave(this.room(boardId));
			socket.data.joinedBoards.delete(boardId);
			const becameOffline = await this.presence.leave(
				boardId,
				socket.id,
				socket.data.user.id,
			);
			if (becameOffline) {
				this.server
					.to(this.room(boardId))
					.emit("presence:left", { userId: socket.data.user.id });
			}
			return { ok: true };
		} catch (error) {
			return this.toErrorAck(error);
		}
	}

	@SubscribeMessage("cursor:update")
	async updateCursor(
		@ConnectedSocket() socket: RealtimeSocket,
		@MessageBody() body: unknown,
	): Promise<SuccessAck | ErrorAck> {
		const parsed = cursorSchema.safeParse(body);
		if (!parsed.success) return this.error("invalid_payload");
		const { boardId, x, y } = parsed.data;
		if (!socket.data.joinedBoards.has(boardId)) {
			return this.error("not_joined");
		}
		if (!this.consumeCursorToken(socket)) {
			return this.error("rate_limited");
		}
		try {
			await this.boardAccess.assertPermissions(socket.data.user.id, boardId, [
				BoardPermission.BOARD_READ,
			]);
			await this.presence.refresh(boardId, socket.id);
			socket.to(this.room(boardId)).emit("cursor:updated", {
				userId: socket.data.user.id,
				x,
				y,
			});
			return { ok: true };
		} catch (error) {
			return this.toErrorAck(error);
		}
	}

	emitBoardEvent(boardId: string, eventName: string, payload: unknown): void {
		this.server.to(this.room(boardId)).emit(eventName, payload);
	}

	onModuleDestroy(): void {
		if (this.heartbeat) clearInterval(this.heartbeat);
	}

	private async authenticateSocket(socket: RealtimeSocket): Promise<void> {
		const token = this.extractToken(socket);
		const user = await this.authentication.authenticate(token);
		socket.data = {
			cursorTimestamps: [],
			joinedBoards: new Set(),
			user,
		};
	}

	private consumeCursorToken(socket: RealtimeSocket): boolean {
		const now = Date.now();
		socket.data.cursorTimestamps = socket.data.cursorTimestamps.filter(
			(timestamp) => now - timestamp < 1_000,
		);
		if (socket.data.cursorTimestamps.length >= CURSOR_LIMIT_PER_SECOND) {
			return false;
		}
		socket.data.cursorTimestamps.push(now);
		return true;
	}

	private extractToken(socket: RealtimeSocket): string {
		const authToken: unknown = socket.handshake.auth?.token;
		if (
			typeof authToken === "string" &&
			authToken.length > 0 &&
			!/[\s]/.test(authToken)
		) {
			return authToken;
		}
		const authorization = socket.handshake.headers.authorization;
		const match =
			typeof authorization === "string"
				? /^Bearer ([^\s]+)$/.exec(authorization)
				: null;
		if (!match?.[1]) {
			throw new BadRequestException("A valid bearer token is required.");
		}
		return match[1];
	}

	private async refreshLocalPresence(): Promise<void> {
		const operations: Array<Promise<void>> = [];
		for (const socket of this.sockets.values()) {
			for (const boardId of socket.data.joinedBoards) {
				operations.push(this.presence.refresh(boardId, socket.id));
			}
		}
		const results = await Promise.allSettled(operations);
		if (results.some(({ status }) => status === "rejected")) {
			this.logger.warn("One or more realtime presence heartbeats failed");
		}
	}

	private error(code: string): ErrorAck {
		return { error: { code }, ok: false };
	}

	private toErrorAck(error: unknown): ErrorAck {
		if (error instanceof HttpException) {
			const status = error.getStatus();
			if (status === 400) return this.error("invalid_request");
			if (status === 401) return this.error("unauthorized");
			if (status === 403 || status === 404) return this.error("access_denied");
			if (status === 409) return this.error("conflict");
		}
		this.logger.error("Realtime message failed");
		return this.error("internal_error");
	}

	private room(boardId: string): string {
		return `board:${boardId}`;
	}

	private toPresenceUser(user: CurrentUser): PresenceUser {
		return {
			avatarUrl: user.avatarUrl ?? null,
			id: user.id,
			name: user.name,
		};
	}
}
