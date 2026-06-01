# Gantt Planner

Open `index.html` in a browser to use the planner. Changes are saved automatically in that browser with `localStorage`, so closing and reopening the same browser keeps your work.

On a fresh browser with no local save, the planner first tries to load `data.json` from this folder. If that file cannot be loaded, it falls back to the built-in sample chart.

## Sharing Between Computers

Use `Export` to download `data.json`, replace the repo's `data.json` with that file, then commit and push it. On another computer, pull the repo and open the planner in a fresh browser profile or clear that browser's saved planner data so it loads the committed `data.json`.

Browsers control the download folder. The app suggests the filename `data.json`, but you may need to move the downloaded file into this folder before committing it.

Some browsers block loading `data.json` from a `file://` URL. If the planner does not load the committed data, run a tiny local web server from this folder and open the shown localhost URL:

```sh
python3 -m http.server
```

## Features

- Add groups, tasks, and milestones.
- Click and drag across the calendar to create a new task in that row's group.
- Collapse and expand groups.
- Drag groups to reorder them.
- Drag tasks and milestones to reorder them or move them into another group.
- Drag task bars or milestone diamonds to shift dates.
- Resize task bars from the left or right edge.
- Switch between day, week, month, and year zoom.
- Edit names, dates, responsible people, tags, colors, percent complete, and task group placement.
- Show percent complete as a filled portion of each task bar.
- Show group completion bars as weighted tag-color segments with overall completion labels.
- Assign consistent colors from tags; the first tag controls the task or milestone color.
- Export and import JSON backups of the planner.

## Files

- `index.html` contains the app shell.
- `style.css` contains the monday.com/teamgantt-inspired interface.
- `app.js` contains the editable Gantt chart behavior and persistence.
- `data.json` contains the shared chart data to commit with the repo.
