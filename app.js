const STORAGE_KEY = "editable-gantt-planner-v1";
const DATA_FILE = "data.json";
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ATTACHMENT_SIZE = 2 * 1024 * 1024;
const palette = ["#0073ea", "#00a878", "#fdab3d", "#e2445c", "#784bd1", "#579bfc", "#333333", "#9d50dd"];
const zooms = {
  day: { dayWidth: 44, labelEvery: 1 },
  week: { dayWidth: 18, labelEvery: 7 },
  month: { dayWidth: 7, labelEvery: 14 },
  year: { dayWidth: 2, labelEvery: 30 }
};
const rangePadding = {
  day: { before: 30, after: 90 },
  week: { before: 60, after: 180 },
  month: { before: 90, after: 365 },
  year: { before: 180, after: 730 }
};

let state = null;
let selected = null;
let dragState = null;
let rowDrag = null;
let createDrag = null;
let renderedRange = null;
let renderedDayWidth = null;
let pendingSelectionCenter = false;

const elements = {
  gantt: document.querySelector(".gantt"),
  dateRangeLabel: document.querySelector("#dateRangeLabel"),
  taskList: document.querySelector("#taskList"),
  timeline: document.querySelector("#timeline"),
  timelineHead: document.querySelector("#timelineHead"),
  addGroupBtn: document.querySelector("#addGroupBtn"),
  addTaskBtn: document.querySelector("#addTaskBtn"),
  addMilestoneBtn: document.querySelector("#addMilestoneBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  importInput: document.querySelector("#importInput"),
  editorForm: document.querySelector("#editorForm"),
  emptyInspector: document.querySelector("#emptyInspector"),
  editorHeading: document.querySelector("#editorHeading"),
  deleteBtn: document.querySelector("#deleteBtn"),
  nameInput: document.querySelector("#nameInput"),
  groupField: document.querySelector("#groupField"),
  groupSelect: document.querySelector("#groupSelect"),
  dateGrid: document.querySelector(".date-grid"),
  startInput: document.querySelector("#startInput"),
  endField: document.querySelector("#endField"),
  endInput: document.querySelector("#endInput"),
  ownerField: document.querySelector("#ownerField"),
  ownerInput: document.querySelector("#ownerInput"),
  tagsField: document.querySelector("#tagsField"),
  tagsInput: document.querySelector("#tagsInput"),
  dependencyField: document.querySelector("#dependencyField"),
  dependencySelect: document.querySelector("#dependencySelect"),
  progressField: document.querySelector("#progressField"),
  progressRange: document.querySelector("#progressRange"),
  progressInput: document.querySelector("#progressInput"),
  colorField: document.querySelector("#colorField"),
  colorInput: document.querySelector("#colorInput"),
  colorSwatches: document.querySelector("#colorSwatches"),
  commentsField: document.querySelector("#commentsField"),
  commentsInput: document.querySelector("#commentsInput"),
  attachmentsField: document.querySelector("#attachmentsField"),
  attachmentInput: document.querySelector("#attachmentInput"),
  attachmentList: document.querySelector("#attachmentList")
};

async function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return normalizeState(JSON.parse(saved));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  const sharedState = await loadSharedState();
  if (sharedState) return sharedState;

  return getDefaultState();
}

async function loadSharedState() {
  try {
    const response = await fetch(DATA_FILE, { cache: "no-store" });
    if (!response.ok) return null;
    return normalizeState(await response.json());
  } catch {
    return null;
  }
}

function getDefaultState() {
  return normalizeState({
    zoom: "week",
    groups: [
      {
        id: createId(),
        name: "Website launch",
        collapsed: false,
        items: [
          {
            id: createId(),
            type: "task",
            name: "Content and wireframes",
            start: "2026-05-18",
            end: "2026-05-29",
            color: "#0073ea",
            owner: "Design",
            tags: ["content", "UX"],
            progress: 35
          },
          {
            id: createId(),
            type: "task",
            name: "Build interactive prototype",
            start: "2026-05-28",
            end: "2026-06-12",
            color: "#00a878",
            owner: "Pierre",
            tags: ["frontend"],
            progress: 50
          },
          {
            id: createId(),
            type: "milestone",
            name: "Client review",
            start: "2026-06-15",
            end: "2026-06-15",
            color: "#fdab3d",
            owner: "Client",
            tags: ["review"],
            progress: 0
          }
        ]
      },
      {
        id: createId(),
        name: "Operations",
        collapsed: false,
        items: [
          {
            id: createId(),
            type: "task",
            name: "Analytics and QA",
            start: "2026-06-10",
            end: "2026-06-24",
            color: "#784bd1",
            owner: "Ops",
            tags: ["QA"],
            progress: 20
          }
        ]
      }
    ]
  });
}

function normalizeState(input) {
  const tagColors = { ...(input.tagColors || {}) };
  const groups = Array.isArray(input.groups) && input.groups.length ? input.groups.map((group) => ({
    id: group.id || createId(),
    name: group.name || "Untitled group",
    collapsed: Boolean(group.collapsed),
    items: Array.isArray(group.items) ? group.items.map((item) => {
      const tags = Array.isArray(item.tags) ? item.tags : [];
      if (tags.length && item.color && !tagColors[getTagKey(tags[0])]) {
        tagColors[getTagKey(tags[0])] = item.color;
      }

      return {
        id: item.id || createId(),
        type: item.type === "milestone" ? "milestone" : "task",
        name: item.name || "Untitled item",
        start: item.start || formatDate(new Date()),
        end: item.type === "milestone" ? item.start || formatDate(new Date()) : item.end || item.start || formatDate(new Date()),
        color: tags.length ? getTagColorFromMap(tags[0], tagColors) : item.color || palette[0],
        owner: item.owner || "",
        tags,
        dependsOn: typeof item.dependsOn === "string" ? item.dependsOn : "",
        comments: typeof item.comments === "string" ? item.comments : "",
        attachments: normalizeAttachments(item.attachments),
        progress: clampProgress(item.progress)
      };
    }) : []
  })) : [];

  normalizeDependencies(groups);

  return {
    zoom: zooms[input.zoom] ? input.zoom : "week",
    tagColors,
    groups
  };
}

function normalizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments.filter((attachment) => attachment && attachment.name && attachment.dataUrl).map((attachment) => ({
    id: attachment.id || createId(),
    name: String(attachment.name),
    type: String(attachment.type || "application/octet-stream"),
    size: Number.isFinite(Number(attachment.size)) ? Number(attachment.size) : 0,
    dataUrl: String(attachment.dataUrl)
  }));
}

function normalizeDependencies(groups) {
  const itemIds = new Set(groups.flatMap((group) => group.items.map((item) => item.id)));
  groups.forEach((group) => {
    group.items.forEach((item) => {
      if (!item.dependsOn || !itemIds.has(item.dependsOn) || wouldCreateDependencyCycle(item.id, item.dependsOn, groups)) {
        item.dependsOn = "";
      }
    });
  });
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function createId() {
  return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(value, days) {
  const date = typeof value === "string" ? parseDate(value) : new Date(value);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function daysBetween(start, end) {
  return Math.round((parseDate(end) - parseDate(start)) / DAY_MS);
}

function readableDate(value) {
  return parseDate(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function clampProgress(value) {
  const progress = Number(value);
  if (!Number.isFinite(progress)) return 0;
  return Math.min(100, Math.max(0, Math.round(progress)));
}

function getItemColor(item) {
  const tags = Array.isArray(item.tags) ? item.tags : [];
  if (tags.length) return getTagColor(tags[0]);
  return item.color || palette[0];
}

function getTagColor(tag) {
  return getTagColorFromMap(tag, state?.tagColors || {});
}

function getTagColorFromMap(tag, tagColors) {
  const key = getTagKey(tag);
  if (tagColors[key]) return tagColors[key];
  const color = getDefaultTagColor(tag);
  tagColors[key] = color;
  return color;
}

function getTagKey(tag) {
  return tag.trim().toLowerCase();
}

function getDefaultTagColor(tag) {
  const normalized = tag.trim().toLowerCase();
  if (!normalized) return palette[0];
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) % 2147483647;
  }
  return palette[hash % palette.length];
}

function getTagStyle(tag) {
  const color = getTagColor(tag);
  return `background:${hexToRgba(color, 0.14)};color:${color}`;
}

function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function getVisibleRows() {
  const rows = [];
  state.groups.forEach((group) => {
    rows.push({ type: "group", group });
    if (!group.collapsed) {
      group.items.forEach((item) => rows.push({ type: "item", group, item }));
    }
  });
  return rows;
}

function getRange() {
  const dates = [];
  state.groups.forEach((group) => {
    group.items.forEach((item) => {
      dates.push(parseDate(item.start));
      dates.push(parseDate(item.end));
    });
  });
  const today = new Date();
  dates.push(today);
  const min = new Date(Math.min(...dates.map((date) => date.getTime())));
  const max = new Date(Math.max(...dates.map((date) => date.getTime())));
  const padding = rangePadding[state.zoom] || rangePadding.week;
  min.setDate(min.getDate() - padding.before);
  max.setDate(max.getDate() + padding.after);
  return { start: formatDate(min), end: formatDate(max), days: daysBetween(formatDate(min), formatDate(max)) + 1 };
}

function findSelection() {
  if (!selected) return null;
  if (selected.type === "group") {
    const group = state.groups.find((candidate) => candidate.id === selected.id);
    return group ? { type: "group", group } : null;
  }

  for (const group of state.groups) {
    const item = group.items.find((candidate) => candidate.id === selected.id);
    if (item) return { type: "item", group, item };
  }
  return null;
}

function getFirstGroup() {
  if (!state.groups.length) {
    state.groups.push({ id: createId(), name: "New group", collapsed: false, items: [] });
  }
  return state.groups[0];
}

function render() {
  const scrollAnchor = getScrollAnchor();
  const rows = getVisibleRows();
  const range = getRange();
  const zoom = zooms[state.zoom];
  const timelineWidth = range.days * zoom.dayWidth;
  elements.timeline.style.setProperty("--day-width", `${zoom.dayWidth}px`);
  elements.timeline.style.width = `${timelineWidth}px`;
  elements.timeline.style.minWidth = `${timelineWidth}px`;
  elements.timelineHead.style.width = `${timelineWidth}px`;
  elements.dateRangeLabel.textContent = `${readableDate(range.start)} - ${readableDate(range.end)}`;

  renderHeader(range, zoom, timelineWidth);
  renderRows(rows, range, zoom, timelineWidth);
  renderInspector();
  renderedRange = range;
  renderedDayWidth = zoom.dayWidth;
  if (pendingSelectionCenter) {
    centerSelectionInView(rows, range, zoom);
    pendingSelectionCenter = false;
  } else {
    restoreScrollAnchor(scrollAnchor, range, zoom);
  }
  saveState();
}

function getScrollAnchor() {
  if (!elements.gantt || !renderedRange || !renderedDayWidth) return null;
  return {
    date: addDays(renderedRange.start, Math.round(elements.gantt.scrollLeft / renderedDayWidth)),
    top: elements.gantt.scrollTop
  };
}

function restoreScrollAnchor(anchor, range, zoom) {
  if (!elements.gantt || !anchor) return;
  const dayOffset = Math.max(0, daysBetween(range.start, anchor.date));
  elements.gantt.scrollLeft = dayOffset * zoom.dayWidth;
  elements.gantt.scrollTop = anchor.top;
}

function centerSelectionInView(rows, range, zoom) {
  if (!elements.gantt || !selected) return;
  const target = getSelectionTimelineTarget(rows, range, zoom);
  if (!target) return;

  const leftWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--left-width")) || 370;
  const availableWidth = Math.max(240, elements.gantt.clientWidth - leftWidth);
  const headerHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-height")) || 68;
  const availableHeight = Math.max(160, elements.gantt.clientHeight - headerHeight);

  elements.gantt.scrollLeft = Math.max(0, target.x - availableWidth / 2);
  elements.gantt.scrollTop = Math.max(0, target.y - availableHeight / 2);
}

function getSelectionTimelineTarget(rows, range, zoom) {
  const rowIndex = rows.findIndex((row) => (
    selected.type === "group"
      ? row.type === "group" && row.group.id === selected.id
      : row.type === "item" && row.item.id === selected.id
  ));
  if (rowIndex < 0) return null;

  const row = rows[rowIndex];
  if (row.type === "group") {
    const summary = getGroupSummary(row.group);
    if (!summary) return null;
    const left = daysBetween(range.start, summary.start) * zoom.dayWidth;
    const width = Math.max(1, daysBetween(summary.start, summary.end) + 1) * zoom.dayWidth;
    return { x: left + width / 2, y: rowIndex * 54 + 27 };
  }

  const left = daysBetween(range.start, row.item.start) * zoom.dayWidth;
  const width = row.item.type === "milestone" ? 24 : getItemDuration(row.item) * zoom.dayWidth;
  return { x: left + width / 2, y: rowIndex * 54 + 27 };
}

function renderHeader(range, zoom, timelineWidth) {
  const monthRow = document.createElement("div");
  monthRow.className = "month-row";
  const dayRow = document.createElement("div");
  dayRow.className = "day-row";

  let cursor = parseDate(range.start);
  let currentMonth = cursor.getMonth();
  let monthStart = 0;

  for (let day = 0; day < range.days; day += 1) {
    const date = parseDate(addDays(range.start, day));
    if (date.getMonth() !== currentMonth) {
      monthRow.append(createMonthCell(addDays(range.start, monthStart), (day - monthStart) * zoom.dayWidth));
      monthStart = day;
      currentMonth = date.getMonth();
    }

    const dayCell = document.createElement("div");
    dayCell.className = `day-cell ${isWeekend(date) ? "weekend" : ""}`;
    dayCell.style.width = `${zoom.dayWidth}px`;
    dayCell.textContent = day % zoom.labelEvery === 0 ? getDayLabel(date) : "";
    dayRow.append(dayCell);
  }

  monthRow.append(createMonthCell(addDays(range.start, monthStart), (range.days - monthStart) * zoom.dayWidth));
  elements.timelineHead.replaceChildren(monthRow, dayRow);
  elements.timelineHead.style.minWidth = `${timelineWidth}px`;
}

function createMonthCell(value, width) {
  const cell = document.createElement("div");
  cell.className = "month-cell";
  cell.style.width = `${width}px`;
  const date = parseDate(value);
  cell.textContent = date.toLocaleDateString(undefined, state.zoom === "year"
    ? { month: "short", year: date.getMonth() === 0 ? "numeric" : undefined }
    : { month: "long", year: "numeric" });
  return cell;
}

function getDayLabel(date) {
  if (state.zoom === "year") {
    return date.getDate() <= 2 ? date.toLocaleDateString(undefined, { month: "short" }) : "";
  }
  if (state.zoom === "month") return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return date.toLocaleDateString(undefined, { day: "numeric" });
}

function isWeekend(date) {
  return date.getDay() === 0 || date.getDay() === 6;
}

function renderRows(rows, range, zoom, timelineWidth) {
  const listFragment = document.createDocumentFragment();
  const canvas = document.createElement("div");
  canvas.className = "timeline-canvas";
  canvas.style.width = `${timelineWidth}px`;
  canvas.style.height = `${rows.length * 54}px`;

  rows.forEach((row, index) => {
    listFragment.append(createListRow(row));
    const timelineRow = document.createElement("div");
    timelineRow.className = "row";
    timelineRow.style.width = `${timelineWidth}px`;
    attachTimelineCreateEvents(timelineRow, row, index, range, zoom);
    canvas.append(timelineRow);

    if (row.type === "group") {
      const groupBar = createTimelineGroup(row.group, index, range, zoom);
      if (groupBar) canvas.append(groupBar);
    } else {
      canvas.append(createTimelineItem(row.item, index, range, zoom));
    }
  });

  for (let day = 0; day < range.days; day += 1) {
    const date = parseDate(addDays(range.start, day));
    const line = document.createElement("div");
    line.className = `grid-line ${isWeekend(date) ? "weekend" : ""}`;
    line.style.left = `${day * zoom.dayWidth}px`;
    canvas.append(line);
  }

  canvas.append(createDependencyLayer(rows, range, zoom, timelineWidth));

  const todayOffset = daysBetween(range.start, formatDate(new Date()));
  if (todayOffset >= 0 && todayOffset <= range.days) {
    const today = document.createElement("div");
    today.className = "today-line";
    today.style.left = `${todayOffset * zoom.dayWidth}px`;
    canvas.append(today);
  }

  elements.taskList.replaceChildren(listFragment);
  elements.timeline.replaceChildren(canvas);
}

function createDependencyLayer(rows, range, zoom, timelineWidth) {
  const height = rows.length * 54;
  const layer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  layer.classList.add("dependency-layer");
  layer.setAttribute("width", timelineWidth);
  layer.setAttribute("height", height);
  layer.setAttribute("viewBox", `0 0 ${timelineWidth} ${height}`);
  layer.setAttribute("aria-hidden", "true");

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
  marker.setAttribute("id", "dependency-arrow");
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "9");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "6");
  marker.setAttribute("markerHeight", "6");
  marker.setAttribute("orient", "auto-start-reverse");
  const arrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
  arrow.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  marker.append(arrow);
  defs.append(marker);
  layer.append(defs);

  const visibleItems = new Map();
  rows.forEach((row, index) => {
    if (row.type === "item") visibleItems.set(row.item.id, { item: row.item, index });
  });

  visibleItems.forEach(({ item, index }) => {
    if (!item.dependsOn || !visibleItems.has(item.dependsOn)) return;
    const dependency = visibleItems.get(item.dependsOn);
    const from = getDependencyPoint(dependency.item, dependency.index, range, zoom, "end");
    const to = getDependencyPoint(item, index, range, zoom, "start");
    const elbowGap = 18;
    const midX = from.x + elbowGap < to.x ? Math.round((from.x + to.x) / 2) : from.x + elbowGap;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.classList.add("dependency-line");
    path.setAttribute("d", `M ${from.x} ${from.y} H ${midX} V ${to.y} H ${to.x}`);
    path.setAttribute("marker-end", "url(#dependency-arrow)");
    path.setAttribute("data-from", item.dependsOn);
    path.setAttribute("data-to", item.id);
    layer.append(path);
  });

  return layer;
}

function getDependencyPoint(item, rowIndex, range, zoom, edge) {
  const startX = daysBetween(range.start, item.start) * zoom.dayWidth;
  const endX = item.type === "milestone" ? startX : startX + getItemDuration(item) * zoom.dayWidth;
  return {
    x: edge === "end" ? endX : startX,
    y: rowIndex * 54 + 27
  };
}

function attachTimelineCreateEvents(timelineRow, row, rowIndex, range, zoom) {
  timelineRow.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const group = row.type === "group" ? row.group : row.group;
    if (!group) return;
    startCreateDrag(event, timelineRow, group, rowIndex, range, zoom);
  });
}

