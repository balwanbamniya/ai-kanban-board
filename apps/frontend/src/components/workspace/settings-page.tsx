import { UserProfile } from "@clerk/tanstack-react-start";
import { usePreferences } from "../../lib/preferences";
import { AppShell } from "./app-shell";
export function SettingsPage() {
	const { preferences, update } = usePreferences();
	return (
		<AppShell>
			<div className="workspace-page-heading">
				<div>
					<span className="eyebrow">MAKE YOURSELF AT HOME</span>
					<h1>A workspace that fits.</h1>
					<p>Your account and a few thoughtful preferences.</p>
				</div>
			</div>
			<section className="surface">
				<h2>Display preferences</h2>
				<p className="form-note">
					Saved for your account in this browser only.
				</p>
				<div className="form-row">
					<label className="field grow">
						Density
						<select
							value={preferences.density}
							onChange={(e) =>
								update({
									...preferences,
									density:
										e.target.value === "compact" ? "compact" : "comfortable",
								})
							}
						>
							<option value="comfortable">Comfortable</option>
							<option value="compact">Compact</option>
						</select>
					</label>
					<label className="field grow">
						Week starts on
						<select
							value={preferences.weekStart}
							onChange={(e) =>
								update({
									...preferences,
									weekStart: e.target.value === "sunday" ? "sunday" : "monday",
								})
							}
						>
							<option value="monday">Monday</option>
							<option value="sunday">Sunday</option>
						</select>
					</label>
				</div>
				<label className="check-label">
					<input
						type="checkbox"
						checked={preferences.cursors}
						onChange={(e) =>
							update({ ...preferences, cursors: e.target.checked })
						}
					/>
					Show collaborator cursors
				</label>
			</section>
			<section className="surface account-settings">
				<h2>Account and security</h2>
				<UserProfile routing="hash" />
			</section>
		</AppShell>
	);
}
