// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Fake XMLHttpRequest na granicy przeglądarki — do testów uploadu przez XHR
 * (issue #203). Test steruje: `xhr.progress(loaded, total)` — progres z realnych
 * bajtów, `xhr.respond(status)` — odpowiedź HTTP, `xhr.fail()` — awaria sieci.
 */
export class FakeXHR {
	static instances: FakeXHR[] = [];

	url = "";
	method = "";
	status = 0;
	timeout: number = 0;
	body: unknown = null;
	upload = { onprogress: null as ((e: { loaded: number; total: number }) => void) | null };
	onload: (() => void) | null = null;
	onerror: (() => void) | null = null;

	constructor() {
		FakeXHR.instances.push(this);
	}

	open(method: string, url: string) {
		this.method = method;
		this.url = url;
	}

	send(body?: unknown) {
		this.body = body;
	}

	progress(loaded: number, total: number) {
		this.upload.onprogress?.({ loaded, total });
	}

	respond(status: number) {
		this.status = status;
		this.onload?.();
	}

	fail() {
		this.onerror?.();
	}
}
