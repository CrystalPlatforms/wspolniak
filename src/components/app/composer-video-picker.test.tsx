// SPDX-License-Identifier: AGPL-3.0-or-later
// Założenia kontraktu (Video v2 F2 #194): klik „Dodaj wideo" otwiera file picker;
// wybór pliku → dialog z tytułem prefilled z nazwy pliku (bez opisu);
// potwierdzenie → karta oczekującego wideo z lokalnym podglądem; × usuwa bez sieci.
// Kolejność: drag & drop (dnd-kit jak w zdjęciach) — w jsdom biblioteka potrzebuje
// layoutu, więc granica dnd-kit jest mockowana i testujemy logikę onDragEnd.
// Limit 5 = MAX_POST_VIDEOS z domeny postów.
let dragEndHandler: ((event: unknown) => void) | null = null;

vi.mock("@dnd-kit/core", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@dnd-kit/core")>();
	return {
		...actual,
		// Passthrough bez sensorów — logikę końca przeciągnięcia wołamy ręcznie.
		DndContext: (props: { children?: React.ReactNode; onDragEnd?: (event: unknown) => void }) => {
			dragEndHandler = props.onDragEnd ?? null;
			return <>{props.children}</>;
		},
		useSensors: () => [],
		useSensor: () => ({}),
	};
});

vi.mock("@dnd-kit/sortable", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@dnd-kit/sortable")>();
	return {
		...actual,
		SortableContext: (props: { children?: React.ReactNode }) => <>{props.children}</>,
		useSortable: (_options: { id: string }) => ({
			attributes: {},
			listeners: {},
			setNodeRef: () => {},
			transform: null,
			transition: undefined,
			isDragging: false,
			isSorting: false,
			index: 0,
			newIndex: 0,
			over: null,
			active: null,
			overIndex: -1,
			dragOverlay: null,
			setActivatorNodeRef: () => {},
			setDroppableNodeRef: () => {},
			setDraggableNodeRef: () => {},
			node: { current: null },
			activatorEvent: null,
			measuring: {} as never,
		}),
	};
});

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ComposerVideoPicker, type PendingVideo } from "./composer-video-picker";

function makeVideoFile(name = "wakacje.mp4") {
	return new File([new Uint8Array(8)], name, { type: "video/mp4" });
}

function makePending(overrides: Partial<PendingVideo> = {}): PendingVideo {
	return {
		key: "k1",
		file: makeVideoFile(),
		title: "Klip",
		preview: "blob:preview",
		...overrides,
	};
}

function renderPicker(props: Partial<Parameters<typeof ComposerVideoPicker>[0]> = {}) {
	const onChange = vi.fn();
	render(<ComposerVideoPicker videos={[]} onChange={onChange} {...props} />);
	return { onChange };
}

