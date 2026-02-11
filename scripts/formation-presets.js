/**
 * FormationPresets — шаблоны построений группы
 * 
 * Определяет как токены располагаются относительно друг друга
 * при роспуске группы
 */

import { MODULE_ID } from './main.js';

export class FormationPresets {

    // Определения всех шаблонов
    static FORMATIONS = {

        /**
         * ЛИНИЯ — токены в ряд
         * Отлично для узких коридоров
         * 
         * [1] [2] [3] [4] [5]
         */
        line: {
            id: 'line',
            name: 'GROUP_POVUXA.Formations.Line',
            icon: 'fas fa-grip-lines',
            // Относительные позиции от центра (в клетках)
            // direction = 0 означает "смотрим на север"
            getPositions: (count, gridSize, direction) => {
                const positions = [];
                const startOffset = -Math.floor(count / 2);

                for (let i = 0; i < count; i++) {
                    positions.push({
                        dx: (startOffset + i) * gridSize,
                        dy: 0,
                        order: i
                    });
                }

                return FormationPresets._rotatePositions(positions, direction);
            }
        },

        /**
         * КЛИН (Wedge) — V-образное построение
         * Лидер впереди, остальные за ним уступами
         * 
         *       [1]
         *    [2]   [3]
         *  [4]       [5]
         */
        wedge: {
            id: 'wedge',
            name: 'GROUP_POVUXA.Formations.Wedge',
            icon: 'fas fa-caret-up',
            getPositions: (count, gridSize, direction) => {
                const positions = [];

                // Лидер впереди
                positions.push({ dx: 0, dy: 0, order: 0 });

                // Остальные за ним уступами
                let row = 1;
                let placed = 1;

                while (placed < count) {
                    // Левая сторона
                    if (placed < count) {
                        positions.push({
                            dx: -row * gridSize,
                            dy: row * gridSize,
                            order: placed++
                        });
                    }
                    // Правая сторона
                    if (placed < count) {
                        positions.push({
                            dx: row * gridSize,
                            dy: row * gridSize,
                            order: placed++
                        });
                    }
                    row++;
                }

                return FormationPresets._rotatePositions(positions, direction);
            }
        },

        /**
         * КРУГ — кольцевое построение
         * Защита важной цели в центре
         * 
         *    [2]
         * [5] [1] [3]
         *    [4]
         */
        circle: {
            id: 'circle',
            name: 'GROUP_POVUXA.Formations.Circle',
            icon: 'fas fa-circle-notch',
            getPositions: (count, gridSize, direction) => {
                const positions = [];

                if (count >= 1) {
                    // Центральный токен (защищаемый)
                    positions.push({ dx: 0, dy: 0, order: 0 });
                }

                // Остальные по кругу
                const remaining = count - 1;
                if (remaining > 0) {
                    const angleStep = (2 * Math.PI) / remaining;
                    const radius = gridSize; // Радиус круга = 1 клетка

                    for (let i = 0; i < remaining; i++) {
                        const angle = i * angleStep - Math.PI / 2; // Начинаем сверху
                        positions.push({
                            dx: Math.round(Math.cos(angle) * radius),
                            dy: Math.round(Math.sin(angle) * radius),
                            order: i + 1
                        });
                    }
                }

                return FormationPresets._rotatePositions(positions, direction);
            }
        },

        /**
         * КВАДРАТ — плотное построение
         * Максимальная защита со всех сторон
         * 
         * [1] [2] [3]
         * [4] [5] [6]
         * [7] [8] [9]
         */
        square: {
            id: 'square',
            name: 'GROUP_POVUXA.Formations.Square',
            icon: 'fas fa-th',
            getPositions: (count, gridSize, direction) => {
                const positions = [];

                // Вычисляем размер квадрата
                const side = Math.ceil(Math.sqrt(count));
                const startX = -Math.floor(side / 2);
                const startY = -Math.floor(side / 2);

                let placed = 0;
                for (let row = 0; row < side && placed < count; row++) {
                    for (let col = 0; col < side && placed < count; col++) {
                        positions.push({
                            dx: (startX + col) * gridSize,
                            dy: (startY + row) * gridSize,
                            order: placed++
                        });
                    }
                }

                return FormationPresets._rotatePositions(positions, direction);
            }
        },

        /**
         * ЗМЕЙКА — следование по тропе
         * Токены выстраиваются в цепочку назад
         * 
         * [1]
         * [2]
         * [3]
         * [4]
         * [5]
         */
        snake: {
            id: 'snake',
            name: 'GROUP_POVUXA.Formations.Snake',
            icon: 'fas fa-stream',
            getPositions: (count, gridSize, direction) => {
                const positions = [];

                for (let i = 0; i < count; i++) {
                    positions.push({
                        dx: 0,
                        dy: i * gridSize,
                        order: i
                    });
                }

                return FormationPresets._rotatePositions(positions, direction);
            }
        }
    };

