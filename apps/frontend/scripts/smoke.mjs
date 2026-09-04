import assert from "node:assert/strict";

const origin = process.env.FRONTEND_SMOKE_URL || "http://localhost:3000";
for (const [path, status, content] of [
	["/", 200, "Big ideas."],
	["/login", 200, "A fresh start, again."],
	["/register", 200, "Let’s make it happen."],
	["/404", 404, "This one slipped"],
	["/unknown-smoke-route", 404, "This one slipped"],
]) {
	const response = await fetch(new URL(path, origin), {
		signal: AbortSignal.timeout(15000),
	});
	assert.equal(response.status, status, `${path} status`);
	assert.ok((await response.text()).includes(content), `${path} page content`);
	console.log(`PASS ${path}: ${status}`);
}
const dashboard = await fetch(new URL("/dashboard", origin), {
	redirect: "manual",
	signal: AbortSignal.timeout(15000),
});
assert.equal(dashboard.status, 307);
assert.equal(
	new URL(dashboard.headers.get("location"), origin).pathname,
	"/login",
);
console.log("PASS /dashboard: signed-out redirect");
const unsafe = await fetch(
	new URL("/login?redirect=https%3A%2F%2Fexample.org", origin),
	{ redirect: "manual", signal: AbortSignal.timeout(15000) },
);
assert.equal(unsafe.status, 307);
const safe = new URL(unsafe.headers.get("location"), origin);
assert.equal(safe.origin, new URL(origin).origin);
assert.equal(safe.searchParams.get("redirect"), "/dashboard");
console.log("PASS external return URL rejected");
