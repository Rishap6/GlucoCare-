const { REPORT_TEMPLATE_RULES, BIOMARKER_PATTERNS, REFERENCE_RANGES } = require('./lab-templates');
const MAX_RAW_TEXT_CHARS = 30000;
const SOURCE_VERSION = 'document-intelligence-v4';
const MONTH_MAP = {
    jan: { short: 'Jan' },
    feb: { short: 'Feb' },
    mar: { short: 'Mar' },
    apr: { short: 'Apr' },
    may: { short: 'May' },
    jun: { short: 'Jun' },
    jul: { short: 'Jul' },
    aug: { short: 'Aug' },
    sep: { short: 'Sep' },
    oct: { short: 'Oct' },
    nov: { short: 'Nov' },
    dec: { short: 'Dec' },
};



function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function toFixedNumber(value, digits) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Number(numeric.toFixed(digits));
}

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
        .replace(/\bA8G\b/gi, 'ABG')
        .replace(/\bmg\s*d\s*l\b/gi, 'mg/dL')
        .replace(/[ ]{2,}/g, ' ')
        .trim();
}

function normalizeMonthToken(token) {
    if (!token) return null;
    var key = token.trim().toLowerCase();
    if (key.length > 3) key = key.slice(0, 3);
    return MONTH_MAP[key] ? key : null;
}

function formatTextualDate(day, monthToken, year) {
    var key = normalizeMonthToken(monthToken);
    if (!key) return null;
    var month = MONTH_MAP[key].short;
    var normalizedYear = String(year).length === 2 ? (Number(year) >= 50 ? '19' : '20') + String(year) : String(year);
    var normalizedDay = String(day).padStart(2, '0');
    return normalizedDay + ' ' + month + ' ' + normalizedYear;
}

