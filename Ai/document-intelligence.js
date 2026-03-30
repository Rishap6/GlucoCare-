const MAX_RAW_TEXT_CHARS = 30000;

function normalizeWhitespace(value) {
    return String(value || '')
        .replace(/\r/g, '\n')
        .replace(/\t/g, ' ')
        .replace(/[|]/g, 'I')
        .replace(/[ ]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function normalizeOcrNoise(value) {
    var text = String(value || '');
    return text
        .replace(/\bH8A1C\b/gi, 'HbA1c')
        .replace(/\bHBAlC\b/gi, 'HbA1c')
        .replace(/\bHBAIC\b/gi, 'HbA1c')
        .replace(/\bG1ucose\b/gi, 'Glucose')
        .replace(/\bB1ood\b/gi, 'Blood')
        .replace(/\b8P\b/g, 'BP')
        .replace(/\bmg\s*d\s*l\b/gi, 'mg/dL')
        .replace(/[ ]{2,}/g, ' ')
        .trim();
}

function toNumber(value) {
    const num = Number(String(value || '').replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(num) ? num : null;
}

function collectUnique(items) {
    return [...new Set(items.map((item) => String(item || '').trim()).filter(Boolean))];
}

function findAll(regex, text, mapFn) {
    const out = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
        out.push(mapFn ? mapFn(match) : match[1]);
    }
    return out;
}

function extractPatientName(text) {
    const patterns = [
        /(?:patient\s*name|name)\s*[:\-]\s*([^\n]{2,80})/i,
        /mr\.?\s+([a-z][a-z .'-]{2,80})/i,
        /mrs\.?\s+([a-z][a-z .'-]{2,80})/i,
        /ms\.?\s+([a-z][a-z .'-]{2,80})/i,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            return match[1].trim().replace(/[|,;]+$/, '');
        }
    }
    return null;
}

function extractHba1c(text) {
    const matches = findAll(
        /(?:h\s*b\s*a\s*1\s*c|a\s*1\s*c|glycated\s+hemoglobin)\s*[:\-]?\s*(\d{1,2}(?:\.\d{1,2})?)\s*%?/gi,
        text,
        (m) => toNumber(m[1]),
    );
    if (!matches.length) return null;
    return Math.max(...matches.filter((v) => v !== null));
}

function extractGlucoseValues(text) {
    const valueMatches = findAll(
        /(?:g\s*l\s*u\s*c\s*o\s*s\s*e|blood\s*sugar|rbs|fbs|ppbs|fasting|post\s*prandial|random)\s*[:\-]?\s*(\d{2,3})\s*(?:mg\/?\s*d\s*l)?/gi,
        text,
        (m) => toNumber(m[1]),
    ).filter((v) => v !== null);

    const ranged = valueMatches.filter((v) => v >= 20 && v <= 700);
    return [...new Set(ranged)].slice(0, 20);
}

function extractBloodPressure(text) {
    const matches = findAll(
        /(?:b\s*p|blood\s*pressure)\s*[:\-]?\s*(\d{2,3})\s*[\/\\]\s*(\d{2,3})/gi,
        text,
        (m) => ({
            systolic: toNumber(m[1]),
            diastolic: toNumber(m[2]),
        }),
    ).filter((entry) => entry.systolic && entry.diastolic);

    return matches.slice(0, 10);
}

function extractWeightKg(text) {
    const matches = findAll(
        /(?:weight|wt)\s*[:\-]?\s*(\d{2,3}(?:\.\d{1,2})?)\s*(?:kg|kgs|kilograms?)?/gi,
        text,
        (m) => toNumber(m[1]),
    ).filter((value) => value !== null && value >= 20 && value <= 400);

    if (!matches.length) return null;
    return matches[matches.length - 1];
}

function extractDates(text) {
    const matches = findAll(
        /\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}[\/-]\d{1,2}[\/-]\d{1,2})\b/g,
        text,
        (m) => m[1],
    );
    return collectUnique(matches).slice(0, 20);
}

function extractMedications(text) {
    const knownMeds = [
        'metformin', 'glimepiride', 'sitagliptin', 'dapagliflozin', 'empagliflozin', 'insulin',
        'voglibose', 'acarbose', 'pioglitazone', 'linagliptin', 'teneligliptin', 'repaglinide',
    ];

    const found = knownMeds.filter((med) => new RegExp(`\\b${med}\\b`, 'i').test(text));

    const dosageMatches = findAll(
        /\b([a-z][a-z0-9+\- ]{2,40})\s+(\d{1,4}(?:\.\d{1,2})?)\s*(mg|iu|units?)\b/gi,
        text,
        (m) => `${m[1].trim()} ${m[2]} ${m[3]}`,
    );

    return collectUnique([...found, ...dosageMatches]).slice(0, 25);
}

function extractAllergies(text) {
    const sectionMatch = text.match(/(?:allerg(?:y|ies)|adverse\s*reaction)\s*[:\-]\s*([^\n]{2,200})/i);
    const explicit = sectionMatch && sectionMatch[1]
        ? sectionMatch[1].split(/[,;/|]/g)
        : [];
    const known = ['penicillin', 'sulfa', 'ibuprofen', 'aspirin', 'lactose', 'gluten'];
    const fromKnown = known.filter((item) => new RegExp(`\\b${item}\\b`, 'i').test(text));

    return collectUnique([...explicit, ...fromKnown]).slice(0, 15);
}

function extractDiagnoses(text) {
    const knownDx = [
        'type 1 diabetes', 'type 2 diabetes', 'prediabetes', 'gestational diabetes',
        'hypertension', 'hypoglycemia', 'hyperglycemia', 'neuropathy', 'retinopathy',
        'nephropathy', 'dyslipidemia', 'obesity',
    ];

    return knownDx.filter((item) => new RegExp(`\\b${item}\\b`, 'i').test(text));
}

function buildHealthReview(extracted) {
    const hba1c = extracted.hba1c;
    const glucoseValues = Array.isArray(extracted.glucoseReadingsMgDl) ? extracted.glucoseReadingsMgDl : [];
    const latestGlucose = glucoseValues.length ? Number(glucoseValues[0]) : null;
    const bp = Array.isArray(extracted.bloodPressure) && extracted.bloodPressure.length ? extracted.bloodPressure[0] : null;
    const systolic = bp ? Number(bp.systolic) : null;
    const diastolic = bp ? Number(bp.diastolic) : null;

    let riskScore = 0;
    const reasons = [];

    if (hba1c !== null && hba1c !== undefined) {
        if (hba1c >= 8.5) {
            riskScore += 4;
            reasons.push(`HbA1c is high (${hba1c}%).`);
        } else if (hba1c >= 7.0) {
            riskScore += 2;
            reasons.push(`HbA1c is above target (${hba1c}%).`);
        } else {
            reasons.push(`HbA1c is in better range (${hba1c}%).`);
        }
    }

    if (glucoseValues.length > 0) {
        const criticalGlucose = glucoseValues.some((value) => value < 70 || value > 250);
        const elevatedGlucose = glucoseValues.some((value) => value > 180 && value <= 250);

        if (criticalGlucose) {
            riskScore += 3;
            reasons.push('Glucose has critical values.');
        } else if (elevatedGlucose) {
            riskScore += 2;
            reasons.push('Glucose has elevated values.');
        } else {
            reasons.push('Glucose values look relatively controlled.');
        }
    }

    if (Number.isFinite(systolic) && Number.isFinite(diastolic)) {
        if (systolic >= 160 || diastolic >= 100) {
            riskScore += 3;
            reasons.push(`Blood pressure is high (${systolic}/${diastolic}).`);
        } else if (systolic >= 140 || diastolic >= 90) {
            riskScore += 2;
            reasons.push(`Blood pressure is above target (${systolic}/${diastolic}).`);
        } else {
            reasons.push(`Blood pressure is acceptable (${systolic}/${diastolic}).`);
        }
    }

    let level = 'not-bad';
    let label = 'Not Bad';
    if (riskScore >= 5) {
        level = 'bad';
        label = 'Bad';
    } else if (riskScore >= 2) {
        level = 'caution';
        label = 'Needs Attention';
    }

    return {
        level,
        label,
        isHealthBad: level === 'bad',
        riskScore,
        summary: level === 'bad'
            ? 'Report review: health markers look concerning. Please consult your doctor.'
            : level === 'caution'
                ? 'Report review: some values need attention.'
                : 'Report review: health markers are generally okay.',
        reasons,
    };
}

function extractProjectDataFromDocument(rawText, metadata) {
    const normalizedText = normalizeOcrNoise(normalizeWhitespace(rawText));
    const text = normalizedText.slice(0, MAX_RAW_TEXT_CHARS);

    if (!text) {
        return {
            fileName: metadata && metadata.fileName ? metadata.fileName : null,
            fileType: metadata && metadata.fileType ? metadata.fileType : null,
            summary: 'No extractable text found in document.',
            extracted: {
                patientName: null,
                hba1c: null,
                glucoseReadingsMgDl: [],
                bloodPressure: [],
                diagnoses: [],
                medications: [],
                allergies: [],
                dates: [],
            },
            confidence: 0.2,
            source: 'document-intelligence-v1',
        };
    }

    const extracted = {
        patientName: extractPatientName(text),
        hba1c: extractHba1c(text),
        glucoseReadingsMgDl: extractGlucoseValues(text),
        bloodPressure: extractBloodPressure(text),
        weightKg: extractWeightKg(text),
        diagnoses: extractDiagnoses(text),
        medications: extractMedications(text),
        allergies: extractAllergies(text),
        dates: extractDates(text),
    };

    const review = buildHealthReview(extracted);

    const signalCount = [
        extracted.patientName ? 1 : 0,
        extracted.hba1c !== null ? 1 : 0,
        extracted.glucoseReadingsMgDl.length > 0 ? 1 : 0,
        extracted.bloodPressure.length > 0 ? 1 : 0,
        extracted.diagnoses.length > 0 ? 1 : 0,
        extracted.medications.length > 0 ? 1 : 0,
        extracted.allergies.length > 0 ? 1 : 0,
    ].reduce((sum, value) => sum + value, 0);

    const confidence = Math.min(0.96, 0.35 + (signalCount * 0.09));

    const summaryParts = [
        extracted.hba1c !== null ? `HbA1c ${extracted.hba1c}%` : null,
        extracted.glucoseReadingsMgDl.length ? `${extracted.glucoseReadingsMgDl.length} glucose value(s)` : null,
        extracted.weightKg !== null && extracted.weightKg !== undefined ? `Weight ${extracted.weightKg} kg` : null,
        extracted.medications.length ? `${extracted.medications.length} medication mention(s)` : null,
        extracted.diagnoses.length ? `${extracted.diagnoses.length} diagnosis term(s)` : null,
    ].filter(Boolean);

    return {
        fileName: metadata && metadata.fileName ? metadata.fileName : null,
        fileType: metadata && metadata.fileType ? metadata.fileType : null,
        summary: summaryParts.length
            ? `Extracted ${summaryParts.join(', ')}.`
            : 'Read document text but found limited diabetes-specific structured values.',
        review,
        extracted,
        confidence: Number(confidence.toFixed(3)),
        source: 'document-intelligence-v1',
        textPreview: text.slice(0, 300),
    };
}

module.exports = {
    extractProjectDataFromDocument,
};
