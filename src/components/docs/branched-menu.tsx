// SPDX-License-Identifier: AGPL-3.0-or-later
import React, {
	type CSSProperties,
	type ReactNode,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
// vendored from react-bits BranchedMenu (F5 #208), adapted: @hugeicons swapped for the project lucide set (icon props are ReactNode; caller renders <Icon />), CSS split out to branched-menu.css. Animated branch lines unchanged.
import "./branched-menu.css";

export interface BranchedMenuChild {
	value: string;
	label: string;
	icon?: ReactNode;
}

export interface BranchedMenuItem {
	label: string;
	value?: string;
	children?: BranchedMenuChild[];
}

export interface BranchedMenuProps {
	items?: BranchedMenuItem[];
	defaultOpen?: number | number[];
	defaultActive?: string;
	onSelect?: (value: string, item: BranchedMenuChild | BranchedMenuItem) => void;
	onToggle?: (index: number, open: boolean) => void;
	color?: string;
	accentColor?: string;
	lineColor?: string;
	width?: number;
	rowHeight?: number;
	indent?: number;
	trunk?: number;
	radius?: number;
	lineWidth?: number;
	fontSize?: number;
	drawDuration?: number;
	foldDuration?: number;
	className?: string;
}

const PAD = 6;
const MARK = 16;

const toSet = (open: number | number[]) =>
	new Set(Array.isArray(open) ? open : open >= 0 ? [open] : []);

const BranchedMenu: React.FC<BranchedMenuProps> = ({
	items = [],
	defaultOpen = 0,
	defaultActive = "",
	onSelect,
	onToggle,
	color = "#f5f5f5",
	accentColor = "#f5f5f5",
	lineColor = "#3f3f46",
	width = 240,
	rowHeight = 36,
	indent = 40,
	trunk = 14,
	radius = 10,
	lineWidth = 1.5,
	fontSize = 14,
	drawDuration = 400,
	foldDuration = 300,
	className = "",
}) => {
	const [open, setOpen] = useState<Set<number>>(() => toSet(defaultOpen));
	const [active, setActive] = useState(() => {
		if (defaultActive) return defaultActive;
		const first = items.find((it, i) => it.children && toSet(defaultOpen).has(i));
		return first?.children?.[0]?.value ?? "";
	});
	const navRef = useRef<HTMLElement>(null);
	const heads = useRef<(HTMLButtonElement | null)[]>([]);
	// adapted (owner fix): tytuly artykulow moga sie zawijac, wiec geometria galezi
	// SVG liczy sie z RZECZYWISTYCH pozycji przyciskow (offsetTop), nie ze stalej
	// siatki rowHeight. Przed pierwszym pomiarem obowiazuje fallback siatkowy.
	const treeRefs = useRef<(HTMLDivElement | null)[]>([]);
	const itemRefs = useRef(new Map<string, HTMLButtonElement>());
	const [layout, setLayout] = useState<{
		centers: Record<string, number>;
		heights: Record<number, number>;
		sig?: string;
	}>({ centers: {}, heights: {} });
	const markerRef = useRef<HTMLSpanElement>(null);
	const latest = useRef<{
		onSelect?: BranchedMenuProps["onSelect"];
		onToggle?: BranchedMenuProps["onToggle"];
	}>({});
	latest.current = { onSelect, onToggle };

	// adapted (F5 #208): active document is router-driven — DepartmentLayout re-renders
	// with a new defaultActive instead of remounting, so resync internal state.
	useEffect(() => {
		if (defaultActive) setActive(defaultActive);
	}, [defaultActive]);

	const activeSection = items.findIndex((it) => it.children?.some((kid) => kid.value === active));
	const markerShown = activeSection >= 0 && open.has(activeSection);
	useLayoutEffect(() => {
		const place = (glide: boolean) => {
			const m = markerRef.current;
			const el = heads.current[activeSection];
			if (!m) return;
			const on = markerShown && el;
			if (!glide) m.style.transition = "none";
			if (on) m.style.top = `${el.offsetTop + (el.offsetHeight - MARK) / 2}px`;
			m.toggleAttribute("data-on", Boolean(on));
			if (!glide) {
				void m.offsetHeight;
				m.style.transition = "";
			}
		};
		place(true);
		let first = true;
		const ro = new ResizeObserver(() => {
			if (first) {
				first = false;
				return;
			}
			place(false);
			measureRef.current();
		});
		if (navRef.current) ro.observe(navRef.current);
		return () => ro.disconnect();
	}, [
		// biome-ignore lint/correctness/useExhaustiveDependencies: vendored react-bits code —
		// extra deps (items, fontSize, rowHeight) intentionally re-place the active marker.
		activeSection,
		markerShown,
	]);

	const select = (value: string, item: BranchedMenuChild | BranchedMenuItem) => {
		setActive(value);
		latest.current.onSelect?.(value, item);
	};
	const toggle = (i: number) => {
		setOpen((prev) => {
			const next = new Set(prev);
			const isOpen = !next.has(i);
			if (isOpen) next.add(i);
			else next.delete(i);
			latest.current.onToggle?.(i, isOpen);
			return next;
		});
	};

	const r = Math.min(radius, rowHeight / 2 - 2);
	const endX = indent - 8;
	const rowY = (k: number) => PAD + k * rowHeight + rowHeight / 2;
	const centerOf = (kidValue: string, k: number) => layout.centers[kidValue] ?? rowY(k);
	const treeH = (i: number, count: number) => layout.heights[i] ?? PAD * 2 + count * rowHeight;
	const branch = (kidValue: string, k: number) => {
		const y = centerOf(kidValue, k);
		return `M ${trunk} ${y - r} A ${r} ${r} 0 0 0 ${trunk + r} ${y} H ${endX}`;
	};
	const reach = (kidValue: string, k: number) => {
		const y = centerOf(kidValue, k);
		return `M ${trunk} 0 V ${y - r} A ${r} ${r} 0 0 0 ${trunk + r} ${y} H ${endX}`;
	};
	const length = (kidValue: string, k: number) =>
		centerOf(kidValue, k) - r + (Math.PI * r) / 2 + (endX - trunk - r);

	// Pomiarnia: po KAZDYM renderze (tanio — setState tylko przy zmianie); robi z
	// tego tez ResizeObserver przy przeplywach tekstu / zmianach szerokosci.
	const measure = () => {
		const centers: Record<string, number> = {};
		const heights: Record<number, number> = {};
		for (const [i, item] of items.entries()) {
			if (!item.children || !open.has(i)) continue;
			const tree = treeRefs.current[i];
			if (tree) heights[i] = tree.offsetHeight;
			for (const kid of item.children) {
				const el = itemRefs.current.get(kid.value);
				if (el) centers[kid.value] = el.offsetTop + el.offsetHeight / 2;
			}
		}
		// Porownanie po TRESCI (referencje sa zawsze nowe) — inaczej petla renderow.
		const sig = JSON.stringify([centers, heights]);
		setLayout((prev) => (prev.sig === sig ? prev : { centers, heights, sig }));
	};
	const measureRef = useRef(measure);
	measureRef.current = measure;
	useLayoutEffect(() => {
		measure();
	});

	return (
		<nav
			ref={navRef}
			className={`branched-menu${className ? ` ${className}` : ""}`}
			style={
				{
					"--bm-w": `${width}px`,
					"--bm-ink": color,
					"--bm-accent": accentColor,
					"--bm-line": lineColor,
					"--bm-font": `${fontSize}px`,
					"--bm-row": `${rowHeight}px`,
					"--bm-indent": `${indent}px`,
					"--bm-line-w": lineWidth,
					"--bm-draw": `${drawDuration}ms`,
					"--bm-fold": `${foldDuration}ms`,
				} as CSSProperties
			}
		>
			<span ref={markerRef} className="branched-menu__marker" aria-hidden="true" />
			{items.map((item, i) => {
				const kids = item.children;
				const isOpen = kids ? open.has(i) : false;
				const leafValue = item.value ?? item.label;
				const leafActive = !kids && leafValue === active;
				return (
					<div
						key={item.value ?? item.label}
						className="branched-menu__section"
						data-open={isOpen ? "" : undefined}
					>
						<button
							ref={(el) => {
								heads.current[i] = el;
							}}
							type="button"
							className="branched-menu__head"
							aria-expanded={kids ? isOpen : undefined}
							aria-current={leafActive ? "true" : undefined}
							data-active={leafActive ? "" : undefined}
							onClick={() => (kids ? toggle(i) : select(leafValue, item))}
						>
							{item.label}
						</button>
						{kids ? (
							<div className="branched-menu__body">
								<div className="branched-menu__fold">
									<div
										ref={(el) => {
											treeRefs.current[i] = el;
										}}
										className="branched-menu__tree"
									>
										<svg
											className="branched-menu__lines"
											width={indent}
											height={treeH(i, kids.length)}
											aria-hidden="true"
										>
											<path
												className="branched-menu__base"
												d={`M ${trunk} 0 V ${centerOf(kids[kids.length - 1].value, kids.length - 1) - r}`}
											/>
											{kids.map((kid, k) => (
												<path
													key={kid.value}
													className="branched-menu__base"
													d={branch(kid.value, k)}
												/>
											))}
											{kids.map((kid, k) => (
												<path
													key={kid.value}
													className="branched-menu__reach"
													d={reach(kid.value, k)}
													style={{
														strokeDasharray: length(kid.value, k),
														strokeDashoffset: kid.value === active ? 0 : length(kid.value, k),
													}}
												/>
											))}
										</svg>
										{kids.map((kid) => (
											<button
												key={kid.value}
												ref={(el) => {
													if (el) itemRefs.current.set(kid.value, el);
													else itemRefs.current.delete(kid.value);
												}}
												type="button"
												className="branched-menu__item"
												aria-current={kid.value === active ? "true" : undefined}
												data-active={kid.value === active ? "" : undefined}
												tabIndex={isOpen ? 0 : -1}
												onClick={() => select(kid.value, kid)}
											>
												{kid.icon ? (
													<span className="branched-menu__icon" aria-hidden="true">
														{kid.icon}
													</span>
												) : null}
												<span className="branched-menu__label">{kid.label}</span>
											</button>
										))}
									</div>
								</div>
							</div>
						) : null}
					</div>
				);
			})}
		</nav>
	);
};

export default BranchedMenu;
