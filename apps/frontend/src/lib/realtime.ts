import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useIdentity } from "../components/providers";
import { useRefresh } from "./workspace";
export interface Presence {
	id: string;
	name: string;
	avatarUrl?: string | null;
}
export function useRealtime(boardId: string, enabled: boolean) {
	const { getToken, userId } = useIdentity();
	const refresh = useRefresh();
	const refreshRef = useRef(refresh);
	refreshRef.current = refresh;
	const tokenRef = useRef(getToken);
	tokenRef.current = getToken;
	const socketRef = useRef<Socket | null>(null);
	const [status, setStatus] = useState("Connecting");
	const [people, setPeople] = useState<Presence[]>([]);
	const [cursors, setCursors] = useState<
		Record<string, { x: number; y: number }>
	>({});
	const lastCursor = useRef(0);
	useEffect(() => {
		if (!enabled || !userId) return;
		let stopped = false;
		const seen = new Set<string>();
		const base = (
			import.meta.env.VITE_API_BASE_URL || "http://localhost:3001/api/v1"
		).replace(/\/api\/v1\/?$/, "");
		const socket = io(`${base}/realtime`, {
			autoConnect: false,
			auth: async (callback) => {
				try {
					callback({ token: await tokenRef.current() });
				} catch {
					callback({ token: null });
				}
			},
		});
		socketRef.current = socket;
		function join() {
			socket
				.timeout(8000)
				.emit(
					"board:join",
					{ boardId },
					(err: unknown, ack: { ok: boolean; presence?: Presence[] }) => {
						if (stopped) return;
						if (err || !ack?.ok) {
							setStatus("Connection unavailable");
							void refreshRef.current();
							return;
						}
						setPeople(ack.presence || []);
						setStatus("Live");
						void refreshRef.current();
					},
				);
		}
		socket.on("connect", join);
		socket.on("disconnect", () => {
			setStatus("Reconnecting");
			setPeople([]);
			setCursors({});
		});
		socket.on("connect_error", () =>
			setStatus("Offline · changes refresh automatically"),
		);
		socket.on("presence:joined", ({ user }: { user: Presence }) =>
			setPeople((p) => [...p.filter((x) => x.id !== user.id), user]),
		);
		socket.on("presence:left", ({ userId: id }: { userId: string }) => {
			setPeople((p) => p.filter((x) => x.id !== id));
			setCursors((p) => {
				const n = { ...p };
				delete n[id];
				return n;
			});
		});
		socket.on(
			"cursor:updated",
			({ userId: id, x, y }: { userId: string; x: number; y: number }) =>
				setCursors((p) => ({ ...p, [id]: { x, y } })),
		);
		socket.onAny((_name, event: unknown) => {
			if (
				!event ||
				typeof event !== "object" ||
				!("eventId" in event) ||
				!("boardId" in event) ||
				event.boardId !== boardId ||
				typeof event.eventId !== "string" ||
				seen.has(event.eventId)
			)
				return;
			seen.add(event.eventId);
			if (seen.size > 1000) seen.delete(seen.values().next().value as string);
			void refreshRef.current();
		});
		socket.connect();
		const renew = setInterval(() => {
			if (!stopped) {
				socket.disconnect();
				socket.connect();
			}
		}, 50_000);
		return () => {
			stopped = true;
			clearInterval(renew);
			socket.emit("board:leave", { boardId });
			socket.removeAllListeners();
			socket.disconnect();
			socketRef.current = null;
			setPeople([]);
			setCursors({});
		};
	}, [boardId, enabled, userId]);
	function sendCursor(x: number, y: number) {
		if (Date.now() - lastCursor.current < 100) return;
		lastCursor.current = Date.now();
		socketRef.current?.emit("cursor:update", { boardId, x, y });
	}
	return { status, people, cursors, sendCursor };
}
