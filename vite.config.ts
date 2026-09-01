import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	server: {
		host: "0.0.0.0",
		// Błąd HMR „createStartHandler is not a function" (TanStack Start × @cloudflare/vite-plugin)
		// pojawia się sporadycznie przy przeładowaniu SSR. Wyłączamy nakładkę błędu, żeby nie blokować
		// UI i nie wymuszać restartu dev servera — sam błąd ląduje w konsoli, a kolejny HMR go czyści.
		hmr: { overlay: false },
	},
	plugins: [
		viteTsConfigPaths({
			projects: ["./tsconfig.json"],
		}),
		tailwindcss(),
		tanstackStart({
			srcDirectory: "src",
			start: { entry: "./start.tsx" },
			server: { entry: "./server.ts" },
		}),
		viteReact(),
		cloudflare({
			// Deploy produkcyjny (build:production) ustawia DEPLOY_ENV=production, żeby build
			// "wypiekł" konfigurację workera `wspolniak` (wspolniak.com) do dist/server/wrangler.json.
			// Bez tego plugin piecze zawsze top-level (dev), a `wrangler deploy --env=''`
			// czyta właśnie wynik builda — i trafia na wspolniak-dev.
			configPath:
				process.env.DEPLOY_ENV === "production" ? "./wrangler.prod.jsonc" : "./wrangler.jsonc",
			viteEnvironment: {
				name: "ssr",
			},
		}),
	],
});
