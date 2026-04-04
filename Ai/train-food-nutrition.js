/**
 * GlucoCare - Food Nutrition Trainer
 * ---------------------------------
 * Aggregates indian_food_nutrition_550_dataset.csv into trained per-food
 * nutrition values and saves them to Ai/food-nutrition-model.json.
 *
 * Usage: node Ai/train-food-nutrition.js
 */

const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '..', 'indian_food_nutrition_550_dataset.csv');
const MODEL_PATH = path.join(__dirname, 'food-nutrition-model.json');

function splitCSVLine(line) {
    const out = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];

        if (ch === '"') {
            // Escaped quote inside a quoted field
            if (inQuotes && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (ch === ',' && !inQuotes) {
            out.push(cur);
            cur = '';
            continue;
        }

        cur += ch;
    }

    out.push(cur);
    return out;
}

function parseCSV(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/).filter(line => line.trim().length > 0);

    if (lines.length < 2) {
        throw new Error('CSV is empty or missing rows.');
    }

    const headers = splitCSVLine(lines[0]).map(h => h.trim());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        const cols = splitCSVLine(lines[i]);
        if (cols.length !== headers.length) continue;

        const row = {};
        for (let c = 0; c < headers.length; c++) {
            row[headers[c]] = (cols[c] || '').trim();
        }
        rows.push(row);
    }

    return rows;
}

function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function clampNonNegative(value) {
    return Math.max(0, value);
}

function round1(value) {
    return Math.round(value * 10) / 10;
}

function normalizeFoodKey(foodName) {
    return String(foodName || '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '_')
        .replace(/-/g, '_')
        .replace(/_\d+$/, '');
}

function pickMostFrequentUnit(unitCounts) {
    let winner = '1 serving';
    let bestCount = -1;

    for (const [unit, count] of Object.entries(unitCounts)) {
        if (count > bestCount) {
            winner = unit;
            bestCount = count;
        }
    }

    return winner;
}

function aggregateFoodNutrition(rows) {
    const grouped = {};

    for (const row of rows) {
        const key = normalizeFoodKey(row.food_name);
        if (!key) continue;

        if (!grouped[key]) {
            grouped[key] = {
                count: 0,
                cal: 0,
                carb: 0,
                protein: 0,
                fat: 0,
                fiber: 0,
                gi: 0,
                serving: 0,
                unitCounts: {},
            };
        }

        const g = grouped[key];
        g.count += 1;

        g.cal += clampNonNegative(toNumber(row.calories_kcal));
        g.carb += clampNonNegative(toNumber(row.carbs_g));
        g.protein += clampNonNegative(toNumber(row.protein_g));
        g.fat += clampNonNegative(toNumber(row.fat_g));
        g.fiber += clampNonNegative(toNumber(row.fiber_g));

        const gi = toNumber(row.glycemic_index, 0);
        g.gi += Math.min(100, Math.max(0, gi));

        const serving = toNumber(row.serving_size_g, 0);
        g.serving += serving > 0 ? serving : 0;

        const unit = row.unit || '1 serving';
        g.unitCounts[unit] = (g.unitCounts[unit] || 0) + 1;
    }

    const foods = {};
    for (const [key, agg] of Object.entries(grouped)) {
        if (!agg.count) continue;

        foods[key] = {
            cal: Math.round(agg.cal / agg.count),
            carb: round1(agg.carb / agg.count),
            protein: round1(agg.protein / agg.count),
            fat: round1(agg.fat / agg.count),
            fiber: round1(agg.fiber / agg.count),
            gi: Math.round(agg.gi / agg.count),
            serving: Math.round((agg.serving || 0) / agg.count) || 100,
            unit: pickMostFrequentUnit(agg.unitCounts),
        };
    }

    return foods;
}

function main() {
    console.log('==============================================');
    console.log('  GlucoCare Food Nutrition Trainer');
    console.log('==============================================\n');

    if (!fs.existsSync(CSV_PATH)) {
        throw new Error(`Dataset not found: ${CSV_PATH}`);
    }

    console.log(`Loading dataset: ${CSV_PATH}`);
    const rows = parseCSV(CSV_PATH);
    console.log(`Rows loaded: ${rows.length}`);

    const foods = aggregateFoodNutrition(rows);
    const keys = Object.keys(foods).sort();

    if (keys.length === 0) {
        throw new Error('No valid food rows found in dataset.');
    }

    const model = {
        version: 1,
        modelType: 'food_nutrition_aggregated_means',
        sourceFile: path.basename(CSV_PATH),
        trainedAt: new Date().toISOString(),
        totalRows: rows.length,
        foodCount: keys.length,
        foods,
    };

    fs.writeFileSync(MODEL_PATH, JSON.stringify(model, null, 2));

    console.log(`Foods aggregated: ${keys.length}`);
    console.log(`Model saved: ${MODEL_PATH}\n`);

    console.log('Preview of trained foods:');
    for (const key of keys.slice(0, 12)) {
        const f = foods[key];
        console.log(`- ${key}: cal=${f.cal}, carb=${f.carb}, protein=${f.protein}, fat=${f.fat}, fiber=${f.fiber}, gi=${f.gi}, serving=${f.serving}`);
    }

    console.log('\nTraining complete.');
}

main();
