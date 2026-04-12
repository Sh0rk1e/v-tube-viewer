# VT Mini Studio

English-only local Live2D viewer inspired by VTube Studio.

## Features

- Autoloads the included `amongus` model
- Loads other `.model3.json` Live2D models from the `models/` folder
- Imports a full model folder from the browser when using the Python server
- Includes a behaviors panel for:
  - idle floating
  - keyboard controls
  - auto blink / simple reactions
- Clean UI with no built-in Chinese or Japanese tips or menus

## Project Structure

```text
v-tube studio/
  app.js
  index.html
  server.py
  styles.css
  models/
  vendor/
```

## Run Locally

1. Start the Python server:

   ```powershell
   python server.py
   ```

2. Open:

   `http://127.0.0.1:8000`

You can still open the site with Live Server, but importing model folders only works with the Python server.

## Add Your Own Model

Option 1:

- Copy the full exported Live2D model folder into `models/`
- Make sure the folder contains a `.model3.json` file
- Click `Refresh`, then `Load Model`

Option 2:

- Start the Python server
- Click `Import Folder`
- Select the full exported model folder from your computer

## Keyboard Controls

- `Arrow keys` or `W A S D`: move model
- `Q` and `E`: rotate model
- `+` and `-`: scale model
- `0`: reset position, scale, and rotation
- `R`: trigger a reaction

## Notes

- A `.moc3` file alone is not enough. You need the full exported model folder.
- Reactions use the model expression system when available and fall back to motion effects.
- This is a lightweight viewer project, not a full VTube Studio clone.
- `.gitignore` excludes local models, the Cubism SDK folder, and runtime files so the repository stays clean for GitHub.

## GitHub Pages

- This project is now static-host friendly for GitHub Pages.
- The model switcher reads from `models/models.json` instead of a local server API.
- When you add or remove models, update `models/models.json` so GitHub Pages can see them.
- Face tracking needs `https://` or `http://127.0.0.1`, so it will work on GitHub Pages but not on plain insecure LAN pages.
