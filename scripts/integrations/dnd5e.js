/**
 * D&D 5e интеграция для Group Po'Vuxa
 * 
 * Добавляет специфичные для D&D 5e фичи:
 * - Passive Perception группы
 * - Групповые проверки навыков (Stealth)
 * - Скорость группы = минимальная
 * - Истощение влияет на скорость
 */

import { MODULE_ID } from '../main.js';

export class DnD5eIntegration {

    /**
     * Проверить, активна ли система D&D 5e
     */
    static isActive() {
        return game.system.id === 'dnd5e';
    }

    /**
     * Инициализация интеграции
     */
    static init() {
        if (!this.isActive()) {
            console.log(`${MODULE_ID} | D&D 5e не обнаружена, интеграция отключена`);
            return;
        }

        console.log(`${MODULE_ID} | Инициализация D&D 5e интеграции`);

        // Регистрируем дополнительные хуки
        Hooks.on('updateActor', this._onActorUpdate.bind(this));
    }

    /**
     * Вычислить лучший Passive Perception группы
     * @param {Array} members - Участники группы
     * @returns {number}
     */
    static getGroupPassivePerception(members) {
        if (!this.isActive()) return 10;

        let maxPP = 10;

        for (const member of members) {
            const actor = game.actors.get(member.actorId);
            if (!actor) continue;

            // В D&D 5e Passive Perception = 10 + модификатор Wisdom + бонус мастерства (если есть)
            const perception = actor.system.skills?.prc;
            if (perception) {
                const passivePerception = 10 + perception.mod + (perception.prof || 0);
                if (passivePerception > maxPP) {
                    maxPP = passivePerception;
                }
            }
        }

        return maxPP;
    }

    /**
     * Вычислить минимальную скорость группы
     * @param {Array} members - Участники группы
     * @returns {number} - Скорость в футах
     */
    static getGroupSpeed(members) {
        if (!this.isActive()) return 30;

        let minSpeed = Infinity;

        for (const member of members) {
            const actor = game.actors.get(member.actorId);
            if (!actor) continue;

            // Базовая скорость
            let speed = actor.system.attributes?.movement?.walk || 30;

            // Учитываем истощение (exhaustion)
            const exhaustion = actor.system.attributes?.exhaustion || 0;
            if (exhaustion >= 2) {
                speed = speed / 2; // Уровень 2+: скорость уменьшена вдвое
            }
            if (exhaustion >= 5) {
                speed = 0; // Уровень 5: скорость 0
            }

            if (speed < minSpeed) {
                minSpeed = speed;
            }
        }

        return minSpeed === Infinity ? 30 : minSpeed;
    }

    /**
     * Выполнить групповую проверку навыка
     * @param {Array} members - Участники группы
     * @param {string} skillId - ID навыка (например, 'ste' для Stealth)
     * @returns {Object} - Результаты бросков
     */
    static async rollGroupSkillCheck(members, skillId) {
        if (!this.isActive()) return null;

        const results = [];

        for (const member of members) {
            const actor = game.actors.get(member.actorId);
            if (!actor) continue;

            try {
                // Бросок навыка
                const roll = await actor.rollSkill(skillId, {
                    chatMessage: false,
                    fastForward: true
                });

                results.push({
                    actorId: member.actorId,
                    name: member.name,
                    total: roll.total,
                    roll: roll
                });
            } catch (e) {
                console.warn(`${MODULE_ID} | Ошибка броска для ${member.name}:`, e);
            }
        }

        // Сортируем по результату
        results.sort((a, b) => a.total - b.total);

        return {
            results,
            worst: results[0],
            best: results[results.length - 1],
            average: results.reduce((sum, r) => sum + r.total, 0) / results.length
        };
    }

    /**
     * Выполнить групповой бросок Stealth
     * @param {Array} members - Участники группы
     * @param {boolean} postToChat - Отправить результат в чат
     */
    static async rollGroupStealth(members, postToChat = true) {
        const result = await this.rollGroupSkillCheck(members, 'ste');
        if (!result) return null;

        if (postToChat) {
            // Создаём красивое сообщение в чат
            const content = await renderTemplate(
                `modules/${MODULE_ID}/templates/stealth-result.hbs`,
                {
                    results: result.results,
                    worst: result.worst,
                    best: result.best,
                    average: Math.round(result.average)
                }
            );

            await ChatMessage.create({
                speaker: { alias: game.i18n.localize('GROUP_POVUXA.Stealth.Title') },
                content: content,
                type: CONST.CHAT_MESSAGE_TYPES.OTHER
            });
        }

        return result;
    }

    /**
     * Получить лучшее тёмное зрение группы
     * @param {Array} members - Участники группы
     * @returns {number} - Дальность в футах
     */
    static getBestDarkvision(members) {
        if (!this.isActive()) return 0;

        let maxDarkvision = 0;

        for (const member of members) {
            const actor = game.actors.get(member.actorId);
            if (!actor) continue;

            const darkvision = actor.system.attributes?.senses?.darkvision || 0;
            if (darkvision > maxDarkvision) {
                maxDarkvision = darkvision;
            }
        }

        return maxDarkvision;
    }

    /**
     * Проверить, есть ли в группе источники света
     * @param {Array} members - Участники группы
     * @returns {Array} - Источники света
     */
    static getLightSources(members) {
        if (!this.isActive()) return [];

        const lightSources = [];

        for (const member of members) {
            const actor = game.actors.get(member.actorId);
            if (!actor) continue;

            // Проверяем предметы с активным светом
            for (const item of actor.items) {
                const light = item.system?.light;
                if (light && (light.dim > 0 || light.bright > 0)) {
                    // Проверяем, активен ли предмет (экипирован и т.д.)
                    if (item.system.equipped || item.system.attunement === 2) {
                        lightSources.push({
                            actorId: member.actorId,
                            actorName: member.name,
                            itemName: item.name,
                            dim: light.dim,
                            bright: light.bright
                        });
                    }
                }
            }
        }

        return lightSources;
    }

    /**
     * Хук на обновление актёра — обновить токен группы если участник изменился
     */
    static _onActorUpdate(actor, changes, options, userId) {
        // Проверяем, есть ли активная группа с этим актёром
        const partyData = game.groupPovuxa?.manager?.getPartyData();
        if (!partyData) return;

        const isMember = partyData.members.some(m => m.actorId === actor.id);
        if (!isMember) return;

        // Обновляем характеристики токена группы
        // TODO: Реализовать пересчёт зрения/света при изменении актёра
    }

    /**
     * Получить сводку характеристик группы для отображения в UI
     * @param {Array} members - Участники группы
     * @returns {Object}
     */
    static getGroupSummary(members) {
        if (!this.isActive()) return null;

        return {
            passivePerception: this.getGroupPassivePerception(members),
            speed: this.getGroupSpeed(members),
            darkvision: this.getBestDarkvision(members),
            lightSources: this.getLightSources(members),
            membersWithExhaustion: members.filter(m => {
                const actor = game.actors.get(m.actorId);
                return actor && (actor.system.attributes?.exhaustion > 0);
            }).length
        };
    }
}

// Автоматическая инициализация при загрузке
Hooks.once('ready', () => {
    DnD5eIntegration.init();
});
