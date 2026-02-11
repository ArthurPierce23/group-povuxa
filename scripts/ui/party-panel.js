/**
 * PartyPanelApp — главная UI-панель управления группой
 * 
 * Показывает список токенов с Drag & Drop для изменения порядка,
 * кнопки действий и выбор шаблона построения
 */

import { MODULE_ID } from '../main.js';
import { FormationPresets } from '../formation-presets.js';
import { PartyManager } from '../party-manager.js';

export class PartyPanelApp extends FormApplication {

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: 'group-povuxa-panel',
            title: game.i18n.localize('GROUP_POVUXA.Panel.Title'),
            template: `modules/${MODULE_ID}/templates/party-panel.hbs`,
            classes: ['group-povuxa', 'party-panel'],
            width: 320,
            height: 'auto',
            minimizable: true,
            resizable: true,
            popOut: true,
            dragDrop: [{ dragSelector: ".party-member-draggable", dropSelector: null }] // Общий класс для списка и сетки
        });
    }

    constructor(options = {}) {
        super(options);

        // Store bound references for proper Hook cleanup
        this._boundOnControl = this._onTokenControlChange.bind(this);
        this._boundOnDelete = this._onTokenDelete.bind(this);
        this._boundOnUpdate = this._onTokenUpdate.bind(this);

        Hooks.on('controlToken', this._boundOnControl);
        Hooks.on('deleteToken', this._boundOnDelete);
        Hooks.on('updateToken', this._boundOnUpdate);
    }

    /**
     * Подготовка данных для шаблона
     */
    async getData(options = {}) {
        const data = await super.getData(options);

        // Получаем выбранные токены
        // Получаем выбранные токены
        const selectedTokens = canvas.tokens.controlled;

        // Проверяем, есть ли активная группа
        // Проверяем, есть ли активная группа
        const partyToken = this._findPartyToken();
        const isPartyActive = !!partyToken;

        // Получаем участников группы (если есть)
        let members = [];
        if (isPartyActive) {
            members = partyToken.document.getFlag(MODULE_ID, 'members') || [];
        } else if (selectedTokens.length > 0) {
            // === РЕЖИМ ЧЕРНОВИКА (DRAFT) ===

            // Проверяем, изменился ли выбор токенов
            const currentIds = selectedTokens.map(t => t.id).sort().join(',');
            const lastIds = (this._lastSelectedIds || []).sort().join(',');

            let forceRecalculate = false;

            // Если выбор изменился, или черновика нет вообще - пересчитываем от сцены
            if (currentIds !== lastIds || !this._draftGrid) {
                // console.log("POVUXA | Selection changed or no draft, recalculating from Scene positions.");
                forceRecalculate = true;
            }

            if (forceRecalculate) {
                // Считаем позиции как они стоят на сцене
                this._draftGrid = PartyManager.getRelativeGridPositions(selectedTokens);
                this._lastSelectedIds = selectedTokens.map(t => t.id);

                // Сохраняем, чтобы Shift+G подхватил это же состояние, если нажмут
                // (хотя Shift+G сам умеет считать, но для UI это важно)
                await game.settings.set(MODULE_ID, 'lastDraft', this._draftGrid);
            }

            // Мапим данные для шаблона
            members = selectedTokens.map((token, index) => {
                // Ищем позицию в нашем (возможно только что созданном) черновике
                const cachedPos = this._draftGrid.find(m => m.tokenId === token.id);

                // Если вдруг токена нет в черновике (странно, но бывает), 
                // то computed fallback (хотя getRelativeGridPositions должен вернуть всех)
                const gridPos = cachedPos ? cachedPos.gridPos : { x: 0, y: 0 };

                return {
                    tokenId: token.id,
                    actorId: token.actor?.id,
                    name: token.name,
                    img: token.document.texture.src,
                    order: index,
                    role: 'member',
                    gridPos: gridPos
                };
            });
        }

        // Получаем сетку (если активна группа)
        const gridCells = this._generateGridCells(members);

        // Получаем доступные шаблоны
        const formations = FormationPresets.getAll();
        const currentFormation = game.settings.get(MODULE_ID, 'defaultFormation');

        // Статистика группы (если активна)
        let groupStats = null;
        if (isPartyActive && members.length > 0) {
            groupStats = this._calculateGroupStats(members);
        }

        return {
            ...data,
            isPartyActive,
            members,
            gridCells, // Передаём сетку в шаблон
            formations,
            currentFormation,
            groupStats,
            hasMembers: members.length > 0,
            roles: this._getRoles()
        };
    }

    /**
     * Генерация ячеек сетки 5x5
     */
    _generateGridCells(members) {
        const cells = [];
        // Генерируем 5x5 сетку (x: -2..2, y: -2..2)
        // y=-2 (Front), y=2 (Back)
        for (let y = -2; y <= 2; y++) {
            for (let x = -2; x <= 2; x++) {
                // Ищем, кто стоит в этой клетке
                const member = members.find(m =>
                    m.gridPos && m.gridPos.x === x && m.gridPos.y === y
                );

                cells.push({
                    x, y,
                    isCenter: x === 0 && y === 0,
                    member: member || null
                });
            }
        }
        return cells;
    }

    /**
     * Активация слушателей событий
     */
    activateListeners(html) {
        super.activateListeners(html);

        // === КНОПКИ ДЕЙСТВИЙ ===
        html.find('.gather-btn').click(this._onGather.bind(this));
        html.find('.disperse-btn').click(this._onDisperse.bind(this));
        html.find('.scatter-btn').click(this._onScatter.bind(this));

        // D&D теперь обрабатывается через _onDragStart / _onDrop

        // === Удаление из сетки ===
        html.find('.remove-from-grid').click(this._onRemoveFromGrid.bind(this));

        // ... другие слушатели ...
        html.find('.role-select').change(this._onRoleChange.bind(this));
        html.find('.formation-select').change(this._onFormationChange.bind(this));
        html.find('.remove-member-btn').click(this._onRemoveMember.bind(this));
        html.find('.member-item').click(this._onMemberClick.bind(this)); // Click on list item
        html.find('.add-selected-btn').click(this._onAddSelected.bind(this));

        // === Шаблоны ===
        const saveBtn = html.find('.save-formation-btn');
        const deleteBtn = html.find('.delete-formation-btn');

        saveBtn.click((e) => {
            this._onSaveFormation(e);
        });
        deleteBtn.click((e) => {
            this._onDeleteFormation(e);
        });
    }

    /**
     * Начало перетаскивания (Foundry API)
     */
    _onDragStart(event) {
        const target = event.currentTarget;
        const tokenId = target.dataset.tokenId;

        if (!tokenId) return;

        // Создаем данные для D&D
        const dragData = {
            type: "PartyMember",
            tokenId: tokenId
        };

        // Устанавливаем данные
        event.dataTransfer.setData("text/plain", JSON.stringify(dragData));

        // Визуальный эффект
        target.classList.add('dragging');
    }

    /**
     * Окончание перетаскивания (Foundry API)
     */
    async _onDrop(event) {
        // Очищаем стили dragging
        this.element.find('.party-member-draggable.dragging').removeClass('dragging');

        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData("text/plain"));
        } catch (err) {
            return;
        }

        if (!data || data.type !== "PartyMember") return;

        const target = event.target;
        const gridCell = target.closest('.grid-cell');

        // 1. Если бросили на сетку
        if (gridCell) {
            event.preventDefault(); // Prevent default to allow drop
            const x = parseInt(gridCell.dataset.gridX);
            const y = parseInt(gridCell.dataset.gridY);

            if (isNaN(x) || isNaN(y)) return;

            // Определяем режим: Активная группа или Черновик
            const partyToken = this._findPartyToken();

            if (partyToken) {
                // Active group: setFlag triggers _onTokenUpdate which calls render
                // Use _skipNextRender to prevent double-render
                this._skipNextRender = true;
                await this._onDropInGrid(data.tokenId, x, y);
            } else {
                await this._onDropInGridDraft(data.tokenId, x, y);
            }

            // Partial DOM update instead of full render
            this._updateGridDOM();
            return;
        }
    }

    /**
     * Обработка D&D в режиме черновика (без активной группы)
     */
    async _onDropInGridDraft(tokenId, x, y) {
        if (!this._draftGrid) this._draftGrid = [];

        // Ищем, не занята ли клетка
        const existingIndex = this._draftGrid.findIndex(d => d.gridPos.x === x && d.gridPos.y === y);
        const sourceIndex = this._draftGrid.findIndex(d => d.tokenId === tokenId);

        // Если перетаскиваем уже существующий в сетке токен
        if (sourceIndex !== -1) {
            const sourceItem = this._draftGrid[sourceIndex];

            if (existingIndex !== -1) {
                // SWAP
                const existingItem = this._draftGrid[existingIndex];
                const oldX = sourceItem.gridPos.x;
                const oldY = sourceItem.gridPos.y;

                sourceItem.gridPos = { x, y };
                existingItem.gridPos = { x: oldX, y: oldY };
            } else {
                // MOVE
                sourceItem.gridPos = { x, y };
            }
        } else {
            // NEW
            if (existingIndex !== -1) {
                // REPLACE
                this._draftGrid.splice(existingIndex, 1);
            }
            this._draftGrid.push({
                tokenId,
                gridPos: { x, y }
            });
        }

        // Save to settings
        await game.settings.set(MODULE_ID, 'lastDraft', this._draftGrid);
    }

    /**
     * Default grid position for drafting
     */
    _getDefaultGridPos(index, total) {
        // Приоритетные точки для 5x5 (Спираль от центра)
        // 0: Center
        // 1-4: Cross 1 (Up, Left, Right, Down)
        // 5-8: Corners 1
        // ...
        const priority = [
            { x: 0, y: 0 },
            { x: 0, y: -1 }, { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, // Cross 1
            { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 }, // Corners 1

            // Outer Ring (Circle 2)
            { x: 0, y: -2 }, { x: -2, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 },
            { x: -1, y: -2 }, { x: 1, y: -2 }, { x: -2, y: -1 }, { x: 2, y: -1 },
            { x: -2, y: 1 }, { x: 2, y: 1 }, { x: -1, y: 2 }, { x: 1, y: 2 },
            { x: -2, y: -2 }, { x: 2, y: -2 }, { x: -2, y: 2 }, { x: 2, y: 2 }
        ];
        return priority[index] || { x: 0, y: 0 }; // Fallback
    }

    /**
     * Обработка броска токена в ячейку сетки (Активная группа)
     */
    async _onDropInGrid(tokenId, x, y) {
        const partyToken = this._findPartyToken();
        if (!partyToken) return;

        const members = partyToken.document.getFlag(MODULE_ID, 'members') || [];
        const member = members.find(m => m.tokenId === tokenId);

        if (member) {
            // Ищем, кто стоит в целевой клетке (Target)
            const targetMember = members.find(m =>
                m.gridPos && m.gridPos.x === x && m.gridPos.y === y
            );

            if (targetMember && targetMember !== member) {
                // SWAP
                const oldPos = member.gridPos ? { ...member.gridPos } : null;

                // Ставим member на новое место
                member.gridPos = { x, y };

                // Ставим targetMember на старое место member (если оно было)
                if (oldPos) {
                    targetMember.gridPos = oldPos;
                } else {
                    // Если member пришел из списка (не имел позиции), targetMember "улетает" в список
                    delete targetMember.gridPos;
                }
            } else {
                // Просто перемещение (или добавление в сетку)
                member.gridPos = { x, y };
            }

            // Удаляем дубликаты позиций (на всякий случай) - хотя логика Swap это предотвращает
            // Сохраняем
            await partyToken.document.setFlag(MODULE_ID, 'members', members);
        }
    }

    /**
     * Удаление токена из сетки
     */
    async _onRemoveFromGrid(event) {
        event.preventDefault();
        event.stopPropagation();

        const tokenId = event.currentTarget.dataset.tokenId;
        const partyToken = this._findPartyToken();
        if (!partyToken) return;

        const members = partyToken.document.getFlag(MODULE_ID, 'members') || [];
        const member = members.find(m => m.tokenId === tokenId);

        if (member && member.gridPos) {
            delete member.gridPos;
            await partyToken.document.setFlag(MODULE_ID, 'members', members);
        }
    }

    /**
     * Partial DOM update for the grid — avoids full template re-render on drag.
     * Reads current grid state (draft or active) and updates cell contents directly.
     */
    _updateGridDOM() {
        if (!this.element?.length) return;

        // Determine current member data source
        let members = [];
        const partyToken = this._findPartyToken();

        if (partyToken) {
            // Active party: read from token flags
            const raw = partyToken.document.getFlag(MODULE_ID, 'members') || [];
            members = raw.map(m => {
                const actor = game.actors.get(m.actorId);
                return {
                    tokenId: m.tokenId,
                    name: m.name || actor?.name || '?',
                    img: actor?.prototypeToken?.texture?.src || actor?.img || 'icons/svg/mystery-man.svg',
                    gridPos: m.gridPos || null
                };
            });
        } else if (this._draftGrid) {
            // Draft mode: read from selected tokens + draft positions
            const selectedTokens = canvas.tokens.controlled;
            members = selectedTokens.map(token => {
                const cached = this._draftGrid.find(d => d.tokenId === token.id);
                return {
                    tokenId: token.id,
                    name: token.name,
                    img: token.document.texture.src,
                    gridPos: cached?.gridPos || null
                };
            });
        }

        // Update each grid cell DOM
        const gridCells = this.element.find('.grid-cell');
        gridCells.each((_, cellEl) => {
            const gx = parseInt(cellEl.dataset.gridX);
            const gy = parseInt(cellEl.dataset.gridY);

            // Find member at this position
            const member = members.find(m =>
                m.gridPos && m.gridPos.x === gx && m.gridPos.y === gy
            );

            // Clear existing content (but keep center-cell class)
            const existingDraggable = cellEl.querySelector('.party-member-draggable');
            const existingRemove = cellEl.querySelector('.remove-from-grid');
            if (existingDraggable) existingDraggable.remove();
            if (existingRemove) existingRemove.remove();

            if (member) {
                // Create draggable element
                const draggable = document.createElement('div');
                draggable.className = 'party-member-draggable';
                draggable.dataset.tokenId = member.tokenId;
                draggable.setAttribute('draggable', 'true');

                const img = document.createElement('img');
                img.src = member.img;
                img.title = member.name;
                draggable.appendChild(img);

                // Create remove button
                const removeBtn = document.createElement('div');
                removeBtn.className = 'remove-from-grid';
                removeBtn.dataset.tokenId = member.tokenId;
                removeBtn.innerHTML = '<i class="fas fa-times"></i>';
                removeBtn.addEventListener('click', this._onRemoveFromGrid.bind(this));

                cellEl.appendChild(draggable);
                cellEl.appendChild(removeBtn);
            }
        });

        // Re-bind DragDrop handlers to newly created elements
        if (this._dragDrop?.length) {
            this._dragDrop.forEach(dd => dd.bind(this.element[0]));
        }
    }

    _onTokenUpdate(token, changes, context, userId) {
        if (this.rendered && token.getFlag(MODULE_ID, 'isPartyToken')) {
            if (changes.flags && changes.flags[MODULE_ID]) {
                // Skip render if we just did a grid drag (prevents double-render flicker)
                if (this._skipNextRender) {
                    this._skipNextRender = false;
                    return;
                }
                this.render();
            }
        }
    }

    /**
     * Сохранить новый порядок (Drag & Drop в списке)
     */
    async _saveNewOrder(list) {
        const items = list.querySelectorAll('.member-item');
        const newOrder = Array.from(items).map((item, index) => ({
            tokenId: item.dataset.tokenId,
            order: index
        }));

        const partyToken = this._findPartyToken();
        if (partyToken) {
            const members = partyToken.document.getFlag(MODULE_ID, 'members') || [];

            // Обновляем порядок
            for (const orderItem of newOrder) {
                const member = members.find(m => m.tokenId === orderItem.tokenId);
                if (member) {
                    member.order = orderItem.order;
                    // Первый — лидер
                    member.role = orderItem.order === 0 ? 'leader' : member.role;
                }
            }

            // Сортируем и сохраняем
            members.sort((a, b) => a.order - b.order);
            await partyToken.document.setFlag(MODULE_ID, 'members', members);
        }

        this.render();
    }

    // ==========================================
    // ОБРАБОТЧИКИ СОБЫТИЙ
    // ==========================================

    async _onGather(event) {
        event.preventDefault();
        const tokens = canvas.tokens.controlled;

        if (tokens.length < 2) {
            ui.notifications.warn(game.i18n.localize('GROUP_POVUXA.Notifications.MinTwoTokens'));
            return;
        }

        // Подготавливаем опции с расстановкой
        const options = {};
        if (this._draftGrid && this._draftGrid.length > 0) {
            options.initialPositions = this._draftGrid;
        }

        try {
            await game.groupPovuxa.manager.gatherParty(tokens, options);
            this._draftGrid = null; // Очищаем черновик после сбора
            await game.settings.set(MODULE_ID, 'lastDraft', []); // Очищаем настройки
        } catch (err) {
            ui.notifications.error(err.message);
            console.error(err);
        }
        this.render();
    }

    async _onDisperse(event) {
        event.preventDefault();
        const partyToken = this._findPartyToken();
        if (!partyToken) {
            ui.notifications.warn(game.i18n.localize('GROUP_POVUXA.Notifications.NoPartyToken'));
            return;
        }
        await game.groupPovuxa.manager.disperseParty(partyToken);
        this.render();
    }

    async _onSaveFormation(event) {
        event.preventDefault();

        const partyToken = this._findPartyToken();
        let gridPositions = [];

        if (partyToken) {
            const members = partyToken.document.getFlag(MODULE_ID, 'members') || [];
            gridPositions = members.filter(m => m.gridPos);
        } else {
            gridPositions = this._draftGrid || [];
        }

        if (gridPositions.length === 0) {
            ui.notifications.warn(game.i18n.localize('GROUP_POVUXA.Notifications.GridEmpty'));
            return;
        }

        // Use DialogV2 for name prompt
        const name = await foundry.applications.api.DialogV2.prompt({
            window: { title: game.i18n.localize('GROUP_POVUXA.Formations.SaveCurrent') },
            content: `<form><div class="form-group"><label>${game.i18n.localize('GROUP_POVUXA.Formations.NameLabel')}</label><input type="text" name="name" autofocus/></div></form>`,
            ok: {
                callback: (event, button, dialog) => button.form.elements.name.value
            },
            rejectClose: false
        });

        if (!name) return;

        const id = await FormationPresets.saveFormation(name, gridPositions);
        if (id) {
            await game.settings.set(MODULE_ID, 'defaultFormation', id);
            this.render();
        }
    }

    async _onDeleteFormation(event) {
        event.preventDefault();
        const id = this.element.find('#formation-select').val();

        const formation = FormationPresets.get(id);
        if (!formation || !formation.isCustom) {
            ui.notifications.warn(game.i18n.localize('GROUP_POVUXA.Notifications.CannotDeleteDefault'));
            return;
        }

        await FormationPresets.deleteFormation(id);
        await game.settings.set(MODULE_ID, 'defaultFormation', 'line');
        this.render();
    }

    async _onScatter(event) {
        event.preventDefault();
        const partyToken = this._findPartyToken();
        if (partyToken) {
            await game.groupPovuxa.manager.emergencyScatter(partyToken);
            this.render();
        }
    }

    async _onRoleChange(event) {
        const select = event.currentTarget;
        const tokenId = select.dataset.tokenId;
        const newRole = select.value;

        const partyToken = this._findPartyToken();
        if (!partyToken) return;

        const members = partyToken.document.getFlag(MODULE_ID, 'members') || [];
        const member = members.find(m => m.tokenId === tokenId);
        if (member) {
            member.role = newRole;
            await partyToken.document.setFlag(MODULE_ID, 'members', members);
        }

        this.render();
    }

    async _onFormationChange(event) {
        const formationId = event.currentTarget.value;
        await game.settings.set(MODULE_ID, 'defaultFormation', formationId);

        // Применяем шаблон немедленно
        const partyToken = this._findPartyToken();

        if (partyToken) {
            // == АКТИВНАЯ ГРУППА ==
            let members = partyToken.document.getFlag(MODULE_ID, 'members') || [];
            if (members.length > 0) {
                // Применяем расстановку
                members = FormationPresets.applyToMembers(members, formationId);
                // Сохраняем
                await partyToken.document.setFlag(MODULE_ID, 'members', members);
                await partyToken.document.setFlag(MODULE_ID, 'formation', formationId);
            }
        } else {
            // == ЧЕРНОВИК (DRAFT) ==
            if (this._draftGrid && this._draftGrid.length > 0) {
                // В черновике у нас структура похожая на members, но может отличаться
                // _draftGrid = [{tokenId, gridPos, ...}]
                this._draftGrid = FormationPresets.applyToMembers(this._draftGrid, formationId);
                await game.settings.set(MODULE_ID, 'lastDraft', this._draftGrid);
            }
        }

        this.render();
    }

    async _onRemoveMember(event) {
        event.preventDefault();
        event.stopPropagation();

        const tokenId = event.currentTarget.dataset.tokenId;
        await game.groupPovuxa.manager.removeMember(tokenId);
        this.render();
    }

    _onMemberClick(event) {
        // Игнорируем клики по кнопкам внутри
        if (event.target.closest('button') || event.target.closest('select')) return;

        const tokenId = event.currentTarget.dataset.tokenId;
        const token = canvas.tokens.get(tokenId);
        if (token) {
            token.control({ releaseOthers: true });
            canvas.animatePan({ x: token.x, y: token.y });
        }
    }

    async _onAddSelected(event) {
        event.preventDefault();
        const tokens = canvas.tokens.controlled;

        for (const token of tokens) {
            // Проверяем, что это не токен группы
            if (!token.document.getFlag(MODULE_ID, 'isPartyToken')) {
                await game.groupPovuxa.manager.addMember(token);
            }
        }

        this.render();
    }

    // ==========================================
    // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
    // ==========================================

    _findPartyToken() {
        // 1. Сначала ищем среди ВЫБРАННЫХ токенов
        const selectedPartyToken = canvas.tokens.controlled.find(t =>
            t.document.getFlag(MODULE_ID, 'isPartyToken')
        );
        if (selectedPartyToken) return selectedPartyToken;

        // 2. Если ничего не выбрано, ищем ПЕРВЫЙ попавшийся на сцене (fallback)
        // TODO: Можно добавить проверку ownership, чтобы не брать чужие группы
        return canvas.tokens.placeables.find(t =>
            t.document.getFlag(MODULE_ID, 'isPartyToken')
        );
    }

    _getRoles() {
        return [
            { id: 'leader', name: game.i18n.localize('GROUP_POVUXA.Roles.Leader') },
            { id: 'scout', name: game.i18n.localize('GROUP_POVUXA.Roles.Scout') },
            { id: 'rearguard', name: game.i18n.localize('GROUP_POVUXA.Roles.Rearguard') },
            { id: 'member', name: game.i18n.localize('GROUP_POVUXA.Roles.Member') }
        ];
    }

    _calculateGroupStats(members) {
        // Placeholder для статистики группы
        // TODO: Добавить расчёт Passive Perception, скорости и т.д.
        return {
            count: members.length,
            hasScout: members.some(m => m.role === 'scout'),
            hasRearguard: members.some(m => m.role === 'rearguard')
        };
    }

    // Хуки для обновления при изменениях
    _onTokenControlChange() {
        // console.log("POVUXA | Token Control Changed | Rendered:", this.rendered);
        if (this.rendered) this.render();
    }

    _onTokenDelete() {
        if (this.rendered) this.render();
    }

    // Очистка при закрытии
    async close(options = {}) {
        Hooks.off('controlToken', this._boundOnControl);
        Hooks.off('deleteToken', this._boundOnDelete);
        Hooks.off('updateToken', this._boundOnUpdate);
        return super.close(options);
    }
}
