/**
 * Group Po'Vuxa — Походный Строй
 * Модуль для группового перемещения токенов в Foundry VTT
 * 
 * Точка входа: регистрация хуков, настроек и горячих клавиш
 */

import { PartyManager } from './party-manager.js';
import { PartyPanelApp } from './ui/party-panel.js';
import { FormationPresets } from './formation-presets.js';

// === КОНСТАНТЫ ===
export const MODULE_ID = 'group-povuxa';
export const MODULE_NAME = "Group Po'Vuxa";

// === ИНИЦИАЛИЗАЦИЯ ===
Hooks.once('init', () => {
    console.log(`${MODULE_NAME} | Инициализация модуля...`);

    // Регистрируем настройки модуля
    registerSettings();

    // Регистрируем горячие клавиши
    registerKeybindings();

    console.log(`${MODULE_NAME} | Настройки зарегистрированы`);
});

Hooks.once('ready', () => {
    // Инициализируем PartyManager
    game.groupPovuxa = {
        manager: new PartyManager(),
        _panel: null,
        openPanel: () => {
            // Singleton pattern: reuse existing panel instance
            if (!game.groupPovuxa._panel || game.groupPovuxa._panel._state <= 0) {
                game.groupPovuxa._panel = new PartyPanelApp();
            }
            game.groupPovuxa._panel.render(true);
        },
        formations: FormationPresets
    };

    // Export API for other modules
    game.modules.get(MODULE_ID).api = {
        gather: (tokens) => game.groupPovuxa.manager.gatherParty(tokens),
        disperse: (partyToken) => game.groupPovuxa.manager.disperseParty(partyToken),
        scatter: (partyToken) => game.groupPovuxa.manager.emergencyScatter(partyToken),
        openPanel: () => game.groupPovuxa.openPanel(),
        getPartyData: () => game.groupPovuxa.manager.getPartyData(),
        getFormations: () => FormationPresets.getAll(),
        addToParty: (token) => game.groupPovuxa.manager.addMember(token),
        removeFromParty: (tokenId) => game.groupPovuxa.manager.removeMember(tokenId)
    };

    const moduleVersion = game.modules.get(MODULE_ID)?.version ?? 'unknown';
    console.log(`${MODULE_NAME} | Module ready! v${moduleVersion}`);
});

// === HIDE PARTY ACTOR FROM SIDEBAR ===
// Use CSS injection — most reliable across Foundry versions
function hidePartyActorFromSidebar() {
    // Remove old style tag if exists
    document.getElementById('group-povuxa-hide-actor')?.remove();

    const partyActors = game.actors?.filter(a => a.getFlag(MODULE_ID, 'isPartyActor')) || [];
    if (!partyActors.length) return;

    const rules = partyActors.map(actor => {
        const id = actor.id;
        // Cover all possible sidebar selector formats
        return `
            [data-document-id="${id}"],
            [data-entry-id="${id}"],
            [data-actor-id="${id}"],
            .directory-item[data-document-id="${id}"],
            .directory-item[data-entry-id="${id}"],
            li[data-document-id="${id}"],
            li[data-entry-id="${id}"]
        `;
    }).join(',\n');

    const style = document.createElement('style');
    style.id = 'group-povuxa-hide-actor';
    style.textContent = `${rules} { display: none !important; }`;
    document.head.appendChild(style);
    console.log(`${MODULE_ID} | Hidden ${partyActors.length} party actor(s) from sidebar`);
}

// Run on ready and whenever actors list updates
Hooks.once('ready', () => {
    setTimeout(hidePartyActorFromSidebar, 500);
});
Hooks.on('createActor', (actor) => {
    if (actor.getFlag(MODULE_ID, 'isPartyActor')) {
        setTimeout(hidePartyActorFromSidebar, 200);
    }
});

