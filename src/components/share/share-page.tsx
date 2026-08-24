// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader } from "@/components/ui/loader";

interface VerifyResponse {
	members?: { id: string; name: string }[];
	isAdmin: boolean;
}

interface LoginResponse {
	redirectUrl: string;
}

type Step = "code" | "members" | "admin-confirm" | "redirecting";

async function verifyCode(code: string): Promise<VerifyResponse> {
	const res = await fetch("/api/share/verify", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ code }),
	});

	if (res.status === 429) {
		throw new Error("Zbyt wiele prób — odczekaj chwilę i spróbuj ponownie");
	}
	if (!res.ok) {
		throw new Error("Nieprawidłowy kod dostępu");
	}

	return res.json() as Promise<VerifyResponse>;
}

async function loginMember(code: string, memberId: string): Promise<LoginResponse> {
	const res = await fetch("/api/share/login", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ code, memberId }),
	});

	if (!res.ok) {
		const body = (await res.json().catch(() => null)) as { error?: string } | null;
		if (body?.error === "Too many requests") {
			throw new Error("Zbyt wiele prób — odczekaj chwilę i spróbuj ponownie");
		}
		throw new Error(
			body?.error === "Invalid code" ? "Nieprawidłowy kod dostępu" : "Logowanie nie powiodło się",
		);
	}

	return res.json() as Promise<LoginResponse>;
}

interface SharePageProps {
	initialCode?: string;
}

/** Strona logowania kodem dostępu (#166): kod → wybór imienia (albo krok
 *  potwierdzenia dla kodu admina 1219 — rewizja usera) → redirect na token. */
export function SharePage({ initialCode = "" }: SharePageProps = {}) {
	const [step, setStep] = useState<Step>("code");
	const [code, setCode] = useState(initialCode);
	const [members, setMembers] = useState<{ id: string; name: string }[]>([]);

	const verifyMutation = useMutation({
		mutationFn: () => verifyCode(code),
		onSuccess: (data) => {
			if (data.isAdmin) {
				setStep("admin-confirm");
			} else {
				setMembers(data.members ?? []);
				setStep("members");
			}
		},
	});

	const loginMutation = useMutation({
		mutationFn: (memberId: string) => loginMember(code, memberId),
		onSuccess: (data) => {
			setStep("redirecting");
			window.location.href = data.redirectUrl;
		},
	});

	if (step === "redirecting") {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6">
				<Loader size={6} />
				<p className="text-muted-foreground">Logowanie...</p>
			</div>
		);
	}

	if (step === "admin-confirm") {
		return (
			<AdminConfirmStep
				isLoggingIn={loginMutation.isPending}
				errorMessage={loginMutation.isError ? loginMutation.error.message : null}
				onConfirm={() => loginMutation.mutate("")}
				onCancel={() => {
					setStep("code");
					loginMutation.reset();
				}}
			/>
		);
	}

	if (step === "members") {
		return (
			<MembersStep
				members={members}
				isLoggingIn={loginMutation.isPending}
				errorMessage={loginMutation.isError ? loginMutation.error.message : null}
				onSelect={(id) => loginMutation.mutate(id)}
				onBack={() => {
					setStep("code");
					setMembers([]);
					loginMutation.reset();
				}}
			/>
		);
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-background px-6">
			<div className="mx-auto w-full max-w-md space-y-6">
				<div className="text-center">
					<h1 className="text-2xl font-bold tracking-tight text-foreground">Wspólniak</h1>
				</div>

				{verifyMutation.isError && (
					<Alert variant="destructive">
						<AlertDescription>{verifyMutation.error.message}</AlertDescription>
					</Alert>
				)}

				<form
					onSubmit={(e) => {
						e.preventDefault();
						verifyMutation.reset();
						verifyMutation.mutate();
					}}
					className="space-y-4"
				>
					<div className="space-y-2">
						<Label htmlFor="share-code">Kod dostępu</Label>
						<Input
							id="share-code"
							type="text"
							inputMode="numeric"
							placeholder="Kod dostępu"
							value={code}
							onChange={(e) => setCode(e.target.value)}
							autoComplete="off"
							maxLength={20}
						/>
					</div>

					<Button
						type="submit"
						className="w-full"
						disabled={!code.trim() || verifyMutation.isPending}
					>
						{verifyMutation.isPending ? <Loader size={4} /> : null}
						{verifyMutation.isPending ? "Sprawdzanie..." : "Dalej"}
					</Button>
				</form>
			</div>
		</div>
	);
}

interface MembersStepProps {
	members: { id: string; name: string }[];
	isLoggingIn: boolean;
	errorMessage: string | null;
	onSelect: (id: string) => void;
	onBack: () => void;
}

function MembersStep({ members, isLoggingIn, errorMessage, onSelect, onBack }: MembersStepProps) {
	return (
		<div className="flex min-h-screen items-center justify-center bg-background px-6">
			<div className="mx-auto w-full max-w-md space-y-6">
				<div className="text-center">
					<h1 className="text-2xl font-bold tracking-tight text-foreground">Wybierz siebie</h1>
					<p className="mt-2 text-muted-foreground">Kto się loguje?</p>
				</div>

				{errorMessage && (
					<Alert variant="destructive">
						<AlertDescription>{errorMessage}</AlertDescription>
					</Alert>
				)}

				<div className="space-y-3">
					{members.map((member) => (
						<Button
							key={member.id}
							variant="outline"
							className="h-14 w-full justify-center text-lg"
							disabled={isLoggingIn}
							onClick={() => onSelect(member.id)}
						>
							{member.name}
						</Button>
					))}
				</div>

				<Button variant="ghost" className="h-12 w-full text-base" onClick={onBack}>
					Wstecz
				</Button>
			</div>
		</div>
	);
}

interface AdminConfirmStepProps {
	isLoggingIn: boolean;
	errorMessage: string | null;
	onConfirm: () => void;
	onCancel: () => void;
}

function AdminConfirmStep({
	isLoggingIn,
	errorMessage,
	onConfirm,
	onCancel,
}: AdminConfirmStepProps) {
	return (
		<div className="flex min-h-screen items-center justify-center bg-background px-6">
			<div className="mx-auto w-full max-w-md space-y-6">
				<div className="text-center">
					<h1 className="text-2xl font-bold tracking-tight text-foreground">
						Logowanie jako Admin
					</h1>
					<p className="mt-2 text-muted-foreground">
						Czy na pewno zalogować się jako administrator?
					</p>
				</div>
				{errorMessage && (
					<Alert variant="destructive">
						<AlertDescription>{errorMessage}</AlertDescription>
					</Alert>
				)}
				<div className="space-y-3">
					<Button
						className="h-14 w-full justify-center bg-destructive text-lg text-destructive-foreground hover:bg-destructive/90"
						disabled={isLoggingIn}
						onClick={onConfirm}
					>
						{isLoggingIn ? "Logowanie..." : "Tak, zaloguj jako admin"}
					</Button>
					<Button
						variant="outline"
						className="h-14 w-full justify-center text-lg"
						disabled={isLoggingIn}
						onClick={onCancel}
					>
						Anuluj
					</Button>
				</div>
			</div>
		</div>
	);
}