    /**
     * Получить все доступные шаблоны
     * @returns {Object}
     */
    /**
     * Получить все доступные шаблоны (стандартные + пользовательские)
     * @returns {Object}
     */
    static getAll() {
        const defaults = Object.entries(this.FORMATIONS).map(([id, formation]) => ({
            id,
            name: game.i18n.localize(formation.name),
            icon: formation.icon,
            isCustom: false
        }));

        const customs = Object.entries(game.settings.get(MODULE_ID, 'customFormations') || {}).map(([id, formation]) => ({
            id,
            name: formation.name,
            icon: 'fas fa-save', // Иконка для кастомных
            isCustom: true
        }));

        return [...defaults, ...customs];
    }

    /**
     * Получить шаблон по ID
     * @param {string} formationId
     * @returns {Object|null}
     */
    static get(formationId) {
        // 1. Стандартные
        if (this.FORMATIONS[formationId]) return this.FORMATIONS[formationId];

        // 2. Пользовательские
        const customs = game.settings.get(MODULE_ID, 'customFormations') || {};
        const custom = customs[formationId];

        if (custom) {
            // Восстанавливаем функционал
            return {
                ...custom,
                getPositions: (count, gridSize, direction) => {
                    // Берем сохраненные позиции. 
                    // Если токенов больше, чем в шаблоне, лишние пойдут в "хвост" (логика apply это делает)
                    // Если меньше - берем первые N

                    const positions = custom.positions.slice(0, count).map(p => ({
                        dx: p.dx,
                        dy: p.dy,
                        order: p.order
                    }));

                    // Если токенов больше, чем мест в шаблоне - генерируем "толпу" вокруг или просто возвращаем что есть
                    // apply сам разберется с непокрытыми токенами (они останутся на местах или пойдут в конец)

                    return FormationPresets._rotatePositions(positions, direction);
                }
            };
        }

        return null;
    }

    /**
     * Сохранить пользовательский шаблон
     * @param {string} name 
     * @param {Array} gridPositions 
     */
    static async saveFormation(name, gridPositions) {
        if (!name || !gridPositions || gridPositions.length === 0) return;

        const id = 'custom_' + Date.now();

        // Преобразуем позиции в формат шаблона (dx, dy)
        // Сохраняем также ID токенов и актеров для привязки

        const formation = {
            id,
            name,
            positions: gridPositions.map((p, i) => ({
                dx: p.gridPos.x * canvas.grid.size,
                dy: p.gridPos.y * canvas.grid.size,
                order: i,
                tokenId: p.tokenId,
                actorId: p.actorId
            })),
            isCustom: true
        };

        // Добавляем метод getPositions (он не сохраняется в JSON, поэтому восстановим при чтении)
        // НО: game.settings хранит JSON. Мы не можем хранить функции.
        // Поэтому изменим логику get: для кастомных он будет формировать positions из сохраненных данных.

        const customs = game.settings.get(MODULE_ID, 'customFormations') || {};
        customs[id] = formation;
        await game.settings.set(MODULE_ID, 'customFormations', customs);
        ui.notifications.info(game.i18n.format('GROUP_POVUXA.Notifications.FormationSaved', { name }));
        return id;
    }

