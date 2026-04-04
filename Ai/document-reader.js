const path = require('path');
const crypto = require('crypto');

function resolveBackendDependency(moduleName) {
    try {
        return require(moduleName);
    } catch (_) {
        return require(path.join(__dirname, '..', 'backend', 'node_modules', moduleName));
    }
}

const pdfParse = resolveBackendDependency('pdf-parse');
const mammoth = resolveBackendDependency('mammoth');
const { createWorker, PSM } = resolveBackendDependency('tesseract.js');
const jimpModule = resolveBackendDependency('jimp');
const Jimp = jimpModule.Jimp || jimpModule;
const JIMP_MIME_PNG = jimpModule.MIME_PNG || 'image/png';

// ── Tuning knobs ────────────────────────────────────────────────────
const OCR_MAX_VARIANTS = Math.max(1, Number(process.env.OCR_MAX_VARIANTS || 4));
const OCR_MAX_ATTEMPTS = Math.max(1, Number(process.env.OCR_MAX_ATTEMPTS || 6));
const OCR_EARLY_EXIT_SCORE = Math.max(80, Number(process.env.OCR_EARLY_EXIT_SCORE || 200));
const OCR_MAX_MS = Math.max(5000, Number(process.env.OCR_MAX_MS || 20000));
const OCR_UPSCALE_LIMIT_PIXELS = Math.max(100000, Number(process.env.OCR_UPSCALE_LIMIT_PIXELS || 1800000));
const OCR_FAST_ACCEPT_SCORE = Math.max(60, Number(process.env.OCR_FAST_ACCEPT_SCORE || 140));
const OCR_FAST_ACCEPT_CHARS = Math.max(40, Number(process.env.OCR_FAST_ACCEPT_CHARS || 100));
const OCR_WARMUP_ON_START = String(process.env.OCR_WARMUP_ON_START || 'true').toLowerCase() !== 'false';
const OCR_CACHE_MAX_ENTRIES = Math.max(10, Number(process.env.OCR_CACHE_MAX_ENTRIES || 200));
const OCR_CACHE_TTL_MS = Math.max(60000, Number(process.env.OCR_CACHE_TTL_MS || 1800000));
const PDF_MIN_TEXT_CHARS = Math.max(40, Number(process.env.PDF_MIN_TEXT_CHARS || 120));
const PDF_MIN_TEXT_LINES = Math.max(2, Number(process.env.PDF_MIN_TEXT_LINES || 4));

let sharedOcrWorkerPromise = null;
let ocrQueue = Promise.resolve();
const ocrResultCache = new Map();

function enqueueOcrTask(task) {
    const run = ocrQueue.then(task, task);
    ocrQueue = run.catch(() => {});
    return run;
}

async function getSharedOcrWorker() {
    if (!sharedOcrWorkerPromise) {
        sharedOcrWorkerPromise = createWorker('eng').catch((err) => {
            sharedOcrWorkerPromise = null;
            throw err;
        });
    }
    return sharedOcrWorkerPromise;
}

function computeBufferHash(buffer) {
    return crypto.createHash('sha1').update(buffer).digest('hex');
}

function getCachedOcrResult(hash) {
    const entry = ocrResultCache.get(hash);
    if (!entry) return null;
    if ((Date.now() - Number(entry.storedAt || 0)) > OCR_CACHE_TTL_MS) {
        ocrResultCache.delete(hash);
        return null;
    }
    ocrResultCache.delete(hash);
    ocrResultCache.set(hash, entry);
    return entry.payload;
}

function setCachedOcrResult(hash, payload) {
    while (ocrResultCache.size >= OCR_CACHE_MAX_ENTRIES) {
        const firstKey = ocrResultCache.keys().next().value;
        if (!firstKey) break;
        ocrResultCache.delete(firstKey);
    }
    ocrResultCache.set(hash, { storedAt: Date.now(), payload });
}

