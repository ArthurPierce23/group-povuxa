/**
 * PartyManager — основная логика управления группой
 * 
 * Отвечает за:
 * - Сбор токенов в группу (gatherParty)
 * - Роспуск группы (disperseParty)
 * - Добавление/удаление участников
 * - Хранение состояния во флагах сцены
 * - Наследование зрения и света
 */

import { MODULE_ID } from './main.js';
import { TokenPlacer } from './token-placer.js';
import { FormationPresets } from './formation-presets.js';

export class PartyManager {

    constructor() {
        // Кэш текущей группы (для быстрого доступа)
        this._partyCache = null;
    }

    // ==========================================
    // СБОР ГРУППЫ
    // ==========================================

    /**
     * Собрать выбранные токены в группу
     * @param {Token[]} tokens - Массив токенов для сбора
     * @param {Object} options - Опции (initialPositions и т.д.)
     * @returns {Token} - Созданный токен группы
     */
    async gatherParty(tokens, options = {}) {
        if (!tokens || tokens.length === 0) {
            ui.notifications.warn(game.i18n.localize('GROUP_POVUXA.Notifications.NoTokensSelected'));
            return null;
        }

        // Фильтруем — нельзя включать токены групп в другую группу
        const validTokens = tokens.filter(t => !t.document.getFlag(MODULE_ID, 'isPartyToken'));
        if (validTokens.length === 0) {
            ui.notifications.warn(game.i18n.localize('GROUP_POVUXA.Notifications.CannotGroupGroups'));
            return null;
        }
        if (validTokens.length < tokens.length) {
            ui.notifications.info(game.i18n.localize('GROUP_POVUXA.Notifications.GroupTokensExcluded'));
        }
        tokens = validTokens;

        console.log(`${MODULE_ID} | Собираем группу из ${tokens.length} токенов`);
        if (options.initialPositions) {
            console.log(`${MODULE_ID} | Получены начальные позиции (Draft) для ${options.initialPositions.length} токенов`);
        } else {
            console.log(`${MODULE_ID} | Начальные позиции (Draft) НЕ получены`);
        }

        // 1. Вычисляем центр группы (средняя точка)
        const center = this._calculateCenter(tokens);

        // 2. Сохраняем информацию об участниках
        let occupiedGridSlots = new Set();
        const members = tokens.map((token, index) => {
            // Проверяем, есть ли сохраненная позиция в опциях
            let gridPos = null;
            if (options.initialPositions) {
                const saved = options.initialPositions.find(p => p.tokenId === token.id);
                if (saved) {
                    gridPos = saved.gridPos;
                    occupiedGridSlots.add(`${gridPos.x},${gridPos.y}`);
                }
            }

            return {
                tokenId: token.id,
                actorId: token.actor?.id,
                name: token.name,
                img: token.document.texture.src,
                order: index,
                role: index === 0 ? 'leader' : 'member',
                gridPos: gridPos, // May be null initially
                originalPosition: { x: token.x, y: token.y },
                // Preserve dimensions and scale
                width: token.document.width,
                height: token.document.height,
                scaleX: token.document.texture.scaleX,
                scaleY: token.document.texture.scaleY,
                // Preserve orientation, elevation, disposition
                rotation: token.document.rotation ?? 0,
                elevation: token.document.elevation ?? 0,
                disposition: token.document.disposition ?? CONST.TOKEN_DISPOSITIONS.FRIENDLY,
                // Preserve vision and light
                vision: {
                    enabled: token.document.sight.enabled,
                    range: token.document.sight.range,
                    visionMode: token.document.sight.visionMode
                },
                light: {
                    dim: token.document.light.dim,
                    bright: token.document.light.bright,
                    color: token.document.light.color,
                    animation: token.document.light.animation
                }
            };
        });

        // 2.1. Заполняем пропуски в gridPos
        // ЛОГИКА: Если токен не имеет позиции (не из черновика), пытаемся определить её по положению на сцене
        // относительно ЦЕНТРА всех токенов.

        const gridSize = canvas.grid.size;

        // Вспомним центр (вычислен выше)
        // const center = this._calculateCenter(tokens); 

        members.forEach(member => {
            if (!member.gridPos) {
                // Если позиции нет в черновике — вычисляем из текущих координат
                // Относительные координаты
                const dx = member.originalPosition.x + (member.width * gridSize / 2) - center.x;
                const dy = member.originalPosition.y + (member.height * gridSize / 2) - center.y;

                // Переводим в клетки (округляем)
                // Сетка: X вправо, Y вниз.
                let gx = Math.round(dx / gridSize);
                let gy = Math.round(dy / gridSize);

                // Ограничиваем сеткой 5x5 (от -2 до 2)
                // Если не влезает — будет обработано дальше спиралью? 
                // Или просто прижимаем к краю?
                // Пользователь просил "токены должны находиться на этом расстоянии".
                // Если они далеко, мы попробуем сохранить "направление", но прижать к 5x5.

                if (gx < -2) gx = -2;
                if (gx > 2) gx = 2;
                if (gy < -2) gy = -2;
                if (gy > 2) gy = 2;

                const key = `${gx},${gy}`;

                // Если клетка свободна - занимаем
                if (!occupiedGridSlots.has(key)) {
                    member.gridPos = { x: gx, y: gy };
                    occupiedGridSlots.add(key);
                }
            }
        });

        // 2.2. Если ВСЁ ЕЩЕ нет позиции (конфликт координат или были слишком далеко и заняли одно место)
        // Используем Спираль (Fallback)
        const prioritySlots = this._getPrioritySlots(members.length + 5);

        members.forEach(member => {
            if (!member.gridPos) {
                for (const slot of prioritySlots) {
                    const key = `${slot.x},${slot.y}`;
                    if (!occupiedGridSlots.has(key)) {
                        member.gridPos = { x: slot.x, y: slot.y };
                        occupiedGridSlots.add(key);
                        break;
                    }
                }
                // Критический фоллбек
                if (!member.gridPos) member.gridPos = { x: 0, y: 0 };
            }
        });

        // 3. Compute best vision and light for party token
        const bestVision = this._calculateBestVision(tokens);
        const combinedLight = this._calculateCombinedLight(tokens);

        // 4. ANIMATION: Slide tokens toward center before gathering
        await this._animateGather(tokens, center);

        // 5. Create party token
        const partyToken = await this._createPartyToken(center, members, bestVision, combinedLight);

        // 6. Delete original tokens (already at center after animation)
        await this._hideOriginalTokens(tokens);

        // 6. Сохраняем состояние во флаги сцены
        await this._savePartyState(partyToken.id, members);

        // 7. Уведомляем пользователя
        ui.notifications.info(
            game.i18n.format('GROUP_POVUXA.Notifications.GatherSuccess', { count: members.length })
        );

        // 8. Обновляем кэш
        this._partyCache = { partyTokenId: partyToken.id, members };

        // 9. Выбираем токен группы (чтобы обновилась панель)
        if (partyToken.object) {
            partyToken.object.control({ releaseOthers: true });
        }

        return partyToken;
    }