function startCreateDrag(event, timelineRow, group, rowIndex, range, zoom) {
  event.preventDefault();
  const canvas = timelineRow.closest(".timeline-canvas");
  const startDay = getTimelineDayFromPointer(event, canvas, range, zoom);
  const preview = document.createElement("div");
  preview.className = "bar create-preview";
  preview.style.top = `${rowIndex * 54 + 12}px`;
  preview.style.setProperty("--bar-color", "#0073ea");
  preview.style.setProperty("--bar-track", "rgba(0, 115, 234, 0.18)");
  preview.innerHTML = `<span class="bar-fill"></span><span class="bar-label">New task</span>`;
  preview.querySelector(".bar-fill").style.width = "100%";
  canvas.append(preview);

  createDrag = {
    groupId: group.id,
    rangeStart: range.start,
    rangeDays: range.days,
    dayWidth: zoom.dayWidth,
    startDay,
    currentDay: startDay,
    preview
  };
  updateCreatePreview();
  timelineRow.setPointerCapture(event.pointerId);
}

function getTimelineDayFromPointer(event, canvas, range, zoom) {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const day = Math.floor(x / zoom.dayWidth);
  return Math.min(range.days - 1, Math.max(0, day));
}

function updateCreatePreview() {
  if (!createDrag) return;
  const startDay = Math.min(createDrag.startDay, createDrag.currentDay);
  const endDay = Math.max(createDrag.startDay, createDrag.currentDay);
  createDrag.preview.style.left = `${startDay * createDrag.dayWidth}px`;
  createDrag.preview.style.width = `${Math.max(1, endDay - startDay + 1) * createDrag.dayWidth}px`;
}

