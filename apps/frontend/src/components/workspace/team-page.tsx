import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { BoardDetail, Invitation } from "../../lib/api";
import {
	permissions,
	useBoard,
	useMe,
	usePages,
	useWrite,
} from "../../lib/workspace";
import { Button, ErrorNotice, Loading } from "../ui";
import { AppShell } from "./app-shell";
import { BoardSelector } from "./board-selector";
import { Modal, More } from "./primitives";
export function TeamPage({ boardId = "" }: { boardId?: string }) {
	const nav = useNavigate();
	return (
		<AppShell>
			<div className="workspace-page-heading">
				<div>
					<span className="eyebrow">GOOD WORK IS SHARED</span>
					<h1>Your people.</h1>
					<p>Give everyone the right place on the board.</p>
				</div>
				<BoardSelector
					value={boardId}
					onChange={(id) =>
						void nav({ to: "/team", search: { boardId: id || undefined } })
					}
				/>
			</div>
			{boardId ? (
				<BoardTeam key={boardId} boardId={boardId} />
			) : (
				<div className="empty-state">
					Choose a board to see its collaborators and invitations.
				</div>
			)}
		</AppShell>
	);
}
function BoardTeam({ boardId }: { boardId: string }) {
	const board = useBoard(boardId);
	if (board.error) return <ErrorNotice error={board.error} />;
	if (!board.data) return <Loading />;
	return <TeamControls board={board.data} />;
}
function TeamControls({ board }: { board: BoardDetail }) {
	const permission = permissions(board.board);
	const me = useMe();
	const write = useWrite<{ token: string; invitation: Invitation }>();
	const inv = usePages<{ invitations: Invitation[] }>(
		"invitations",
		`/boards/${board.board.id}/invitations`,
		permission.readInvitations,
	);
	const [link, setLink] = useState("");
	const [copied, setCopied] = useState(false);
	const [action, setAction] = useState<{
		title: string;
		path: string;
		method: "PATCH" | "DELETE";
		body?: unknown;
		leave?: boolean;
	} | null>(null);
	const nav = useNavigate();
	const roles =
		board.board.role === "OWNER"
			? ["ADMIN", "MEMBER", "VIEWER"]
			: ["MEMBER", "VIEWER"];
	const base = `/boards/${board.board.id}`;
	return (
		<>
			<section className="surface">
				<h2>{board.board.title}</h2>
				<ul className="member-list">
					{board.members.map((member) => {
						const canManage =
							permission.admin &&
							member.id !== me.data?.id &&
							member.role !== "OWNER" &&
							(board.board.role === "OWNER" || member.role !== "ADMIN");
						return (
							<li key={member.id}>
								<span className="member-avatar">
									{member.name.slice(0, 2).toUpperCase()}
								</span>
								<div className="grow">
									<strong>{member.name}</strong>
									<p>{member.email}</p>
								</div>
								{canManage ? (
									<select
										aria-label={`Role for ${member.name}`}
										value={member.role}
										onChange={(e) =>
											setAction({
												title: `Change ${member.name}’s role?`,
												path: `${base}/members/${member.id}`,
												method: "PATCH",
												body: { role: e.target.value },
											})
										}
									>
										{roles.map((role) => (
											<option key={role}>{role}</option>
										))}
									</select>
								) : (
									<span className="role-badge">{member.role}</span>
								)}
								{canManage && (
									<Button
										className="button-small button-secondary"
										onClick={() =>
											setAction({
												title: `Remove ${member.name}?`,
												path: `${base}/members/${member.id}`,
												method: "DELETE",
											})
										}
									>
										Remove
									</Button>
								)}
								{permission.owner &&
									!board.board.archivedAt &&
									member.role !== "OWNER" && (
										<Button
											className="button-small button-secondary"
											onClick={() =>
												setAction({
													title: `Transfer ownership to ${member.name}? You will become an admin.`,
													path: `${base}/owner`,
													method: "PATCH",
													body: {
														userId: member.id,
														version: board.board.version,
													},
												})
											}
										>
											Make owner
										</Button>
									)}
							</li>
						);
					})}
				</ul>
				{!permission.owner && !board.board.archivedAt && (
					<Button
						className="button-secondary"
						onClick={() =>
							setAction({
								title: "Leave this board? You’ll need an invitation to return.",
								path: `${base}/members/me`,
								method: "DELETE",
								leave: true,
							})
						}
					>
						Leave board
					</Button>
				)}
			</section>
			{permission.admin && (
				<section className="surface">
					<h2>Make room for someone new.</h2>
					<form
						className="filter-bar"
						onSubmit={async (e) => {
							e.preventDefault();
							if (write.isPending) return;
							const d = new FormData(e.currentTarget);
							try {
								const r = await write.mutateAsync({
									path: `${base}/invitations`,
									method: "POST",
									body: { email: d.get("email"), role: d.get("role") },
								});
								setLink(`${location.origin}/invite#token=${r.token}`);
								setCopied(false);
							} catch {}
						}}
					>
						<input
							aria-label="Invite email"
							name="email"
							type="email"
							required
							maxLength={320}
							placeholder="teammate@example.com"
						/>
						<select
							name="role"
							aria-label="Invitation role"
							defaultValue="MEMBER"
						>
							{roles.map((role) => (
								<option key={role}>{role}</option>
							))}
						</select>
						<Button disabled={write.isPending}>Create invitation</Button>
					</form>
					<p className="form-note">
						Copy and share the link with this email’s owner. Links expire in
						seven days.
					</p>
					{link && (
						<div className="notice">
							<input aria-label="Invitation link" value={link} readOnly />
							<Button
								className="button-small"
								onClick={async () => {
									try {
										await navigator.clipboard.writeText(link);
										setCopied(true);
									} catch {
										setCopied(false);
									}
								}}
							>
								{copied ? "Copied" : "Copy link"}
							</Button>
						</div>
					)}
				</section>
			)}
			{permission.readInvitations && (
				<section className="surface">
					<h2>Invitations</h2>
					{inv.error && <ErrorNotice error={inv.error} />}
					<ul className="member-list">
						{inv.data?.pages
							.flatMap((p) => p.invitations)
							.map((i) => (
								<li key={i.id}>
									<div className="grow">
										<strong>{i.email}</strong>
										<p>
											{new Date(i.expiresAt) < new Date() &&
											i.status === "PENDING"
												? "EXPIRED"
												: i.status}{" "}
											· {i.role} · Expires{" "}
											{new Date(i.expiresAt).toLocaleString()}
										</p>
									</div>
									{permission.admin &&
										(permission.owner || i.role !== "ADMIN") &&
										i.status === "PENDING" && (
											<>
												<Button
													className="button-small button-secondary"
													disabled={write.isPending}
													onClick={async () => {
														try {
															const r = await write.mutateAsync({
																path: `${base}/invitations/${i.id}/resend`,
																method: "POST",
															});
															setLink(
																`${location.origin}/invite#token=${r.token}`,
															);
															setCopied(false);
														} catch {}
													}}
												>
													Resend / replace link
												</Button>
												<Button
													className="button-small button-secondary"
													onClick={() =>
														setAction({
															title:
																"Revoke this invitation? Its link will stop working.",
															path: `${base}/invitations/${i.id}`,
															method: "DELETE",
														})
													}
												>
													Revoke
												</Button>
											</>
										)}
								</li>
							))}
					</ul>
					<More query={inv} />
				</section>
			)}
			{write.error && <ErrorNotice error={write.error} />}{" "}
			{action && (
				<Modal title={action.title} onClose={() => setAction(null)}>
					<Button
						disabled={write.isPending}
						onClick={async () => {
							try {
								await write.mutateAsync(action);
								if (action.path.includes("/invitations/")) setLink("");
								if (action.leave) void nav({ to: "/dashboard" });
								setAction(null);
							} catch {}
						}}
					>
						Confirm
					</Button>
					{write.error && <ErrorNotice error={write.error} />}
				</Modal>
			)}
		</>
	);
}
