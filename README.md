# Gantt Planner

Open `index.html` in a browser to use the planner. Changes are saved automatically in that browser with `localStorage`, so closing and reopening the same browser keeps your work.

## Sharing Between Computers

Use `Export` to download a JSON backup, move that file to another computer, then use `Import` in the planner there. For live multi-computer syncing, this standalone version would need a small backend or a cloud file/database connection.

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