function finishCreateDrag() {
  if (!createDrag) return;
  const group = state.groups.find((candidate) => candidate.id === createDrag.groupId);
  const startDay = Math.min(createDrag.startDay, createDrag.currentDay);
  const endDay = Math.max(createDrag.startDay, createDrag.currentDay);
  createDrag.preview.remove();

  if (group) {
    const defaults = getGroupDefaults(group);
    const item = {
      id: createId(),
      type: "task",
      name: "New task",
      start: addDays(createDrag.rangeStart, startDay),
      end: addDays(createDrag.rangeStart, endDay),
      color: defaults.tags.length ? getTagColor(defaults.tags[0]) : palette[group.items.length % palette.length],
      owner: defaults.owner,
      tags: [...defaults.tags],
      progress: 0
    };
    group.collapsed = false;
    group.items.push(item);
    selected = { type: "item", id: item.id };
  }

  createDrag = null;
  render();
}

function createListRow(row) {
  const wrapper = document.createElement("div");
  wrapper.className = `row task-row ${row.type === "group" ? "group-row" : ""} ${isSelected(row) ? "selected" : ""}`;
  wrapper.draggable = true;

  if (row.type === "group") {
    wrapper.dataset.dragType = "group";
    wrapper.dataset.id = row.group.id;
    const toggle = document.createElement("button");
    toggle.className = "group-toggle";
    toggle.type = "button";
    toggle.draggable = false;
    toggle.textContent = row.group.collapsed ? ">" : "v";
    toggle.title = row.group.collapsed ? "Expand group" : "Collapse group";
    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      row.group.collapsed = !row.group.collapsed;
      render();
    });

    const main = document.createElement("div");
    main.className = "row-main";
    const summary = getGroupSummary(row.group);
    const progressText = summary ? ` ${summary.progress}%` : "";
    main.innerHTML = `<div class="row-title"><strong></strong></div><div class="row-meta">${row.group.items.length} items${progressText}</div>`;
    main.querySelector("strong").textContent = row.group.name;
    wrapper.append(toggle, main);
    wrapper.addEventListener("click", () => selectItem("group", row.group.id));
    attachRowDragEvents(wrapper, row);
    return wrapper;
  }

  wrapper.dataset.dragType = "item";
  wrapper.dataset.id = row.item.id;
  wrapper.dataset.groupId = row.group.id;
  const icon = document.createElement("div");
  icon.className = `item-icon ${row.item.type === "milestone" ? "milestone-icon" : ""}`;
  icon.style.background = getItemColor(row.item);
  icon.innerHTML = `<span>${row.item.type === "milestone" ? "M" : "T"}</span>`;

  const main = document.createElement("div");
  main.className = "row-main";
  const tags = row.item.tags.slice(0, 2).map((tag) => `<span class="tag" style="${getTagStyle(tag)}">${escapeHtml(tag)}</span>`).join("");
  const dependency = row.item.dependsOn ? `<span class="dependency-chip">after ${escapeHtml(getItemLabel(row.item.dependsOn))}</span>` : "";
  const comments = row.item.comments?.trim() ? `<span class="note-chip">note</span>` : "";
  const attachments = row.item.attachments?.length ? `<span class="note-chip">${row.item.attachments.length} file${row.item.attachments.length === 1 ? "" : "s"}</span>` : "";
  main.innerHTML = `
    <div class="row-title"><span></span></div>
    <div class="row-meta">${escapeHtml(row.item.owner || "Unassigned")} <span>${row.item.progress}%</span> ${dependency} ${comments} ${attachments} ${tags}</div>
  `;
  main.querySelector(".row-title span").textContent = row.item.name;
  wrapper.append(icon, main);
  wrapper.addEventListener("click", () => selectItem("item", row.item.id));
  attachRowDragEvents(wrapper, row);
  return wrapper;
}

