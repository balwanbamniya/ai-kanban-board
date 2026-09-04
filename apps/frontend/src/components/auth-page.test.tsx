import { cleanup, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderPage } from "../test/render";
import { AuthPage } from "./auth-page";

vi.mock("../lib/auth", () => ({ authConfigured: true }));
vi.mock("@clerk/tanstack-react-start", () => ({
	SignIn: ({
		routing,
		forceRedirectUrl,
	}: {
		routing: string;
		forceRedirectUrl: string;
	}) => (
		<div
			data-testid="clerk-sign-in"
			data-routing={routing}
			data-redirect={forceRedirectUrl}
		/>
	),
	SignUp: ({
		routing,
		forceRedirectUrl,
	}: {
		routing: string;
		forceRedirectUrl: string;
	}) => (
		<div
			data-testid="clerk-sign-up"
			data-routing={routing}
			data-redirect={forceRedirectUrl}
		/>
	),
}));
afterEach(cleanup);
it.each(["login", "register"] as const)(
	"uses Clerk hash routing with a safe fixed destination for %s",
	async (mode) => {
		renderPage(<AuthPage mode={mode} />);
		const form = await screen.findByTestId(
			mode === "login" ? "clerk-sign-in" : "clerk-sign-up",
		);
		expect(form).toHaveAttribute("data-routing", "hash");
		expect(form).toHaveAttribute("data-redirect", "/dashboard");
		expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute(
			"href",
			"/",
		);
	},
);