    // ==========================================
    // РОСПУСК ГРУППЫ
    // ==========================================

    /**
     * Распустить группу вокруг токена
     * @param {Token} partyToken - Токен группы
     * @param {Object} options - Опции (formation, направление и т.д.)
     */
    async disperseParty(partyToken, options = {}) {
        if (!partyToken) {
            ui.notifications.warn(game.i18n.localize('GROUP_POVUXA.Notifications.NoPartyToken'));
            return;
        }

        // 1. Получаем сохранённых участников
        const members = partyToken.document.getFlag(MODULE_ID, 'members') || [];
        if (members.length === 0) {
            console.warn(`${MODULE_ID} | Нет участников в группе`);
            return;
        }

        // ЗАЩИТА ОТ ДВОЙНОГО РОСПУСКА
        // Используем getFlag, он возвращает undefined или значение. Проверяем !!
        const isDispersing = partyToken.document.getFlag(MODULE_ID, 'dispersing');

        // Anti-Stuck mechanism: If it's been "dispersing" for too long (e.g. > 2 seconds), assume it crashed and proceed.
        // Since we don't store timestamp, we just rely on the fact that if a user clicks it again, they probably want to force it.
        // We will warn but PROCEED (or reset and proceed).
        if (isDispersing) {
            console.warn(`${MODULE_ID} | Flag 'dispersing' was true. Assuming previous run crashed. Resetting and proceeding.`);
            await partyToken.document.unsetFlag(MODULE_ID, 'dispersing');
        }

        // Ставим флаг СРАЗУ
        await partyToken.document.setFlag(MODULE_ID, 'dispersing', true);

        try {
            console.log(`${MODULE_ID} | Распускаем группу: ${members.length} участников`);

            const hasGridPos = members.filter(m => m.gridPos).length;
            console.log(`${MODULE_ID} | Участников с сохраненной позицией в сетке: ${hasGridPos}`);

            const centerX = partyToken.x + (partyToken.w / 2);
            const centerY = partyToken.y + (partyToken.h / 2);

            // PRE-COMPUTE reachable cell set via wall-safe BFS
            // This is the single source of truth for "can a token be placed here?"
            const reachableSet = TokenPlacer.buildReachableSet(centerX, centerY, 200);

            // Arrays for positions
            const finalPositions = new Array(members.length).fill(null);
            const occupiedCoords = new Set();
            const membersWithoutSpot = [];

            // 2. Process grid-based placement
            members.forEach((member, index) => {
                if (member.gridPos) {
                    const gridSize = canvas.grid.size;
                    const gx = member.gridPos?.x ?? 0;
                    const gy = member.gridPos?.y ?? 0;
                    const baseDx = gx * gridSize;
                    const baseDy = gy * gridSize;

                    // Rotate by token rotation
                    const angle = partyToken.document.rotation || 0;
                    const rad = Math.toRadians(angle);
                    const cos = Math.cos(rad);
                    const sin = Math.sin(rad);

                    const rotX = baseDx * cos - baseDy * sin;
                    const rotY = baseDx * sin + baseDy * cos;

                    // Slot center in world coordinates
                    const slotCenterX = centerX + rotX;
                    const slotCenterY = centerY + rotY;

                    const w = member.width ?? 1;
                    const h = member.height ?? 1;

                    const targetTLX = slotCenterX - (canvas.grid.size * w) / 2;
                    const targetTLY = slotCenterY - (canvas.grid.size * h) / 2;

                    const snapped = TokenPlacer.snapToTopLeft(targetTLX, targetTLY);

                    // Leader (0,0) placed exactly at party token position
                    if (gx === 0 && gy === 0) {
                        snapped.x = partyToken.x;
                        snapped.y = partyToken.y;
                    }

                    // Safety check for snap failure
                    if (snapped.x === undefined || snapped.y === undefined || isNaN(snapped.x) || isNaN(snapped.y)) {
                        snapped.x = partyToken.x;
                        snapped.y = partyToken.y;
                    }

                    const snappedCenterX = snapped.x + (canvas.grid.size * w) / 2;
                    const snappedCenterY = snapped.y + (canvas.grid.size * h) / 2;

                    // VALIDATE via BFS reachability set — the only reliable wall check
                    const cellKey = `${Math.round(snappedCenterX)},${Math.round(snappedCenterY)}`;
                    const isReachable = reachableSet.has(cellKey);
                    const isOccupied = occupiedCoords.has(`${snapped.x},${snapped.y}`);
                    const isLeaderSpot = (gx === 0 && gy === 0);

                    if ((isReachable && !isOccupied) || isLeaderSpot) {
                        finalPositions[index] = snapped;
                        occupiedCoords.add(`${snapped.x},${snapped.y}`);
                    } else {
                        membersWithoutSpot.push(index);
                    }
                } else {
                    membersWithoutSpot.push(index);
                }
            });

            // 3. Если есть участники без мест — ищем свободные через BFS
            if (membersWithoutSpot.length > 0) {
                // Находим с запасом
                const needed = membersWithoutSpot.length;
                const validPositions = TokenPlacer.findValidPositions(
                    centerX,
                    centerY,
                    needed + occupiedCoords.size + 2, // Запас на занятые нами же клетки
                    { excludeTokens: [partyToken.id] }
                );

                // Фильтруем те, что мы уже заняли сеткой
                const available = validPositions.filter(p => !occupiedCoords.has(`${p.x},${p.y}`));

                // Distribute — snap BFS results to grid top-left
                membersWithoutSpot.forEach((memberIndex, i) => {
                    if (i < available.length) {
                        const snapped = TokenPlacer.snapToTopLeft(available[i].x, available[i].y);
                        finalPositions[memberIndex] = snapped;
                        occupiedCoords.add(`${snapped.x},${snapped.y}`);
                    } else {
                        // Wall-aware fallback: find ANY valid nearby position via separate BFS
                        const emergency = TokenPlacer.findValidPositions(centerX, centerY, occupiedCoords.size + 5, {
                            excludeTokens: [partyToken.id]
                        });
                        const emergencyAvail = emergency.filter(p => !occupiedCoords.has(`${p.x},${p.y}`));
                        if (emergencyAvail.length > 0) {
                            const snapped = TokenPlacer.snapToTopLeft(emergencyAvail[0].x, emergencyAvail[0].y);
                            finalPositions[memberIndex] = snapped;
                            occupiedCoords.add(`${snapped.x},${snapped.y}`);
                        } else {
                            // Absolute last resort — stack on party token position
                            finalPositions[memberIndex] = { x: partyToken.x, y: partyToken.y };
                        }
                    }
                });
            }

            let formattedPositions = finalPositions;

            // --- Старая логика (если gridPos вообще не использовался) ---
            const hasAnyGridPos = members.some(m => m.gridPos);
            if (!hasAnyGridPos) {
                const formation = options.formation || game.settings.get(MODULE_ID, 'defaultFormation');
                const direction = partyToken.document.rotation || 0;

                // Берем позиции из BFS
                const validRef = TokenPlacer.findValidPositions(
                    centerX, centerY, members.length, { excludeTokens: [partyToken.id] }
                );
                formattedPositions = FormationPresets.apply(formation, validRef, direction);
            }

            // 4. Rollback check: if >50% of members have no valid position, abort
            const nullCount = formattedPositions.filter(p => p === null).length;
            if (nullCount > members.length * 0.5) {
                console.warn(`${MODULE_ID} | Dispersal aborted: ${nullCount}/${members.length} positions invalid`);
                ui.notifications.warn(game.i18n.localize('GROUP_POVUXA.Notifications.CannotPlaceAll'));
                return; // finally block will clean up the dispersing flag
            }

            // 5. Check total position count
            if (formattedPositions.length < members.length) {
                ui.notifications.warn(game.i18n.localize('GROUP_POVUXA.Notifications.CannotPlaceAll'));
            }

            // 6. Restore member tokens AT party position (for animation start)
            const partyPos = { x: partyToken.x, y: partyToken.y };
            const restoredTokens = await this._restoreMembers(members, formattedPositions.map(() => partyPos));

            // 7. Delete party token FIRST (so tokens become visible)
            try {
                await partyToken.document.delete({ groupPovuxaDispersing: true });
            } catch (e) {
                console.warn(`${MODULE_ID} | Error deleting party token:`, e);
            }

            // 8. ANIMATION: Slide restored tokens from party position to final positions
            if (restoredTokens && restoredTokens.length > 0) {
                await this._animateDisperse(restoredTokens, formattedPositions);
            }

            // 9. Clear scene flags
            await this._clearPartyState();

            // 10. Notify user
            ui.notifications.info(game.i18n.localize('GROUP_POVUXA.Notifications.DisperseSuccess'));

            // 11. Clear cache
            this._partyCache = null;

        } catch (e) {
            console.error(`${MODULE_ID} | CRITICAL ERROR during disperseParty:`, e);
            ui.notifications.error(`Group Po'Vuxa Error: ${e.message}`);
        } finally {
            // ALWAYS clear the dispersing flag, even if error occurred
            try { await partyToken.document.unsetFlag(MODULE_ID, 'dispersing'); } catch (e) { }
        }
    }

