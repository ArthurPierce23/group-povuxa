/**
 * TokenPlacer — Smart token placement algorithm
 *
 * Uses BFS (Breadth-First Search) to find available positions
 * respecting walls, token collisions, and scene boundaries.
 *
 * Wall safety is ensured by:
 * 1. Stepwise cell-to-cell checks (no long-distance ray skipping walls)
 * 2. Diagonal movement requires at least one orthogonal path clear
 * 3. Reachability set pre-computation for grid position validation
 *
 * Requires Foundry VTT v13+
 */

import { MODULE_ID } from './main.js';

export class TokenPlacer {

    /**
     * Find valid positions for placing tokens using BFS flood-fill.
     * Returns positions that are:
     * - Reachable from center without crossing walls (stepwise)
     * - Not occupied by other tokens
     * - Within scene boundaries
     *
     * @param {number} centerX - Center X coordinate (typically party token center)
     * @param {number} centerY - Center Y coordinate
     * @param {number} count - Number of positions to find
     * @param {Object} options
     * @param {string[]} [options.excludeTokens] - Token IDs to ignore in occupancy checks
     * @returns {Array<{x: number, y: number, distance: number}>}
     */
    static findValidPositions(centerX, centerY, count, options = {}) {
        const gridSize = canvas.grid.size;
        const validPositions = [];
        const visited = new Set();

        const queue = [{ x: centerX, y: centerY, distance: 0 }];

        // 4 cardinal + 4 diagonal directions
        const directions = [
            { dx: 0, dy: -1, diagonal: false },   // N
            { dx: 1, dy: 0, diagonal: false },     // E
            { dx: 0, dy: 1, diagonal: false },     // S
            { dx: -1, dy: 0, diagonal: false },    // W
            { dx: 1, dy: -1, diagonal: true },     // NE
            { dx: 1, dy: 1, diagonal: true },      // SE
            { dx: -1, dy: 1, diagonal: true },     // SW
            { dx: -1, dy: -1, diagonal: true }     // NW
        ];

        const maxIterations = Math.max(2000, count * 500);
        let iterations = 0;

        while (queue.length > 0 && validPositions.length < count && iterations < maxIterations) {
            iterations++;
            const current = queue.shift();
            const key = `${Math.round(current.x)},${Math.round(current.y)}`;

            if (visited.has(key)) continue;
            visited.add(key);

            if (!this.isWithinSceneBounds(current.x, current.y)) continue;

            const occupied = this.isPositionOccupied(current.x, current.y, options.excludeTokens || []);

            if (!occupied) {
                validPositions.push({
                    x: current.x,
                    y: current.y,
                    distance: current.distance
                });
            }

            // Expand to neighbors — check walls for each step
            for (const dir of directions) {
                const nextX = current.x + dir.dx * gridSize;
                const nextY = current.y + dir.dy * gridSize;
                const nextKey = `${Math.round(nextX)},${Math.round(nextY)}`;

                if (visited.has(nextKey)) continue;

                // For diagonal movement, require at least one orthogonal neighbor to be reachable
                // This prevents cutting corners through walls (D&D 5e movement rule)
                if (dir.diagonal) {
                    const ortho1Clear = this._isStepClear(current.x, current.y, current.x + dir.dx * gridSize, current.y);
                    const ortho2Clear = this._isStepClear(current.x, current.y, current.x, current.y + dir.dy * gridSize);
                    if (!ortho1Clear && !ortho2Clear) continue;
                }

                // Check direct wall collision between adjacent cells
                if (!this._isStepClear(current.x, current.y, nextX, nextY)) continue;

                queue.push({
                    x: nextX,
                    y: nextY,
                    distance: current.distance + 1
                });
            }
        }

        validPositions.sort((a, b) => a.distance - b.distance);
        return validPositions;
    }

