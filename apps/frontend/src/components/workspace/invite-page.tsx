import { UserButton } from "@clerk/tanstack-react-start";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ApiError } from "../../lib/api";
import { useMe, useWrite } from "../../lib/workspace";
import { useIdentity } from "../providers";
import { Brand, Button, ErrorNotice, Loading } from "../ui";

const key = "kanban-pending-invitation";
export function InvitePage() {
	const { userId, isLoaded } = useIdentity();
	const me = useMe();
	const nav = useNavigate();
	const [token, setToken] = useState("");
	const [loaded, setLoaded] = useState(false);
	const [terminal, setTerminal] = useState(false);
	const accept = useWrite<{ boardId: string }>();
	useEffect(() => {
		const incoming = new URLSearchParams(location.hash.slice(1)).get("token");
		try {
			if (incoming) {
				if (/^[A-Za-z0-9_-]{43}$/.test(incoming)) {
					sessionStorage.setItem(
						key,
						JSON.stringify({
							token: incoming,
							expires: Date.now() + 24 * 60 * 60 * 1000,
						}),
					);
					setToken(incoming);
				} else {
					sessionStorage.removeItem(key);
				}
			} else {
				const saved = JSON.parse(sessionStorage.getItem(key) || "null");
				if (saved?.expires > Date.now() && typeof saved.token === "string")
					setToken(saved.token);
				else sessionStorage.removeItem(key);
			}
		} catch {
			if (incoming && /^[A-Za-z0-9_-]{43}$/.test(incoming)) setToken(incoming);
		}
		if (incoming) history.replaceState(null, "", location.pathname);
		setLoaded(true);
	}, []);
	return (
		<main id="main-content" className="invite-page page-container">
			<Brand />
			<section className="surface">
				<span className="eyebrow">THERE’S A PLACE FOR YOU HERE</span>
				<h1>Good work is better together.</h1>
				{!loaded || !isLoaded ? (
					<Loading />
				) : !token ? (
					<p>
						This invitation is missing or invalid. Ask the board owner for a new
						link.
					</p>
				) : !userId ? (
					<>
						<p>Sign in with the email address that received this invitation.</p>
						<Link
							to="/login"
							search={{ redirect: "/invite" }}
							className="button"
						>
							Sign in to join
						</Link>
						<Link
							to="/register"
							search={{ redirect: "/invite" }}
							className="text-link"
						>
							Create account
						</Link>
					</>
				) : (
					<>
						<p>
							Joining as {me.data?.email || "your signed-in account"}.
							Invitation links can be used once and expire after seven days.
						</p>
						{me.error && <ErrorNotice error={me.error} />}
						<Button
							disabled={!me.isSuccess || accept.isPending || terminal}
							onClick={async () => {
								try {
									const joined = await accept.mutateAsync({
										path: "/invitations/accept",
										method: "POST",
										body: { token },
									});
									try {
										sessionStorage.removeItem(key);
									} catch {}
									setToken("");
									void nav({
										to: "/board/$boardId",
										params: { boardId: joined.boardId },
									});
								} catch (error) {
									if (
										error instanceof ApiError &&
										[409, 410].includes(error.status)
									) {
										setTerminal(true);
										try {
											sessionStorage.removeItem(key);
										} catch {}
									}
								}
							}}
						>
							Accept invitation
						</Button>
						{accept.error && <ErrorNotice error={accept.error} />}
						<UserButton />
						<p>
							Wrong account? Use the account menu to switch, then reopen this
							invitation.
						</p>
					</>
				)}
				<Link to="/" className="text-link">
					Back to home
				</Link>
			</section>
		</main>
	);
}