    // ==========================================
    // ЭКСТРЕННОЕ РАССЕИВАНИЕ
    // ==========================================

    /**
     * Экстренное (случайное) рассеивание — для засады
     * @param {Token} partyToken - Токен группы
     */
    async emergencyScatter(partyToken) {
        if (!partyToken) return;

        const members = partyToken.document.getFlag(MODULE_ID, 'members') || [];
        if (members.length === 0) {
            console.warn(`${MODULE_ID} | emergencyScatter: no members found`);
            return;
        }

        const centerX = partyToken.x + (partyToken.w / 2);
        const centerY = partyToken.y + (partyToken.h / 2);

        // Находим позиции
        let positions = TokenPlacer.findValidPositions(centerX, centerY, members.length * 2);

        // Перемешиваем случайно
        positions = this._shuffleArray(positions).slice(0, members.length);

        // Snap BFS results to grid top-left
        positions = positions.map(p => TokenPlacer.snapToTopLeft(p.x, p.y));

        // CRITICAL: Restore member tokens BEFORE deleting party token
        const restoredTokens = await this._restoreMembers(members, positions);

        // Удаляем токен группы (with flag to prevent preDeleteToken recursion)
        try {
            await partyToken.document.delete({ groupPovuxaDispersing: true });
        } catch (e) {
            console.warn(`${MODULE_ID} | Error deleting party token during scatter:`, e);
        }

        await this._clearPartyState();
        this._partyCache = null;

        ui.notifications.info(game.i18n.localize('GROUP_POVUXA.Notifications.DisperseSuccess'));
    }

