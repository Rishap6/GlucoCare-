const fs = require('fs');
const path = require('path');
const { buildIndiaGeoKnowledge } = require('./knowledge-india-geo');
const { buildExpandedKnowledge } = require('./knowledge-expanded');

const KB_PATH = path.join(__dirname, 'knowledge-base.json');
const MODEL_PATH = path.join(__dirname, 'model.json');

const STOPWORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'i', 'if', 'in', 'is', 'it',
    'me', 'my', 'of', 'on', 'or', 'the', 'to', 'what', 'when', 'where', 'which', 'with', 'you', 'your',
]);

function safeJsonRead(filePath, fallback) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return fallback;
    }
}

function getKnowledgeBase() {
    const base = safeJsonRead(KB_PATH, []);
    const geo = buildIndiaGeoKnowledge();
    const expanded = buildExpandedKnowledge();
    const merged = [
        ...(Array.isArray(base) ? base : []),
        ...(Array.isArray(geo) ? geo : []),
        ...(Array.isArray(expanded) ? expanded : []),
    ];

    // Keep first occurrence for stable IDs in case of accidental duplicates.
    const seen = new Set();
    return merged.filter((item) => {
        const id = String(item && item.id ? item.id : '').trim();
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

function appendDoctorLine(text) {
    const line = 'You can consult a doctor.';
    const value = String(text || '').trim();
    if (!value) return line;
    if (value.toLowerCase().includes(line.toLowerCase())) return value;
    return `${value} ${line}`;
}

function tokenize(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w && !STOPWORDS.has(w));
}

function termFrequency(tokens) {
    const tf = Object.create(null);
    if (!tokens.length) return tf;
    for (const token of tokens) {
        tf[token] = (tf[token] || 0) + 1;
    }
    const count = tokens.length;
    for (const token of Object.keys(tf)) {
        tf[token] = tf[token] / count;
    }
    return tf;
}

function buildModel(knowledgeBase) {
    const docs = knowledgeBase.map((item) => {
        const source = [item.title, item.question, item.answer, ...(Array.isArray(item.tags) ? item.tags : [])].join(' ');
        const tokens = tokenize(source);
        return {
            id: item.id,
            title: item.title,
            answer: item.answer,
            tags: item.tags || [],
            tf: termFrequency(tokens),
        };
    });

    const df = Object.create(null);
    for (const doc of docs) {
        const uniqueTerms = new Set(Object.keys(doc.tf));
        for (const term of uniqueTerms) {
            df[term] = (df[term] || 0) + 1;
        }
    }

    const totalDocs = Math.max(1, docs.length);
    const idf = Object.create(null);
    for (const term of Object.keys(df)) {
        idf[term] = Math.log((1 + totalDocs) / (1 + df[term])) + 1;
    }

    return {
        version: 1,
        trainedAt: new Date().toISOString(),
        totalDocs,
        idf,
        docs,
    };
}

function scoreQuery(model, query) {
    const qTokens = tokenize(query);
    const qTf = termFrequency(qTokens);

    let best = null;
    let second = null;

    for (const doc of model.docs || []) {
        let score = 0;
        for (const term of Object.keys(qTf)) {
            const queryWeight = qTf[term] * (model.idf[term] || 0);
            const docWeight = (doc.tf[term] || 0) * (model.idf[term] || 0);
            score += queryWeight * docWeight;
        }

        if (!best || score > best.score) {
            second = best;
            best = { doc, score };
        } else if (!second || score > second.score) {
            second = { doc, score };
        }
    }

    return { best, second };
}

function extractAllergyAlternatives(query, allergies) {
    const normalized = String(query || '').toLowerCase();
    const known = Array.isArray(allergies) ? allergies.map((a) => String(a || '').toLowerCase()) : [];
    const map = [
        {
            triggers: ['metformin', 'glycomet', 'cetapin'],
            alternatives: 'Potential alternatives include SGLT2 inhibitors, DPP-4 inhibitors, GLP-1 receptor agonists, sulfonylureas, or insulin, based on patient profile.',
        },
        {
            triggers: ['insulin', 'actrapid', 'mixtard', 'huminsulin', 'novorapid'],
            alternatives: 'Possible approach includes specialist review for insulin formulation switch or supervised desensitization protocols.',
        },
        {
            triggers: ['sulfa', 'sulfonamide', 'sulfonylurea'],
            alternatives: 'Consider non-sulfonylurea options such as DPP-4 inhibitors, GLP-1 receptor agonists, SGLT2 inhibitors, or insulin after clinician review.',
        },
        {
            triggers: ['sitagliptin', 'teneligliptin', 'zita', 'teneza', 'jalra'],
            alternatives: 'If DPP-4 intolerance occurs, clinicians may consider SGLT2 inhibitors, GLP-1 receptor agonists, or other classes depending on kidney function and symptom profile.',
        },
        {
            triggers: ['dapagliflozin', 'empagliflozin', 'forxiga', 'jardiance'],
            alternatives: 'If SGLT2 inhibitors are not tolerated, clinicians may consider DPP-4 inhibitors, GLP-1 receptor agonists, or insulin-based strategies based on comorbid risks.',
        },
        {
            triggers: ['liraglutide', 'semaglutide', 'victoza', 'rybelsus', 'ozempic'],
            alternatives: 'If GLP-1 therapies are not tolerated, alternatives may include SGLT2 inhibitors, DPP-4 inhibitors, or insulin depending on patient goals and clinician assessment.',
        },
        {
            triggers: ['aspirin'],
            alternatives: 'Depending on indication, alternatives may include acetaminophen or other physician-selected agents.',
        },
        {
            triggers: ['ace inhibitor', 'lisinopril', 'enalapril'],
            alternatives: 'ARB medicines are often considered when ACE inhibitors are not tolerated due to cough or related side effects.',
        },
    ];

    for (const item of map) {
        const matchedInQuery = item.triggers.some((term) => normalized.includes(term));
        const matchedInAllergy = known.some((a) => item.triggers.some((term) => a.includes(term) || term.includes(a)));
        if (matchedInQuery || matchedInAllergy) {
            return item.alternatives;
        }
    }

    return null;
}

function loadModel() {
    const model = safeJsonRead(MODEL_PATH, null);
    if (model && model.docs && model.idf) return model;

    const knowledgeBase = getKnowledgeBase();
    return buildModel(knowledgeBase);
}

function answerQuestion(question, options = {}) {
    const model = loadModel();
    const allergies = Array.isArray(options.allergies) ? options.allergies : [];
    const normalizedQuestion = String(question || '').toLowerCase();

    const { best, second } = scoreQuery(model, question);
    const confidence = best ? Number((best.score / ((best.score + (second ? second.score : 0)) || 1)).toFixed(3)) : 0;

    const allergyAdvice = extractAllergyAlternatives(question, allergies);
    const medicineContext = /allergy|allergic|alternative|intoler|reaction|cannot use|can.t use|side effect/.test(normalizedQuestion);
    const shouldAttachAllergyLine = Boolean(allergyAdvice)
        && (medicineContext || allergies.length > 0 || /allergy|allergic|intoler|reaction/.test(normalizedQuestion));
    const allergyLine = shouldAttachAllergyLine
        ? `\n\nAllergy-aware note: ${allergyAdvice}`
        : '';

    if (medicineContext && allergyAdvice) {
        return {
            answer: appendDoctorLine(`For medicine allergy or intolerance questions, treatment alternatives should be selected by your doctor after reviewing kidney function, glucose profile, and prior reactions. ${allergyAdvice}`),
            confidence: Number(Math.max(confidence, 0.8).toFixed(3)),
            source: {
                id: 'allergy-alternative-guidance',
                title: 'Medication Allergy Alternative Guidance',
                tags: ['allergy', 'alternative', 'safety'],
            },
            disclaimer: 'Educational support only. Do not start, stop, or replace medicines without clinician guidance.',
        };
    }

    const locationFoodIntent = /\b(in|for)\s+[a-z\s]+\b/.test(normalizedQuestion)
        && /\b(city|state|india|food|eat|avoid|diet|dish|dishes|meal)\b/.test(normalizedQuestion);

    if (!best || best.score <= 0) {
        if (locationFoodIntent) {
            return {
                answer: appendDoctorLine('For city or state-specific diabetes food guidance, avoid local dishes that are deep-fried, sugar syrup-based, maida-heavy, or served in very large refined-carb portions. Prioritize vegetables and protein first, then controlled carbohydrate portions and regular glucose monitoring.'),
                confidence: 0.62,
                source: {
                    id: 'india-city-query-fallback',
                    title: 'City-Specific Query Fallback Guidance',
                    tags: ['india', 'city', 'diet'],
                },
                disclaimer: 'Educational support only. Do not start, stop, or replace medicines without clinician guidance.',
            };
        }

        return {
            answer: appendDoctorLine('I do not have a strong match for that question in the current diabetes knowledge base. Please ask in a more specific way (for example: Type 1 vs Type 2, hypoglycemia steps, or medicine allergy alternatives).'),
            confidence,
            source: null,
            disclaimer: 'Educational support only. Do not start, stop, or replace medicines without clinician guidance.',
        };
    }

    return {
        answer: appendDoctorLine(`${best.doc.answer}${allergyLine}`),
        confidence,
        source: {
            id: best.doc.id,
            title: best.doc.title,
            tags: best.doc.tags,
        },
        disclaimer: 'Educational support only. Do not start, stop, or replace medicines without clinician guidance.',
    };
}

module.exports = {
    KB_PATH,
    MODEL_PATH,
    buildModel,
    getKnowledgeBase,
    answerQuestion,
};
