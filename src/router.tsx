// SPDX-License-Identifier: AGPL-3.0-or-later
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { Loader } from "@/components/ui/loader";
import * as TanstackQuery from "./integrations/tanstack-query/root-provider";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

function RoutePending() {
	return (
		<div className="flex min-h-dvh items-center justify-center bg-background">
			<Loader size={10} />
		</div>
	);
}

// Create a new router instance
export const getRouter = () => {
	const rqContext = TanstackQuery.getContext();

	const router = createRouter({
		routeTree,
		context: { ...rqContext },
		defaultPreload: "intent",
		defaultPendingComponent: RoutePending,
		defaultPendingMs: 0,
		Wrap: (props: { children: React.ReactNode }) => {
			return <TanstackQuery.Provider {...rqContext}>{props.children}</TanstackQuery.Provider>;
		},
	});

	setupRouterSsrQueryIntegration({ router, queryClient: rqContext.queryClient });

	return router;
};