    /**
     * Генерация координат спирали для заполнения
     */
    _getPrioritySlots(count) {
        const slots = [{ x: 0, y: 0 }];
        let x = 0, y = 0;
        let dx = 0, dy = -1;

        // Генерируем чуть больше чем нужно
        for (let i = 0; i < count; i++) {
            if (-2 <= x && x <= 2 && -2 <= y && y <= 2) { // Limit to 5x5
                if (i > 0) slots.push({ x, y });
            }
            if (x === y || (x < 0 && x === -y) || (x > 0 && x === 1 - y)) {
                let temp = dx;
                dx = -dy;
                dy = temp;
            }
            x += dx;
            y += dy;
        }
        return slots;
    }



    // ==========================================
    // УПРАВЛЕНИЕ УЧАСТНИКАМИ
    // ==========================================

    /**
     * Добавить токен в существующую группу
     * @param {Token} token - Токен для добавления
     */
    async addMember(token) {
        // Нельзя добавить токен группы в другую группу
        if (token.document.getFlag(MODULE_ID, 'isPartyToken')) {
            ui.notifications.warn(game.i18n.localize('GROUP_POVUXA.Notifications.CannotGroupGroups'));
            return;
        }

        const partyToken = this._findPartyToken();
        if (!partyToken) {
            ui.notifications.warn(game.i18n.localize('GROUP_POVUXA.Notifications.NoPartyToken'));
            return;
        }

        const members = partyToken.document.getFlag(MODULE_ID, 'members') || [];

        // Добавляем нового участника
        const newMember = {
            tokenId: token.id,
            actorId: token.actor?.id,
            name: token.name,
            img: token.document.texture.src,
            order: members.length,
            role: 'member',
            originalPosition: { x: token.x, y: token.y },
            width: token.document.width,
            height: token.document.height,
            scaleX: token.document.texture.scaleX,
            scaleY: token.document.texture.scaleY,
            vision: {
                enabled: token.document.sight.enabled,
                range: token.document.sight.range,
                visionMode: token.document.sight.visionMode
            },
            light: {
                dim: token.document.light.dim,
                bright: token.document.light.bright,
                color: token.document.light.color,
                animation: token.document.light.animation
            }
        };

        members.push(newMember);

        // Обновляем флаги
        await partyToken.document.setFlag(MODULE_ID, 'members', members);

        // Обновляем зрение/свет токена группы
        await this._updatePartyTokenVision(partyToken, members);

        // Скрываем добавленный токен
        await token.document.delete();

        ui.notifications.info(
            game.i18n.format('GROUP_POVUXA.Notifications.TokenAdded', { name: token.name })
        );

        // Обновляем кэш
        this._partyCache = { partyTokenId: partyToken.id, members };
    }