    /**
     * Build a Set of all reachable cell coordinates from a center point.
     * Used to validate grid-based positions — if a cell isn't in this set,
     * it's behind a wall and must not be used.
     *
     * @param {number} centerX
     * @param {number} centerY
     * @param {number} maxCells - Maximum cells to explore
     * @returns {Set<string>} Set of "x,y" keys (center coordinates)
     */
    static buildReachableSet(centerX, centerY, maxCells = 200) {
        const gridSize = canvas.grid.size;
        const reachable = new Set();
        const visited = new Set();

        const queue = [{ x: centerX, y: centerY }];

        const directions = [
            { dx: 0, dy: -1, diagonal: false },
            { dx: 1, dy: 0, diagonal: false },
            { dx: 0, dy: 1, diagonal: false },
            { dx: -1, dy: 0, diagonal: false },
            { dx: 1, dy: -1, diagonal: true },
            { dx: 1, dy: 1, diagonal: true },
            { dx: -1, dy: 1, diagonal: true },
            { dx: -1, dy: -1, diagonal: true }
        ];

        let iterations = 0;

        while (queue.length > 0 && iterations < maxCells) {
            iterations++;
            const current = queue.shift();
            const key = `${Math.round(current.x)},${Math.round(current.y)}`;

            if (visited.has(key)) continue;
            visited.add(key);

            if (!this.isWithinSceneBounds(current.x, current.y)) continue;

            reachable.add(key);

            for (const dir of directions) {
                const nextX = current.x + dir.dx * gridSize;
                const nextY = current.y + dir.dy * gridSize;
                const nextKey = `${Math.round(nextX)},${Math.round(nextY)}`;

                if (visited.has(nextKey)) continue;

                if (dir.diagonal) {
                    const ortho1Clear = this._isStepClear(current.x, current.y, current.x + dir.dx * gridSize, current.y);
                    const ortho2Clear = this._isStepClear(current.x, current.y, current.x, current.y + dir.dy * gridSize);
                    if (!ortho1Clear && !ortho2Clear) continue;
                }

                if (!this._isStepClear(current.x, current.y, nextX, nextY)) continue;

                queue.push({ x: nextX, y: nextY });
            }
        }

        return reachable;
    }

    /**
     * Check if a single step between two adjacent cells is clear of walls.
     * Uses 3-ray fan: center-to-center + center-to-edges for robustness.
     *
     * @param {number} fromX - Source cell center X
     * @param {number} fromY - Source cell center Y
     * @param {number} toX - Target cell center X
     * @param {number} toY - Target cell center Y
     * @returns {boolean} true if step is clear
     * @private
     */
    static _isStepClear(fromX, fromY, toX, toY) {
        if (Math.abs(fromX - toX) < 1 && Math.abs(fromY - toY) < 1) return true;

        try {
            // Primary ray: center to center
            const ray = new foundry.canvas.geometry.Ray(
                { x: fromX, y: fromY },
                { x: toX, y: toY }
            );
            if (CONFIG.Canvas.polygonBackends.move.testCollision(ray.A, ray.B, { mode: 'any', type: 'move' })) return false;

            // Secondary rays: fan out to catch walls at cell edges
            // Perpendicular offset = half grid, scaled down for adjacent-cell testing
            const gridSize = canvas.grid.size;
            const offset = gridSize * 0.35; // 35% of grid to cover most of cell width
            const dx = toX - fromX;
            const dy = toY - fromY;
            const len = Math.sqrt(dx * dx + dy * dy);

            if (len > 0) {
                // Perpendicular unit vector
                const perpX = -dy / len * offset;
                const perpY = dx / len * offset;

                // Left fan ray
                const rayL = new foundry.canvas.geometry.Ray(
                    { x: fromX + perpX, y: fromY + perpY },
                    { x: toX + perpX, y: toY + perpY }
                );
                if (CONFIG.Canvas.polygonBackends.move.testCollision(rayL.A, rayL.B, { mode: 'any', type: 'move' })) return false;

                // Right fan ray
                const rayR = new foundry.canvas.geometry.Ray(
                    { x: fromX - perpX, y: fromY - perpY },
                    { x: toX - perpX, y: toY - perpY }
                );
                if (CONFIG.Canvas.polygonBackends.move.testCollision(rayR.A, rayR.B, { mode: 'any', type: 'move' })) return false;
            }

            return true;
        } catch (e) {
            console.warn(`${MODULE_ID} | _isStepClear error:`, e);
            return true; // Fail open
        }
    }

