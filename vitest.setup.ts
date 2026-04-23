import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { vi } from "vitest";
import { afterEach } from "vitest";

if (!URL.createObjectURL) {
  URL.createObjectURL = vi.fn(() => `blob:mock-${Math.random().toString(16).slice(2)}`);
}

if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = vi.fn();
}

afterEach(() => {
  cleanup();
});
