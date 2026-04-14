// ── Backend Document Parser (upgraded to match Ai/ layer quality) ────
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { createWorker, PSM } = require('tesseract.js');
const crypto = require('crypto');

let jimpModule;
let Jimp;
let JIMP_MIME_PNG;
try {
    jimpModule = require('jimp');
    Jimp = jimpModule.Jimp || jimpModule;
    JIMP_MIME_PNG = jimpModule.MIME_PNG || 'image/png';
} catch (_) { Jimp = null; }

// ── Shared worker + queue + cache ───────────────────────────────────
let sharedWorkerPromise = null;
let ocrQueue = Promise.resolve();
const ocrCache = new Map();
const CACHE_MAX = 120;
const CACHE_TTL = 1800000;

function enqueue(task) {
    const run = ocrQueue.then(task, task);
    ocrQueue = run.catch(() => {});
    return run;
}

async function getWorker() {
    if (!sharedWorkerPromise) {
        sharedWorkerPromise = createWorker('eng').catch((err) => { sharedWorkerPromise = null; throw err; });
    }
    return sharedWorkerPromise;
}

function bufferHash(buf) { return crypto.createHash('sha1').update(buf).digest('hex'); }

function getCached(hash) {
    const e = ocrCache.get(hash);
    if (!e) return null;
    if (Date.now() - e.at > CACHE_TTL) { ocrCache.delete(hash); return null; }
    ocrCache.delete(hash); ocrCache.set(hash, e);
    return e.payload;
}

function setCache(hash, payload) {
    while (ocrCache.size >= CACHE_MAX) { const k = ocrCache.keys().next().value; if (!k) break; ocrCache.delete(k); }
    ocrCache.set(hash, { at: Date.now(), payload });
}

// Warmup
setTimeout(() => { getWorker().catch(() => {}); }, 300);

function decodeBase64Content(base64Content) {
    const value = String(base64Content || '').trim();
    if (!value) return null;
    const contentOnly = value.includes(',') ? value.split(',').pop() : value;
    try { const buf = Buffer.from(contentOnly, 'base64'); return buf.length ? buf : null; } catch { return null; }
}

function inferType(fileType, fileName) {
    const ex = String(fileType || '').toLowerCase();
    if (ex.includes('pdf')) return 'pdf';
    if (ex.includes('docx') || ex.includes('word')) return 'docx';
    if (ex.includes('text') || ex.includes('txt')) return 'txt';
    if (ex.includes('png')) return 'png';
    if (ex.includes('jpg') || ex.includes('jpeg')) return 'jpg';
    if (ex.includes('webp')) return 'webp';
    if (ex.includes('bmp')) return 'bmp';
    if (ex.includes('tif')) return 'tiff';
    const n = String(fileName || '').toLowerCase();
    if (n.endsWith('.pdf')) return 'pdf';
    if (n.endsWith('.docx')) return 'docx';
    if (n.endsWith('.txt')) return 'txt';
    if (n.endsWith('.png')) return 'png';
    if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'jpg';
    if (n.endsWith('.webp')) return 'webp';
    if (n.endsWith('.bmp')) return 'bmp';
    if (n.endsWith('.tif') || n.endsWith('.tiff')) return 'tiff';
    return 'unknown';
}

function toImageBuffer(image, mime) {
    if (!image) return Promise.resolve(null);
    if (typeof image.getBufferAsync === 'function') return image.getBufferAsync(mime);
    return new Promise((res, rej) => { image.getBuffer(mime, (e, b) => e ? rej(e) : res(b)); });
}

async function buildVariants(buffer) {
    const variants = [{ name: 'original', buffer }];
    if (!Jimp) return variants;
    try {
        const img = await Jimp.read(buffer);
        const w = img.bitmap ? img.bitmap.width : 0;
        const h = img.bitmap ? img.bitmap.height : 0;
        if (!w || !h) return variants;
        const gray = img.clone().normalize().greyscale().contrast(0.35);
        const gBuf = await toImageBuffer(gray, JIMP_MIME_PNG);
        if (gBuf) variants.push({ name: 'gray-contrast', buffer: gBuf });
        const sharp = img.clone().normalize().greyscale().contrast(0.55);
        const sBuf = await toImageBuffer(sharp, JIMP_MIME_PNG);
        if (sBuf) variants.push({ name: 'sharp', buffer: sBuf });
    } catch (_) {}
    return variants.slice(0, 3);
}