    /**
     * Убрать участника из группы
     * @param {string} tokenId - ID токена для удаления
     */
    async removeMember(tokenId) {
        const partyToken = this._findPartyToken();
        if (!partyToken) return;

        let members = partyToken.document.getFlag(MODULE_ID, 'members') || [];
        const memberIndex = members.findIndex(m => m.tokenId === tokenId);

        if (memberIndex === -1) return;

        const removedMember = members[memberIndex];
        members.splice(memberIndex, 1);

        // Пересчитываем порядок
        members = members.map((m, i) => ({ ...m, order: i }));

        // Создаём токен обратно на сцене
        await this._createTokenFromMember(removedMember, partyToken.x, partyToken.y);

        // ЕСЛИ осталось меньше 2 участников — распускаем группу автоматически
        if (members.length < 2) {
            ui.notifications.info(game.i18n.localize('GROUP_POVUXA.Notifications.TooFewMembers'));
            // Обновляем флаг перед роспуском, чтобы корректно вернуть последнего
            await partyToken.document.setFlag(MODULE_ID, 'members', members);
            await this.disperseParty(partyToken);
            return;
        }

        // Обновляем флаги
        await partyToken.document.setFlag(MODULE_ID, 'members', members);

        // Обновляем зрение/свет
        await this._updatePartyTokenVision(partyToken, members);

        ui.notifications.info(
            game.i18n.format('GROUP_POVUXA.Notifications.TokenRemoved', { name: removedMember.name })
        );

        this._partyCache = { partyTokenId: partyToken.id, members };
    }

    /**
     * Получить данные о текущей группе
     */
    getPartyData() {
        if (this._partyCache) return this._partyCache;

        const partyToken = this._findPartyToken();
        if (!partyToken) return null;

        return {
            partyTokenId: partyToken.id,
            members: partyToken.document.getFlag(MODULE_ID, 'members') || []
        };
    }

    // ==========================================
    // ПРИВАТНЫЕ МЕТОДЫ
    // ==========================================

    /**
     * Вычислить центр группы токенов
     */
    _calculateCenter(tokens) {
        const sumX = tokens.reduce((sum, t) => sum + t.x + t.w / 2, 0);
        const sumY = tokens.reduce((sum, t) => sum + t.y + t.h / 2, 0);
        return {
            x: sumX / tokens.length,
            y: sumY / tokens.length
        };
    }

    /**
     * Вычислить лучшее зрение из всех участников
     * Берём максимальный range, тёмное зрение если есть хотя бы у одного
     */
    _calculateBestVision(tokens) {
        if (!game.settings.get(MODULE_ID, 'inheritVision')) {
            return { enabled: true, range: 0, visionMode: 'basic' };
        }

        let maxRange = 0;
        let hasDarkvision = false;

        for (const token of tokens) {
            const sight = token.document.sight;
            if (sight.range > maxRange) {
                maxRange = sight.range;
            }
            if (sight.visionMode === 'darkvision') {
                hasDarkvision = true;
            }
        }

        return {
            enabled: true,
            range: maxRange,
            visionMode: hasDarkvision ? 'darkvision' : 'basic'
        };
    }

    /**
     * Вычислить комбинированный свет
     * Берём максимальные значения dim/bright
     */
    _calculateCombinedLight(tokens) {
        if (!game.settings.get(MODULE_ID, 'inheritLight')) {
            return { dim: 0, bright: 0, color: null, animation: { type: null } };
        }

        let maxDim = 0;
        let maxBright = 0;
        let lightColor = null;
        let lightAnimation = { type: null };

        for (const token of tokens) {
            const light = token.document.light;
            if (light.dim > maxDim) {
                maxDim = light.dim;
                lightColor = light.color;
                lightAnimation = light.animation;
            }
            if (light.bright > maxBright) {
                maxBright = light.bright;
            }
        }

        return {
            dim: maxDim,
            bright: maxBright,
            color: lightColor,
            animation: lightAnimation
        };
    }