function extractTextualDates(text) {
    var matches = findAll(
        /(?:\b(\d{1,2})[\s\-](jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[,\s-]*(\d{2,4})\b)|(\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[,\s]+(\d{1,2})(?:st|nd|rd|th)?[,\s]+(\d{2,4})\b)/gi,
        text,
        function(match) {
            if (match[1] && match[2] && match[3]) {
                return formatTextualDate(match[1], match[2], match[3]);
            }
            if (match[4] && match[5] && match[6]) {
                return formatTextualDate(match[5], match[4], match[6]);
            }
            return null;
        },
    ).filter(Boolean);
    return matches;
}

function extractPatientId(text) {
    var patterns = [
        /id\s*[- ]?pc\s*[:\-]\s*([a-z0-9\- ]{6,40})/i,
        /patient\s*(?:id|#)\s*[:\-]\s*([a-z0-9\-]{3,30})/i,
        /id\s*[:\-]\s*([a-z][a-z0-9\-]{3,30})/i,
    ];

    for (var i = 0; i < patterns.length; i += 1) {
        var match = text.match(patterns[i]);
        if (match && match[1]) {
            return match[1].trim();
        }
    }
    return null;
}

function detectReportTemplate(text, metadata) {
    const haystack = String(text || '').toLowerCase();
    const fileName = String((metadata && metadata.fileName) || '').toLowerCase();

    let best = {
        id: 'generic-lab',
        name: 'Generic Lab Report',
        confidence: 0.22,
        matchedSignals: [],
        strategy: 'generic',
    };

    REPORT_TEMPLATE_RULES.forEach((rule) => {
        const matchedSignals = rule.signals.filter((signal) => signal.test(haystack) || signal.test(fileName));
        if (!matchedSignals.length) return;

        const score = clamp(0.4 + (matchedSignals.length * 0.16) + (matchedSignals.length >= 2 ? 0.08 : 0), 0.4, 0.96);
        if (score > best.confidence) {
            best = {
                id: rule.id,
                name: rule.name,
                confidence: score,
                matchedSignals: matchedSignals.map((item) => item.toString()),
                strategy: 'template',
            };
        }
    });

    return {
        id: best.id,
        name: best.name,
        confidence: toFixedNumber(best.confidence, 3),
        matchedSignals: best.matchedSignals,
        strategy: best.strategy,
    };
}

function isFiniteBetween(value, min, max) {
    return Number.isFinite(value) && value >= min && value <= max;
}

function makeFieldConfidence(isPresent, score, reason) {
    const confidence = clamp(Number(score || 0), 0, 0.99);
    return {
        status: isPresent ? 'present' : 'missing',
        confidence: toFixedNumber(confidence, 3),
        reason,
    };
}

function buildFieldConfidenceMap(extracted, text, templateInfo) {
    const out = {};
    const lowerText = String(text || '').toLowerCase();
    const hba1c = Number(extracted.hba1c);
    const glucoseValues = Array.isArray(extracted.glucoseReadingsMgDl) ? extracted.glucoseReadingsMgDl : [];
    const bpValues = Array.isArray(extracted.bloodPressure) ? extracted.bloodPressure : [];
    const meds = Array.isArray(extracted.medications) ? extracted.medications : [];
    const diagnoses = Array.isArray(extracted.diagnoses) ? extracted.diagnoses : [];
    const allergies = Array.isArray(extracted.allergies) ? extracted.allergies : [];
    const dates = Array.isArray(extracted.dates) ? extracted.dates : [];

    if (extracted.patientName) {
        const tokenCount = String(extracted.patientName).trim().split(/\s+/).filter(Boolean).length;
        out.patientName = makeFieldConfidence(true, tokenCount >= 2 ? 0.91 : 0.76, 'Name marker detected in report text.');
    } else {
        out.patientName = makeFieldConfidence(false, 0.1, 'No reliable patient-name marker found.');
    }

    if (extracted.patientId) {
        out.patientId = makeFieldConfidence(true, 0.88, 'Patient identifier pattern detected.');
    } else {
        out.patientId = makeFieldConfidence(false, 0.12, 'No clear patient identifier marker.');
    }

    if (isFiniteBetween(hba1c, 2, 20)) {
        const decimalPresent = /\bh\s*b\s*a\s*1\s*c\b[^\n]{0,80}?\d{1,2}\.\d{1,2}/i.test(lowerText);
        out.hba1c = makeFieldConfidence(true, decimalPresent ? 0.95 : 0.86, 'HbA1c value captured near known markers.');
    } else {
        out.hba1c = makeFieldConfidence(false, 0.08, 'No valid HbA1c value found.');
    }

    if (glucoseValues.length > 0) {
        const first = Number(glucoseValues[0]);
        const score = isFiniteBetween(first, 20, 700)
            ? clamp(0.82 + Math.min(glucoseValues.length, 3) * 0.04, 0.82, 0.95)
            : 0.72;
        out.glucoseReadingsMgDl = makeFieldConfidence(true, score, 'Glucose marker and numeric value detected.');
    } else {
        out.glucoseReadingsMgDl = makeFieldConfidence(false, 0.12, 'No glucose measurement detected.');
    }

    if (isFiniteBetween(Number(extracted.averageGlucoseMgDl), 20, 700)) {
        out.averageGlucoseMgDl = makeFieldConfidence(true, 0.9, 'Average blood glucose or ABG marker detected.');
    } else {
        out.averageGlucoseMgDl = makeFieldConfidence(false, 0.15, 'No ABG/average glucose marker found.');
    }

    if (bpValues.length > 0) {
        out.bloodPressure = makeFieldConfidence(true, 0.84, 'Blood pressure pattern detected.');
    } else {
        out.bloodPressure = makeFieldConfidence(false, 0.16, 'No blood-pressure measurement found.');
    }

    if (isFiniteBetween(Number(extracted.weightKg), 20, 400)) {
        out.weightKg = makeFieldConfidence(true, 0.81, 'Weight value found in expected range.');
    } else {
        out.weightKg = makeFieldConfidence(false, 0.18, 'No reliable weight value found.');
    }

    out.reportDate = extracted.reportDate
        ? makeFieldConfidence(true, 0.83, 'Report date token detected.')
        : makeFieldConfidence(false, 0.18, 'No explicit report date token found.');

    out.diagnoses = diagnoses.length
        ? makeFieldConfidence(true, 0.78, 'Diagnosis terms detected in report text.')
        : makeFieldConfidence(false, 0.2, 'No known diagnosis terms detected.');

    out.medications = meds.length
        ? makeFieldConfidence(true, 0.76, 'Medication names/dosages detected.')
        : makeFieldConfidence(false, 0.22, 'No medication terms detected.');

    out.allergies = allergies.length
        ? makeFieldConfidence(true, 0.74, 'Allergy terms detected.')
        : makeFieldConfidence(false, 0.24, 'No allergy terms detected.');

    out.dates = dates.length
        ? makeFieldConfidence(true, 0.79, 'Date patterns detected in text.')
        : makeFieldConfidence(false, 0.2, 'No date patterns detected.');

    out.template = makeFieldConfidence(
        templateInfo && templateInfo.strategy === 'template',
        templateInfo ? templateInfo.confidence : 0.2,
        templateInfo && templateInfo.strategy === 'template'
            ? `Matched report template: ${templateInfo.name}.`
            : 'Using generic template strategy.',
    );

    return out;
}

function deriveConfidenceLevel(score) {
    if (score >= 0.86) return 'high';
    if (score >= 0.64) return 'medium';
    return 'low';
}

function buildSummaryFromExtracted(extracted) {
    const summaryMeta = [];
    if (extracted.reportDate) summaryMeta.push(`dated ${extracted.reportDate}`);
    if (extracted.patientId) summaryMeta.push(`patient ID ${extracted.patientId}`);

    const summaryParts = [
        extracted.hba1c !== null ? `HbA1c ${extracted.hba1c}%` : null,
        extracted.glucoseReadingsMgDl.length ? `${extracted.glucoseReadingsMgDl.length} glucose value(s)` : null,
        extracted.weightKg !== null && extracted.weightKg !== undefined ? `Weight ${extracted.weightKg} kg` : null,
        extracted.medications.length ? `${extracted.medications.length} medication mention(s)` : null,
        extracted.diagnoses.length ? `${extracted.diagnoses.length} diagnosis term(s)` : null,
    ].filter(Boolean);

    const combinedSummary = [...summaryMeta, ...summaryParts];
    return combinedSummary.length
        ? `Extracted ${combinedSummary.join(', ')}.`
        : 'Read document text but found limited diabetes-specific structured values.';
}

function buildQualityFlags(options) {
    const flags = [];
    const textLength = Number(options.textLength || 0);
    const extracted = options.extracted || {};
    const fieldConfidence = options.fieldConfidence || {};
    const templateInfo = options.templateInfo || null;
    const ocrDiagnostics = options.ocrDiagnostics || null;

    if (textLength < 120) flags.push('low_text_volume');
    if (!extracted.patientName) flags.push('missing_patient_name');
    if (extracted.hba1c === null && (!Array.isArray(extracted.glucoseReadingsMgDl) || extracted.glucoseReadingsMgDl.length === 0)) {
        flags.push('missing_glycemic_markers');
    }
    if (!extracted.reportDate) flags.push('missing_report_date');
    if (templateInfo && templateInfo.strategy !== 'template') flags.push('generic_template_used');

    const confidenceEntries = Object.keys(fieldConfidence)
        .map((key) => fieldConfidence[key])
        .filter((item) => item && Number.isFinite(item.confidence));
    if (confidenceEntries.length > 0) {
        const average = confidenceEntries.reduce((sum, item) => sum + Number(item.confidence), 0) / confidenceEntries.length;
        if (average < 0.52) flags.push('low_field_confidence');
    }

    if (ocrDiagnostics && Number.isFinite(Number(ocrDiagnostics.bestScore)) && Number(ocrDiagnostics.bestScore) < 90) {
        flags.push('weak_ocr_signal');
    }

    return collectUnique(flags);
}

function evaluateExtractedData(extracted, options) {
    const context = options || {};
    const normalizedText = normalizeOcrNoise(normalizeWhitespace(context.text || ''));
    const textLength = normalizedText.length;
    const metadata = context.metadata || {};
    const templateInfo = context.templateInfo || detectReportTemplate(normalizedText, metadata);

    const fieldConfidence = buildFieldConfidenceMap(extracted, normalizedText, templateInfo);
    const review = buildHealthReview(extracted);
    const summary = buildSummaryFromExtracted(extracted);

    const signalCount = [
        extracted.patientName ? 1 : 0,
        extracted.patientId ? 1 : 0,
        extracted.hba1c !== null ? 1 : 0,
        extracted.glucoseReadingsMgDl.length > 0 ? 1 : 0,
        extracted.bloodPressure.length > 0 ? 1 : 0,
        extracted.diagnoses.length > 0 ? 1 : 0,
        extracted.medications.length > 0 ? 1 : 0,
        extracted.allergies.length > 0 ? 1 : 0,
        extracted.weightKg !== null && extracted.weightKg !== undefined ? 1 : 0,
        extracted.dates.length > 0 ? 1 : 0,
    ].reduce((sum, value) => sum + value, 0);

    const scoredFields = Object.keys(fieldConfidence)
        .map((key) => fieldConfidence[key])
        .filter((item) => item && Number.isFinite(item.confidence));

    const presentScoredFields = scoredFields.filter((item) => item.status === 'present');
    const presentAverage = presentScoredFields.length
        ? presentScoredFields.reduce((sum, item) => sum + Number(item.confidence), 0) / presentScoredFields.length
        : 0;

    const criticalKeys = ['patientName', 'hba1c', 'glucoseReadingsMgDl', 'reportDate'];
    const criticalScores = criticalKeys
        .map((key) => fieldConfidence[key])
        .filter((item) => item && item.status === 'present')
        .map((item) => Number(item.confidence));
    const criticalAverage = criticalScores.length
        ? criticalScores.reduce((sum, value) => sum + value, 0) / criticalScores.length
        : 0;

    const textBoost = textLength > 1400
        ? 0.08
        : textLength > 700
            ? 0.05
            : textLength > 240
                ? 0.02
                : -0.03;

    const ocrBoost = metadata.ocrDiagnostics ? 0.04 : 0;
    const signalBoost = signalCount * 0.055;
    const templateBoost = Number(templateInfo.confidence || 0) * 0.11;

    let confidence = 0.32 + signalBoost + (presentAverage * 0.35) + (criticalAverage * 0.18) + templateBoost + textBoost + ocrBoost;
    if (signalCount >= 5) confidence += 0.05;
    if (signalCount >= 8) confidence += 0.03;
    confidence = clamp(confidence, 0.2, 0.99);

    const qualityFlags = buildQualityFlags({
        textLength,
        extracted,
        fieldConfidence,
        templateInfo,
        ocrDiagnostics: metadata.ocrDiagnostics || null,
    });

    return {
        summary,
        review,
        confidence: toFixedNumber(confidence, 3),
        confidenceDetails: {
            overall: toFixedNumber(confidence, 3),
            level: deriveConfidenceLevel(confidence),
            signalCount,
            textLength,
            template: templateInfo,
            fields: fieldConfidence,
            ocr: metadata.ocrDiagnostics || null,
        },
        qualityFlags,
        templateInfo,
    };
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

function cleanPatientName(value) {
    var cleaned = String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!cleaned) return null;

    cleaned = cleaned
        .replace(/\b(sample\s*collect(?:ed)?|sample\s*reg(?:istered|istred)|sample\s*report(?:ed)?|barcode|test\s*asked|ref\/?by|id\s*[- ]?pc)\b[\s\S]*$/i, '')
        .replace(/\(\s*\d{1,3}\s*\/\s*[mf]\s*(?:\/\s*[a-z]{1,3})?\s*\)/i, '')
        .replace(/[|,;:~\-]+$/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

    if (!cleaned) return null;
    if (/^(?:name|patient|sample|test)$/i.test(cleaned)) return null;
    if (cleaned.length > 80) cleaned = cleaned.slice(0, 80).trim();
    return cleaned || null;
}

function extractPatientDemographicsFromNameLine(text) {
    var out = { patientAge: null, patientSex: null };
    var lineMatch = String(text || '').match(/(?:patient\s*name|name)\s*[:\-]\s*([^\n]{2,140})/i);
    if (!lineMatch || !lineMatch[1]) return out;

    var line = lineMatch[1];
    var match = line.match(/\(\s*(\d{1,3})\s*\/\s*([mf])(?:\s*\/\s*[a-z]{1,3})?\s*\)/i)
        || line.match(/\b(\d{1,3})\s*\/\s*([mf])\b/i);

    if (!match) return out;

    var age = Number(match[1]);
    if (Number.isFinite(age) && age >= 0 && age <= 120) {
        out.patientAge = Math.round(age);
    }

    var sexToken = String(match[2] || '').toLowerCase();
    if (sexToken === 'm') out.patientSex = 'male';
    if (sexToken === 'f') out.patientSex = 'female';

    return out;
}

function extractReportLifecycleDates(text) {
    var reportText = String(text || '');
    var patterns = {
        sampleCollectedOn: /sample\s*collect(?:ed)?\s*on\s*[~:\-\s]*\s*(\d{1,2}\s+[a-z]{3,9}\s+\d{2,4}(?:\s+\d{1,2}:\d{2}\s*(?:am|pm))?)/i,
        sampleRegisteredOn: /sample\s*reg(?:istered|istred)\s*on\s*[~:\-\s]*\s*(\d{1,2}\s+[a-z]{3,9}\s+\d{2,4}(?:\s+\d{1,2}:\d{2}\s*(?:am|pm))?)/i,
        sampleReportedOn: /sample\s*report(?:ed)?\s*on\s*[~:\-\s]*\s*(\d{1,2}\s+[a-z]{3,9}\s+\d{2,4}(?:\s+\d{1,2}:\d{2}\s*(?:am|pm))?)/i,
    };

    var out = {
        sampleCollectedOn: null,
        sampleRegisteredOn: null,
        sampleReportedOn: null,
    };

    Object.keys(patterns).forEach(function(key) {
        var match = reportText.match(patterns[key]);
        if (match && match[1]) {
            out[key] = normalizeWhitespace(match[1]);
        }
    });

    return out;
}

function normalizeSexToken(value) {
    var token = String(value || '').trim().toLowerCase();
    if (token === 'm' || token === 'male') return 'male';
    if (token === 'f' || token === 'female') return 'female';
    return null;
}

function sanitizeReferringDoctor(value) {
    var cleaned = String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[|,;:~\-]+$/g, '')
        .replace(/(?:m\.?d\.?|dm|mbbs|dnb)\s*$/i, '')
        .trim();
    if (!cleaned) return null;
    if (/\b(reference\s*range|normal\s*value|borderline\s*control|euglycemic\s*control|impaired\s*control|diabetic\s*control|poor\s*control)\b/i.test(cleaned)) {
        return null;
    }
    if (cleaned.length < 3) return null;
    if (cleaned.length > 60) cleaned = cleaned.slice(0, 60).trim();
    return cleaned;
}

function extractDoctorName(text) {
    var matches = findAll(/\bdr\.?\s*([a-z][a-z .'-]{2,50})/gi, text, function(m) { return m[1]; });
    var normalized = matches
        .map(function(item) {
            return String(item || '')
                .replace(/\b(?:m\.?d\.?|dm|mbbs|dnb)\b/gi, '')
                .replace(/(?:m\.?d\.?|dm|mbbs|dnb)\s*$/i, '')
                .replace(/\s{2,}/g, ' ')
                .trim();
        })
        .filter(function(item) {
            return item && !/\b(reference|range|technology|control)\b/i.test(item);
        });

    return normalized.length ? normalized[0] : null;
}

function sanitizeBiomarkers(biomarkers, text, demographics) {
    var out = Object.assign({}, biomarkers || {});

    var age = Number(out.patientAge);
    if (!Number.isFinite(age) || age < 0 || age > 120) {
        out.patientAge = null;
    } else {
        out.patientAge = Math.round(age);
    }

    out.patientSex = normalizeSexToken(out.patientSex);
    out.referringDoctor = sanitizeReferringDoctor(out.referringDoctor);

    if (demographics && Number.isFinite(Number(demographics.patientAge))) {
        out.patientAge = Number(demographics.patientAge);
    }
    if (demographics && demographics.patientSex) {
        out.patientSex = demographics.patientSex;
    }
    if (!out.referringDoctor) {
        out.referringDoctor = extractDoctorName(text);
    }

    return out;
}

function toDisplayDateOnly(value) {
    var dates = extractDates(String(value || ''));
    return dates.length ? dates[0] : null;
}

function pickPrimaryReportDate(dateHits, lifecycleDates) {
    var reported = toDisplayDateOnly(lifecycleDates && lifecycleDates.sampleReportedOn);
    if (reported) return reported;

    var collected = toDisplayDateOnly(lifecycleDates && lifecycleDates.sampleCollectedOn);
    if (collected) return collected;

    return Array.isArray(dateHits) && dateHits.length ? dateHits[0] : null;
}

function extractPatientName(text) {
    const patterns = [
        /(?:patient\s*name|name)\s*[:\-]\s*([^\n]{2,80})/i,
        /patient\s*[:\-]\s*([^\n]{2,80})/i,
        /mr\.?\s+([a-z][a-z .'-]{2,80})/i,
        /mrs\.?\s+([a-z][a-z .'-]{2,80})/i,
        /ms\.?\s+([a-z][a-z .'-]{2,80})/i,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            const cleaned = cleanPatientName(match[1]);
            return cleaned || null;
        }
    }
    return null;
}

function extractHba1c(text) {
    // Prefer table-style rows where HbA1c label is followed by method/value lines.
    const lines = String(text || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i].toLowerCase();
        if (!/(^|\b)h\s*b\s*a\s*1\s*c($|\b)|(^|\b)a\s*1\s*c($|\b)/i.test(line)) continue;
        if (/test\s*asked|reference\s*range|normal\s*value|borderline|diabetic\s*control|poor\s*control/.test(line)) {
            continue;
        }

        // Inspect a short lookahead window for the measurement row.
        const windowText = lines.slice(i, i + 8).join(' ');
        const decimalFirst = windowText.match(/\b(\d{1,2}\.\d{1,2})\s*%?/i);
        if (decimalFirst) {
            const decimalValue = toNumber(decimalFirst[1]);
            if (decimalValue !== null && decimalValue >= 2 && decimalValue <= 20) {
                return decimalValue;
            }
        }

        const integerFallback = windowText.match(/\b(\d{1,2})\s*%/i);
        if (integerFallback) {
            const integerValue = toNumber(integerFallback[1]);
            if (integerValue !== null && integerValue >= 2 && integerValue <= 20) {
                return integerValue;
            }
        }
    }

    // Multi-line table fallback where value appears below the label.
    const tablePattern = /\bh\s*b\s*a\s*1\s*c\b[\s\S]{0,120}?(\d{1,2}(?:\.\d{1,2})?)\s*%?/i;
    const tableMatch = String(text || '').match(tablePattern);
    if (tableMatch && tableMatch[1]) {
        const tableValue = toNumber(tableMatch[1]);
        if (tableValue !== null && tableValue >= 2 && tableValue <= 20) {
            return tableValue;
        }
    }

    const pattern = /(?:h\s*b\s*a\s*1\s*c|a\s*1\s*c|glycated\s+hemoglobin)(?:[^0-9]{0,55})(\d{1,2}(?:\.\d{1,2})?)\s*%?/gi;
    const candidates = [];
    let match;

    while ((match = pattern.exec(text)) !== null) {
        const value = toNumber(match[1]);
        if (value === null || value < 2 || value > 20) continue;

        const contextStart = Math.max(0, match.index - 45);
        const contextEnd = Math.min(text.length, pattern.lastIndex + 60);
        const context = text.slice(contextStart, contextEnd).toLowerCase();

        let score = 0;
        if (/\bh\s*b\s*a\s*1\s*c\b|\ba\s*1\s*c\b|glycated/.test(context)) score += 3;
        if (/method|h\.?p\.?l\.?c|test\s*name|value/.test(context)) score += 2;
        if (/%|percent/.test(context)) score += 1;
        if (/reference\s*range|normal\s*value|borderline|poor\s*control|impaired\s*control|diabetic\s*control|<\s*\d|>\s*\d/.test(context)) {
            score -= 8;
        }

        candidates.push({ value, score, index: match.index });
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => (b.score - a.score) || (a.index - b.index));
    return candidates[0].value;
}

function extractGlucoseValues(text) {
    // Prioritize measured glucose values and de-prioritize reference ranges.
    const patterns = [
        /(?:average\s*blood\s*glucose|a\s*b\s*g|g\s*l\s*u\s*c\s*o\s*s\s*e|blood\s*sugar|rbs|fbs|ppbs|fasting|post\s*prandial|random)(?:[^0-9]{0,55})(\d{2,3})(?:\s*mg\/?\s*d\s*l)?/gi,
        /(?:average\s*blood\s*glucose|a\s*b\s*g|g\s*l\s*u\s*c\s*o\s*s\s*e|blood\s*sugar|rbs|fbs|ppbs|fasting|post\s*prandial|random)[^\n]{0,100}?\b(\d{2,3})\s*mg\/?\s*d\s*l/gi,
    ];

    const scoredCandidates = [];
    patterns.forEach((pattern) => {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const value = toNumber(match[1]);
            if (value === null || value < 20 || value > 700) continue;

            const contextStart = Math.max(0, match.index - 40);
            const contextEnd = Math.min(text.length, pattern.lastIndex + 70);
            const context = text.slice(contextStart, contextEnd).toLowerCase();

            let score = 0;
            if (/average\s*blood\s*glucose|\ba\s*b\s*g\b/.test(context)) score += 4;
            if (/fasting|fbs|post\s*prandial|ppbs|random|rbs/.test(context)) score += 3;
            if (/mg\/?\s*d\s*l/.test(context)) score += 2;
            if (/reference\s*range|normal\s*value|borderline|poor\s*control|impaired\s*control|diabetic\s*control|<\s*\d|>\s*\d|\d{2,3}\s*[-–]\s*\d{2,3}/.test(context)) {
                score -= 4;
            }

            scoredCandidates.push({ value, score, index: match.index });
        }
    });

    if (!scoredCandidates.length) return [];
    scoredCandidates.sort((a, b) => (b.score - a.score) || (a.index - b.index));

    const preferred = scoredCandidates.some((item) => item.score >= 0)
        ? scoredCandidates.filter((item) => item.score >= 0)
        : scoredCandidates;

    const unique = [];
    preferred.forEach((item) => {
        if (!unique.includes(item.value)) unique.push(item.value);
    });

    return unique.slice(0, 20);
}

function extractAverageBloodGlucose(text) {
    const matches = findAll(
        /(?:average\s*blood\s*glucose|\ba\s*b\s*g\b)(?:[^0-9]{0,55})(\d{2,3})\s*(?:mg\/?\s*d\s*l)?/gi,
        text,
        (m) => toNumber(m[1]),
    ).filter((value) => value !== null && value >= 20 && value <= 700);

    if (!matches.length) return null;
    return matches[0];
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
    const numericMatches = findAll(
        /\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}[\/-]\d{1,2}[\/-]\d{1,2})\b/g,
        text,
        (m) => m[1],
    );
    const textualMatches = extractTextualDates(text);
    return collectUnique([...numericMatches, ...textualMatches]).slice(0, 20);
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
    ).filter((entry) => {
        const lower = String(entry || '').toLowerCase();
        if (/^(calculated|average|reference|range|value|blood|glucose|sample|method|technology)\b/.test(lower)) {
            return false;
        }
        if (/\b(glucose|blood\s*sugar|hba1c|a1c|abg)\b/.test(lower)) {
            return false;
        }
        return true;
    });

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

// ── Generic biomarker extractor using lab-templates patterns ────────
function extractBiomarkerValue(text, fieldKey) {
    const patterns = BIOMARKER_PATTERNS[fieldKey];
    if (!patterns || !patterns.length) return null;
    for (const pat of patterns) {
        const match = text.match(pat);
        if (match && match[1]) {
            const val = String(match[1]).trim();
            // For numeric fields, validate
            const num = Number(val);
            if (Number.isFinite(num) && num > 0) return num;
            if (val.length >= 1) return val; // string fields like patientSex
        }
    }
    return null;
}

function extractAllBiomarkers(text) {
    const result = {};
    for (const key of Object.keys(BIOMARKER_PATTERNS)) {
        result[key] = extractBiomarkerValue(text, key);
    }
    return result;
}

// ── Reference range abnormality flagging ────────────────────────────
function flagAbnormalities(biomarkers, sex) {
    const flags = {};
    const normalizedSex = String(sex || '').toLowerCase().charAt(0); // 'm' or 'f'

    for (const [key, value] of Object.entries(biomarkers)) {
        if (value === null || value === undefined || typeof value === 'string') continue;
        const refDef = REFERENCE_RANGES[key];
        if (!refDef) continue;

        const range = (normalizedSex === 'f' && refDef.female) ? refDef.female
            : (normalizedSex === 'm' && refDef.male) ? refDef.male
            : refDef.all || refDef.male || refDef.female;
        if (!range) continue;

        const numVal = Number(value);
        if (!Number.isFinite(numVal)) continue;

        let status = 'normal';
        if (numVal < range[0]) status = numVal < range[0] * 0.7 ? 'critical-low' : 'low';
        else if (numVal > range[1] && range[1] < 900) status = numVal > range[1] * 1.5 ? 'critical-high' : 'high';

        flags[key] = { value: numVal, range, unit: refDef.unit || '', status };
    }
    return flags;
}

// ── Expanded health review ──────────────────────────────────────────
function buildHealthReviewExpanded(extracted, biomarkers, abnormalityFlags) {
    const hba1c = extracted.hba1c;
    const glucoseValues = Array.isArray(extracted.glucoseReadingsMgDl) ? extracted.glucoseReadingsMgDl : [];
    const bp = Array.isArray(extracted.bloodPressure) && extracted.bloodPressure.length ? extracted.bloodPressure[0] : null;
    const systolic = bp ? Number(bp.systolic) : null;
    const diastolic = bp ? Number(bp.diastolic) : null;

    let riskScore = 0;
    const reasons = [];

    // HbA1c
    if (hba1c !== null && hba1c !== undefined) {
        if (hba1c >= 8.5) { riskScore += 4; reasons.push(`HbA1c is high (${hba1c}%).`); }
        else if (hba1c >= 7.0) { riskScore += 2; reasons.push(`HbA1c is above target (${hba1c}%).`); }
        else if (hba1c >= 5.7) { riskScore += 1; reasons.push(`HbA1c in prediabetic range (${hba1c}%).`); }
        else { reasons.push(`HbA1c is normal (${hba1c}%).`); }
    }

    // Glucose
    if (glucoseValues.length > 0) {
        const critical = glucoseValues.some((v) => v < 70 || v > 250);
        const elevated = glucoseValues.some((v) => v > 180 && v <= 250);
        if (critical) { riskScore += 3; reasons.push('Glucose has critical values.'); }
        else if (elevated) { riskScore += 2; reasons.push('Glucose has elevated values.'); }
        else { reasons.push('Glucose values look relatively controlled.'); }
    }

    // Blood Pressure
    if (Number.isFinite(systolic) && Number.isFinite(diastolic)) {
        if (systolic >= 160 || diastolic >= 100) { riskScore += 3; reasons.push(`BP is high (${systolic}/${diastolic}).`); }
        else if (systolic >= 140 || diastolic >= 90) { riskScore += 2; reasons.push(`BP is above target (${systolic}/${diastolic}).`); }
        else { reasons.push(`BP is acceptable (${systolic}/${diastolic}).`); }
    }

    // Score all abnormality flags from biomarkers
    for (const [key, flag] of Object.entries(abnormalityFlags)) {
        if (flag.status === 'critical-high' || flag.status === 'critical-low') {
            riskScore += 3;
            reasons.push(`${key} is critically ${flag.status.replace('critical-', '')} (${flag.value} ${flag.unit}).`);
        } else if (flag.status === 'high' || flag.status === 'low') {
            riskScore += 1;
            reasons.push(`${key} is ${flag.status} (${flag.value} ${flag.unit}).`);
        }
    }

    let level = 'not-bad';
    let label = 'Not Bad';
    if (riskScore >= 6) { level = 'bad'; label = 'Bad'; }
    else if (riskScore >= 2) { level = 'caution'; label = 'Needs Attention'; }

    return {
        level, label, isHealthBad: level === 'bad', riskScore,
        summary: level === 'bad' ? 'Report review: health markers look concerning. Please consult your doctor.'
            : level === 'caution' ? 'Report review: some values need attention.'
            : 'Report review: health markers are generally okay.',
        reasons,
    };
}

// ── Table row parser ────────────────────────────────────────────────
function extractTableRows(text) {
    const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const rows = [];
    for (const line of lines) {
        // Match lines like: "Test Name   Value   Unit   Ref Range"
        const match = line.match(/^([A-Za-z][A-Za-z0-9\s\-\/().,']{2,50}?)\s{2,}([\d.]+)\s*([\w\/µμ%]+)?\s*([\d.\-–]+\s*[-–]\s*[\d.]+)?/);
        if (match) {
            rows.push({ testName: match[1].trim(), value: match[2], unit: (match[3] || '').trim(), refRange: (match[4] || '').trim() });
        }
    }
    return rows;
}

function extractProjectDataFromDocument(rawText, metadata) {
    const normalizedText = normalizeOcrNoise(normalizeWhitespace(rawText));
    const text = normalizedText.slice(0, MAX_RAW_TEXT_CHARS);

    const emptyBiomarkers = {};
    Object.keys(BIOMARKER_PATTERNS).forEach((k) => { emptyBiomarkers[k] = null; });

    if (!text) {
        const emptyExtracted = {
            patientName: null, patientId: null, hba1c: null,
            patientAge: null, patientSex: null, referringDoctor: null,
            glucoseReadingsMgDl: [], averageGlucoseMgDl: null, bloodPressure: [],
            weightKg: null, diagnoses: [], medications: [], allergies: [],
            dates: [], reportDate: null,
            sampleCollectedOn: null, sampleRegisteredOn: null, sampleReportedOn: null,
            biomarkers: emptyBiomarkers, abnormalityFlags: {}, tableRows: [],
        };
        const evaluatedEmpty = evaluateExtractedData(emptyExtracted, { text, metadata });
        return {
            fileName: metadata && metadata.fileName ? metadata.fileName : null,
            fileType: metadata && metadata.fileType ? metadata.fileType : null,
            summary: 'No extractable text found in document.',
            review: evaluatedEmpty.review, extracted: emptyExtracted,
            confidence: evaluatedEmpty.confidence, confidenceDetails: evaluatedEmpty.confidenceDetails,
            qualityFlags: evaluatedEmpty.qualityFlags, source: SOURCE_VERSION,
        };
    }

    const dateHits = extractDates(text);
    const lifecycleDates = extractReportLifecycleDates(text);
    const demographicsFromName = extractPatientDemographicsFromNameLine(text);
    const patientName = extractPatientName(text);
    const averageGlucoseMgDl = extractAverageBloodGlucose(text);
    let glucoseReadings = extractGlucoseValues(text);
    if (averageGlucoseMgDl !== null) {
        glucoseReadings = [averageGlucoseMgDl].concat(glucoseReadings.filter((v) => v !== averageGlucoseMgDl));
    }

    const biomarkers = sanitizeBiomarkers(extractAllBiomarkers(text), text, demographicsFromName);
    const patientSex = biomarkers.patientSex || null;
    const abnormalityFlags = flagAbnormalities(biomarkers, patientSex);
    const tableRows = extractTableRows(text);
    const reportDate = pickPrimaryReportDate(dateHits, lifecycleDates);

    const extracted = {
        patientName,
        patientId: extractPatientId(text),
        hba1c: extractHba1c(text),
        patientAge: biomarkers.patientAge,
        patientSex: biomarkers.patientSex,
        referringDoctor: biomarkers.referringDoctor,
        glucoseReadingsMgDl: glucoseReadings,
        averageGlucoseMgDl,
        bloodPressure: extractBloodPressure(text),
        weightKg: extractWeightKg(text),
        diagnoses: extractDiagnoses(text),
        medications: extractMedications(text),
        allergies: extractAllergies(text),
        dates: dateHits,
        reportDate,
        sampleCollectedOn: lifecycleDates.sampleCollectedOn,
        sampleRegisteredOn: lifecycleDates.sampleRegisteredOn,
        sampleReportedOn: lifecycleDates.sampleReportedOn,
        biomarkers,
        abnormalityFlags,
        tableRows: tableRows.slice(0, 50),
    };

    const evaluated = evaluateExtractedData(extracted, { text, metadata });
    const expandedReview = buildHealthReviewExpanded(extracted, biomarkers, abnormalityFlags);

    return {
        fileName: metadata && metadata.fileName ? metadata.fileName : null,
        fileType: metadata && metadata.fileType ? metadata.fileType : null,
        summary: evaluated.summary,
        review: expandedReview,
        extracted,
        confidence: evaluated.confidence,
        confidenceDetails: evaluated.confidenceDetails,
        qualityFlags: evaluated.qualityFlags,
        source: SOURCE_VERSION,
        textPreview: text.slice(0, 300),
    };
}

module.exports = {
    extractProjectDataFromDocument,
    evaluateExtractedData,
    detectReportTemplate,
};

