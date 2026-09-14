// SPDX-License-Identifier: AGPL-3.0-or-later
type SentRequest = { id: number; file: File; maxWidth: number; quality: number };

function fileOfSize(name: string, bytes: number, type = "image/jpeg"): File {
	return new File([new Uint8Array(bytes)], name, { type });
}

function nextTick(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * `shrinkImageToLimit` deleguje kompresję do Web Workera przez compressImage
 * (granica systemu — mockujemy globalny `Worker`). Każdy test dostaje świeży
 * moduł (`vi.resetModules` + dynamiczny import), bo klient trzyma singleton
 * workera w stanie modułu.
 */
function mountFakeWorker() {
	const messageListeners: Array<(e: MessageEvent) => void> = [];
	const fakeWorker = {
		addEventListener: vi.fn((type: string, cb: (e: MessageEvent) => void) => {
			if (type === "message") messageListeners.push(cb);
		}),
		removeEventListener: vi.fn(),
		postMessage: vi.fn(),
	};
	// musi być zwykła funkcja (nie arrow) — compress.ts woła `new Worker(...)`.
	const WorkerCtor = vi.fn(function (this: unknown) {
		return fakeWorker;
	});
	vi.stubGlobal("Worker", WorkerCtor);

	const dispatch = (data: unknown) => {
		const event = new MessageEvent("message", { data });
		for (const cb of [...messageListeners]) cb(event);
	};
	const sentRequests = () =>
		fakeWorker.postMessage.mock.calls.map((call) => call[0] as SentRequest);

	return { dispatch, sentRequests };
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe("shrinkImageToLimit", () => {
	it("zwraca wynik pierwszej kompresji, gdy mieści się w limicie i jest mniejszy od oryginału", async () => {
		vi.resetModules();
		const { shrinkImageToLimit } = await import("./shrink");
		const { dispatch, sentRequests } = mountFakeWorker();

		const original = fileOfSize("duze.jpg", 20 * 1024 * 1024);
		const promise = shrinkImageToLimit(original, 19 * 1024 * 1024);

		await nextTick();
		const requests = sentRequests();
		expect(requests.length).toBe(1);
		dispatch({ id: requests[0]?.id, file: fileOfSize("duze.webp", 400 * 1024, "image/webp") });

		const result = await promise;
		expect(result.size).toBe(400 * 1024);
		expect(result.name).toBe("duze.webp");
	});

	it("próbuje kolejnych ustawień, gdy pierwszy wynik nadal przekracza limit", async () => {
		vi.resetModules();
		const { shrinkImageToLimit } = await import("./shrink");
		const { dispatch, sentRequests } = mountFakeWorker();

		const original = fileOfSize("duze.jpg", 20 * 1024 * 1024);
		const promise = shrinkImageToLimit(original, 1024 * 1024);

		await nextTick();
		let requests = sentRequests();
		expect(requests.length).toBe(1);
		// pierwszy wynik nadal za duży
		dispatch({ id: requests[0]?.id, file: fileOfSize("duze.webp", 2 * 1024 * 1024, "image/webp") });

		await nextTick();
		requests = sentRequests();
		expect(requests.length).toBe(2);
		// drugi wynik już mieści się w limicie
		dispatch({ id: requests[1]?.id, file: fileOfSize("duze.webp", 512 * 1024, "image/webp") });

		const result = await promise;
		expect(result.size).toBe(512 * 1024);
	});

	it("rzuca ShrinkError z polskim komunikatem, gdy żadna próba nie da pliku pod limitem", async () => {
		vi.resetModules();
		const { shrinkImageToLimit } = await import("./shrink");
		const { dispatch, sentRequests } = mountFakeWorker();

		const original = fileOfSize("duze.jpg", 20 * 1024 * 1024);
		const promise = shrinkImageToLimit(original, 10 * 1024);
		// asercje podpięte od razu — odrzucenie przychodzi w trakcie pętli niżej
		const rejection = Promise.all([
			expect(promise).rejects.toThrow(/nie udało się zmniejszyć/i),
			expect(promise).rejects.toMatchObject({ name: "ShrinkError" }),
		]);

		// odpowiadamy dużym plikiem na kolejne próby, aż moduł się podda
		let answered = 0;
		for (let round = 0; round < 10; round++) {
			await nextTick();
			const requests = sentRequests();
			if (answered >= requests.length) break;
			for (let i = answered; i < requests.length; i++) {
				const request = requests[i];
				if (!request) continue;
				dispatch({ id: request.id, file: fileOfSize("duze.webp", 500 * 1024, "image/webp") });
			}
			answered = requests.length;
		}

		await rejection;
	});
});
