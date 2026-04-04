/**
 * GlucoCare+ Meal Parser
 * ──────────────────────
 * Parses natural-language Indian meal descriptions like:
 *   "2 idli, sambar, tea without sugar"
 *   "3 chapati dal chawal"
 *   "1 plate chole bhature and lassi"
 *
 * Returns per-item nutrition breakdown + totals.
 */

const { INDIAN_FOOD_DB, FOOD_ALIASES } = require('./indian-food-nutrition');

// ── Helpers ─────────────────────────────────────────────────────────

/** Normalize input text for matching */
function normalize(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[''""]/g, '')
        .replace(/\bwithout\s+sugar\b/g, '_without_sugar')
        .replace(/\bno\s+sugar\b/g, '_without_sugar')
        .replace(/\bsugar\s+free\b/g, '_without_sugar')
        .replace(/\bbina\s+cheeni\b/g, '_without_sugar')
        .replace(/\bwith\s+butter\b/g, '_with_butter')
        .replace(/\bwith\s+ghee\b/g, '_with_ghee')
        .replace(/\bplain\s+/g, '')
        .replace(/[^a-z0-9_\s.,]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Resolve a food name to its canonical DB key */
function resolveKey(token) {
    const key = token.replace(/\s+/g, '_');
    if (INDIAN_FOOD_DB[key]) return key;
    if (FOOD_ALIASES[key]) return FOOD_ALIASES[key];

    // Try without trailing 's' (plurals)
    const singular = key.replace(/_?s$/, '');
    if (INDIAN_FOOD_DB[singular]) return singular;
    if (FOOD_ALIASES[singular]) return FOOD_ALIASES[singular];

    return null;
}

/**
 * Number words in Hindi/English
 */
const NUMBER_WORDS = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    'eleven': 11, 'twelve': 12,
    'half': 0.5, 'quarter': 0.25,
    'ek': 1, 'do': 2, 'teen': 3, 'char': 4, 'paanch': 5,
    'chhe': 6, 'saat': 7, 'aath': 8, 'nau': 9, 'das': 10,
    'aadha': 0.5, 'aadhi': 0.5,
};

/** Plate/bowl multiplier words */
const PLATE_WORDS = new Set([
    'plate', 'plates', 'bowl', 'bowls', 'katori', 'katoris',
    'glass', 'glasses', 'cup', 'cups', 'serving', 'servings',
    'piece', 'pieces', 'slice', 'slices',
]);

/** Skip words that appear between items */
const SKIP_WORDS = new Set([
    'and', 'with', 'aur', 'ke', 'ka', 'ki', 'or', 'also',
    'plus', 'some', 'little', 'bit', 'of', 'the', 'a', 'an',
    'on',
]);

/**
 * Parse a meal description into individual food items with quantities.
 *
 * @param {string} text - Natural language meal description
 * @returns {{ items: Array<{name, key, qty, cal, carb, protein, fat, fiber, gi, unit}>, totals: {cal, carb, protein, fat, fiber}, raw: string }}
 */
function parseMeal(text) {
    const raw = String(text || '').trim();
    if (!raw) return { items: [], totals: { cal: 0, carb: 0, protein: 0, fat: 0, fiber: 0 }, raw };

    const cleaned = normalize(raw);

    // Split by comma, 'and', 'aur', 'or', '+', semicolon
    const segments = cleaned.split(/[,;+]|\band\b|\baur\b|\bor\b/).map(s => s.trim()).filter(Boolean);

    const items = [];
    const totals = { cal: 0, carb: 0, protein: 0, fat: 0, fiber: 0 };

    for (const segment of segments) {
        const parsed = parseSegment(segment);
        if (parsed.length > 0) {
            for (const item of parsed) {
                items.push(item);
                totals.cal += item.cal;
                totals.carb += item.carb;
                totals.protein += item.protein;
                totals.fat += item.fat;
                totals.fiber += item.fiber;
            }
        }
    }

    // Round totals
    totals.cal = Math.round(totals.cal);
    totals.carb = Math.round(totals.carb);
    totals.protein = Math.round(totals.protein);
    totals.fat = Math.round(totals.fat);
    totals.fiber = Math.round(totals.fiber * 10) / 10;

    return { items, totals, raw };
}

/**
 * Parse a single segment like "2 idli" or "dal chawal" or "3 chapati with ghee"
 */
