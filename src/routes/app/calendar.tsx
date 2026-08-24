// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MailQuestion, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { CalendarGrid, formatEventDate } from "@/components/app/calendar-grid";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader } from "@/components/ui/loader";

interface CalendarEventDTO {
	id: string;
	title: string;
	description: string | null;
	day: number;
	month: number;
}

interface EventForm {
	title: string;
	description: string;
	day: string;
	month: string;
}

interface EventInput {
	title: string;
	description: string | null;
	day: number;
	month: number;
}

const EMPTY_FORM: EventForm = { title: "", description: "", day: "", month: "" };

function eventToForm(event: CalendarEventDTO): EventForm {
	return {
		title: event.title,
		description: event.description ?? "",
		day: String(event.day),
		month: String(event.month),
	};
}

function formToInput(form: EventForm): EventInput {
	return {
		title: form.title.trim(),
		description: form.description.trim() || null,
		day: Number(form.day),
		month: Number(form.month),
	};
}

export const Route = createFileRoute("/app/calendar")({
	component: CalendarPage,
});

function CalendarPage() {
	const { session } = Route.useRouteContext();
	const isAdmin = session.role === "admin";
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [addOpen, setAddOpen] = useState(false);
	const [addForm, setAddForm] = useState<EventForm>(EMPTY_FORM);
	const [editing, setEditing] = useState<CalendarEventDTO | null>(null);
	const [editForm, setEditForm] = useState<EventForm>(EMPTY_FORM);
	const [deleting, setDeleting] = useState<CalendarEventDTO | null>(null);

	const eventsQuery = useQuery({
		queryKey: ["app", "calendar"],
		queryFn: async (): Promise<CalendarEventDTO[]> => {
			const res = await fetch("/api/app/calendar");
			if (!res.ok) throw new Error("Nie udało się pobrać wydarzeń");
			const json = (await res.json()) as { data: CalendarEventDTO[] };
			return json.data;
		},
	});

	const createMutation = useMutation({
		mutationFn: async (input: EventInput) => {
			const res = await fetch("/api/admin/calendar", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(input),
			});
			if (!res.ok) {
				const err = (await res.json()) as { error: string };
				throw new Error(err.error);
			}
			return res.json() as Promise<{ data: CalendarEventDTO }>;
		},
		onSuccess: async () => {
			setAddForm(EMPTY_FORM);
			setAddOpen(false);
			await queryClient.invalidateQueries({ queryKey: ["app", "calendar"] });
		},
	});

	const updateMutation = useMutation({
		mutationFn: async ({ id, input }: { id: string; input: EventInput }) => {
			const res = await fetch(`/api/admin/calendar/${id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(input),
			});
			if (!res.ok) {
				const err = (await res.json()) as { error: string };
				throw new Error(err.error);
			}
			return res.json() as Promise<{ data: CalendarEventDTO }>;
		},
		onSuccess: async () => {
			setEditing(null);
			await queryClient.invalidateQueries({ queryKey: ["app", "calendar"] });
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async (id: string) => {
			const res = await fetch(`/api/admin/calendar/${id}`, { method: "DELETE" });
			if (!res.ok) {
				const err = (await res.json()) as { error: string };
				throw new Error(err.error);
			}
		},
		onSuccess: async () => {
			setDeleting(null);
			await queryClient.invalidateQueries({ queryKey: ["app", "calendar"] });
		},
	});

	function handleCreate(e: React.FormEvent) {
		e.preventDefault();
		createMutation.reset();
		createMutation.mutate(formToInput(addForm));
	}

	function openEdit(event: CalendarEventDTO) {
		updateMutation.reset();
		setEditForm(eventToForm(event));
		setEditing(event);
	}

	function handleUpdate(e: React.FormEvent) {
		e.preventDefault();
		if (!editing) return;
		updateMutation.mutate({ id: editing.id, input: formToInput(editForm) });
	}

	return (
		<div className="max-w-2xl bg-background px-4 py-6 pb-28 sm:pb-6">
			<div className="mb-6 flex items-center gap-2">
				<h1 className="text-2xl font-bold text-foreground">Kalendarz</h1>
				<div className="flex-1" />
				<Button
					variant="ghost"
					size="lg"
					title="Zaproponuj datę"
					onClick={() => navigate({ to: "/app/new", search: { calendar: true } })}
				>
					<MailQuestion className="h-4 w-4" />
					<span className="hidden sm:inline">Zaproponuj datę</span>
				</Button>
				{isAdmin && (
					<Button
						variant="ghost"
						size="lg"
						onClick={() => setAddOpen(true)}
						title="Dodaj wydarzenie"
					>
						<Plus className="h-4 w-4" />
					</Button>
				)}
			</div>

			<Dialog
				open={addOpen}
				onOpenChange={(open) => {
					setAddOpen(open);
					if (!open) {
						setAddForm(EMPTY_FORM);
						createMutation.reset();
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Dodaj wydarzenie</DialogTitle>
					</DialogHeader>

					{createMutation.isError && (
						<Alert variant="destructive">{createMutation.error.message}</Alert>
					)}

					<form onSubmit={handleCreate} className="space-y-3">
						<EventFormFields form={addForm} setForm={setAddForm} />
						<Button type="submit" disabled={createMutation.isPending} className="w-full">
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

			<Dialog
				open={!!editing}
				onOpenChange={(open) => {
					if (!open) {
						setEditing(null);
						updateMutation.reset();
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Edytuj wydarzenie</DialogTitle>
					</DialogHeader>

					{updateMutation.isError && (
						<Alert variant="destructive">{updateMutation.error.message}</Alert>
					)}

					<form onSubmit={handleUpdate} className="space-y-3">
						<EventFormFields form={editForm} setForm={setEditForm} />
						<Button type="submit" disabled={updateMutation.isPending} className="w-full">
							{updateMutation.isPending ? (
								<Loader loading={updateMutation.isPending} />
							) : (
								<Pencil className="h-4 w-4" />
							)}
							{updateMutation.isPending ? "Zapisuję..." : "Zapisz zmiany"}
						</Button>
					</form>
				</DialogContent>
			</Dialog>

			<Dialog
				open={!!deleting}
				onOpenChange={(open) => {
					if (!open) {
						setDeleting(null);
						deleteMutation.reset();
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Usunąć wydarzenie?</DialogTitle>
					</DialogHeader>

					{deleting && (
						<p className="text-sm text-muted-foreground">
							Wydarzenie <span className="font-medium text-foreground">{deleting.title}</span> (
							{formatEventDate(deleting.day, deleting.month)}) zostanie trwale usunięte.
						</p>
					)}

					{deleteMutation.isError && (
						<Alert variant="destructive">{deleteMutation.error.message}</Alert>
					)}

					<div className="flex gap-2">
						<Button
							variant="outline"
							className="flex-1"
							onClick={() => setDeleting(null)}
							disabled={deleteMutation.isPending}
						>
							Anuluj
						</Button>
						<Button
							variant="destructive"
							className="flex-1"
							disabled={deleteMutation.isPending}
							onClick={() => deleting && deleteMutation.mutate(deleting.id)}
						>
							{deleteMutation.isPending ? (
								<Loader loading={deleteMutation.isPending} />
							) : (
								<Trash2 className="h-4 w-4" />
							)}
							{deleteMutation.isPending ? "Usuwam..." : "Usuń"}
						</Button>
					</div>
				</DialogContent>
			</Dialog>

			{eventsQuery.data && (
				<CalendarGrid
					events={eventsQuery.data}
					isAdmin={isAdmin}
					onEdit={openEdit}
					onDelete={setDeleting}
				/>
			)}
		</div>
	);
}

interface EventFormFieldsProps {
	form: EventForm;
	setForm: React.Dispatch<React.SetStateAction<EventForm>>;
}

function EventFormFields({ form, setForm }: EventFormFieldsProps) {
	return (
		<>
			<Input
				value={form.title}
				onChange={(e) => setForm({ ...form, title: e.target.value })}
				placeholder="Tytuł"
				autoFocus
				required
			/>
			<Input
				value={form.description}
				onChange={(e) => setForm({ ...form, description: e.target.value })}
				placeholder="Opis (opcjonalnie)"
			/>
			<div className="flex gap-2">
				<Input
					type="number"
					min={1}
					max={31}
					value={form.day}
					onChange={(e) => setForm({ ...form, day: e.target.value })}
					placeholder="Dzień (1–31)"
					required
					className="flex-1"
				/>
				<Input
					type="number"
					min={1}
					max={12}
					value={form.month}
					onChange={(e) => setForm({ ...form, month: e.target.value })}
					placeholder="Miesiąc (1–12)"
					required
					className="flex-1"
				/>
			</div>
		</>
	);
}
