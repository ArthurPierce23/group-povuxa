# Development

## Source of Truth

This repository is the source of truth for the module.

- Do not develop from a copied module folder on the Foundry server and then try to reconstruct git history later.
- The folder inside `Data/modules` must be named `group-povuxa`, because it must match `module.json:id`.

## Local Setup

### 1. Clone the repository

```powershell
git clone https://github.com/ArthurPierce23/group-povuxa.git
cd group-povuxa
```

### 2. Link the repo into Foundry

Windows example with a junction:

```powershell
$repo = "C:\dev\group-povuxa"
$modules = "C:\path\to\FoundryVTT\Data\modules"
New-Item -ItemType Junction -Path (Join-Path $modules "group-povuxa") -Target $repo
```

macOS/Linux example with a symlink:

```bash
ln -s /path/to/group-povuxa /path/to/FoundryVTT/Data/modules/group-povuxa
```

If a real `group-povuxa` folder already exists in `Data/modules`, remove or rename it before creating the link.

### 3. Run local checks

```powershell
npm run check
```

This validates:

- `module.json`
- `lang/*.json`
- JavaScript syntax in `scripts/` and `tools/`
- release URL consistency between `version`, `manifest`, and `download`

## Daily Workflow

1. Edit code in the repository, not on the server.
2. Reload Foundry and test the module in-world.
3. Run `npm run check` before preparing a release.
4. If you need a release candidate zip, run:

```powershell
npm run build:release -- --tag vX.Y.Z
```

Artifacts are created in `dist/release/`:

- `module.json`
- `module.zip`

The build script verifies that the archive unpacks into a single top-level `group-povuxa/` folder.
