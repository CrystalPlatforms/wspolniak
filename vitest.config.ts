import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@": resolve(import.meta.dirname, "src"),
			// DurableObject (RPC-style) istnieje tylko w workerd — w vitest podstawiamy stub.
			"cloudflare:workers": resolve(import.meta.dirname, "src/test/cloudflare-workers-stub.ts"),
		},
	},
	test: {
		globals: true,
		include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
		exclude: ["src/routes/**"],
		environment: "jsdom",
		setupFiles: ["./src/test/setup.ts"],
	},
});
