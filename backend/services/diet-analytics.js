const { getDb } = require('../database');

const DIET_MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
const DIET_SUGAR_TIMINGS = ['before', 'after', 'random'];
const DIET_SLOT_LABELS = {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snack: 'Snack',
};

const DIET_TRIGGER_FOOD_PATTERNS = [
    {
        key: 'refined-rice',
        label: 'Large refined rice portions',
        swap: 'Switch part of the rice portion to salad, dal, or millet.',
        pattern: /\b(white\s+rice|refined\s+rice|fried\s+rice|biryani|pulao|noodles?)\b/i,
    },
    {
        key: 'sweets-dessert',
        label: 'Sweets and desserts',
        swap: 'Use a small fruit portion with nuts instead of sweets.',
        pattern: /\b(sweet|sweets|dessert|mithai|cake|pastry|jalebi|gulab\s*jamun|ice\s*cream|chocolate)\b/i,
    },
    {
        key: 'sugary-drinks',
        label: 'Sugary drinks',
        swap: 'Replace sugary drinks with water, chaas, or unsweetened tea.',
        pattern: /\b(juice|cola|soda|soft\s*drink|sweet\s*tea|sweet\s*coffee|milkshake|energy\s*drink)\b/i,
    },
    {
        key: 'fried-snacks',
        label: 'Fried snacks',
        swap: 'Choose roasted chana, sprouts, or baked snacks over fried items.',
        pattern: /\b(samosa|pakora|chips|fries|fried|bhatura|puri)\b/i,
    },
    {
        key: 'refined-flour',
        label: 'Refined flour (maida) foods',
        swap: 'Use whole grain or millet options instead of maida products.',
        pattern: /\b(maida|white\s*bread|naan|burger|pizza|pasta)\b/i,
    },
];

const db = {
    prepare: (...args) => getDb().prepare(...args),
};

function mapDietIntakeRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        _id: row.id,
        patientId: row.patient_id,
        mealSlot: row.meal_slot,
        intakeText: row.intake_text,
        bloodSugarMgDl: row.blood_sugar_mgdl !== null && row.blood_sugar_mgdl !== undefined
            ? Number(row.blood_sugar_mgdl)
            : null,
        sugarTiming: row.sugar_timing || null,
        carbsG: row.carbs_g !== null && row.carbs_g !== undefined ? Number(row.carbs_g) : null,
        calories: row.calories !== null && row.calories !== undefined ? Number(row.calories) : null,
        note: row.note || null,
        loggedAt: row.logged_at,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

function buildDietDateRange(days) {
    const rangeDays = Math.max(1, Number(days || 7));
    const since = new Date();
    since.setDate(since.getDate() - rangeDays);
    return {
        rangeDays,
        sinceIso: since.toISOString(),
    };
}

function detectDietTriggers(text) {
    const value = String(text || '');
    if (!value.trim()) return [];

    return DIET_TRIGGER_FOOD_PATTERNS
        .filter((item) => item.pattern.test(value))
        .map((item) => ({
            key: item.key,
            label: item.label,
            swap: item.swap,
        }));
}

