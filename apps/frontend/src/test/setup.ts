import "@testing-library/jest-dom/vitest";

import { vi } from "vitest";

Object.defineProperty(window, "scrollTo", { value: vi.fn(), writable: true });

// JSDOM has no layout engine; browser checks cover actual drag geometry.
globalThis.ResizeObserver = class {
	observe() {}
	unobserve() {}
	disconnect() {}
};
