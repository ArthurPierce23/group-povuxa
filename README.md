# Group Po'Vuxa — Party Formation / Походный Строй

![Foundry v13](https://img.shields.io/badge/foundry-v13-green)
![Latest Release](https://img.shields.io/github/v/release/ArthurPierce23/group-povuxa)
![Downloads](https://img.shields.io/github/downloads/ArthurPierce23/group-povuxa/total)

**[English](#english) | [Русский](#russian)**

---

<a name="english"></a>
## English

**Group Po'Vuxa** is a Foundry VTT module for party movement. Instead of dragging tokens one by one, you gather the party into a single leader token, move as a unit, and deploy into tactical formations when needed.

### Install for Players and GMs
1. Open Foundry VTT.
2. Go to **Add-on Modules** -> **Install Module**.
3. Paste this manifest URL:
   `https://github.com/ArthurPierce23/group-povuxa/releases/latest/download/module.json`
4. Click **Install**.

### Features
- Gather and disperse a party into one shared token.
- Use formations like Line, Wedge, Square, Circle, or custom layouts.
- Respect walls and collisions when deploying members.
- Roll Stealth for the party in one action.
- Inherit light and vision from group members.

### Maintainer Workflow

This repository is now intended to be the source of truth. Do not develop from a copied module folder on the Foundry server and then try to reconstruct git history afterwards.

#### 1. Clone the repository
Use `git clone`, not GitHub's ZIP download.

```powershell
git clone https://github.com/ArthurPierce23/group-povuxa.git
cd group-povuxa
```

#### 2. Link the repo into Foundry
The folder inside `Data/modules` must be named `group-povuxa`, because it must match `module.json:id`.

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

#### 3. Run local checks

```powershell
npm run check
```

This validates:
- `module.json`
- `lang/*.json`
- JavaScript syntax in `scripts/` and `tools/`
- release URL consistency between `version`, `manifest`, and `download`

#### 4. Build a release locally

```powershell
npm run build:release -- --tag vX.Y.Z
```

Artifacts are created in `dist/release/`:
- `module.json`
- `module.zip`

The zip is verified to unpack into a single top-level `group-povuxa/` folder.

### Release Flow
1. Update `module.json.version`.
2. Update `module.json.download` to `https://github.com/ArthurPierce23/group-povuxa/releases/download/vX.Y.Z/module.zip`.
3. Commit the release changes to `main`.
4. Create and push a matching tag:

```powershell
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

5. GitHub Actions will:
- validate the tag against `module.json.version`
- build `module.zip` and `module.json`
- publish a GitHub Release with those assets

### Recovering from a Failed Release
If a bad tag or broken release was published:
1. Delete the GitHub Release.
2. Delete the tag locally and remotely.
3. Fix `module.json`.
4. Recreate the tag and push again.

```powershell
git tag -d vX.Y.Z
git push origin :refs/tags/vX.Y.Z
```

---

<a name="russian"></a>
## Русский

**Group Po'Vuxa** — модуль для Foundry VTT, который упрощает передвижение группы по карте. Вместо перетаскивания токенов по одному вы собираете отряд в один токен-лидер, перемещаете его и разворачиваете в боевое построение.

### Установка для игроков и ГМ
1. Откройте Foundry VTT.
2. Перейдите в **Add-on Modules** -> **Install Module**.
3. Вставьте ссылку на манифест:
   `https://github.com/ArthurPierce23/group-povuxa/releases/latest/download/module.json`
4. Нажмите **Install**.

### Возможности
- Сбор и роспуск группы в один общий токен.
- Построения Line, Wedge, Square, Circle и кастомные схемы.
- Учет стен и коллизий при расстановке.
- Один бросок скрытности на всю группу.
- Наследование света и зрения от участников.

### Workflow для поддержки модуля

Теперь источником истины должен быть git-репозиторий. Не стоит править модуль прямо в установленной папке на сервере Foundry, а потом пытаться переносить это обратно в GitHub.

#### 1. Клонировать репозиторий
Нужен именно `git clone`, а не скачанный ZIP-архив.

```powershell
git clone https://github.com/ArthurPierce23/group-povuxa.git
cd group-povuxa
```

#### 2. Подключить репозиторий к Foundry
Папка внутри `Data/modules` должна называться `group-povuxa`, потому что это значение `module.json:id`.

Пример для Windows через junction:

```powershell
$repo = "C:\dev\group-povuxa"
$modules = "C:\path\to\FoundryVTT\Data\modules"
New-Item -ItemType Junction -Path (Join-Path $modules "group-povuxa") -Target $repo
```

Пример для macOS/Linux через symlink:

```bash
ln -s /path/to/group-povuxa /path/to/FoundryVTT/Data/modules/group-povuxa
```

Если в `Data/modules` уже есть обычная папка `group-povuxa`, сначала удалите или переименуйте ее, иначе ссылка не создастся.

#### 3. Запуск локальных проверок

```powershell
npm run check
```

Команда проверяет:
- `module.json`
- `lang/*.json`
- синтаксис JavaScript в `scripts/` и `tools/`
- согласованность `version`, `manifest` и `download`

#### 4. Локальная сборка релиза

```powershell
npm run build:release -- --tag vX.Y.Z
```

Артефакты появятся в `dist/release/`:
- `module.json`
- `module.zip`

Скрипт отдельно проверяет, что архив разворачивается в одну корневую папку `group-povuxa/`.

### Процесс релиза
1. Обновить `module.json.version`.
2. Обновить `module.json.download` на `https://github.com/ArthurPierce23/group-povuxa/releases/download/vX.Y.Z/module.zip`.
3. Закоммитить изменения в `main`.
4. Создать и отправить соответствующий тег:

```powershell
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

5. GitHub Actions автоматически:
- сверит тег с `module.json.version`
- соберет `module.zip` и `module.json`
- создаст GitHub Release с этими файлами

### Если релиз сломался
Если был выпущен неверный тег или битый релиз:
1. Удалите GitHub Release.
2. Удалите тег локально и на GitHub.
3. Исправьте `module.json`.
4. Создайте тег заново и отправьте его.

```powershell
git tag -d vX.Y.Z
git push origin :refs/tags/vX.Y.Z
```

### Authors / Авторы
- **Arthur Pierce**

### License / Лицензия
MIT License.
