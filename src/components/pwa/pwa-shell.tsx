// SPDX-License-Identifier: AGPL-3.0-or-later

import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { isIOSSafari, isStandalone } from "@/pwa/detect";
import { useInstallPrompt } from "@/pwa/use-install-prompt";
import { useOnlineStatus } from "@/pwa/use-online-status";
import { InstallBanner } from "./install-banner";
import { IOSInstallBanner } from "./ios-install-banner";
import { PushPrompt } from "./push-prompt";

export function PwaShell({ children }: { children: React.ReactNode }) {
	const online = useOnlineStatus();
	const { canInstall, promptInstall } = useInstallPrompt();
	const [iosSafari, setIOSSafari] = useState(false);
	const [standalone, setStandalone] = useState(false);

	useEffect(() => {
		setIOSSafari(isIOSSafari());
		setStandalone(isStandalone());
	}, []);

	useEffect(() => {
		if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
		// SW tylko na produkcji: w dev cache'ował bundlę Vite i po hot-reloadach
		// serwował nieistniejące chunki („Failed to fetch dynamically imported
		// module"). W dev dodatkowo automatycznie wyrejestrujemy stare workery,
		// żeby nikt nie musiał robić tego ręcznie w DevTools.
		if (import.meta.env.DEV) {
			void navigator.serviceWorker.getRegistrations().then((registrations) => {
				for (const registration of registrations) {
					void registration.unregister();
				}
			});
			return;
		}
		navigator.serviceWorker.register("/sw.js").catch((_error) => {});
	}, []);

	return (
		<>
			{children}

			{!online && (
				<div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-destructive p-2 text-destructive-foreground">
					<WifiOff className="h-4 w-4" />
					<span className="text-sm font-medium">Brak połączenia</span>
				</div>
			)}

			<InstallBanner canInstall={canInstall} promptInstall={promptInstall} />

			<IOSInstallBanner isIOSSafari={iosSafari} isStandalone={standalone} />

			<PushPrompt isStandalone={standalone} />
		</>
	);
}