    /**
     * Применить шаблон к конкретным участникам (с учетом привязки по ID)
     * @param {Array} members - массив участников (с tokenId, actorId)
     * @param {string} formationId 
     * @returns {Array} - members с обновленными gridPos
     */
    static applyToMembers(members, formationId) {
        const formation = this.get(formationId);
        if (!formation) return members;

        const gridSize = canvas.grid.size;

        if (formation.isCustom) {
            // === ПОЛЬЗОВАТЕЛЬСКИЙ ШАБЛОН (ПРИВЯЗКА ПО ID) ===

            // 1. Создаем карту занятости позиций шаблона
            const assignedPositions = new Set();

            // 2. Сначала ставим тех, кто совпадает по ID
            for (const member of members) {
                // Ищем позицию для этого токена
                // Приоритет: tokenId -> actorId -> порядок

                const exactMatch = formation.positions.find(p => p.tokenId === member.tokenId);

                if (exactMatch) {
                    // console.log(`POVUXA | applyToMembers | Matched TokenID ${member.tokenId}`);
                    member.gridPos = {
                        x: Math.round(exactMatch.dx / gridSize),
                        y: Math.round(exactMatch.dy / gridSize)
                    };
                    assignedPositions.add(exactMatch);
                    member._assigned = true;
                    continue;
                }

                // Если нет точного совпадения, ищем по актеру (если это не уникальный NPC)
                const actorMatch = formation.positions.find(p => p.actorId === member.actorId && !assignedPositions.has(p));
                if (actorMatch) {
                    // console.log(`POVUXA | applyToMembers | Matched ActorID ${member.actorId}`);
                    member.gridPos = {
                        x: Math.round(actorMatch.dx / gridSize),
                        y: Math.round(actorMatch.dy / gridSize)
                    };
                    assignedPositions.add(actorMatch);
                    member._assigned = true;
                }
                // else { console.log(...) }
            }

            // 3. Расставляем оставшихся (кто не попал в свои слоты)
            // Берем оставшиеся свободные слоты шаблона
            const freeSlots = formation.positions.filter(p => !assignedPositions.has(p));
            // console.log(`POVUXA | applyToMembers | Free slots left: ${freeSlots.length}`);

            for (const member of members) {
                if (member._assigned) {
                    delete member._assigned;
                    continue;
                }

                if (freeSlots.length > 0) {
                    // Берем первый свободный слот
                    const slot = freeSlots.shift();
                    member.gridPos = {
                        x: Math.round(slot.dx / gridSize),
                        y: Math.round(slot.dy / gridSize)
                    };
                } else {
                    // Если слотов не хватило - ищем ближайшую свободную клетку
                    // Спиральный поиск от (0,0)
                    let placed = false;
                    // x, y от -2 до 2
                    // Простейший перебор по дистанции от центра
                    const spiral = [];
                    for (let d = 0; d <= 4; d++) { // dist (max 4 approx)
                        for (let x = -2; x <= 2; x++) {
                            for (let y = -2; y <= 2; y++) {
                                // Проверяем занятость
                                const isOccupied = members.some(m => m.gridPos && m.gridPos.x === x && m.gridPos.y === y) ||
                                    spiral.some(p => p.x === x && p.y === y); // (хотя мы только ищем)

                                // Мы ищем для ТЕКУЩЕГО member, считая, что предыдущие уже имеют gridPos
                                if (!isOccupied) {
                                    // Но нам нужно найти БЛИЖАЙШУЮ к исходной цели, но у нас нет цели.
                                    // Давайте просто заполнять пустые места сверху-вниз слева-направо или как угодно?
                                    // Пользователь просил "не трогать" или "рядом".
                                    // Если "не трогать" - у нас нет gridPos, и в UI он пропадет. Надо дать gridPos.
                                    spiral.push({ x, y, dist: Math.abs(x) + Math.abs(y) });
                                }
                            }
                        }
                    }

                    spiral.sort((a, b) => a.dist - b.dist);

                    // Берем первую свободную, перепроверяя, что она еще не занята (т.к. мы в цикле members)
                    const validSpot = spiral.find(s => !members.some(m => m !== member && m.gridPos && m.gridPos.x === s.x && m.gridPos.y === s.y));

                    if (validSpot) {
                        member.gridPos = { x: validSpot.x, y: validSpot.y };
                    } else {
                        // Ну совсем все занято
                        member.gridPos = { x: 0, y: 0 };
                    }
                }
            }

            return members;

        } else {
            // === СТАНДАРТНЫЙ ШАБЛОН (ГЕОМЕТРИЯ) ===
            // Используем старую логику apply, но привязываем к members

            // Генерируем "идеальные" позиции
            const idealPositions = formation.getPositions(members.length, gridSize, 0);

            // Просто назначаем по порядку (leaders first ideally, but members are sorted)
            for (let i = 0; i < members.length; i++) {
                if (idealPositions[i]) {
                    members[i].gridPos = {
                        x: Math.round(idealPositions[i].dx / gridSize),
                        y: Math.round(idealPositions[i].dy / gridSize)
                    };
                }
            }

            return members;
        }
    }

