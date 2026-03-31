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
const OCR_MAX_VARIANTS = Math.max(1, Number(process.env.OCR_MAX_VARIANTS || 2));
const OCR_MAX_ATTEMPTS = Math.max(1, Number(process.env.OCR_MAX_ATTEMPTS || 3));
const OCR_EARLY_EXIT_SCORE = Math.max(80, Number(process.env.OCR_EARLY_EXIT_SCORE || 170));
const OCR_MAX_MS = Math.max(5000, Number(process.env.OCR_MAX_MS || 12000));
const OCR_UPSCALE_LIMIT_PIXELS = Math.max(100000, Number(process.env.OCR_UPSCALE_LIMIT_PIXELS || 1400000));
const OCR_FAST_ACCEPT_SCORE = Math.max(60, Number(process.env.OCR_FAST_ACCEPT_SCORE || 120));
const OCR_FAST_ACCEPT_CHARS = Math.max(40, Number(process.env.OCR_FAST_ACCEPT_CHARS || 120));
const OCR_WARMUP_ON_START = String(process.env.OCR_WARMUP_ON_START || 'true').toLowerCase() !== 'false';
const OCR_CACHE_MAX_ENTRIES = Math.max(10, Number(process.env.OCR_CACHE_MAX_ENTRIES || 120));
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

    // Refresh entry recency.
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

    ocrResultCache.set(hash, {
        storedAt: Date.now(),
        payload,
    });
}

function shouldAcceptQuickOcr(score, text) {
    const normalized = String(text || '');
    if (score >= OCR_FAST_ACCEPT_SCORE) return true;
    if (normalized.length >= OCR_FAST_ACCEPT_CHARS && /(hba1c|glucose|blood|patient|report|mg\s*\/?\s*d\s*l|bp)/i.test(normalized)) {
        return true;
    }
    return false;
}

if (OCR_WARMUP_ON_START) {
    setTimeout(() => {
        getSharedOcrWorker().catch(() => {});
    }, 200);
}

function decodeBase64Content(base64Content) {
    const value = String(base64Content || '').trim();
    if (!value) return null;

    const contentOnly = value.includes(',') ? value.split(',').pop() : value;
    try {
        const buffer = Buffer.from(contentOnly, 'base64');
        return buffer.length ? buffer : null;
    } catch {
        return null;
    }
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
    ].reduce((score, regex) => (regex.test(value) ? score + 25 : score), 0);

    return alphaNumCount + (lineCount * 8) + keywordBoost;
}

