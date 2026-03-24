# Releasing

## Version Bump

1. Update `module.json.version`.
2. Update `module.json.download` to:

```text
https://github.com/ArthurPierce23/group-povuxa/releases/download/vX.Y.Z/module.zip
```

3. Run the checks:

```powershell
npm run check
```

4. Build release artifacts locally:

```powershell
npm run build:release -- --tag vX.Y.Z
```

## Publish Flow

1. Commit the release changes to `main`.
2. Create and push the matching tag:

```powershell
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

3. GitHub Actions will:
- validate the tag against `module.json.version`
- build `module.zip` and `module.json`
- publish a GitHub Release with those assets

## If a Release Fails

If a bad tag or broken release was published:

1. Delete the GitHub Release.
2. Delete the tag locally and remotely.
3. Fix `module.json`.
4. Recreate the tag and push again.

```powershell
git tag -d vX.Y.Z
git push origin :refs/tags/vX.Y.Z
```