    /**
     * Удалить пользовательский шаблон
     * @param {string} id 
     */
    static async deleteFormation(id) {
        const customs = game.settings.get(MODULE_ID, 'customFormations') || {};
        if (customs[id]) {
            delete customs[id];
            await game.settings.set(MODULE_ID, 'customFormations', customs);
            ui.notifications.info(game.i18n.localize('GROUP_POVUXA.Notifications.FormationDeleted'));
        }
    }

    /**
     * Применить шаблон к найденным позициям
     * 
     * @param {string} formationId - ID шаблона
     * @param {Array} availablePositions - Доступные позиции от TokenPlacer
     * @param {number} direction - Угол направления (0 = север)
     * @returns {Array} - Отсортированные позиции по шаблону
     */
    static apply(formationId, availablePositions, direction = 0) {
        const formation = this.FORMATIONS[formationId];
        if (!formation || availablePositions.length === 0) {
            return availablePositions;
        }

        const gridSize = canvas.grid.size;
        const count = availablePositions.length;

        // Получаем идеальные относительные позиции для шаблона
        const idealPositions = formation.getPositions(count, gridSize, direction);

        // Центр (первая позиция)
        const center = availablePositions[0];

        // Для каждой идеальной позиции находим ближайшую доступную
        const result = [];
        const usedPositions = new Set();

        for (const ideal of idealPositions) {
            const targetX = center.x + ideal.dx;
            const targetY = center.y + ideal.dy;

            // Ищем ближайшую свободную позицию к идеальной
            let bestMatch = null;
            let bestDistance = Infinity;

            for (let i = 0; i < availablePositions.length; i++) {
                if (usedPositions.has(i)) continue;

                const pos = availablePositions[i];
                const distance = Math.hypot(pos.x - targetX, pos.y - targetY);

                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestMatch = i;
                }
            }

            if (bestMatch !== null) {
                result.push(availablePositions[bestMatch]);
                usedPositions.add(bestMatch);
            }
        }

        // Добавляем оставшиеся позиции (если шаблон не покрыл все)
        for (let i = 0; i < availablePositions.length; i++) {
            if (!usedPositions.has(i)) {
                result.push(availablePositions[i]);
            }
        }

        return result;
    }

    /**
     * Повернуть позиции на заданный угол
     * 
     * @param {Array} positions - Относительные позиции
     * @param {number} directionDegrees - Угол в градусах (0 = север, 90 = восток)
     * @returns {Array}
     */
    static _rotatePositions(positions, directionDegrees) {
        if (directionDegrees === 0) return positions;

        const radians = (directionDegrees * Math.PI) / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);

        return positions.map(pos => ({
            dx: Math.round(pos.dx * cos - pos.dy * sin),
            dy: Math.round(pos.dx * sin + pos.dy * cos),
            order: pos.order
        }));
    }
}