function normalizeOcrArtifacts(text) {
    return String(text || '')
        .replace(/\r/g, '\n')
        .replace(/[|]/g, 'I')
        .replace(/\bH8A1C\b/gi, 'HbA1c')
        .replace(/\bHBAlC\b/gi, 'HbA1c')
        .replace(/\bHBAIC\b/gi, 'HbA1c')
        .replace(/\bG1ucose\b/gi, 'Glucose')
        .replace(/\b8P\b/g, 'BP')
        .replace(/[ ]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function toImageBuffer(image, mimeType) {
    if (!image) return Promise.resolve(null);

    if (typeof image.getBufferAsync === 'function') {
        return image.getBufferAsync(mimeType);
    }

    return new Promise((resolve, reject) => {
        image.getBuffer(mimeType, (err, buffer) => {
            if (err) return reject(err);
            resolve(buffer);
        });
    });
}

async function buildOcrImageVariants(buffer) {
    const variants = [{ name: 'original', buffer }];

    try {
        const image = await Jimp.read(buffer);
        const width = image && image.bitmap ? Number(image.bitmap.width) : 0;
        const height = image && image.bitmap ? Number(image.bitmap.height) : 0;
        if (!width || !height) return variants;

        const enhanced = image.clone().normalize().greyscale().contrast(0.35);
        const enhancedBuffer = await toImageBuffer(enhanced, JIMP_MIME_PNG);
        if (enhancedBuffer && enhancedBuffer.length) {
            variants.push({ name: 'gray-contrast', buffer: enhancedBuffer });
        }

        if (OCR_MAX_VARIANTS >= 3 && (width * height) <= OCR_UPSCALE_LIMIT_PIXELS) {
            const upscaled = image.clone().normalize().greyscale().contrast(0.45);
            upscaled.resize(Math.max(1, Math.round(width * 1.6)), Math.max(1, Math.round(height * 1.6)));
            const upscaledBuffer = await toImageBuffer(upscaled, JIMP_MIME_PNG);
            if (upscaledBuffer && upscaledBuffer.length) {
                variants.push({ name: 'upscaled-1.6x', buffer: upscaledBuffer });
            }
        }

        if (width > height * 1.25) {
            const rotated = image.clone().rotate(90).normalize().greyscale().contrast(0.35);
            const rotatedBuffer = await toImageBuffer(rotated, JIMP_MIME_PNG);
            if (rotatedBuffer && rotatedBuffer.length) {
                variants.push({ name: 'rotated-90', buffer: rotatedBuffer });
            }
        }
    } catch (_err) {
        // Keep original buffer when preprocessing fails.
    }

    return variants.slice(0, OCR_MAX_VARIANTS);
}

async function extractImageText(buffer) {
    return enqueueOcrTask(async () => {
        const hash = computeBufferHash(buffer);
        const cachedPayload = getCachedOcrResult(hash);
        if (cachedPayload) {
            return {
                ...cachedPayload,
                cacheHit: true,
            };
        }

        const worker = await getSharedOcrWorker();
        const quickPass = {
            name: 'psm6',
            params: {
                tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
                preserve_interword_spaces: '1',
            },
        };
        const fallbackPasses = [
            {
                name: 'psm11',
                params: {
                    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
                    preserve_interword_spaces: '1',
                },
            },
            {
                name: 'psm4',
                params: {
                    tessedit_pageseg_mode: PSM.SINGLE_COLUMN,
                    preserve_interword_spaces: '1',
                },
            },
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
            if ((Date.now() - startedAt) >= OCR_MAX_MS) {
                timedOut = true;
                return true;
            }

            try {
                attemptsRun += 1;
                await worker.setParameters(pass.params);
                const result = await worker.recognize(targetBuffer);
                const text = normalizeOcrArtifacts(result && result.data ? result.data.text : '');
                const score = scoreOcrText(text);

                diagnostics.push({
                    variant: variantName,
                    pass: pass.name,
                    score,
                    chars: text.length,
                });

                if (score > bestScore) {
                    bestScore = score;
                    bestText = text;
                    bestPass = pass.name;
                    bestVariant = variantName;
                }

                if (score >= OCR_EARLY_EXIT_SCORE && text.length >= 80) {
                    return true;
                }
                return false;
            } catch (err) {
                diagnostics.push({
                    variant: variantName,
                    pass: pass.name,
                    score: -1,
                    chars: 0,
                    error: err && err.message ? err.message : 'ocr-failed',
                });
                return false;
            }
        }

        // Fast path: run OCR on original image first and exit if good enough.
        let shouldStop = await runPassOnBuffer(buffer, 'original', quickPass);
        if (shouldStop) {
            quickAccepted = true;
        } else if (shouldAcceptQuickOcr(bestScore, bestText)) {
            shouldStop = true;
            quickAccepted = true;
        }

        if (!shouldStop) {
            const variants = await buildOcrImageVariants(buffer);
            variantCount = variants.length;

            // Avoid repeating same quick pass on original variant.
            const quickVariants = variants.filter((variant) => variant && variant.name !== 'original');
            for (const variant of quickVariants) {
                shouldStop = await runPassOnBuffer(variant.buffer, variant.name, quickPass);
                if (shouldStop) break;
            }

            if (shouldStop) {
                quickAccepted = true;
            } else if (shouldAcceptQuickOcr(bestScore, bestText)) {
                shouldStop = true;
                quickAccepted = true;
            }

            if (!shouldStop) {
                outerLoop:
                for (const pass of fallbackPasses) {
                    for (const variant of variants) {
                        shouldStop = await runPassOnBuffer(variant.buffer, variant.name, pass);
                        if (shouldStop) break outerLoop;
                    }

                    if (attemptsRun >= OCR_MAX_ATTEMPTS) break;
                    if ((Date.now() - startedAt) >= OCR_MAX_MS) {
                        timedOut = true;
                        break;
                    }
                }
            }
        }

        diagnostics.sort((a, b) => Number(b.score || -1) - Number(a.score || -1));

        const resultPayload = {
            text: bestText,
            bestPass,
            bestVariant,
            bestScore,
            variantCount,
            attemptsRun,
            maxAttempts: OCR_MAX_ATTEMPTS,
            maxVariants: OCR_MAX_VARIANTS,
            timedOut,
            workerMode: 'shared',
            quickAccepted,
            attempts: diagnostics.slice(0, 10),
        };

        setCachedOcrResult(hash, resultPayload);
        return {
            ...resultPayload,
            cacheHit: false,
        };
    });
}

async function parseDocumentToText({ fileName, fileType, text, base64Content }) {
    const plainText = String(text || '').trim();
    if (plainText) {
        return {
            text: plainText,
            parser: 'provided-text',
            inferredType: inferType(fileType, fileName),
            ocrDiagnostics: null,
        };
    }

    const buffer = decodeBase64Content(base64Content);
    if (!buffer) {
        return {
            text: '',
            parser: 'none',
            inferredType: inferType(fileType, fileName),
            ocrDiagnostics: null,
        };
    }

    const inferredType = inferType(fileType, fileName);

    if (inferredType === 'pdf') {
        const parsed = await pdfParse(buffer);
        const extractedText = String((parsed && parsed.text) || '').trim();
        const nonEmptyLines = extractedText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length;
        const alphaNumericChars = (extractedText.match(/[a-z0-9]/gi) || []).length;
        const likelyScannedPdf = extractedText.length < PDF_MIN_TEXT_CHARS
            || nonEmptyLines < PDF_MIN_TEXT_LINES
            || alphaNumericChars < Math.floor(PDF_MIN_TEXT_CHARS * 0.35);

        return {
            text: extractedText,
            parser: 'pdf-parse',
            inferredType,
            ocrDiagnostics: {
                source: 'pdf-parse',
                pdfTextChars: extractedText.length,
                pdfLineCount: nonEmptyLines,
                likelyScannedPdf,
                note: likelyScannedPdf
                    ? 'Low embedded text in PDF. File may be scan/image-based; OCR fallback for PDF is limited in current pipeline.'
                    : 'Extracted embedded text from PDF successfully.',
            },
        };
    }

    if (inferredType === 'docx') {
        const parsed = await mammoth.extractRawText({ buffer });
        return {
            text: String((parsed && parsed.value) || '').trim(),
            parser: 'mammoth',
            inferredType,
            ocrDiagnostics: null,
        };
    }

    if (inferredType === 'txt') {
        return {
            text: buffer.toString('utf8').trim(),
            parser: 'utf8',
            inferredType,
            ocrDiagnostics: null,
        };
    }

    if (['png', 'jpg', 'webp', 'bmp', 'tiff'].includes(inferredType)) {
        const extracted = await extractImageText(buffer);
        return {
            text: extracted.text,
            parser: 'tesseract-ocr:' + extracted.bestVariant + ':' + extracted.bestPass,
            inferredType,
            ocrDiagnostics: {
                bestPass: extracted.bestPass,
                bestVariant: extracted.bestVariant,
                bestScore: extracted.bestScore,
                variantCount: extracted.variantCount,
                attemptsRun: extracted.attemptsRun,
                maxAttempts: extracted.maxAttempts,
                maxVariants: extracted.maxVariants,
                maxMs: OCR_MAX_MS,
                timedOut: extracted.timedOut,
                cacheHit: Boolean(extracted.cacheHit),
                quickAccepted: Boolean(extracted.quickAccepted),
                attempts: extracted.attempts,
            },
        };
    }

    return {
        text: buffer.toString('utf8').trim(),
        parser: 'fallback-utf8',
        inferredType,
        ocrDiagnostics: null,
    };
}

module.exports = {
    parseDocumentToText,
};