// === КНОПКИ В ПАНЕЛИ ИНСТРУМЕНТОВ ===
Hooks.on('getSceneControlButtons', (controls) => {
    // В Foundry v13 controls — это объект Record<string, SceneControl>
    // Получаем token controls
    const tokenControls = controls.tokens || controls.find?.(c => c.name === 'token');
    if (!tokenControls) {
        console.warn(`${MODULE_ID} | Token controls not found`);
        return;
    }

    // Получаем текущее количество инструментов для order
    const toolsCount = Object.keys(tokenControls.tools || {}).length;

    // 1. Открыть панель управления
    tokenControls.tools['group-povuxa-panel'] = {
        name: 'group-povuxa-panel',
        title: game.i18n.localize('GROUP_POVUXA.Panel.Title'),
        icon: 'fas fa-users',
        order: toolsCount + 1,
        button: true,
        visible: true,
        onChange: () => {
            if (game.groupPovuxa) game.groupPovuxa.openPanel();
        }
    };

    // 2. Собрать группу
    tokenControls.tools['group-povuxa-gather'] = {
        name: 'group-povuxa-gather',
        title: game.i18n.localize('GROUP_POVUXA.Actions.Gather'),
        icon: 'fas fa-compress-arrows-alt',
        order: toolsCount + 2,
        button: true,
        visible: true,
        onChange: () => {
            if (!game.groupPovuxa) return;
            const tokens = canvas.tokens.controlled;
            if (tokens.length > 0) {
                // Пытаемся взять черновик из настроек
                const draft = game.settings.get(MODULE_ID, 'lastDraft');
                const options = {};
                if (draft && Array.isArray(draft) && draft.length > 0) {
                    // Фильтруем черновик по выбранным токенам
                    options.initialPositions = draft.filter(d => tokens.some(t => t.id === d.tokenId));
                    console.log(`${MODULE_ID} | Gather (Button) using draft for ${options.initialPositions.length} tokens`);
                }

                game.groupPovuxa.manager.gatherParty(tokens, options);
            } else {
                ui.notifications.warn(game.i18n.localize('GROUP_POVUXA.Notifications.NoTokensSelected'));
            }
        }
    };

    // 3. Распустить группу
    tokenControls.tools['group-povuxa-disperse'] = {
        name: 'group-povuxa-disperse',
        title: game.i18n.localize('GROUP_POVUXA.Actions.Disperse'),
        icon: 'fas fa-expand-arrows-alt',
        order: toolsCount + 3,
        button: true,
        visible: true,
        onChange: () => {
            if (!game.groupPovuxa) return;
            const tokens = canvas.tokens.controlled;
            const partyToken = tokens.find(t => t.document.getFlag(MODULE_ID, 'isPartyToken'));
            if (partyToken) {
                game.groupPovuxa.manager.disperseParty(partyToken);
            } else {
                ui.notifications.warn(game.i18n.localize('GROUP_POVUXA.Notifications.NoPartyToken'));
            }
        }
    };

    // 4. Экстренное рассеивание
    tokenControls.tools['group-povuxa-scatter'] = {
        name: 'group-povuxa-scatter',
        title: game.i18n.localize('GROUP_POVUXA.Actions.Scatter'),
        icon: 'fas fa-bolt',
        order: toolsCount + 4,
        button: true,
        visible: true,
        onChange: async () => {
            if (!game.groupPovuxa) return;

            const confirmed = await foundry.applications.api.DialogV2.confirm({
                window: { title: game.i18n.localize('GROUP_POVUXA.Actions.Scatter') },
                content: `<p>${game.i18n.localize('GROUP_POVUXA.Prompts.ScatterConfirm')}</p>`,
                rejectClose: false,
                modal: true
            });

            if (!confirmed) return;

            const tokens = canvas.tokens.controlled;
            const partyToken = tokens.find(t => t.document.getFlag(MODULE_ID, 'isPartyToken'));
            if (partyToken) {
                game.groupPovuxa.manager.emergencyScatter(partyToken);
            }
        }
    };

    console.log(`${MODULE_ID} | Added 4 tools to token controls`);
});

// === КОНТЕКСТНОЕ МЕНЮ ТОКЕНА (HUD) ===
Hooks.on('renderTokenHUD', (hud, html, tokenData) => {
    const token = hud.object;
    if (!token) return;

    // V13: html may be a raw DOM element or jQuery object
    const container = html instanceof HTMLElement ? html : html[0] ?? html;

    const isPartyToken = token.document.getFlag(MODULE_ID, 'isPartyToken');

    const button = document.createElement('div');
    button.classList.add('control-icon', 'group-povuxa-hud');

    if (isPartyToken) {
        button.innerHTML = '<i class="fas fa-expand-arrows-alt"></i>';
        button.title = game.i18n.localize('GROUP_POVUXA.Actions.Disperse');
        button.addEventListener('click', async () => {
            await game.groupPovuxa.manager.disperseParty(token);
        });
    } else {
        button.innerHTML = '<i class="fas fa-user-plus"></i>';
        button.title = game.i18n.localize('GROUP_POVUXA.Actions.AddToken');
        button.addEventListener('click', async () => {
            await game.groupPovuxa.manager.addMember(token);
        });
    }

    // Append to right column using native DOM
    const rightCol = container.querySelector('.col.right');
    if (rightCol) rightCol.append(button);
});