function attachRowDragEvents(wrapper, row) {
  wrapper.addEventListener("dragstart", (event) => {
    rowDrag = row.type === "group"
      ? { type: "group", id: row.group.id }
      : { type: "item", id: row.item.id };
    wrapper.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", JSON.stringify(rowDrag));
  });

  wrapper.addEventListener("dragend", () => {
    rowDrag = null;
    clearDropIndicators();
  });

  wrapper.addEventListener("dragover", (event) => {
    if (!rowDrag || !canDropOn(row)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    showDropIndicator(wrapper, row, event);
  });

  wrapper.addEventListener("dragleave", () => {
    wrapper.classList.remove("drop-before", "drop-after", "drop-inside");
  });

  wrapper.addEventListener("drop", (event) => {
    if (!rowDrag || !canDropOn(row)) return;
    event.preventDefault();
    moveDraggedRow(row, event);
    clearDropIndicators();
    render();
  });
}

function canDropOn(targetRow) {
  if (rowDrag.type === "group") {
    return targetRow.type === "group" && targetRow.group.id !== rowDrag.id;
  }

  if (targetRow.type === "group") return true;
  return targetRow.item.id !== rowDrag.id;
}

function showDropIndicator(wrapper, targetRow, event) {
  clearDropIndicators();
  const position = getDropPosition(wrapper, targetRow, event);
  wrapper.classList.add(`drop-${position}`);
}

function clearDropIndicators() {
  document.querySelectorAll(".dragging, .drop-before, .drop-after, .drop-inside").forEach((row) => {
    row.classList.remove("dragging", "drop-before", "drop-after", "drop-inside");
  });
}

function getDropPosition(wrapper, targetRow, event) {
  const rect = wrapper.getBoundingClientRect();
  const isBefore = event.clientY < rect.top + rect.height / 2;
  if (rowDrag.type === "group") return isBefore ? "before" : "after";
  if (targetRow.type === "group") return "inside";
  return isBefore ? "before" : "after";
}

function moveDraggedRow(targetRow, event) {
  const position = getDropPosition(event.currentTarget, targetRow, event);
  if (rowDrag.type === "group") {
    moveGroup(rowDrag.id, targetRow.group.id, position);
    selected = { type: "group", id: rowDrag.id };
    return;
  }

  moveItem(rowDrag.id, targetRow, position);
  selected = { type: "item", id: rowDrag.id };
}

function moveGroup(sourceId, targetId, position) {
  const sourceIndex = state.groups.findIndex((group) => group.id === sourceId);
  const targetIndex = state.groups.findIndex((group) => group.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;

  const [group] = state.groups.splice(sourceIndex, 1);
  const adjustedTargetIndex = state.groups.findIndex((candidate) => candidate.id === targetId);
  const insertIndex = position === "after" ? adjustedTargetIndex + 1 : adjustedTargetIndex;
  state.groups.splice(insertIndex, 0, group);
}

function moveItem(itemId, targetRow, position) {
  const source = removeItem(itemId);
  if (!source) return;

  if (targetRow.type === "group") {
    const targetGroup = state.groups.find((group) => group.id === targetRow.group.id);
    if (!targetGroup) return;
    targetGroup.collapsed = false;
    targetGroup.items.push(source.item);
    return;
  }

  const targetGroup = state.groups.find((group) => group.id === targetRow.group.id);
  if (!targetGroup) return;
  const targetIndex = targetGroup.items.findIndex((item) => item.id === targetRow.item.id);
  const insertIndex = position === "after" ? targetIndex + 1 : targetIndex;
  targetGroup.items.splice(Math.max(0, insertIndex), 0, source.item);
}

function removeItem(itemId) {
  for (const group of state.groups) {
    const index = group.items.findIndex((item) => item.id === itemId);
    if (index >= 0) {
      const [item] = group.items.splice(index, 1);
      return { group, item };
    }
  }
  return null;
}

function getItemDuration(item) {
  return Math.max(1, daysBetween(item.start, item.end || item.start) + 1);
}

function getGroupSummary(group) {
  if (!group.items.length) return null;

  const starts = group.items.map((item) => parseDate(item.start).getTime());
  const ends = group.items.map((item) => parseDate(item.end || item.start).getTime());
  let weightedProgress = 0;
  let totalWeight = 0;

  group.items.forEach((item) => {
    const weight = getItemDuration(item);
    totalWeight += weight;
    weightedProgress += clampProgress(item.progress) * weight;
  });

  return {
    start: formatDate(new Date(Math.min(...starts))),
    end: formatDate(new Date(Math.max(...ends))),
    progress: totalWeight ? Math.round(weightedProgress / totalWeight) : 0,
    totalWeight,
    segments: getGroupTagSegments(group, totalWeight)
  };
}

function getGroupTagSegments(group, totalWeight) {
  const segmentMap = new Map();

  group.items.forEach((item) => {
    const tag = item.tags[0] || "Untagged";
    const key = getTagKey(tag);
    const weight = getItemDuration(item);
    const existing = segmentMap.get(key) || {
      tag,
      color: item.tags.length ? getTagColor(tag) : item.color || palette[0],
      weight: 0,
      weightedProgress: 0
    };

    existing.weight += weight;
    existing.weightedProgress += clampProgress(item.progress) * weight;
    segmentMap.set(key, existing);
  });

  return [...segmentMap.values()].map((segment) => ({
    ...segment,
    share: totalWeight ? (segment.weight / totalWeight) * 100 : 0,
    progress: segment.weight ? Math.round(segment.weightedProgress / segment.weight) : 0
  }));
}

function createTimelineGroup(group, rowIndex, range, zoom) {
  const summary = getGroupSummary(group);
  if (!summary) return null;

  const left = daysBetween(range.start, summary.start) * zoom.dayWidth;
  const top = rowIndex * 54;
  const duration = Math.max(1, daysBetween(summary.start, summary.end) + 1);
  const bar = document.createElement("div");
  bar.className = `bar group-bar ${selected?.type === "group" && selected.id === group.id ? "selected" : ""}`;
  bar.style.left = `${left}px`;
  bar.style.top = `${top + 14}px`;
  bar.style.width = `${duration * zoom.dayWidth}px`;
  bar.title = `${group.name} - ${summary.progress}% complete`;
  bar.innerHTML = `
    <span class="group-segments"></span>
    <span class="bar-label"></span>
  `;
  const segments = bar.querySelector(".group-segments");
  summary.segments.forEach((segment) => {
    const segmentElement = document.createElement("span");
    segmentElement.className = "group-segment";
    segmentElement.style.width = `${segment.share}%`;
    segmentElement.style.setProperty("--segment-color", segment.color);
    segmentElement.style.setProperty("--segment-track", hexToRgba(segment.color, 0.2));
    segmentElement.title = `${segment.tag}: ${segment.progress}% complete`;
    segmentElement.innerHTML = `<span class="group-segment-fill"></span>`;
    segmentElement.querySelector(".group-segment-fill").style.width = `${segment.progress}%`;
    segments.append(segmentElement);
  });
  bar.querySelector(".bar-label").textContent = `${group.name} ${summary.progress}%`;
  bar.addEventListener("click", () => selectItem("group", group.id));
  return bar;
}

function createTimelineItem(item, rowIndex, range, zoom) {
  const left = daysBetween(range.start, item.start) * zoom.dayWidth;
  const top = rowIndex * 54;

  if (item.type === "milestone") {
    const milestone = document.createElement("div");
    milestone.className = `milestone ${selected?.type === "item" && selected.id === item.id ? "selected" : ""}`;
    milestone.style.background = getItemColor(item);
    milestone.style.left = `${left - 12}px`;
    milestone.style.top = `${top + 15}px`;
    milestone.title = `${item.name} - ${readableDate(item.start)}`;
    milestone.addEventListener("pointerdown", (event) => startDrag(event, item.id, "move"));
    milestone.addEventListener("click", () => selectItem("item", item.id));
    return milestone;
  }

  const duration = getItemDuration(item);
  const bar = document.createElement("div");
  bar.className = `bar ${selected?.type === "item" && selected.id === item.id ? "selected" : ""}`;
  const itemColor = getItemColor(item);
  bar.style.setProperty("--bar-color", itemColor);
  bar.style.setProperty("--bar-track", hexToRgba(itemColor, 0.24));
  bar.style.left = `${left}px`;
  bar.style.top = `${top + 12}px`;
  bar.style.width = `${duration * zoom.dayWidth}px`;
  bar.title = `${item.name} - ${readableDate(item.start)} to ${readableDate(item.end)} - ${item.progress}% complete`;
  bar.innerHTML = `
    <span class="bar-fill"></span>
    <span class="resize-handle left" data-mode="resize-start"></span>
    <span class="bar-label"></span>
    <span class="resize-handle right" data-mode="resize-end"></span>
  `;
  bar.querySelector(".bar-fill").style.width = `${item.progress}%`;
  bar.querySelector(".bar-label").textContent = item.name;
  bar.addEventListener("pointerdown", (event) => startDrag(event, item.id, event.target.dataset.mode || "move"));
  bar.addEventListener("click", () => selectItem("item", item.id));
  return bar;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function isSelected(row) {
  if (!selected) return false;
  if (row.type === "group") return selected.type === "group" && selected.id === row.group.id;
  return selected.type === "item" && selected.id === row.item.id;
}

function selectItem(type, id) {
  selected = { type, id };
  pendingSelectionCenter = true;
  render();
}

function startDrag(event, id, mode) {
  event.preventDefault();
  const located = findItem(id);
  if (!located) return;
  selected = { type: "item", id };
  dragState = {
    id,
    mode,
    startX: event.clientX,
    originalStart: located.item.start,
    originalEnd: located.item.end,
    dayWidth: zooms[state.zoom].dayWidth
  };
  event.currentTarget.setPointerCapture(event.pointerId);
}

function findItem(id) {
  for (const group of state.groups) {
    const item = group.items.find((candidate) => candidate.id === id);
    if (item) return { group, item };
  }
  return null;
}

function getAllItems(groups = state.groups) {
  return groups.flatMap((group) => group.items.map((item) => ({ group, item })));
}

function getItemLabel(itemId) {
  const located = findItem(itemId);
  return located ? located.item.name : "";
}

function wouldCreateDependencyCycle(itemId, dependencyId, groups = state.groups) {
  let nextId = dependencyId;
  const visited = new Set();

  while (nextId) {
    if (nextId === itemId) return true;
    if (visited.has(nextId)) return true;
    visited.add(nextId);

    const located = getAllItems(groups).find(({ item }) => item.id === nextId);
    nextId = located?.item.dependsOn || "";
  }

  return false;
}

function handlePointerMove(event) {
  if (createDrag) {
    const canvas = createDrag.preview.closest(".timeline-canvas");
    createDrag.currentDay = getTimelineDayFromPointer(event, canvas, { days: createDrag.rangeDays }, { dayWidth: createDrag.dayWidth });
    updateCreatePreview();
    return;
  }

  if (!dragState) return;
  const located = findItem(dragState.id);
  if (!located) return;
  const deltaDays = Math.round((event.clientX - dragState.startX) / dragState.dayWidth);
  const item = located.item;

  if (dragState.mode === "resize-start") {
    const nextStart = addDays(dragState.originalStart, deltaDays);
    if (daysBetween(nextStart, item.end) >= 0) item.start = nextStart;
  } else if (dragState.mode === "resize-end") {
    const nextEnd = addDays(dragState.originalEnd, deltaDays);
    if (daysBetween(item.start, nextEnd) >= 0) item.end = nextEnd;
  } else {
    item.start = addDays(dragState.originalStart, deltaDays);
    item.end = addDays(dragState.originalEnd, deltaDays);
  }

  if (item.type === "milestone") item.end = item.start;
  render();
}

function handlePointerUp() {
  if (createDrag) {
    finishCreateDrag();
    return;
  }
  dragState = null;
}

function renderInspector() {
  const current = findSelection();
  elements.groupSelect.replaceChildren(...state.groups.map((group) => {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = group.name;
    return option;
  }));
  elements.dependencySelect.replaceChildren(...getDependencyOptions(current));

  elements.colorSwatches.replaceChildren(...palette.map((color) => {
    const button = document.createElement("button");
    button.className = "swatch";
    button.type = "button";
    button.style.background = color;
    button.title = color;
    button.addEventListener("click", () => {
      elements.colorInput.value = color;
      updateSelectedFromForm();
    });
    return button;
  }));

  if (!current) {
    elements.editorForm.classList.add("hidden");
    elements.emptyInspector.classList.remove("hidden");
    return;
  }

  elements.editorForm.classList.remove("hidden");
  elements.emptyInspector.classList.add("hidden");
  elements.groupField.classList.toggle("hidden", current.type === "group");
  elements.dateGrid.classList.toggle("hidden", current.type === "group");
  elements.endField.classList.toggle("hidden", current.item?.type === "milestone");
  elements.ownerField.classList.toggle("hidden", current.type === "group");
  elements.tagsField.classList.toggle("hidden", current.type === "group");
  elements.dependencyField.classList.toggle("hidden", current.type === "group");
  elements.progressField.classList.toggle("hidden", current.type === "group");
  elements.colorField.classList.toggle("hidden", current.type === "group");
  elements.commentsField.classList.toggle("hidden", current.type === "group");
  elements.attachmentsField.classList.toggle("hidden", current.type === "group");
  elements.editorHeading.textContent = current.type === "group" ? "Group" : current.item.type === "milestone" ? "Milestone" : "Task";

  const editable = current.type === "group" ? current.group : current.item;
  elements.nameInput.value = editable.name;
  elements.startInput.value = current.type === "group" ? "" : current.item.start;
  elements.startInput.disabled = current.type === "group";
  elements.endInput.value = current.type === "group" ? "" : current.item.end;
  elements.endInput.disabled = current.type === "group";
  elements.ownerInput.value = current.type === "group" ? "" : current.item.owner;
  elements.ownerInput.disabled = current.type === "group";
  elements.tagsInput.value = current.type === "group" ? "" : current.item.tags.join(", ");
  elements.dependencySelect.value = current.type === "group" ? "" : current.item.dependsOn || "";
  elements.progressRange.value = current.type === "group" ? 0 : current.item.progress;
  elements.progressInput.value = current.type === "group" ? 0 : current.item.progress;
  elements.colorInput.value = current.type === "group" ? palette[0] : getItemColor(current.item);
  elements.commentsInput.value = current.type === "group" ? "" : current.item.comments || "";
  renderAttachmentList(current.type === "item" ? current.item : null);
  if (current.type === "item") elements.groupSelect.value = current.group.id;
}

function renderAttachmentList(item) {
  elements.attachmentList.replaceChildren();
  if (!item) return;

  if (!item.attachments.length) {
    const empty = document.createElement("div");
    empty.className = "attachment-empty";
    empty.textContent = "No files attached";
    elements.attachmentList.append(empty);
    return;
  }

  item.attachments.forEach((attachment) => {
    const row = document.createElement("div");
    row.className = "attachment-row";

    const link = document.createElement("a");
    link.href = attachment.dataUrl;
    link.download = attachment.name;
    link.textContent = attachment.name;
    link.title = attachment.name;

    const meta = document.createElement("span");
    meta.textContent = formatFileSize(attachment.size);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "attachment-remove";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => removeAttachment(attachment.id));

    row.append(link, meta, remove);
    elements.attachmentList.append(row);
  });
}

function formatFileSize(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getDependencyOptions(current) {
  const options = [];
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "No dependency";
  options.push(none);

  if (!current || current.type !== "item") return options;

  state.groups.forEach((group) => {
    group.items.forEach((candidate) => {
      if (candidate.id === current.item.id) return;
      if (wouldCreateDependencyCycle(current.item.id, candidate.id)) return;
      const option = document.createElement("option");
      option.value = candidate.id;
      option.textContent = `${candidate.name} (${group.name})`;
      options.push(option);
    });
  });

  return options;
}

function updateSelectedFromForm() {
  const current = findSelection();
  if (!current) return;

  if (current.type === "group") {
    current.group.name = elements.nameInput.value || "Untitled group";
    render();
    return;
  }

  const item = current.item;
  item.name = elements.nameInput.value || "Untitled item";
  item.start = elements.startInput.value || item.start;
  item.end = item.type === "milestone" ? item.start : elements.endInput.value || item.end;
  if (daysBetween(item.start, item.end) < 0) item.end = item.start;
  item.owner = elements.ownerInput.value;
  item.tags = elements.tagsInput.value.split(",").map((tag) => tag.trim()).filter(Boolean);
  item.dependsOn = elements.dependencySelect.value && !wouldCreateDependencyCycle(item.id, elements.dependencySelect.value)
    ? elements.dependencySelect.value
    : "";
  item.comments = elements.commentsInput.value;
  item.progress = clampProgress(elements.progressInput.value || elements.progressRange.value);
  if (item.tags.length) {
    state.tagColors[getTagKey(item.tags[0])] = elements.colorInput.value;
    item.color = elements.colorInput.value;
  } else {
    item.color = elements.colorInput.value;
  }

  const targetGroup = state.groups.find((group) => group.id === elements.groupSelect.value);
  if (targetGroup && targetGroup.id !== current.group.id) {
    current.group.items = current.group.items.filter((candidate) => candidate.id !== item.id);
    targetGroup.items.push(item);
  }

  render();
}

function handleAttachmentUpload(files) {
  const current = findSelection();
  if (!current || current.type !== "item" || !files.length) return;
  const targetItemId = current.item.id;

  const accepted = [...files].filter((file) => {
    if (file.size <= MAX_ATTACHMENT_SIZE) return true;
    alert(`${file.name} is larger than ${formatFileSize(MAX_ATTACHMENT_SIZE)} and was not attached.`);
    return false;
  });
  if (!accepted.length) {
    elements.attachmentInput.value = "";
    return;
  }

  Promise.all(accepted.map(readAttachmentFile)).then((attachments) => {
    const located = findItem(targetItemId);
    if (!located) return;
    located.item.attachments.push(...attachments);
    elements.attachmentInput.value = "";
    render();
  }).catch(() => {
    alert("One of those files could not be attached.");
    elements.attachmentInput.value = "";
  });
}

function readAttachmentFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve({
      id: createId(),
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      dataUrl: reader.result
    }));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

function removeAttachment(attachmentId) {
  const current = findSelection();
  if (!current || current.type !== "item") return;
  current.item.attachments = current.item.attachments.filter((attachment) => attachment.id !== attachmentId);
  render();
}

function addGroup() {
  const group = { id: createId(), name: "New group", collapsed: false, items: [] };
  state.groups.push(group);
  selected = { type: "group", id: group.id };
  render();
}

function getGroupDefaults(group) {
  if (!group.items.length) {
    const today = formatDate(new Date());
    return {
      start: today,
      end: addDays(today, 5),
      owner: "",
      tags: []
    };
  }

  const starts = group.items.map((item) => parseDate(item.start).getTime());
  const ends = group.items.map((item) => parseDate(item.end || item.start).getTime());
  return {
    start: formatDate(new Date(Math.min(...starts))),
    end: formatDate(new Date(Math.max(...ends))),
    owner: getMostCommonOwner(group),
    tags: getGroupTags(group)
  };
}

function getMostCommonOwner(group) {
  const ownerCounts = new Map();
  group.items.forEach((item) => {
    if (!item.owner.trim()) return;
    ownerCounts.set(item.owner, (ownerCounts.get(item.owner) || 0) + 1);
  });

  let bestOwner = "";
  let bestCount = 0;
  ownerCounts.forEach((count, owner) => {
    if (count > bestCount) {
      bestOwner = owner;
      bestCount = count;
    }
  });
  return bestOwner;
}

function getGroupTags(group) {
  const tags = [];
  group.items.forEach((item) => {
    item.tags.forEach((tag) => {
      if (!tags.includes(tag)) tags.push(tag);
    });
  });
  return tags;
}

function addItem(type) {
  const selection = findSelection();
  const group = selection?.group || getFirstGroup();
  const defaults = getGroupDefaults(group);
  const item = {
    id: createId(),
    type,
    name: type === "milestone" ? "New milestone" : "New task",
    start: defaults.start,
    end: type === "milestone" ? defaults.start : defaults.end,
    color: defaults.tags.length ? getTagColor(defaults.tags[0]) : palette[group.items.length % palette.length],
    owner: defaults.owner,
    tags: [...defaults.tags],
    dependsOn: "",
    comments: "",
    attachments: [],
    progress: 0
  };
  group.collapsed = false;
  group.items.push(item);
  selected = { type: "item", id: item.id };
  render();
}

function deleteSelected() {
  const current = findSelection();
  if (!current) return;

  if (current.type === "group") {
    const deletedIds = new Set(current.group.items.map((item) => item.id));
    state.groups = state.groups.filter((group) => group.id !== current.group.id);
    clearDependencies(deletedIds);
    selected = state.groups[0] ? { type: "group", id: state.groups[0].id } : null;
  } else {
    current.group.items = current.group.items.filter((item) => item.id !== current.item.id);
    clearDependencies(new Set([current.item.id]));
    selected = { type: "group", id: current.group.id };
  }

  render();
}

function clearDependencies(deletedIds) {
  state.groups.forEach((group) => {
    group.items.forEach((item) => {
      if (deletedIds.has(item.dependsOn)) item.dependsOn = "";
    });
  });
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = DATA_FILE;
  link.click();
  URL.revokeObjectURL(link.href);
}

function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      state = normalizeState(JSON.parse(reader.result));
      selected = state.groups[0] ? { type: "group", id: state.groups[0].id } : null;
      render();
    } catch {
      alert("That file is not valid planner JSON.");
    }
  });
  reader.readAsText(file);
}

