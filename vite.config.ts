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
		{
			// Przeglądarka cache'uje /node_modules/.vite/deps/* jako „immutable" (Vite dodaje
			// max-age=31536000, bo URL ma ?v=hash). Po wyczyszczeniu/odbudowie cache deps
			// chunki mają INNE nazwy i przeglądarka w kółko prosi o stare → 404 → „Failed to
			// fetch dynamically imported module". W dev odpytujemy serwer zawsze świeżo.
			name: "dev-no-immutable-deps-cache",
			apply: "serve",
			configureServer(server) {
				server.middlewares.use((req, res, next) => {
					if (req.url?.includes("/node_modules/.vite/")) {
						res.setHeader("Cache-Control", "no-store");
					}
					next();
				});
			},
		},
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