// === СКРЫТИЕ АКТЕРА ГРУППЫ ===
Hooks.on('renderActorDirectory', (app, html, data) => {
    if (!game.settings.get(MODULE_ID, 'hidePartyActor')) return;

    // V13: html may be HTMLElement or jQuery. Use native DOM.
    const container = html instanceof HTMLElement ? html : html[0] ?? html;

    const actor = game.actors.find(a => a.getFlag(MODULE_ID, 'isPartyActor'));
    if (actor) {
        const li = container.querySelector(`.actor[data-document-id="${actor.id}"]`);
        if (li) li.style.display = 'none';
    }
});

// === РЕГИСТРАЦИЯ НАСТРОЕК ===
function registerSettings() {
    // Изображение токена группы по умолчанию
    game.settings.register(MODULE_ID, 'defaultPartyToken', {
        name: game.i18n.localize('GROUP_POVUXA.Settings.DefaultToken'),
        hint: game.i18n.localize('GROUP_POVUXA.Settings.DefaultTokenHint'),
        scope: 'world',
        config: true,
        type: String,
        default: `modules/${MODULE_ID}/assets/tokens/party-group-circle.png`,
        filePicker: 'image'
    });

    // Шаблон построения по умолчанию
    game.settings.register(MODULE_ID, 'defaultFormation', {
        name: game.i18n.localize('GROUP_POVUXA.Settings.DefaultFormation'),
        scope: 'world',
        config: true,
        type: String,
        choices: {
            line: game.i18n.localize('GROUP_POVUXA.Formations.Line'),
            wedge: game.i18n.localize('GROUP_POVUXA.Formations.Wedge'),
            circle: game.i18n.localize('GROUP_POVUXA.Formations.Circle'),
            square: game.i18n.localize('GROUP_POVUXA.Formations.Square'),
            snake: game.i18n.localize('GROUP_POVUXA.Formations.Snake')
        },
        default: 'line'
    });

    // Анимации вкл/выкл
    game.settings.register(MODULE_ID, 'enableAnimations', {
        name: game.i18n.localize('GROUP_POVUXA.Settings.EnableAnimations'),
        hint: game.i18n.localize('GROUP_POVUXA.Settings.EnableAnimationsHint'),
        scope: 'client',
        config: true,
        type: Boolean,
        default: true
    });

    // Дистанция разведчика
    game.settings.register(MODULE_ID, 'scoutDistance', {
        name: game.i18n.localize('GROUP_POVUXA.Settings.ScoutDistance'),
        scope: 'world',
        config: true,
        type: Number,
        default: 4,
        range: { min: 1, max: 10, step: 1 }
    });

    // Дистанция арьергарда
    game.settings.register(MODULE_ID, 'rearguardDistance', {
        name: game.i18n.localize('GROUP_POVUXA.Settings.RearguardDistance'),
        scope: 'world',
        config: true,
        type: Number,
        default: 3,
        range: { min: 1, max: 10, step: 1 }
    });

    // Наследование зрения
    game.settings.register(MODULE_ID, 'inheritVision', {
        name: game.i18n.localize('GROUP_POVUXA.Settings.InheritVision'),
        scope: 'world',
        config: true,
        type: Boolean,
        default: true
    });

    // Наследование источников света
    game.settings.register(MODULE_ID, 'inheritLight', {
        name: game.i18n.localize('GROUP_POVUXA.Settings.InheritLight'),
        scope: 'world',
        config: true,
        type: Boolean,
        default: true
    });

    // Сохранение черновика расстановки (скрытая настройка)
    game.settings.register(MODULE_ID, 'lastDraft', {
        name: 'Last Draft Grid',
        scope: 'client',
        config: false,
        type: Object, // Array stored as object
        default: []
    });

    // Скрывать актера группы из боковой панели
    game.settings.register(MODULE_ID, 'hidePartyActor', {
        name: game.i18n.localize('GROUP_POVUXA.Settings.HidePartyActor'),
        hint: game.i18n.localize('GROUP_POVUXA.Settings.HidePartyActorHint'),
        scope: 'world',
        config: true,
        type: Boolean,
        default: true,
        onChange: () => {
            // Перезагрузка не обязательна, эффект при следующем создании/получении
            ui.sidebar.tabs.actors.render();
        }
    });
    // Пользовательские шаблоны построений
    game.settings.register(MODULE_ID, 'customFormations', {
        name: 'Custom Formations',
        scope: 'world',
        config: false,
        type: Object,
        default: {}
    });
}