describe("ComposerVideoPicker — dodawanie (us stories 1–3)", () => {
	it("renders the add button and hidden file input (accept video/*)", () => {
		renderPicker();

		const button = screen.getByRole("button", { name: /dodaj wideo/i });
		expect(button).toBeDefined();
		const fileInput = document.querySelector("input[type='file']") as HTMLInputElement;
		expect(fileInput.accept).toBe("video/*");
	});

	it("opens the title dialog prefilled from the filename on file pick", async () => {
		const { onChange } = renderPicker();
		const input = document.querySelector("input[type='file']") as HTMLInputElement;

		await userEvent.upload(input, makeVideoFile("wakacje-nad-morzem.mp4"));

		const titleInput = screen.getByPlaceholderText(/wakacje nad morzem/i);
		expect((titleInput as HTMLInputElement).value).toBe("wakacje-nad-morzem");
		expect(onChange).not.toHaveBeenCalled();
	});

	it("confirming the title adds a pending card with a local preview", async () => {
		const onChange = vi.fn();
		render(<ComposerVideoPicker videos={[]} onChange={onChange} />);
		const input = document.querySelector("input[type='file']") as HTMLInputElement;

		await userEvent.upload(input, makeVideoFile("urlop.mp4"));
		const titleInput = screen.getByPlaceholderText(/wakacje nad morzem/i) as HTMLInputElement;
		await userEvent.clear(titleInput);
		await userEvent.type(titleInput, "Urlop nad morzem");
		await userEvent.click(screen.getByRole("button", { name: /^dodaj$/i }));

		expect(onChange).toHaveBeenCalledTimes(1);
		const added = onChange.mock.calls[0]?.[0] as PendingVideo[];
		expect(added).toHaveLength(1);
		expect(added[0]?.title).toBe("Urlop nad morzem");
		expect(added[0]?.file).toBeInstanceOf(File);
		expect(added[0]?.preview).toMatch(/^blob:/);
	});

	it("confirming without a title is refused (button disabled)", async () => {
		const onChange = vi.fn();
		render(<ComposerVideoPicker videos={[]} onChange={onChange} />);
		const input = document.querySelector("input[type='file']") as HTMLInputElement;

		await userEvent.upload(input, makeVideoFile("klip.mp4"));
		const titleInput = screen.getByPlaceholderText(/wakacje nad morzem/i);
		await userEvent.clear(titleInput);

		const addBtn = screen.getByRole("button", { name: /^dodaj$/i }) as HTMLButtonElement;
		expect(addBtn.disabled).toBe(true);
	});

	it("a 6th video is refused (add button disabled at the limit)", () => {
		const five = [1, 2, 3, 4, 5].map((i) => makePending({ key: `k${i}`, title: `Klip ${i}` }));
		renderPicker({ videos: five });

		// Przy limicie przycisk pokazuje „5/5" i jest zablokowany z tytułem-instrukcją.
		const addBtn = screen.getByTitle(/limit to 5/i) as HTMLButtonElement;
		expect(addBtn.disabled).toBe(true);
	});
});

describe("ComposerVideoPicker — lista oczekujących (us stories 3–6)", () => {
	it("remove (×) makes no network call and drops the entry", () => {
		const onChange = vi.fn();
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		render(
			<ComposerVideoPicker
				videos={[makePending(), makePending({ key: "k2", title: "Drugi" })]}
				onChange={onChange}
			/>,
		);

		const removeButtons = screen.getAllByRole("button", { name: /usuń wideo/i });
		fireEvent.click(removeButtons[1] as HTMLElement);

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(onChange).toHaveBeenCalledTimes(1);
		const remaining = onChange.mock.calls[0]?.[0] as PendingVideo[];
		expect(remaining.map((v) => v.key)).toEqual(["k1"]);
	});

	it("drag & drop: dropping the third video on the first reorders the list", () => {
		const onChange = vi.fn();
		render(
			<ComposerVideoPicker
				videos={[
					makePending({ key: "k1", title: "A" }),
					makePending({ key: "k2", title: "B" }),
					makePending({ key: "k3", title: "C" }),
				]}
				onChange={onChange}
			/>,
		);

		if (!dragEndHandler) throw new Error("DndContext nie przechwycił onDragEnd");
		dragEndHandler({ active: { id: "k3" }, over: { id: "k1" } });

		expect(onChange).toHaveBeenCalledTimes(1);
		const reordered = onChange.mock.calls[0]?.[0] as PendingVideo[];
		expect(reordered.map((v) => v.key)).toEqual(["k3", "k1", "k2"]);
	});

	it("drag & drop: drop without a target or onto itself is a no-op", () => {
		const onChange = vi.fn();
		render(
			<ComposerVideoPicker
				videos={[makePending({ key: "k1" }), makePending({ key: "k2" })]}
				onChange={onChange}
			/>,
		);

		if (!dragEndHandler) throw new Error("DndContext nie przechwycił onDragEnd");
		dragEndHandler({ active: { id: "k1" }, over: null });
		dragEndHandler({ active: { id: "k1" }, over: { id: "k1" } });

		expect(onChange).not.toHaveBeenCalled();
	});

	it("renders the admin-panel message instead of the picker when not connected", () => {
		renderPicker({ notConnected: true });

		expect(screen.queryByRole("button", { name: /dodaj wideo/i })).toBeNull();
		expect(screen.getByText(/podłącz youtube w panelu admina/i)).toBeDefined();
	});
});
