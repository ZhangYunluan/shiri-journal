export function icon(name, size = 20) {
  const paths = {
    grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    image:
      "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z M3 16l5-5 5 5 3-3 5 5 M15 7h.01",
    layers: "m12 3 10 6-10 6L2 9 10-6Z M2 13l10 6 10-6 M2 17l10 6 10-6",
    book: "M12 5c-3-2-7-2-10-1v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Z M12 5v15",
    plan: "M8 4h12v17H4V4h4 M8 2h8v5H8z M8 12h8 M8 16h5",
    settings:
      "M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
    plus: "M12 5v14 M5 12h14",
    arrow: "M5 12h14 M13 6l6 6-6 6",
    left: "m14 6-6 6 6 6",
    right: "m10 6 6 6-6 6",
    check: "m5 12 4 4L19 6",
    close: "m6 6 12 12 M18 6 6 18",
    shield: "M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Z m-4 9 3 3 5-6",
    sun: "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5 19 19 M5 19l1.5-1.5 M17.5 6.5 19 5",
    moon: "M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12Z",
    compass: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z m-6-3-2 4-4 2 2-4 4-2Z",
    wallet:
      "M20 7H5a2 2 0 0 1 0-4h13v4 M3 5v14a2 2 0 0 0 2 2h15V7 M20 12h-5v5h5",
    comment: "M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 3v-3H3V6a2 2 0 0 1 2-2Z M7 9h10 M7 13h6",
    heart:
      "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
    activity: "M2 12h5l3-8 4 16 3-8h5",
    clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l3 2",
    note: "M14 3H4v18h16V9 M14 3v6h6l-6-6Z M8 13h8 M8 17h5",
    search: "M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0 M15 15l6 6",
    download: "M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5",
    upload: "M12 16V4 m-5 5 5-5 5 5 M4 16v5h16v-5",
    spark: "m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z",
    trash: "M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7",
    edit: "m14 4 6 6 M4 14 15 3l6 6-11 11-7 1 1-7Z",
    copy: "M8 8h13v13H8z M16 8V3H3v13h5",
    calendar: "M3 5h18v16H3z M3 10h18 M7 3v4 M17 3v4",
    lock: "M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4 M12 14v3",
    chevron: "m6 9 6 6 6-6",
    refresh:
      "M20 7v5h-5 M4 17v-5h5 M19 12a7 7 0 0 0-12-5L4 10 M5 12a7 7 0 0 0 12 5l3-3",
    grip: "M8 5h.01 M16 5h.01 M8 12h.01 M16 12h.01 M8 19h.01 M16 19h.01",
    up: "m6 14 6-6 6 6",
    down: "m6 10 6 6 6-6",
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.note}"/></svg>`;
}
export const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const button = (action, label, i = "", cls = "button", extra = "") =>
  `<button type="button" class="${cls}" data-action="${action}" ${extra}>${i ? icon(i) : ""}${label}</button>`;
export function markdown(text) {
  return text
    .split("\n")
    .map((line) =>
      line.startsWith("# ")
        ? `<h2>${esc(line.slice(2))}</h2>`
        : line.startsWith("## ")
          ? `<h3>${esc(line.slice(3))}</h3>`
          : line.startsWith("> ")
            ? `<p class="muted report-disclaimer">${esc(line.slice(2))}</p>`
            : line.startsWith("- ")
              ? `<p class="report-item">${esc(line.slice(2))}</p>`
              : line
                ? `<p>${esc(line)}</p>`
                : "",
    )
    .join("");
}
