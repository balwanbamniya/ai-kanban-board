import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderPage } from "../test/render";
import { HomePage } from "./home-page";
import { NotFoundPage } from "./not-found-page";

const identity = vi.hoisted(() => ({
	userId: null as string | null,
	isLoaded: true,
	getToken: async () => null,
}));
vi.mock("./providers", () => ({ useIdentity: () => identity }));
vi.mock("@clerk/tanstack-react-start", () => ({
	UserButton: () => <button type="button">Account</button>,
}));
afterEach(() => {
	cleanup();
	identity.userId = null;
});
describe("public pages", () => {
	it("offers account creation and honestly labeled sample content", async () => {
		renderPage(<HomePage />);
		expect(
			await screen.findByRole("heading", {
				name: /Big ideas.*Clear next steps/,
			}),
		).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: /Find your flow/ }),
		).toHaveAttribute("href", "/register");
		expect(screen.getByText("Sample board")).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: /See how it works/ }),
		).toHaveAttribute("href", "#how-it-works");
	});
	it("sends authenticated visitors to their workspace", async () => {
		identity.userId = "user-1";
		renderPage(<HomePage />);
		expect(
			await screen.findByRole("link", { name: /Go to your workspace/ }),
		).toHaveAttribute("href", "/dashboard");
		expect(
			screen.queryByRole("link", { name: "Log in" }),
		).not.toBeInTheDocument();
	});
	it("provides a usable not-found page", async () => {
		renderPage(<NotFoundPage />);
		expect(
			await screen.findByRole("heading", { name: /This one slipped/ }),
		).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /Back to home/ })).toHaveAttribute(
			"href",
			"/",
		);
	});
});