    /**
     * Legacy method kept for backward compatibility with external callers.
     * Prefer _isStepClear for adjacent cell checks and buildReachableSet for
     * validating positions.
     *
     * @param {number} fromX
     * @param {number} fromY
     * @param {number} toX
     * @param {number} toY
     * @returns {boolean}
     */
    static isPathClear(fromX, fromY, toX, toY) {
        if (Math.abs(fromX - toX) < 1 && Math.abs(fromY - toY) < 1) return true;

        try {
            const ray = new foundry.canvas.geometry.Ray(
                { x: fromX, y: fromY },
                { x: toX, y: toY }
            );
            return !CONFIG.Canvas.polygonBackends.move.testCollision(ray.A, ray.B, { mode: 'any', type: 'move' });
        } catch (e) {
            console.warn(`${MODULE_ID} | isPathClear error:`, e);
            return true;
        }
    }

    /**
     * Check if a position is occupied by another token.
     *
     * @param {number} x - Center X of the position to check
     * @param {number} y - Center Y of the position to check
     * @param {string[]} excludeTokens - Token IDs to exclude
     * @returns {boolean} true if occupied
     */
    static isPositionOccupied(x, y, excludeTokens = []) {
        const gridSize = canvas.grid.size;
        const halfGrid = gridSize / 2;

        for (const token of canvas.tokens.placeables) {
            if (excludeTokens.includes(token.id)) continue;

            const tokenLeft = token.x;
            const tokenRight = token.x + token.w;
            const tokenTop = token.y;
            const tokenBottom = token.y + token.h;

            const checkLeft = x - halfGrid + 5;
            const checkRight = x + halfGrid - 5;
            const checkTop = y - halfGrid + 5;
            const checkBottom = y + halfGrid - 5;

            const overlapsX = checkLeft < tokenRight && checkRight > tokenLeft;
            const overlapsY = checkTop < tokenBottom && checkBottom > tokenTop;

            if (overlapsX && overlapsY) return true;
        }

        return false;
    }

    /**
     * Snap coordinates to grid center point.
     * @param {number} x
     * @param {number} y
     * @returns {{x: number, y: number}}
     */
    static snapToGrid(x, y) {
        const snapped = canvas.grid.getSnappedPoint(
            { x, y },
            { mode: CONST.GRID_SNAPPING_MODES.CENTER }
        );
        return { x: snapped.x, y: snapped.y };
    }

    /**
     * Snap coordinates to the top-left corner of the nearest grid cell.
     * @param {number} x
     * @param {number} y
     * @returns {{x: number, y: number}}
     */
    static snapToTopLeft(x, y) {
        if (x === undefined || y === undefined || isNaN(x) || isNaN(y)) {
            console.warn(`${MODULE_ID} | snapToTopLeft: invalid coordinates (${x}, ${y})`);
            return { x: x || 0, y: y || 0 };
        }

        try {
            const topLeft = canvas.grid.getTopLeftPoint({ x, y });
            return { x: topLeft.x, y: topLeft.y };
        } catch (e) {
            const gridSize = canvas.grid.size;
            return {
                x: Math.round(x / gridSize) * gridSize,
                y: Math.round(y / gridSize) * gridSize
            };
        }
    }

    /**
     * Check if a position is within scene boundaries.
     * @param {number} x
     * @param {number} y
     * @returns {boolean}
     */
    static isWithinSceneBounds(x, y) {
        const scene = canvas.scene;
        if (!scene) return true;

        const d = canvas.dimensions;
        return x >= d.sceneX && y >= d.sceneY
            && x < d.sceneX + d.sceneWidth
            && y < d.sceneY + d.sceneHeight;
    }
}
