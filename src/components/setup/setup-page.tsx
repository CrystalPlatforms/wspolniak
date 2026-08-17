// SPDX-License-Identifier: AGPL-3.0-or-later
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader } from "@/components/ui/loader";

interface SetupResponse {
	magicLink: string;
}

class SetupAlreadyCompletedError extends Error {
	constructor() {
		super("Instancja już skonfigurowana");
		this.name = "SetupAlreadyCompletedError";
	}
}

async function submitSetup(data: {
	familyName: string;
	adminName: string;
}): Promise<SetupResponse> {
	const res = await fetch("/api/setup", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(data),
	});

	if (res.status === 404) {
		throw new SetupAlreadyCompletedError();
	}

	if (!res.ok) {
		throw new Error("Nie udało się skonfigurować instancji");
	}

	return res.json() as Promise<SetupResponse>;
}

export function SetupPage() {
	const [copied, setCopied] = useState(false);
	const mutation = useMutation({
		mutationFn: submitSetup,
	});

	const form = useForm({
		defaultValues: { familyName: "", adminName: "" },
		onSubmit: async ({ value }) => {
			mutation.reset();
			mutation.mutate(value);
		},
	});

	if (mutation.isSuccess) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background px-6">
				<div className="mx-auto w-full max-w-md space-y-6 text-center">
					<h1 className="text-2xl font-bold tracking-tight text-foreground">
						Instancja skonfigurowana
					</h1>
					<p className="text-muted-foreground">Skopiuj poniższy link i wyślij go do admina:</p>
					<div className="flex items-center gap-2 rounded-md border border-border bg-muted p-3">
						<code className="flex-1 break-all text-sm text-foreground">
							{mutation.data.magicLink}
						</code>
						<Button
							variant="ghost"
							size="icon"
							onClick={() => {
								navigator.clipboard.writeText(mutation.data.magicLink);
								setCopied(true);
								setTimeout(() => setCopied(false), 2000);
							}}
						>
							{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
						</Button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-background px-6">
			<div className="mx-auto w-full max-w-md space-y-6">
				<div className="text-center">
					<h1 className="text-2xl font-bold tracking-tight text-foreground">
						Skonfiguruj instancję
					</h1>
					<p className="mt-2 text-muted-foreground">Ustaw nazwę rodziny i konto administratora</p>
				</div>

				{mutation.isError && (
					<Alert variant="destructive">
						<AlertDescription>{mutation.error.message}</AlertDescription>
					</Alert>
				)}

				<form
					onSubmit={(e) => {
						e.preventDefault();
						form.handleSubmit();
					}}
					className="space-y-4"
				>
					<form.Field name="familyName">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="familyName">Nazwa rodziny</Label>
								<Input
									id="familyName"
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value)}
									onBlur={field.handleBlur}
								/>
							</div>
						)}
					</form.Field>

					<form.Field name="adminName">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="adminName">Imię administratora</Label>
								<Input
									id="adminName"
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value)}
									onBlur={field.handleBlur}
								/>
							</div>
						)}
					</form.Field>

					<form.Subscribe selector={(s) => s.canSubmit}>
						{(canSubmit) => (
							<Button type="submit" className="w-full" disabled={!canSubmit || mutation.isPending}>
								<Loader loading={mutation.isPending} />
								{mutation.isPending ? "Konfigurowanie..." : "Skonfiguruj"}
							</Button>
						)}
					</form.Subscribe>
				</form>
			</div>
		</div>
	);
}