function parseReportJsonObject(row) {
    if (!row || !row.parsed_json) return null;
    try {
        const parsed = JSON.parse(row.parsed_json);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

function toFiniteNumberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const cleaned = String(value).replace(/[^0-9.\-]/g, '');
    if (!cleaned) return null;
    const numeric = Number(cleaned);
    return Number.isFinite(numeric) ? numeric : null;
}

function buildDietReportSummary(patientId, days) {
    const { rangeDays, sinceIso } = buildDietDateRange(days);
    const rawEntries = db.prepare(`
        SELECT *
        FROM diet_intakes
        WHERE patient_id = ?
          AND datetime(logged_at) >= datetime(?)
        ORDER BY datetime(logged_at) DESC
    `).all(patientId, sinceIso);

    const entries = rawEntries.map(mapDietIntakeRow);
    const sugarEntries = entries.filter((item) => Number.isFinite(Number(item.bloodSugarMgDl)));
    const sugarValues = sugarEntries.map((item) => Number(item.bloodSugarMgDl));
    const highEvents = sugarEntries.filter((item) => Number(item.bloodSugarMgDl) >= 180);
    const veryHighEvents = sugarEntries.filter((item) => Number(item.bloodSugarMgDl) >= 250);

    const mealSlotStats = DIET_MEAL_SLOTS.map((slot) => {
        const slotEntries = entries.filter((item) => item.mealSlot === slot);
        const slotSugar = slotEntries
            .map((item) => Number(item.bloodSugarMgDl))
            .filter((value) => Number.isFinite(value));
        const slotHigh = slotSugar.filter((value) => value >= 180);

        return {
            slot,
            label: DIET_SLOT_LABELS[slot] || slot,
            count: slotEntries.length,
            averageSugar: slotSugar.length
                ? Number((slotSugar.reduce((sum, value) => sum + value, 0) / slotSugar.length).toFixed(1))
                : null,
            highCount: slotHigh.length,
            highPercent: slotSugar.length
                ? Number(((slotHigh.length / slotSugar.length) * 100).toFixed(1))
                : 0,
        };
    });

    const triggerMap = new Map();
    entries.forEach((item) => {
        const triggers = detectDietTriggers(item.intakeText);
        triggers.forEach((trigger) => {
            const existing = triggerMap.get(trigger.key) || {
                key: trigger.key,
                label: trigger.label,
                swap: trigger.swap,
                occurrences: 0,
                sugarSum: 0,
                sugarCount: 0,
                highSugarCount: 0,
            };

            existing.occurrences += 1;
            if (Number.isFinite(Number(item.bloodSugarMgDl))) {
                existing.sugarSum += Number(item.bloodSugarMgDl);
                existing.sugarCount += 1;
                if (Number(item.bloodSugarMgDl) >= 180) existing.highSugarCount += 1;
            }

            triggerMap.set(trigger.key, existing);
        });
    });

    const triggerFoods = Array.from(triggerMap.values())
        .map((item) => ({
            key: item.key,
            label: item.label,
            swap: item.swap,
            occurrences: item.occurrences,
            averageSugar: item.sugarCount ? Number((item.sugarSum / item.sugarCount).toFixed(1)) : null,
            highSugarCount: item.highSugarCount,
        }))
        .sort((a, b) => {
            if (b.highSugarCount !== a.highSugarCount) return b.highSugarCount - a.highSugarCount;
            if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
            return (b.averageSugar || 0) - (a.averageSugar || 0);
        });

    const avoidFoods = triggerFoods
        .filter((item) => item.highSugarCount > 0 || (item.averageSugar !== null && item.averageSugar >= 170))
        .slice(0, 4);

    const reportRows = db.prepare(`
        SELECT id, reportName, date, status, parsed_json, createdAt
        FROM reports
        WHERE patient = ?
          AND parsed_json IS NOT NULL
          AND datetime(createdAt) >= datetime(?, '-180 days')
        ORDER BY datetime(createdAt) DESC
        LIMIT 8
    `).all(patientId, new Date().toISOString());

    let latestHba1c = null;
    let latestAverageGlucose = null;
    let latestReportName = null;
    let latestReportDate = null;

    reportRows.forEach((row, index) => {
        const parsed = parseReportJsonObject(row);
        const extracted = parsed && parsed.extracted && typeof parsed.extracted === 'object'
            ? parsed.extracted
            : null;
        if (!extracted) return;

        if (index === 0) {
            latestReportName = row.reportName || null;
            latestReportDate = row.date || null;
        }

        if (!Number.isFinite(latestHba1c)) {
            const hba1cValue = toFiniteNumberOrNull(extracted.hba1c);
            if (Number.isFinite(hba1cValue)) latestHba1c = Number(hba1cValue.toFixed(2));
        }

        if (!Number.isFinite(latestAverageGlucose)) {
            const avgValue = toFiniteNumberOrNull(extracted.averageGlucoseMgDl);
            if (Number.isFinite(avgValue)) {
                latestAverageGlucose = Number(avgValue.toFixed(1));
                return;
            }

            if (Array.isArray(extracted.glucoseReadingsMgDl) && extracted.glucoseReadingsMgDl.length > 0) {
                const firstReading = toFiniteNumberOrNull(extracted.glucoseReadingsMgDl[0]);
                if (Number.isFinite(firstReading)) latestAverageGlucose = Number(firstReading.toFixed(1));
            }
        }
    });

    const recommendations = [];
    if (entries.length === 0) {
        recommendations.push('Start logging breakfast, lunch, and dinner with sugar values to unlock personalized diet guidance.');
    } else {
        if (highEvents.length > 0) {
            recommendations.push('Your sugar was high after some meals. Keep carb portions smaller and add protein/fiber in each meal.');
        }

        if (avoidFoods.length > 0) {
            recommendations.push('Limit these trigger items: ' + avoidFoods.map((item) => item.label).join(', ') + '.');
            recommendations.push(avoidFoods[0].swap);
        }

        const weakestSlot = mealSlotStats
            .filter((item) => item.count > 0)
            .sort((a, b) => (b.averageSugar || 0) - (a.averageSugar || 0))[0];
        if (weakestSlot && Number.isFinite(weakestSlot.averageSugar) && weakestSlot.averageSugar >= 165) {
            recommendations.push('Focus on ' + weakestSlot.label.toLowerCase() + ' first: reduce refined carbs and include vegetables/protein.');
        }
    }

    if (Number.isFinite(latestHba1c) && latestHba1c >= 7) {
        recommendations.push('Latest report HbA1c is elevated; consistent diet changes are important over the next 8-12 weeks.');
    }

    if (recommendations.length === 0) {
        recommendations.push('Current diet logs look stable. Continue balanced meals and consistent sugar checks.');
    }

    const narrativeParts = [];
    if (entries.length === 0) {
        narrativeParts.push('No diet logs were found in the selected range.');
    } else {
        narrativeParts.push('Logged ' + entries.length + ' meals in the last ' + rangeDays + ' days.');
        if (sugarValues.length > 0) {
            narrativeParts.push('Average recorded sugar was ' + Number((sugarValues.reduce((sum, value) => sum + value, 0) / sugarValues.length).toFixed(1)) + ' mg/dL.');
            if (highEvents.length > 0) {
                narrativeParts.push(highEvents.length + ' readings were >= 180 mg/dL.');
            }
        } else {
            narrativeParts.push('No blood sugar values were linked with meals yet.');
        }
        if (avoidFoods.length > 0) {
            narrativeParts.push('Main trigger foods: ' + avoidFoods.map((item) => item.label).join(', ') + '.');
        }
    }

    if (latestReportName) {
        const reportSummary = ['Latest report: ' + latestReportName + (latestReportDate ? ' (' + latestReportDate + ')' : '')];
        if (Number.isFinite(latestHba1c)) reportSummary.push('HbA1c ' + latestHba1c + '%');
        if (Number.isFinite(latestAverageGlucose)) reportSummary.push('avg glucose ' + latestAverageGlucose + ' mg/dL');
        narrativeParts.push(reportSummary.join(', ') + '.');
    }

    return {
        range: rangeDays + 'd',
        summary: {
            entryCount: entries.length,
            sugarEntryCount: sugarEntries.length,
            averageSugar: sugarValues.length
                ? Number((sugarValues.reduce((sum, value) => sum + value, 0) / sugarValues.length).toFixed(1))
                : null,
            highSugarEvents: highEvents.length,
            veryHighSugarEvents: veryHighEvents.length,
        },
        mealSlotStats,
        triggerFoods,
        avoidFoods,
        latestReportSignals: {
            reportName: latestReportName,
            reportDate: latestReportDate,
            hba1c: Number.isFinite(latestHba1c) ? latestHba1c : null,
            averageGlucoseMgDl: Number.isFinite(latestAverageGlucose) ? latestAverageGlucose : null,
            reportCount: reportRows.length,
        },
        recommendations: recommendations.slice(0, 6),
        narrative: narrativeParts.join(' '),
        entries,
    };
}

function isDietInsightQuestion(question) {
    const normalized = String(question || '').toLowerCase();
    const dietWords = /(diet|meal|intake|food|breakfast|lunch|dinner)/.test(normalized);
    const personalization = /(my|me|i\s+have|i\s+am|i\s+logged|based\s+on\s+my|my\s+report)/.test(normalized);
    const summaryIntent = /(report|summary|analy[sz]e|track|progress|what\s+should\s+i\s+not\s+eat|what\s+to\s+avoid)/.test(normalized);
    return dietWords && (personalization || summaryIntent);
}

function buildDietAiResponse(patientId, question) {
    const report = buildDietReportSummary(patientId, 30);
    const wantsDietGuidance = isDietInsightQuestion(question);
    if (!wantsDietGuidance) return null;

    if (!report || !report.summary || report.summary.entryCount === 0) {
        return {
            answer: [
                'Quick answer: I do not have enough meal logs yet to generate your personalized diet report.',
                'What this means: Start logging breakfast, lunch, and dinner with blood sugar at that time so I can detect your trigger foods.',
                'Next steps: Log at least 3-5 days of meals, then ask: "Give me my diet report and foods to avoid."',
            ].join(' '),
            confidence: 0.91,
            suggestions: [
                'Give me a meal logging template for breakfast, lunch, and dinner',
                'What sugar range should I target after meals?',
                'How should I log meals and blood sugar correctly?',
            ],
            source: {
                id: 'patient-diet-analytics-empty',
                title: 'Patient Diet Analytics',
                tags: ['diet', 'tracking', 'report'],
            },
            disclaimer: 'Educational support only. Do not start, stop, or replace medicines without clinician guidance.',
        };
    }

    const avoidFoods = Array.isArray(report.avoidFoods) ? report.avoidFoods : [];
    const avoidText = avoidFoods.length > 0
        ? avoidFoods.map((item) => item.label).join(', ')
        : 'no strong trigger foods detected yet';

    const slotFocus = (report.mealSlotStats || [])
        .filter((item) => item.count > 0 && Number.isFinite(item.averageSugar))
        .sort((a, b) => (b.averageSugar || 0) - (a.averageSugar || 0))[0];

    const signal = report.latestReportSignals || {};
    const reportSignalLine = signal.reportName
        ? ('Latest report signal: ' + signal.reportName
            + (signal.hba1c !== null ? ', HbA1c ' + signal.hba1c + '%' : '')
            + (signal.averageGlucoseMgDl !== null ? ', avg glucose ' + signal.averageGlucoseMgDl + ' mg/dL' : '')
            + '.')
        : 'No recent AI-parsed report signal was found.';

    const actionLine = avoidFoods.length > 0
        ? ('Foods to limit now: ' + avoidText + '.')
        : 'Continue logging sugar-linked meals so trigger foods can be identified more accurately.';

    const slotLine = slotFocus
        ? ('Highest sugar trend appears around ' + slotFocus.label.toLowerCase() + ' (avg ' + slotFocus.averageSugar + ' mg/dL).')
        : 'Meal-slot trend is still building; keep logging consistently.';

    const topSwap = avoidFoods.length > 0 && avoidFoods[0].swap
        ? avoidFoods[0].swap
        : 'Pair each carb source with protein and vegetables to reduce sugar spikes.';

    return {
        answer: [
            'Quick answer: ' + report.narrative,
            'What this means: ' + slotLine + ' ' + reportSignalLine + ' ' + actionLine,
            'Next steps: ' + topSwap,
        ].join(' '),
        confidence: 0.93,
        suggestions: [
            'Show my breakfast-wise sugar triggers',
            'Give me a safer lunch swap plan based on my logs',
            'What should I avoid this week to improve my sugar?',
        ],
        source: {
            id: 'patient-diet-analytics',
            title: 'Patient Diet Analytics',
            tags: ['diet', 'intake', 'sugar', 'report'],
        },
        disclaimer: 'Educational support only. Do not start, stop, or replace medicines without clinician guidance.',
    };
}

module.exports = {
    DIET_MEAL_SLOTS,
    DIET_SUGAR_TIMINGS,
    mapDietIntakeRow,
    buildDietDateRange,
    buildDietReportSummary,
    buildDietAiResponse,
};