async function initializeApp() {
  state = await loadState();
  selected = state.groups[0] ? { type: "group", id: state.groups[0].id } : null;

  elements.addGroupBtn.addEventListener("click", addGroup);
  elements.addTaskBtn.addEventListener("click", () => addItem("task"));
  elements.addMilestoneBtn.addEventListener("click", () => addItem("milestone"));
  elements.deleteBtn.addEventListener("click", deleteSelected);
  elements.exportBtn.addEventListener("click", exportData);
  elements.importInput.addEventListener("change", (event) => importData(event.target.files[0]));
  document.querySelectorAll("[data-zoom]").forEach((button) => {
    button.addEventListener("click", () => {
      state.zoom = button.dataset.zoom;
      document.querySelectorAll("[data-zoom]").forEach((zoomButton) => zoomButton.classList.toggle("active", zoomButton.dataset.zoom === state.zoom));
      render();
    });
  });

  elements.progressRange.addEventListener("input", () => {
    elements.progressInput.value = elements.progressRange.value;
  });

  elements.progressInput.addEventListener("input", () => {
    elements.progressRange.value = clampProgress(elements.progressInput.value);
  });

  elements.editorForm.addEventListener("change", updateSelectedFromForm);
  elements.attachmentInput.addEventListener("change", (event) => handleAttachmentUpload(event.target.files));

  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);

  document.querySelectorAll("[data-zoom]").forEach((button) => {
    button.classList.toggle("active", button.dataset.zoom === state.zoom);
  });

  render();
}

initializeApp();
