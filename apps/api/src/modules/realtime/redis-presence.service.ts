import { Inject, Injectable } from "@nestjs/common";
import type { CurrentUser } from "../users/application/user-sync.service.js";
import { RealtimeRedisService } from "./realtime-redis.service.js";

const PRESENCE_TTL_MS = 45_000;

const joinScript = `
local expires = KEYS[1]
local profiles = KEYS[2]
local now = tonumber(ARGV[1])
local expiresAt = tonumber(ARGV[2])
local ttlSeconds = tonumber(ARGV[3])
local socketId = ARGV[4]
local userId = ARGV[5]
local profile = ARGV[6]
local expired = redis.call('ZRANGEBYSCORE', expires, '-inf', now)
if #expired > 0 then
  redis.call('ZREM', expires, unpack(expired))
  redis.call('HDEL', profiles, unpack(expired))
end
local wasOnline = 0
local current = redis.call('HVALS', profiles)
for _, encoded in ipairs(current) do
  if cjson.decode(encoded).id == userId then wasOnline = 1 end
end
redis.call('ZADD', expires, expiresAt, socketId)
redis.call('HSET', profiles, socketId, profile)
redis.call('EXPIRE', expires, ttlSeconds)
redis.call('EXPIRE', profiles, ttlSeconds)
local result = { tostring(wasOnline) }
local updated = redis.call('HVALS', profiles)
for _, encoded in ipairs(updated) do table.insert(result, encoded) end
return result
`;

const leaveScript = `
local expires = KEYS[1]
local profiles = KEYS[2]
local socketId = ARGV[1]
local userId = ARGV[2]
redis.call('ZREM', expires, socketId)
redis.call('HDEL', profiles, socketId)
local stillOnline = 0
local current = redis.call('HVALS', profiles)
for _, encoded in ipairs(current) do
  if cjson.decode(encoded).id == userId then stillOnline = 1 end
end
return stillOnline
`;

const snapshotScript = `
local expires = KEYS[1]
local profiles = KEYS[2]
local now = tonumber(ARGV[1])
local expired = redis.call('ZRANGEBYSCORE', expires, '-inf', now)
if #expired > 0 then
  redis.call('ZREM', expires, unpack(expired))
  redis.call('HDEL', profiles, unpack(expired))
end
return redis.call('HVALS', profiles)
`;

export interface PresenceUser {
	avatarUrl: string | null;
	id: string;
	name: string;
}

@Injectable()
export class RedisPresenceService {
	constructor(
		@Inject(RealtimeRedisService)
		private readonly redis: RealtimeRedisService,
	) {}

	async join(
		boardId: string,
		socketId: string,
		user: CurrentUser,
	): Promise<{ becameOnline: boolean; users: PresenceUser[] }> {
		const now = Date.now();
		const result = await this.redis.command.eval(joinScript, {
			keys: this.keys(boardId),
			arguments: [
				String(now),
				String(now + PRESENCE_TTL_MS),
				String(Math.ceil(PRESENCE_TTL_MS / 1_000) + 5),
				socketId,
				user.id,
				JSON.stringify({
					avatarUrl: user.avatarUrl ?? null,
					id: user.id,
					name: user.name,
				}),
			],
		});
		const values = this.stringArray(result);
		return {
			becameOnline: values.shift() === "0",
			users: this.uniqueUsers(values),
		};
	}

	async leave(
		boardId: string,
		socketId: string,
		userId: string,
	): Promise<boolean> {
		const result = await this.redis.command.eval(leaveScript, {
			keys: this.keys(boardId),
			arguments: [socketId, userId],
		});
		return Number(result) === 0;
	}

	async refresh(boardId: string, socketId: string): Promise<void> {
		const [expiresKey, profilesKey] = this.keys(boardId);
		const now = Date.now();
		await this.redis.command
			.multi()
			.zAdd(
				expiresKey,
				{
					score: now + PRESENCE_TTL_MS,
					value: socketId,
				},
				{ condition: "XX" },
			)
			.expire(expiresKey, Math.ceil(PRESENCE_TTL_MS / 1_000) + 5)
			.expire(profilesKey, Math.ceil(PRESENCE_TTL_MS / 1_000) + 5)
			.exec();
	}

	async snapshot(boardId: string): Promise<PresenceUser[]> {
		const result = await this.redis.command.eval(snapshotScript, {
			keys: this.keys(boardId),
			arguments: [String(Date.now())],
		});
		return this.uniqueUsers(this.stringArray(result));
	}

	private keys(boardId: string): [string, string] {
		return [`presence:{${boardId}}:expires`, `presence:{${boardId}}:profiles`];
	}

	private stringArray(value: unknown): string[] {
		if (
			!Array.isArray(value) ||
			value.some((item) => typeof item !== "string")
		) {
			throw new Error("Redis returned an invalid presence response.");
		}
		return [...value];
	}

	private uniqueUsers(encodedProfiles: string[]): PresenceUser[] {
		const users = new Map<string, PresenceUser>();
		for (const encoded of encodedProfiles) {
			const parsed: unknown = JSON.parse(encoded);
			if (
				typeof parsed !== "object" ||
				parsed === null ||
				!("id" in parsed) ||
				!("name" in parsed) ||
				typeof parsed.id !== "string" ||
				typeof parsed.name !== "string"
			) {
				throw new Error("Redis contains an invalid presence profile.");
			}
			users.set(parsed.id, {
				avatarUrl:
					"avatarUrl" in parsed && typeof parsed.avatarUrl === "string"
						? parsed.avatarUrl
						: null,
				id: parsed.id,
				name: parsed.name,
			});
		}
		return [...users.values()].sort((left, right) =>
			left.id.localeCompare(right.id),
		);
	}
}