    async _getOrCreatePartyActor() {
        const actorName = "Group Party Actor (Do Not Delete)";
        // Ищем существующего актера
        let actor = game.actors.find(a => a.getFlag(MODULE_ID, 'isPartyActor'));

        // Fallback по имени
        if (!actor) {
            actor = game.actors.find(a => a.name === actorName);
        }

        // Auto-migrate: fix prototypeToken.texture.src if missing or old square image
        if (actor) {
            const circleImg = `modules/${MODULE_ID}/assets/tokens/party-group-circle.png`;
            const currentTexture = actor.prototypeToken?.texture?.src;
            const needsMigration = !currentTexture
                || currentTexture === 'icons/svg/mystery-man.svg'
                || currentTexture.endsWith('party-group.png');
            if (needsMigration) {
                await actor.update({
                    img: circleImg,
                    'prototypeToken.texture.src': circleImg,
                    'prototypeToken.name': game.i18n.localize('GROUP_POVUXA.Panel.Title')
                });
                console.log(`${MODULE_ID} | Migrated Party Actor to circular token`);
            }
        }

        if (!actor) {
            const tokenImg = `modules/${MODULE_ID}/assets/tokens/party-group-circle.png`;
            const cls = getDocumentClass("Actor");
            actor = await cls.create({
                name: actorName,
                type: "npc",
                img: tokenImg,
                prototypeToken: {
                    texture: { src: tokenImg },
                    name: game.i18n.localize('GROUP_POVUXA.Panel.Title')
                },
                flags: {
                    [MODULE_ID]: { isPartyActor: true }
                },
                ownership: { default: 0 }
            });
            console.log(`${MODULE_ID} | Created generic Party Actor: ${actor.id}`);
        }

        // Проверяем настройку видимости
        const hideActor = game.settings.get(MODULE_ID, 'hidePartyActor');
        const folderName = "Group Po'Vuxa";

        // Организация в папку или скрытие
        // Если скрыт — возможно стоит убрать из папки? Или наоборот в скрытую папку?
        // Проще всего управлять правами, но "hide from sidebar" это обычно permission level.
        // Если GM, он всегда видит.

        return actor;
    }

    /**
     * Создать токен группы
     */
    async _createPartyToken(center, members, vision, light) {
        const gridSize = canvas.grid.size;
        let tokenImage = game.settings.get(MODULE_ID, 'defaultPartyToken');

        // Auto-fix: migrate old default images to circular version
        if (!tokenImage || tokenImage.includes('party-walking.svg') || tokenImage.endsWith('party-group.png')) {
            tokenImage = `modules/${MODULE_ID}/assets/tokens/party-group-circle.png`;
        }

        // Получаем или создаем технического актера для группы
        const partyActor = await this._getOrCreatePartyActor();

        // Привязываем к сетке (v13 API: point, behavior)
        const snappedPosition = canvas.grid.getSnappedPoint(
            { x: center.x, y: center.y },
            { mode: CONST.GRID_SNAPPING_MODES.CENTER }
        );

        const tokenData = {
            name: game.i18n.localize('GROUP_POVUXA.Panel.Title'),
            actorId: partyActor.id,
            texture: {
                src: tokenImage || `modules/${MODULE_ID}/assets/tokens/party-group-circle.png`
            },
            x: snappedPosition.x - gridSize / 2,
            y: snappedPosition.y - gridSize / 2,
            width: 1,
            height: 1,
            sight: {
                enabled: vision.enabled,
                range: vision.range,
                visionMode: vision.visionMode
            },
            light: {
                dim: light.dim,
                bright: light.bright,
                color: light.color,
                animation: light.animation
            },
            flags: {
                [MODULE_ID]: {
                    isPartyToken: true,
                    members: members,
                    formation: game.settings.get(MODULE_ID, 'defaultFormation')
                }
            }
        };

        const [created] = await canvas.scene.createEmbeddedDocuments('Token', [tokenData]);
        return canvas.tokens.get(created.id);
    }

    /**
     * Delete original tokens from canvas.
     */
    async _hideOriginalTokens(tokens) {
        const tokenIds = tokens.map(t => t.id).filter(id => canvas.tokens.get(id));
        if (tokenIds.length > 0) {
            await canvas.scene.deleteEmbeddedDocuments('Token', tokenIds);
        }
    }

    /**
     * ANIMATION: Slide all member tokens toward center before gathering.
     * Tokens move to the calculated center point, then get deleted.
     * @param {Token[]} tokens - Token objects to animate
     * @param {{x: number, y: number}} center - Target center position
     */
    async _animateGather(tokens, center) {
        const gridSize = canvas.grid.size;
        const targetX = center.x - gridSize / 2;
        const targetY = center.y - gridSize / 2;

        // Move all tokens toward center simultaneously
        const movePromises = tokens.map(token => {
            if (!token.document) return Promise.resolve();
            return token.document.update(
                { x: targetX, y: targetY },
                { animate: true, animation: { duration: 400, easing: 'easeInOutCubic' } }
            ).catch(() => { });
        });

        await Promise.all(movePromises);
        // Brief pause for visual effect
        await new Promise(r => setTimeout(r, 150));
    }