function scoreText(text) {
    const v = String(text || '').trim();
    if (!v) return 0;
    const alpha = (v.match(/[a-z0-9]/gi) || []).length;
    const lines = v.split(/\r?\n/).filter((l) => l.trim()).length;
    const kw = [/hba1c/i, /glucose/i, /blood/i, /patient/i, /mg.*dl/i, /cholesterol/i, /creatinine/i, /tsh/i, /haemoglobin/i, /platelet/i]
        .reduce((s, r) => r.test(v) ? s + 20 : s, 0);
    return alpha + lines * 8 + kw;
}

async function extractImageText(buffer) {
    return enqueue(async () => {
        const hash = bufferHash(buffer);
        const cached = getCached(hash);
        if (cached) return { ...cached, cacheHit: true };

        const worker = await getWorker();
        const passes = [
            { name: 'psm6', params: { tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: '1' } },
            { name: 'psm3', params: { tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1' } },
            { name: 'psm11', params: { tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: '1' } },
        ];

        let best = { text: '', score: -1, pass: 'unknown', variant: 'original' };
        let attempts = 0;
        const started = Date.now();
        const variants = await buildVariants(buffer);

        for (const pass of passes) {
            for (const variant of variants) {
                if (attempts >= 6 || Date.now() - started >= 18000) break;
                try {
                    attempts++;
                    await worker.setParameters(pass.params);
                    const r = await worker.recognize(variant.buffer);
                    const text = String(r && r.data ? r.data.text : '').trim();
                    const score = scoreText(text);
                    if (score > best.score) { best = { text, score, pass: pass.name, variant: variant.name }; }
                    if (score >= 180 && text.length >= 80) break;
                } catch (_) {}
            }
            if (best.score >= 180) break;
        }

        const payload = { text: best.text, bestPass: best.pass, bestVariant: best.variant, bestScore: best.score, attemptsRun: attempts };
        setCache(hash, payload);
        return { ...payload, cacheHit: false };
    });
}

async function parseDocumentToText({ fileName, fileType, text, base64Content }) {
    const plainText = String(text || '').trim();
    if (plainText) return { text: plainText, parser: 'provided-text', inferredType: inferType(fileType, fileName), ocrDiagnostics: null };

    const buffer = decodeBase64Content(base64Content);
    if (!buffer) return { text: '', parser: 'none', inferredType: inferType(fileType, fileName), ocrDiagnostics: null };

    const inferredType = inferType(fileType, fileName);

    if (inferredType === 'pdf') {
        const parsed = await pdfParse(buffer);
        const t = String((parsed && parsed.text) || '').trim();
        const lines = t.split(/\r?\n/).filter(Boolean).length;
        const scanned = t.length < 120 || lines < 4;
        if (scanned) {
            try {
                const ocr = await extractImageText(buffer);
                if (ocr && ocr.text && scoreText(ocr.text) > scoreText(t)) {
                    return { text: ocr.text, parser: 'tesseract-ocr:pdf-fallback', inferredType, ocrDiagnostics: { source: 'pdf-ocr-fallback', bestScore: ocr.bestScore } };
                }
            } catch (_) {}
        }
        return { text: t, parser: 'pdf-parse', inferredType, ocrDiagnostics: { source: 'pdf-parse', pdfTextChars: t.length, likelyScannedPdf: scanned } };
    }

    if (inferredType === 'docx') {
        const parsed = await mammoth.extractRawText({ buffer });
        return { text: String((parsed && parsed.value) || '').trim(), parser: 'mammoth', inferredType, ocrDiagnostics: null };
    }

    if (inferredType === 'txt') return { text: buffer.toString('utf8').trim(), parser: 'utf8', inferredType, ocrDiagnostics: null };

    if (['png', 'jpg', 'webp', 'bmp', 'tiff'].includes(inferredType)) {
        const result = await extractImageText(buffer);
        return {
            text: result.text, parser: 'tesseract-ocr:' + result.bestVariant + ':' + result.bestPass, inferredType,
            ocrDiagnostics: { bestPass: result.bestPass, bestVariant: result.bestVariant, bestScore: result.bestScore, attemptsRun: result.attemptsRun, cacheHit: Boolean(result.cacheHit) },
        };
    }

    return { text: buffer.toString('utf8').trim(), parser: 'fallback-utf8', inferredType, ocrDiagnostics: null };
}

module.exports = { parseDocumentToText };