// === ЗАЩИТА ОТ УДАЛЕНИЯ ТОКЕНА ГРУППЫ ===
Hooks.on('preDeleteToken', (tokenDoc, options, userId) => {
    const isPartyToken = tokenDoc.getFlag(MODULE_ID, 'isPartyToken');
    if (isPartyToken) {
        // If this deletion was triggered by our disperseParty, allow it
        if (options.groupPovuxaDispersing) return true;

        console.log(`${MODULE_ID} | Intercepting party token deletion. Launching disperse...`);

        // Launch disperse asynchronously via setTimeout to avoid blocking the sync hook
        // and prevent potential infinite recursion
        const tokenObject = tokenDoc.object;
        if (tokenObject) {
            setTimeout(async () => {
                if (!tokenObject.document || !tokenObject.document.uuid) return; // Safety check
                try {
                    await game.groupPovuxa.manager.disperseParty(tokenObject);
                } catch (e) {
                    console.error(`${MODULE_ID} | Error during auto-disperse on delete:`, e);
                }
            }, 50);
        }

        ui.notifications.info(game.i18n.localize('GROUP_POVUXA.Notifications.AutoDisperseInfo'));
        return false; // Cancel the raw deletion
    }
});

// === РЕГИСТРАЦИЯ ГОРЯЧИХ КЛАВИШ ===
function registerKeybindings() {
    // Собрать группу: Shift + G
    game.keybindings.register(MODULE_ID, 'gatherParty', {
        name: game.i18n.localize('GROUP_POVUXA.Keybindings.Gather'),
        hint: game.i18n.localize('GROUP_POVUXA.Keybindings.GatherHint'),
        editable: [{ key: 'KeyG', modifiers: ['Shift'] }],
        onDown: () => {
            const tokens = canvas.tokens.controlled;
            if (tokens.length > 0) {
                // Пытаемся взять черновик из настроек
                const draft = game.settings.get(MODULE_ID, 'lastDraft');
                const options = {};
                if (draft && Array.isArray(draft) && draft.length > 0) {
                    options.initialPositions = draft.filter(d => tokens.some(t => t.id === d.tokenId));
                    console.log(`${MODULE_ID} | Gather (Hotkey) using draft for ${options.initialPositions.length} tokens`);
                }

                game.groupPovuxa.manager.gatherParty(tokens, options);
            } else {
                ui.notifications.warn(game.i18n.localize('GROUP_POVUXA.Notifications.NoTokensSelected'));
            }
            return true;
        }
    });

    // Распустить группу: Shift + D
    game.keybindings.register(MODULE_ID, 'disperseParty', {
        name: game.i18n.localize('GROUP_POVUXA.Keybindings.Disperse'),
        hint: game.i18n.localize('GROUP_POVUXA.Keybindings.DisperseHint'),
        editable: [{ key: 'KeyD', modifiers: ['Shift'] }],
        onDown: () => {
            const tokens = canvas.tokens.controlled;
            const partyToken = tokens.find(t => t.document.getFlag(MODULE_ID, 'isPartyToken'));
            if (partyToken) {
                game.groupPovuxa.manager.disperseParty(partyToken);
            } else {
                ui.notifications.warn(game.i18n.localize('GROUP_POVUXA.Notifications.NoPartyToken'));
            }
            return true;
        }
    });

    // Экстренное рассеивание: Shift + X
    game.keybindings.register(MODULE_ID, 'emergencyScatter', {
        name: game.i18n.localize('GROUP_POVUXA.Keybindings.Scatter'),
        hint: game.i18n.localize('GROUP_POVUXA.Keybindings.ScatterHint'),
        editable: [{ key: 'KeyX', modifiers: ['Shift'] }],
        onDown: async () => {
            const tokens = canvas.tokens.controlled;
            const partyToken = tokens.find(t => t.document.getFlag(MODULE_ID, 'isPartyToken'));

            if (partyToken) {
                const confirmed = await foundry.applications.api.DialogV2.confirm({
                    window: { title: game.i18n.localize('GROUP_POVUXA.Actions.Scatter') },
                    content: `<p>${game.i18n.localize('GROUP_POVUXA.Prompts.ScatterConfirm')}</p>`,
                    rejectClose: false,
                    modal: true
                });

                if (confirmed) {
                    game.groupPovuxa.manager.emergencyScatter(partyToken);
                }
            }
            return true;
        }
    });

    // Открыть панель: Shift + P
    game.keybindings.register(MODULE_ID, 'openPanel', {
        name: game.i18n.localize('GROUP_POVUXA.Keybindings.OpenPanel'),
        editable: [{ key: 'KeyP', modifiers: ['Shift'] }],
        onDown: () => {
            game.groupPovuxa.openPanel();
            return true;
        }
    });
}