function parseSegment(segment) {
    const tokens = segment.split(/\s+/).filter(Boolean);
    const results = [];

    let i = 0;
    while (i < tokens.length) {
        // Skip filler words
        if (SKIP_WORDS.has(tokens[i])) { i++; continue; }

        // Try to extract quantity
        let qty = 1;
        let qtyFound = false;

        // Check for numeric quantity
        if (/^\d+(\.\d+)?$/.test(tokens[i])) {
            qty = parseFloat(tokens[i]);
            qtyFound = true;
            i++;
        } else if (NUMBER_WORDS[tokens[i]] !== undefined) {
            qty = NUMBER_WORDS[tokens[i]];
            qtyFound = true;
            i++;
        }

        // Skip plate/bowl words after quantity
        if (i < tokens.length && PLATE_WORDS.has(tokens[i])) {
            i++;
        }
        if (i < tokens.length && tokens[i] === 'of') {
            i++;
        }

        // Skip filler again
        while (i < tokens.length && SKIP_WORDS.has(tokens[i])) { i++; }

        if (i >= tokens.length) break;

        // Try multi-word food names (up to 4 words)
        let matched = null;
        let matchLen = 0;

        for (let len = Math.min(4, tokens.length - i); len >= 1; len--) {
            const candidate = tokens.slice(i, i + len).join(' ');
            const key = resolveKey(candidate);
            if (key) {
                matched = key;
                matchLen = len;
                break;
            }
        }

        if (matched) {
            const food = INDIAN_FOOD_DB[matched];

            // Check for modifiers after the food name
            let modifier = null;
            const afterIdx = i + matchLen;
            if (afterIdx < tokens.length) {
                const next = tokens[afterIdx];
                if (next === '_without_sugar' || next === '_with_butter' || next === '_with_ghee') {
                    modifier = next;
                    matchLen++;
                }
            }

            let itemCal = food.cal * qty;
            let itemCarb = food.carb * qty;
            let itemProtein = food.protein * qty;
            let itemFat = food.fat * qty;
            let itemFiber = food.fiber * qty;

            // Apply modifiers
            if (modifier === '_without_sugar') {
                // Reduce ~20 cal and ~5g carbs for sugar removal
                itemCal = Math.max(0, itemCal - (20 * qty));
                itemCarb = Math.max(0, itemCarb - (5 * qty));
            } else if (modifier === '_with_butter') {
                itemCal += 36 * qty;
                itemFat += 4 * qty;
            } else if (modifier === '_with_ghee') {
                itemCal += 45 * qty;
                itemFat += 5 * qty;
            }

            const displayName = buildDisplayName(matched, qty, modifier);

            results.push({
                name: displayName,
                key: matched,
                qty: qty,
                cal: Math.round(itemCal),
                carb: Math.round(itemCarb),
                protein: Math.round(itemProtein),
                fat: Math.round(itemFat),
                fiber: Math.round(itemFiber * 10) / 10,
                gi: food.gi,
                unit: food.unit,
            });

            i += matchLen;
        } else {
            // Unknown food — skip this token
            i++;
        }
    }

    return results;
}

function buildDisplayName(key, qty, modifier) {
    let name = key.replace(/_/g, ' ');
    name = name.charAt(0).toUpperCase() + name.slice(1);

    if (modifier === '_without_sugar') name += ' (no sugar)';
    else if (modifier === '_with_butter') name += ' (with butter)';
    else if (modifier === '_with_ghee') name += ' (with ghee)';

    if (qty !== 1) {
        return qty + '× ' + name;
    }
    return name;
}

/**
 * Quick estimate: returns just { calories, carbs } for form auto-fill.
 */
function estimateNutrition(text) {
    const result = parseMeal(text);

    let gi = null;
    const giWeighted = result.items
        .filter((item) => Number.isFinite(Number(item.gi)) && Number.isFinite(Number(item.carb)) && Number(item.carb) > 0);
    if (giWeighted.length > 0) {
        const giCarbSum = giWeighted.reduce((sum, item) => sum + (Number(item.gi) * Number(item.carb)), 0);
        const carbWeight = giWeighted.reduce((sum, item) => sum + Number(item.carb), 0);
        gi = carbWeight > 0 ? Number((giCarbSum / carbWeight).toFixed(1)) : null;
    }

    const serving = Number(result.items.reduce((sum, item) => sum + Math.max(0, Number(item.qty) || 0), 0).toFixed(1));
    const servingText = result.items
        .slice(0, 6)
        .map((item) => item.name)
        .join(', ');

    return {
        calories: result.totals.cal,
        carbs: result.totals.carb,
        protein: result.totals.protein,
        fat: result.totals.fat,
        fiber: result.totals.fiber,
        gi: gi,
        serving: serving,
        servingText: servingText || null,
        itemCount: result.items.length,
        items: result.items,
    };
}

module.exports = { parseMeal, estimateNutrition, resolveKey, normalize };