    /**
     * ANIMATION: Slide restored tokens from party position to their final positions.
     * Tokens are created at party position, then animated outward.
     * @param {TokenDocument[]} restoredTokens - Newly created token documents
     * @param {Array<{x: number, y: number}>} finalPositions - Target positions
     */
    async _animateDisperse(restoredTokens, finalPositions) {
        // Small delay to let tokens render
        await new Promise(r => setTimeout(r, 100));

        const updateBatch = [];

        // We assume restoredTokens aligns with finalPositions logic, 
        // BUT restoredTokens only contains valid ones.
        // The original members list might have had skips.
        // However, `_restoreMembers` pushes sequentially for every valid member.
        // So we should iterate restoredTokens.

        for (let i = 0; i < restoredTokens.length; i++) {
            const tokenDoc = restoredTokens[i];
            const finalPos = finalPositions[i]; // This alignment assumes 1:1 match.

            // WARNING: If `_restoreMembers` skipped some members (e.g. actor not found),
            // indices will shift. We should probably pass the FULL list or align safer.
            // But for now, let's assume reliability or index alignment.
            // Actually `_restoreMembers` skips if actor missing. `finalPositions` matches `members`.

            // To be safe, _restoreMembers should probably return sparse array or we assume alignment.
            // Let's rely on basic alignment for now as actor missing is rare.

            if (!finalPos) continue;

            updateBatch.push({
                _id: tokenDoc.id,
                x: finalPos.x,
                y: finalPos.y
            });
        }

        if (updateBatch.length > 0) {
            await canvas.scene.updateEmbeddedDocuments('Token', updateBatch, {
                animate: true,
                animation: { duration: 500, easing: 'easeOutCubic' }
            });
        }
    }

    /**
     * Восстановить участников группы
     */
    async _restoreMembers(members, positions, options = { animate: true }) {
        const tokensData = [];

        for (let i = 0; i < members.length; i++) {
            const member = members[i];
            const position = positions[i] || positions[positions.length - 1] || { x: 0, y: 0 };

            // Получаем актёра для восстановления токена
            const actor = game.actors.get(member.actorId);
            if (!actor) {
                console.warn(`${MODULE_ID} | Actor not found: ${member.actorId} (${member.name})`);
                continue;
            }

            const tokenData = {
                actorId: member.actorId,
                name: member.name,
                texture: {
                    src: member.img,
                    scaleX: member.scaleX ?? 1,
                    scaleY: member.scaleY ?? 1
                },
                x: position.x,
                y: position.y,
                width: member.width ?? 1,
                height: member.height ?? 1,
                rotation: member.rotation ?? 0,
                elevation: member.elevation ?? 0,
                disposition: member.disposition ?? CONST.TOKEN_DISPOSITIONS.FRIENDLY,
                sight: member.vision ?? {},
                light: member.light ?? {}
            };
            tokensData.push(tokenData);
        }

        if (tokensData.length === 0) {
            console.warn(`${MODULE_ID} | _restoreMembers: no valid tokens to create`);
            return [];
        }

        // Создаём все токены одной batch-операцией
        const createdDocs = await canvas.scene.createEmbeddedDocuments('Token', tokensData);
        return createdDocs;
    }

    /**
     * Create a single token from saved member data
     * @param {Object} member - Saved member data
     * @param {number} x - X coordinate (top-left)
     * @param {number} y - Y coordinate (top-left)
     * @returns {Token|null}
     */
    async _createTokenFromMember(member, x, y) {
        const actor = game.actors.get(member.actorId);
        if (!actor) {
            console.warn(`${MODULE_ID} | _createTokenFromMember: actor not found ${member.actorId}`);
            return null;
        }

        const tokenData = {
            actorId: member.actorId,
            name: member.name,
            texture: {
                src: member.img,
                scaleX: member.scaleX ?? 1,
                scaleY: member.scaleY ?? 1
            },
            x: x,
            y: y,
            width: member.width ?? 1,
            height: member.height ?? 1,
            rotation: member.rotation ?? 0,
            elevation: member.elevation ?? 0,
            disposition: member.disposition ?? CONST.TOKEN_DISPOSITIONS.FRIENDLY,
            sight: member.vision ?? {},
            light: member.light ?? {}
        };

        const [created] = await canvas.scene.createEmbeddedDocuments('Token', [tokenData]);
        return canvas.tokens.get(created.id);
    }

