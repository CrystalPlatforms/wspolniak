// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useSearch } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Check, Copy, Plus, Waypoints } from "lucide-react";
import { useState } from "react";
import { FeatureToggles } from "@/components/admin/feature-toggles";
import { MaintenanceDialog } from "@/components/admin/maintenance-dialog";
import { MemberRow } from "@/components/admin/member-row";
import { ShareCodeDialog } from "@/components/admin/share-code-dialog";
import {
	type UploadFailureEntry,
	UploadFailuresSection,
} from "@/components/admin/upload-failures-section";
import {
	YoutubeConnection,
	type YoutubeConnectionStatus,
} from "@/components/admin/youtube-connection";
import { feedQueryKey } from "@/components/app/feed-query";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader } from "@/components/ui/loader";

interface Member {
	id: string;
	name: string;
	role: string;
	createdAt: string;
	// AL (F1 #179) — blokada AI nałożona przez admina na tego członka.
	aiBlocked: boolean;
}

interface CreateMemberResponse {
	data: { user: Member; magicLink: string };
}

export const Route = createFileRoute("/app/admin")({
	beforeLoad: ({ context }) => {
		if (context.session.role !== "admin") {
			throw redirect({ to: "/app" });
		}
	},
	component: AdminPage,
});

function AdminPage() {
	const queryClient = useQueryClient();
	const [newName, setNewName] = useState("");
	const [copiedLink, setCopiedLink] = useState<string | null>(null);
	const [lastMagicLink, setLastMagicLink] = useState<{ name: string; link: string } | null>(null);
	const [addDialogOpen, setAddDialogOpen] = useState(false);
	const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false);
	// #166: dialog kodu dostępu /share (kod + QR per członek).
	const [shareCodeDialogOpen, setShareCodeDialogOpen] = useState(false);

	const membersQuery = useQuery({
		queryKey: ["admin", "members"],
		queryFn: async (): Promise<Member[]> => {
			const res = await fetch("/api/admin/members");
			if (!res.ok) throw new Error("Nie udało się pobrać członków");
			const json = (await res.json()) as { data: Member[] };
			return json.data;
		},
	});

	const createMutation = useMutation({
		mutationFn: async (name: string): Promise<CreateMemberResponse> => {
			const res = await fetch("/api/admin/members", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name }),
			});
			if (!res.ok) {
				const err = (await res.json()) as { error: string };
				throw new Error(err.error);
			}
			return res.json() as Promise<CreateMemberResponse>;
		},
		onSuccess: async (data) => {
			setLastMagicLink({ name: data.data.user.name, link: data.data.magicLink });
			setNewName("");
			setAddDialogOpen(false);
			await queryClient.invalidateQueries({ queryKey: ["admin", "members"] });
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async (id: string) => {
			const res = await fetch(`/api/admin/members/${id}`, { method: "DELETE" });
			if (!res.ok) throw new Error("Nie udało się usunąć członka");
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["admin", "members"] });
		},
	});

	const regenerateMutation = useMutation({
		mutationFn: async ({ id, name }: { id: string; name: string }) => {
			const res = await fetch(`/api/admin/members/${id}/regenerate`, { method: "POST" });
			if (!res.ok) throw new Error("Nie udało się wygenerować nowego linku");
			const json = (await res.json()) as { data: { magicLink: string } };
			return { name, link: json.data.magicLink };
		},
		// Link pokazuje dialog „Info" danego członka — banner nie jest już potrzebny
		// (przebudowa 2026-09-01: opcje usera przeniesione z listy do dialogu).
	});

	const renameMutation = useMutation({
		mutationFn: async ({ id, name }: { id: string; name: string }) => {
			const res = await fetch(`/api/admin/members/${id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name }),
			});
			if (!res.ok) {
				const err = (await res.json()) as { error: string };
				throw new Error(err.error);
			}
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["admin", "members"] });
			await queryClient.invalidateQueries({ queryKey: feedQueryKey });
		},
	});

	// AL (F1 #179) — blokada AI per członek; przełącznik w wierszu MemberRow.
	const aiBlockedMutation = useMutation({
		mutationFn: async ({ id, blocked }: { id: string; blocked: boolean }) => {
			const res = await fetch(`/api/admin/members/${id}/ai-blocked`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ blocked }),
			});
			if (!res.ok) throw new Error("Nie udało się zapisać ustawienia AI");
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["admin", "members"] });
		},
	});

	const maintenanceQuery = useQuery({
		queryKey: ["admin", "maintenance"],
		queryFn: async () => {
			const res = await fetch("/api/admin/maintenance");
			if (!res.ok) throw new Error("Nie udało się pobrać konfiguracji trybu awaryjnego");
			const json = (await res.json()) as {
				data: { enabled: boolean; message: string; subtitle: string; icon: string };
			};
			return json.data;
		},
	});

	const maintenanceMutation = useMutation({
		mutationFn: async (input: {
			enabled?: boolean;
			message?: string;
			subtitle?: string;
			icon?: string;
		}) => {
			const res = await fetch("/api/admin/maintenance", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(input),
			});
			if (!res.ok) {
				const err = (await res.json()) as { error: string };
				throw new Error(err.error);
			}
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["admin", "maintenance"] });
		},
	});

	const youtubeConnectionQuery = useQuery({
		queryKey: ["admin", "youtube-connection"],
		queryFn: async () => {
			const res = await fetch("/api/video/connection");
			if (!res.ok) throw new Error("Nie udało się pobrać statusu YouTube");
			const json = (await res.json()) as { data: YoutubeConnectionStatus };
			return json.data;
		},
	});

	const youtubeDisconnectMutation = useMutation({
		mutationFn: async () => {
			const res = await fetch("/api/video/connection", { method: "DELETE" });
			if (!res.ok) throw new Error("Nie udało się rozłączyć YouTube");
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["admin", "youtube-connection"] });
		},
	});

	const featuresQuery = useQuery({
		queryKey: ["admin", "features"],
		queryFn: async () => {
			const res = await fetch("/api/admin/features");
			if (!res.ok) throw new Error("Nie udało się pobrać ustawień funkcji");
			const json = (await res.json()) as {
				data: {
					video: boolean;
					markdown: boolean;
					library: boolean;
					chat: boolean;
					albums: boolean;
					ai: boolean;
				};
			};
			return json.data;
		},
	});

	const featuresMutation = useMutation({
		mutationFn: async (input: {
			video?: boolean;
			markdown?: boolean;
			library?: boolean;
			chat?: boolean;
			albums?: boolean;
			ai?: boolean;
		}) => {
			const res = await fetch("/api/admin/features", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(input),
			});
			if (!res.ok) {
				const err = (await res.json()) as { error: string };
				throw new Error(err.error);
			}
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["admin", "features"] });
		},
	});

	const youtubeSearch = useSearch({ strict: false }) as { youtube?: string };
	const youtubeFlash =
		youtubeSearch.youtube === "connected"
			? "connected"
			: youtubeSearch.youtube === "error"
				? "error"
				: null;

	// Nieudane uploady zdjęć (issue #135) — diagnostyka; userId rozwiązujemy do
	// imienia z listy członków (już pobranej powyżej).
	const uploadFailuresQuery = useQuery({
		queryKey: ["admin", "upload-failures"],
		queryFn: async () => {
			const res = await fetch("/api/admin/upload-failures");
			if (!res.ok) throw new Error("Nie udało się pobrać nieudanych uploadów");
			const json = (await res.json()) as {
				data: Array<Omit<UploadFailureEntry, "userName">>;
			};
			return json.data;
		},
	});
	const memberNames = new Map(membersQuery.data?.map((m) => [m.id, m.name]) ?? []);
	const uploadFailures = uploadFailuresQuery.data?.map((failure) => ({
		...failure,
		userName: memberNames.get(failure.userId),
	}));

	async function copyToClipboard(text: string) {
		await navigator.clipboard.writeText(text);
		setCopiedLink(text);
		setTimeout(() => setCopiedLink(null), 2000);
	}

	function handleCreate(e: React.FormEvent) {
		e.preventDefault();
		const trimmed = newName.trim();
		if (!trimmed) return;
		createMutation.reset();
		createMutation.mutate(trimmed);
	}

	return (
		<div className="max-w-2xl bg-background px-4 py-6 pb-28 sm:pb-6">
			<div className="mb-6 flex items-center gap-2">
				<a href="/app">
					<button
						type="button"
						className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
						title="Wróć"
					>
						<ArrowLeft className="h-5 w-5" />
					</button>
				</a>
				<h1 className="text-2xl font-bold text-foreground">Zarządzanie</h1>
				<div className="flex-1" />
				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						size="lg"
						onClick={() => setAddDialogOpen(true)}
						title="Dodaj członka"
					>
						<Plus className="size-6" />
					</Button>
					<Button
						variant="ghost"
						size="lg"
						onClick={() => setMaintenanceDialogOpen(true)}
						title="Tryb awaryjny"
					>
						<AlertTriangle className="h-4 w-4" />
					</Button>
					<Button
						variant="ghost"
						size="lg"
						onClick={() => setShareCodeDialogOpen(true)}
						title="Kod dostępu /share"
					>
						<Waypoints className="h-4 w-4" />
					</Button>
				</div>
			</div>

			<MaintenanceDialog
				open={maintenanceDialogOpen}
				onOpenChange={setMaintenanceDialogOpen}
				config={
					maintenanceQuery.data ?? {
						enabled: false,
						message: "Wspólniak jest w trakcie naprawy",
						subtitle: "Wróć za chwilę",
						icon: "alert-triangle",
					}
				}
				isSaving={maintenanceMutation.isPending}
				errorMessage={maintenanceMutation.isError ? maintenanceMutation.error.message : undefined}
				onSave={(input) => {
					maintenanceMutation.reset();
					maintenanceMutation.mutate(input);
				}}
			/>

			<ShareCodeDialog open={shareCodeDialogOpen} onOpenChange={setShareCodeDialogOpen} />

			<Dialog
				open={addDialogOpen}
				onOpenChange={(open) => {
					setAddDialogOpen(open);
					if (!open) {
						setNewName("");
						createMutation.reset();
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Dodaj członka</DialogTitle>
					</DialogHeader>

					{createMutation.isError && (
						<Alert variant="destructive">{createMutation.error.message}</Alert>
					)}

					<form onSubmit={handleCreate} className="flex gap-2">
						<Input
							value={newName}
							onChange={(e) => setNewName(e.target.value)}
							placeholder="Imię nowego członka..."
							className="flex-1"
							autoFocus
						/>
						<Button type="submit" disabled={!newName.trim() || createMutation.isPending}>
							{createMutation.isPending ? (
								<Loader loading={createMutation.isPending} />
							) : (
								<Plus className="h-4 w-4" />
							)}
							{createMutation.isPending ? "Dodaję..." : "Dodaj"}
						</Button>
					</form>
				</DialogContent>
			</Dialog>

			{lastMagicLink && (
				<div className="mb-6 rounded-lg border border-border bg-card p-4">
					<p className="mb-2 text-sm font-medium text-foreground">
						Link logowania dla <strong>{lastMagicLink.name}</strong>:
					</p>
					<div className="flex items-center gap-2">
						<code className="flex-1 overflow-x-auto rounded bg-muted px-2 py-1 text-xs text-foreground">
							{lastMagicLink.link}
						</code>
						<Button size="sm" variant="outline" onClick={() => copyToClipboard(lastMagicLink.link)}>
							{copiedLink === lastMagicLink.link ? (
								<Check className="h-4 w-4" />
							) : (
								<Copy className="h-4 w-4" />
							)}
						</Button>
					</div>
					<p className="mt-2 text-xs text-muted-foreground">
						Wyślij ten link osobie — po kliknięciu zostanie zalogowana.
					</p>
				</div>
			)}

			{membersQuery.data && (
				<div className="space-y-2">
					{membersQuery.data.map((member) => (
						<MemberRow
							key={member.id}
							member={member}
							isRegenerating={regenerateMutation.isPending}
							isDeleting={deleteMutation.isPending}
							isAiSaving={aiBlockedMutation.isPending}
							onRegenerate={async () => {
								const result = await regenerateMutation.mutateAsync({
									id: member.id,
									name: member.name,
								});
								return result.link;
							}}
							onDelete={() => deleteMutation.mutate(member.id)}
							onRename={(id, name) => renameMutation.mutateAsync({ id, name })}
							onAiBlockedChange={(blocked) => aiBlockedMutation.mutate({ id: member.id, blocked })}
						/>
					))}
				</div>
			)}

			<div className="mt-6">
				<YoutubeConnection
					connection={youtubeConnectionQuery.data}
					isDisconnecting={youtubeDisconnectMutation.isPending}
					onDisconnect={() => youtubeDisconnectMutation.mutate()}
					flash={youtubeFlash}
				/>
			</div>

			<div className="mt-6">
				<FeatureToggles
					flags={featuresQuery.data}
					isSaving={featuresMutation.isPending}
					onChange={(input) => {
						featuresMutation.reset();
						featuresMutation.mutate(input);
					}}
				/>
			</div>

			<div className="mt-6">
				<UploadFailuresSection
					failures={uploadFailures}
					isLoading={uploadFailuresQuery.isLoading}
				/>
			</div>
		</div>
	);
}
