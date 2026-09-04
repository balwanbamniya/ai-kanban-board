import { useEffect, useState } from "react";
import { useIdentity } from "../components/providers";
export interface Preferences {
	density: "comfortable" | "compact";
	weekStart: "monday" | "sunday";
	cursors: boolean;
}
const defaults: Preferences = {
	density: "comfortable",
	weekStart: "monday",
	cursors: true,
};
export function usePreferences() {
	const { userId } = useIdentity();
	const key = `kanban-preferences:${userId || "guest"}`;
	const [preferences, set] = useState(defaults);
	useEffect(() => {
		function read() {
			try {
				const p = JSON.parse(localStorage.getItem(key) || "{}");
				set({
					density: p.density === "compact" ? "compact" : "comfortable",
					weekStart: p.weekStart === "sunday" ? "sunday" : "monday",
					cursors: p.cursors !== false,
				});
			} catch {
				set(defaults);
			}
		}
		read();
		window.addEventListener("kanban-preferences", read);
		return () => window.removeEventListener("kanban-preferences", read);
	}, [key]);
	function update(next: Preferences) {
		set(next);
		try {
			localStorage.setItem(key, JSON.stringify(next));
			window.dispatchEvent(new Event("kanban-preferences"));
		} catch {
			/* Storage may be unavailable; keep this session's choice. */
		}
	}
	return { preferences, update };
}