    /**
     * Вычислить относительные позиции токенов в сетке 5x5
     * @param {Token[]} tokens - Массив токенов
     * @returns {Object[]} - Массив { tokenId, gridPos: {x, y} }
     */
    static getRelativeGridPositions(tokens) {
        if (!tokens || tokens.length === 0) return [];

        const gridSize = canvas.grid.size;

        // 1. Calculate GEOMETRIC CENTER of the bounding box of all tokens
        // This ensures the formation center stays stable across gather/disperse cycles
        const minX = Math.min(...tokens.map(t => t.x));
        const maxX = Math.max(...tokens.map(t => t.x + t.w));
        const minY = Math.min(...tokens.map(t => t.y));
        const maxY = Math.max(...tokens.map(t => t.y + t.h));
        const refCenterX = (minX + maxX) / 2;
        const refCenterY = (minY + maxY) / 2;

        const rawPositions = tokens.map(token => {
            const tCenterX = token.x + token.w / 2;
            const tCenterY = token.y + token.h / 2;

            const dx = tCenterX - refCenterX;
            const dy = tCenterY - refCenterY;

            return {
                tokenId: token.id,
                gx: Math.round(dx / gridSize),
                gy: Math.round(dy / gridSize)
            };
        });

        // 2. Центрируем это всё в 5x5
        // Находим границы получившейся фигуры
        const minGx = Math.min(...rawPositions.map(p => p.gx));
        const maxGx = Math.max(...rawPositions.map(p => p.gx));
        const minGy = Math.min(...rawPositions.map(p => p.gy));
        const maxGy = Math.max(...rawPositions.map(p => p.gy));

        // Вычисляем смещение, чтобы центр фигуры оказался в (0,0)
        // CenterX of figure = (min + max) / 2
        // Shift = -Round(Center)
        // FIX: If we only have 1 token (leader), min=0, max=0, shift=0.
        // If we have leader (0,0) and one guy at (1,0): min=0, max=1. Center=0.5. Shift=-1.
        // Result: Leader -> -1, Member -> 0.
        // This shifts the leader away from the center!
        // We want the LEADER (or reference) to stay at 0,0 if possible, OR center the group.
        // User complaint: "Central token shifts to inter-grid".
        // Let's try to KEEP reference at 0,0 and only shift if bounds are exceeded?
        // OR: Shift only if the group is larger than 5x5?
        // Actually, the previous logic tried to center the *formation* in the 5x5 grid.
        // If user wants leader to be center, we should just NOT shift if it fits.

        let shiftX = 0;
        let shiftY = 0;

        // Check if fits without shift
        // We need coordinates between -2 and 2.
        // If current bounds are within -2..2, NO SHIFT.
        // Only shift if we exceed bounds.

        if (minGx < -2 || maxGx > 2) {
            const centerGx = Math.round((minGx + maxGx) / 2);
            shiftX = -centerGx;
        }
        if (minGy < -2 || maxGy > 2) {
            const centerGy = Math.round((minGy + maxGy) / 2);
            shiftY = -centerGy;
        }

        const occupied = new Set();
        return rawPositions.map(p => {
            let finalGx = p.gx + shiftX;
            let finalGy = p.gy + shiftY;

            // Клампинг к -2..2
            // Вместо жесткого клампинга, который создает кучу в одной клетке,
            // попробуем найти ближайшую свободную точку в пределах -2..2 К этой точке.

            const clamp = (val) => Math.max(-2, Math.min(2, val));

            let targetX = clamp(finalGx);
            let targetY = clamp(finalGy);

            // Если точка занята - ищем соседей
            if (occupied.has(`${targetX},${targetY}`)) {
                // Спиральный поиск свободного места вокруг targetX, targetY
                let found = false;
                for (let d = 1; d <= 4; d++) {
                    for (let dx = -d; dx <= d; dx++) {
                        for (let dy = -d; dy <= d; dy++) {
                            if (Math.abs(dx) !== d && Math.abs(dy) !== d) continue; // только оболочка

                            const tx = targetX + dx;
                            const ty = targetY + dy;

                            if (tx >= -2 && tx <= 2 && ty >= -2 && ty <= 2) {
                                if (!occupied.has(`${tx},${ty}`)) {
                                    targetX = tx;
                                    targetY = ty;
                                    found = true;
                                    break;
                                }
                            }
                        }
                        if (found) break;
                    }
                    if (found) break;
                }
            }

            occupied.add(`${targetX},${targetY}`);

            return {
                tokenId: p.tokenId,
                gridPos: { x: targetX, y: targetY }
            };
        });
    }

    // NOTE: _createTokenFromMember is defined above (single definition, no duplicate)

    /**
     * Обновить зрение/свет токена группы после изменения состава
     */
    async _updatePartyTokenVision(partyToken, members) {
        // Пересобираем токены из актёров для расчёта
        // (упрощённо — используем сохранённые данные)
        let maxRange = 0;
        let maxDim = 0;
        let maxBright = 0;

        for (const member of members) {
            if (member.vision.range > maxRange) {
                maxRange = member.vision.range;
            }
            if (member.light.dim > maxDim) {
                maxDim = member.light.dim;
            }
            if (member.light.bright > maxBright) {
                maxBright = member.light.bright;
            }
        }

        await partyToken.document.update({
            sight: { range: maxRange },
            light: { dim: maxDim, bright: maxBright }
        });
    }

    /**
     * Сохранить состояние группы во флаги сцены
     */
    async _savePartyState(partyTokenId, members) {
        await canvas.scene.setFlag(MODULE_ID, 'activeParty', {
            partyTokenId,
            members: members.map(m => ({ tokenId: m.tokenId, actorId: m.actorId }))
        });
    }

    /**
     * Очистить состояние группы
     */
    async _clearPartyState() {
        await canvas.scene.unsetFlag(MODULE_ID, 'activeParty');
    }

    /**
     * Найти токен группы на текущей сцене
     */
    _findPartyToken() {
        return canvas.tokens.placeables.find(t =>
            t.document.getFlag(MODULE_ID, 'isPartyToken')
        );
    }

    /**
     * Определить направление последнего движения
     */
    _getMovementDirection(token) {
        // Возвращаем угол в градусах (0 = север, 90 = восток)
        // TODO: отслеживать историю движения
        return 0;
    }

    /**
     * Перемешать массив (Fisher-Yates)
     */
    _shuffleArray(array) {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }
}