function shouldAcceptQuickOcr(score, text) {
    const normalized = String(text || '');
    if (score >= OCR_FAST_ACCEPT_SCORE) return true;
    if (normalized.length >= OCR_FAST_ACCEPT_CHARS && /(hba1c|glucose|blood|patient|report|mg\s*\/?\s*d\s*l|bp|cholesterol|creatinine|thyroid|tsh|haemoglobin|hemoglobin|platelet|bilirubin|sgot|sgpt|urea|vitamin)/i.test(normalized)) {
        return true;
    }
    return false;
}

if (OCR_WARMUP_ON_START) {
    setTimeout(() => { getSharedOcrWorker().catch(() => {}); }, 200);
}

// ── Medical OCR noise correction (expanded) ─────────────────────────
function normalizeOcrArtifacts(text) {
    return String(text || '')
        .replace(/\r/g, '\n')
        // Pipe → I
        .replace(/[|]/g, 'I')
        // HbA1c variants
        .replace(/\bH8A1C\b/gi, 'HbA1c')
        .replace(/\bHBAlC\b/gi, 'HbA1c')
        .replace(/\bHBAIC\b/gi, 'HbA1c')
        .replace(/\bHbAlc\b/g, 'HbA1c')
        .replace(/\bHbA1C\b/g, 'HbA1c')
        .replace(/\bHBA1c\b/g, 'HbA1c')
        .replace(/\bHBA 1C\b/gi, 'HbA1c')
        .replace(/\bHb A1c\b/gi, 'HbA1c')
        .replace(/\bHb A1C\b/gi, 'HbA1c')
        .replace(/\bH6A1C\b/gi, 'HbA1c')
        // Common medical term OCR misreads
        .replace(/\bG1ucose\b/gi, 'Glucose')
        .replace(/\bGIucose\b/gi, 'Glucose')
        .replace(/\bg1ucose\b/g, 'glucose')
        .replace(/\bB1ood\b/gi, 'Blood')
        .replace(/\bb1ood\b/g, 'blood')
        .replace(/\b8P\b/g, 'BP')
        .replace(/\bA8G\b/gi, 'ABG')
        .replace(/\bCho1estero1\b/gi, 'Cholesterol')
        .replace(/\bcho1estero1\b/g, 'cholesterol')
        .replace(/\bTrig1ycerides\b/gi, 'Triglycerides')
        .replace(/\bCreatinine\b/gi, 'Creatinine')
        .replace(/\bcreatinine\b/gi, 'creatinine')
        .replace(/\bBi1irubin\b/gi, 'Bilirubin')
        .replace(/\bbi1irubin\b/g, 'bilirubin')
        .replace(/\bHaemog1obin\b/gi, 'Haemoglobin')
        .replace(/\bHemog1obin\b/gi, 'Hemoglobin')
        .replace(/\bP1atelets?\b/gi, 'Platelets')
        .replace(/\bLeukocytes\b/gi, 'Leukocytes')
        .replace(/\bLymphocytes\b/gi, 'Lymphocytes')
        .replace(/\bNeutrophi1s\b/gi, 'Neutrophils')
        .replace(/\bA1bumin\b/gi, 'Albumin')
        .replace(/\ba1bumin\b/g, 'albumin')
        .replace(/\bG1obulin\b/gi, 'Globulin')
        .replace(/\bThyroxine\b/gi, 'Thyroxine')
        .replace(/\bTriiodothyronine\b/gi, 'Triiodothyronine')
        // l↔1 in numbers near units
        .replace(/(\d)l(\d)/g, '$1 $2') // stray l between digits
        .replace(/\bI(\d{2,3})\s*mg/g, '$1 mg') // I126 mg → 126 mg
        // Unit normalization
        .replace(/mg\s*d\s*l\b/gi, 'mg/dL')
        .replace(/mg\s*\/\s*d\s*l\b/gi, 'mg/dL')
        .replace(/u\s*IU\s*\/?\s*mL\b/gi, 'μIU/mL')
        .replace(/uIU\s*\/?\s*mL\b/gi, 'μIU/mL')
        .replace(/g\s*\/?\s*d\s*l\b/gi, 'g/dL')
        .replace(/ng\s*\/?\s*m\s*l\b/gi, 'ng/mL')
        .replace(/pg\s*\/?\s*m\s*l\b/gi, 'pg/mL')
        .replace(/mm\s*o\s*l\s*\/?\s*L\b/gi, 'mmol/L')
        .replace(/IU\s*\/?\s*L\b/gi, 'IU/L')
        .replace(/U\s*\/?\s*L\b/g, 'U/L')
        .replace(/m\s*Eq\s*\/?\s*L\b/gi, 'mEq/L')
        .replace(/\bcells?\s*\/?\s*cumm\b/gi, 'cells/cumm')
        .replace(/\blakhs?\s*\/?\s*cumm\b/gi, 'lakhs/cumm')
        .replace(/\bx\s*10\s*[3³]\s*\/?\s*[uμ]?L\b/gi, 'x10³/µL')
        .replace(/\bx\s*10\s*[6⁶]\s*\/?\s*[uμ]?L\b/gi, 'x10⁶/µL')
        // 5↔S, 0↔O near known fields
        .replace(/\bS(\d{2,3})\s*mg/g, '5$1 mg')
        // Whitespace cleanup
        .replace(/[ ]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// ── Scoring ─────────────────────────────────────────────────────────
function scoreOcrText(text) {
    const value = String(text || '').trim();
    if (!value) return 0;

    const alphaNumCount = (value.match(/[a-z0-9]/gi) || []).length;
    const lineCount = value.split(/\r?\n/).filter((line) => line.trim().length > 0).length;

    const keywordBoost = [
        /h\s*b\s*a\s*1\s*c/i,
        /a\s*1\s*c/i,
        /glu\s*c\s*o\s*s\s*e/i,
        /blood\s*pressure/i,
        /bp\s*[:\-]?\s*\d{2,3}\s*[\/\\]\s*\d{2,3}/i,
        /mg\s*\/?\s*d\s*l/i,
        /cholesterol/i,
        /triglycerides?/i,
        /creatinine/i,
        /bilirubin/i,
        /h[ae]moglobin/i,
        /platelet/i,
        /\btsh\b/i,
        /thyroid/i,
        /\bsgot\b|\bast\b/i,
        /\bsgpt\b|\balt\b/i,
        /vitamin\s*[db]/i,
        /uric\s*acid/i,
        /sodium|potassium|calcium/i,
        /\bwbc\b|\bleukocyte/i,
        /\brbc\b|red\s*blood/i,
        /\besr\b|erythrocyte\s*sed/i,
        /\bcrp\b|c.reactive/i,
        /fasting|post\s*prandial|random/i,
        /patient\s*name/i,
        /report\s*date/i,
        /reference\s*range/i,
        /normal\s*value/i,
    ].reduce((score, regex) => (regex.test(value) ? score + 20 : score), 0);

    return alphaNumCount + (lineCount * 8) + keywordBoost;
}

function decodeBase64Content(base64Content) {
    const value = String(base64Content || '').trim();
    if (!value) return null;
    const contentOnly = value.includes(',') ? value.split(',').pop() : value;
    try {
        const buffer = Buffer.from(contentOnly, 'base64');
        return buffer.length ? buffer : null;
    } catch { return null; }
}

function inferType(fileType, fileName) {
    const explicit = String(fileType || '').toLowerCase();
    if (explicit.includes('pdf')) return 'pdf';
    if (explicit.includes('docx') || explicit.includes('word')) return 'docx';
    if (explicit.includes('text') || explicit.includes('txt')) return 'txt';
    if (explicit.includes('png')) return 'png';
    if (explicit.includes('jpg') || explicit.includes('jpeg')) return 'jpg';
    if (explicit.includes('webp')) return 'webp';
    if (explicit.includes('bmp')) return 'bmp';
    if (explicit.includes('tif') || explicit.includes('tiff')) return 'tiff';

    const lowerName = String(fileName || '').toLowerCase();
    if (lowerName.endsWith('.pdf')) return 'pdf';
    if (lowerName.endsWith('.docx')) return 'docx';
    if (lowerName.endsWith('.txt')) return 'txt';
    if (lowerName.endsWith('.png')) return 'png';
    if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'jpg';
    if (lowerName.endsWith('.webp')) return 'webp';
    if (lowerName.endsWith('.bmp')) return 'bmp';
    if (lowerName.endsWith('.tif') || lowerName.endsWith('.tiff')) return 'tiff';
    return 'unknown';
}

function toImageBuffer(image, mimeType) {
    if (!image) return Promise.resolve(null);
    if (typeof image.getBufferAsync === 'function') return image.getBufferAsync(mimeType);
    return new Promise((resolve, reject) => {
        image.getBuffer(mimeType, (err, buffer) => { if (err) return reject(err); resolve(buffer); });
    });
}

// ── Image variant builder (enhanced) ────────────────────────────────
async function buildOcrImageVariants(buffer) {
    const variants = [{ name: 'original', buffer }];
    try {
        const image = await Jimp.read(buffer);
        const width = image && image.bitmap ? Number(image.bitmap.width) : 0;
        const height = image && image.bitmap ? Number(image.bitmap.height) : 0;
        if (!width || !height) return variants;

        // Variant 1: Grayscale + contrast (standard)
        const enhanced = image.clone().normalize().greyscale().contrast(0.35);
        const enhancedBuf = await toImageBuffer(enhanced, JIMP_MIME_PNG);
        if (enhancedBuf && enhancedBuf.length) {
            variants.push({ name: 'gray-contrast', buffer: enhancedBuf });
        }

        // Variant 2: High contrast + sharpen (for blurry photos)
        const sharp = image.clone().normalize().greyscale().contrast(0.55);
        // Simulate sharpen with a convolve kernel if available
        if (typeof sharp.convolute === 'function') {
            sharp.convolute([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]]);
        }
        const sharpBuf = await toImageBuffer(sharp, JIMP_MIME_PNG);
        if (sharpBuf && sharpBuf.length) {
            variants.push({ name: 'sharp-highcontrast', buffer: sharpBuf });
        }

        // Variant 3: Adaptive binarization (threshold at mid-brightness)
        const binary = image.clone().normalize().greyscale().contrast(0.7);
        // Extreme contrast effectively binarizes
        const binaryBuf = await toImageBuffer(binary, JIMP_MIME_PNG);
        if (binaryBuf && binaryBuf.length) {
            variants.push({ name: 'binarized', buffer: binaryBuf });
        }

        // Variant 4: Upscaled for small images
        if ((width * height) <= OCR_UPSCALE_LIMIT_PIXELS) {
            const upscaled = image.clone().normalize().greyscale().contrast(0.45);
            upscaled.resize(Math.max(1, Math.round(width * 1.8)), Math.max(1, Math.round(height * 1.8)));
            const upscaledBuf = await toImageBuffer(upscaled, JIMP_MIME_PNG);
            if (upscaledBuf && upscaledBuf.length) {
                variants.push({ name: 'upscaled-1.8x', buffer: upscaledBuf });
            }
        }

        // Variant 5: Rotated for landscape-oriented reports
        if (width > height * 1.25) {
            const rotated = image.clone().rotate(90).normalize().greyscale().contrast(0.35);
            const rotatedBuf = await toImageBuffer(rotated, JIMP_MIME_PNG);
            if (rotatedBuf && rotatedBuf.length) {
                variants.push({ name: 'rotated-90', buffer: rotatedBuf });
            }
        }
    } catch (_err) {
        // Keep original buffer when preprocessing fails.
    }
    return variants.slice(0, OCR_MAX_VARIANTS);
}

// ── Core OCR extraction ─────────────────────────────────────────────
async function extractImageText(buffer) {
    return enqueueOcrTask(async () => {
        const hash = computeBufferHash(buffer);
        const cachedPayload = getCachedOcrResult(hash);
        if (cachedPayload) return { ...cachedPayload, cacheHit: true };

        const worker = await getSharedOcrWorker();

        const passes = [
            { name: 'psm6-block', params: { tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: '1' } },
            { name: 'psm3-auto', params: { tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1' } },
            { name: 'psm4-column', params: { tessedit_pageseg_mode: PSM.SINGLE_COLUMN, preserve_interword_spaces: '1' } },
            { name: 'psm11-sparse', params: { tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: '1' } },
        ];

        let bestText = '';
        let bestScore = -1;
        let bestPass = 'unknown';
        let bestVariant = 'original';
        let variantCount = 1;
        const diagnostics = [];
        let attemptsRun = 0;
        const startedAt = Date.now();
        let timedOut = false;
        let quickAccepted = false;

        async function runPassOnBuffer(targetBuffer, variantName, pass) {
            if (!targetBuffer || !pass) return false;
            if (attemptsRun >= OCR_MAX_ATTEMPTS) return true;
            if ((Date.now() - startedAt) >= OCR_MAX_MS) { timedOut = true; return true; }
            try {
                attemptsRun += 1;
                await worker.setParameters(pass.params);
                const result = await worker.recognize(targetBuffer);
                const text = normalizeOcrArtifacts(result && result.data ? result.data.text : '');
                const score = scoreOcrText(text);
                diagnostics.push({ variant: variantName, pass: pass.name, score, chars: text.length });
                if (score > bestScore) { bestScore = score; bestText = text; bestPass = pass.name; bestVariant = variantName; }
                if (score >= OCR_EARLY_EXIT_SCORE && text.length >= 80) return true;
                return false;
            } catch (err) {
                diagnostics.push({ variant: variantName, pass: pass.name, score: -1, chars: 0, error: err && err.message ? err.message : 'ocr-failed' });
                return false;
            }
        }

        // Fast path: primary pass on original
        let shouldStop = await runPassOnBuffer(buffer, 'original', passes[0]);
        if (!shouldStop && shouldAcceptQuickOcr(bestScore, bestText)) { shouldStop = true; quickAccepted = true; }

        if (!shouldStop) {
            const variants = await buildOcrImageVariants(buffer);
            variantCount = variants.length;

            // Quick pass on all variants
            const quickVariants = variants.filter((v) => v && v.name !== 'original');
            for (const variant of quickVariants) {
                shouldStop = await runPassOnBuffer(variant.buffer, variant.name, passes[0]);
                if (shouldStop) break;
            }
            if (!shouldStop && shouldAcceptQuickOcr(bestScore, bestText)) { shouldStop = true; quickAccepted = true; }

            // Fallback passes on all variants
            if (!shouldStop) {
                outerLoop:
                for (let p = 1; p < passes.length; p++) {
                    for (const variant of variants) {
                        shouldStop = await runPassOnBuffer(variant.buffer, variant.name, passes[p]);
                        if (shouldStop) break outerLoop;
                    }
                    if (attemptsRun >= OCR_MAX_ATTEMPTS) break;
                    if ((Date.now() - startedAt) >= OCR_MAX_MS) { timedOut = true; break; }
                }
            }
        }

        diagnostics.sort((a, b) => Number(b.score || -1) - Number(a.score || -1));
        const resultPayload = {
            text: bestText, bestPass, bestVariant, bestScore, variantCount, attemptsRun,
            maxAttempts: OCR_MAX_ATTEMPTS, maxVariants: OCR_MAX_VARIANTS, timedOut,
            workerMode: 'shared', quickAccepted,
            attempts: diagnostics.slice(0, 12),
        };
        setCachedOcrResult(hash, resultPayload);
        return { ...resultPayload, cacheHit: false };
    });
}

// ── Document parser ─────────────────────────────────────────────────
async function parseDocumentToText({ fileName, fileType, text, base64Content }) {
    const plainText = String(text || '').trim();
    if (plainText) {
        return { text: plainText, parser: 'provided-text', inferredType: inferType(fileType, fileName), ocrDiagnostics: null };
    }

    const buffer = decodeBase64Content(base64Content);
    if (!buffer) {
        return { text: '', parser: 'none', inferredType: inferType(fileType, fileName), ocrDiagnostics: null };
    }

    const inferredType = inferType(fileType, fileName);

    if (inferredType === 'pdf') {
        const parsed = await pdfParse(buffer);
        const extractedText = String((parsed && parsed.text) || '').trim();
        const nonEmptyLines = extractedText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).length;
        const alphaNumericChars = (extractedText.match(/[a-z0-9]/gi) || []).length;
        const likelyScannedPdf = extractedText.length < PDF_MIN_TEXT_CHARS || nonEmptyLines < PDF_MIN_TEXT_LINES || alphaNumericChars < Math.floor(PDF_MIN_TEXT_CHARS * 0.35);

        // If scanned PDF, attempt OCR on the raw buffer
        if (likelyScannedPdf) {
            try {
                const ocrResult = await extractImageText(buffer);
                if (ocrResult && ocrResult.text && scoreOcrText(ocrResult.text) > scoreOcrText(extractedText)) {
                    return {
                        text: ocrResult.text, parser: 'tesseract-ocr:pdf-fallback:' + ocrResult.bestVariant + ':' + ocrResult.bestPass,
                        inferredType, ocrDiagnostics: { source: 'pdf-ocr-fallback', bestPass: ocrResult.bestPass, bestVariant: ocrResult.bestVariant, bestScore: ocrResult.bestScore, variantCount: ocrResult.variantCount, attemptsRun: ocrResult.attemptsRun, likelyScannedPdf: true },
                    };
                }
            } catch (_ocrErr) { /* fall through to embedded text */ }
        }

        return {
            text: extractedText, parser: 'pdf-parse', inferredType,
            ocrDiagnostics: { source: 'pdf-parse', pdfTextChars: extractedText.length, pdfLineCount: nonEmptyLines, likelyScannedPdf, note: likelyScannedPdf ? 'Low embedded text in PDF. File may be scan/image-based.' : 'Extracted embedded text from PDF successfully.' },
        };
    }

    if (inferredType === 'docx') {
        const parsed = await mammoth.extractRawText({ buffer });
        return { text: String((parsed && parsed.value) || '').trim(), parser: 'mammoth', inferredType, ocrDiagnostics: null };
    }

    if (inferredType === 'txt') {
        return { text: buffer.toString('utf8').trim(), parser: 'utf8', inferredType, ocrDiagnostics: null };
    }

    if (['png', 'jpg', 'webp', 'bmp', 'tiff'].includes(inferredType)) {
        const extracted = await extractImageText(buffer);
        return {
            text: extracted.text, parser: 'tesseract-ocr:' + extracted.bestVariant + ':' + extracted.bestPass, inferredType,
            ocrDiagnostics: { bestPass: extracted.bestPass, bestVariant: extracted.bestVariant, bestScore: extracted.bestScore, variantCount: extracted.variantCount, attemptsRun: extracted.attemptsRun, maxAttempts: extracted.maxAttempts, maxVariants: extracted.maxVariants, maxMs: OCR_MAX_MS, timedOut: extracted.timedOut, cacheHit: Boolean(extracted.cacheHit), quickAccepted: Boolean(extracted.quickAccepted), attempts: extracted.attempts },
        };
    }

    return { text: buffer.toString('utf8').trim(), parser: 'fallback-utf8', inferredType, ocrDiagnostics: null };
}

module.exports = { parseDocumentToText };
