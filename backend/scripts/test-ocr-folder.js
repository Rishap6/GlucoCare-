/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const { parseDocumentToText } = require('../../Ai/document-reader');
const { extractProjectDataFromDocument } = require('../../Ai/document-intelligence');

const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff', '.pdf', '.txt', '.docx']);

function inferMimeFromExt(ext) {
    switch (ext) {
        case '.png':
            return 'image/png';
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.webp':
            return 'image/webp';
        case '.bmp':
            return 'image/bmp';
        case '.tiff':
            return 'image/tiff';
        case '.pdf':
            return 'application/pdf';
        case '.txt':
            return 'text/plain';
        case '.docx':
            return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        default:
            return 'application/octet-stream';
    }
}

function getFolderFromArgs() {
    const arg = process.argv[2];
    if (arg) {
        return path.resolve(process.cwd(), arg);
    }

    return path.resolve(process.cwd(), '..', 'test orc');
}

async function run() {
    const targetFolder = getFolderFromArgs();

    if (!fs.existsSync(targetFolder)) {
        console.error('[ocr:test] Folder not found:', targetFolder);
        process.exitCode = 1;
        return;
    }

    const entries = fs.readdirSync(targetFolder, { withFileTypes: true });
    const files = entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((name) => SUPPORTED_EXTENSIONS.has(path.extname(name).toLowerCase()));

    if (!files.length) {
        console.error('[ocr:test] No supported files found in:', targetFolder);
        process.exitCode = 1;
        return;
    }

    console.log('[ocr:test] Folder:', targetFolder);
    console.log('[ocr:test] Files:', files.length);

    let totalMs = 0;
    let successful = 0;

    for (const fileName of files) {
        const filePath = path.join(targetFolder, fileName);
        const ext = path.extname(fileName).toLowerCase();
        const mimeType = inferMimeFromExt(ext);
        const startedAt = Date.now();

        try {
            const raw = fs.readFileSync(filePath);
            const base64Content = 'data:' + mimeType + ';base64,' + raw.toString('base64');

            const parsed = await parseDocumentToText({
                fileName,
                fileType: ext.replace('.', ''),
                base64Content,
            });

            const extractedData = extractProjectDataFromDocument(parsed.text, {
                fileName,
                fileType: parsed.inferredType,
                parser: parsed.parser,
                ocrDiagnostics: parsed.ocrDiagnostics,
            });

            const durationMs = Date.now() - startedAt;
            totalMs += durationMs;
            successful += 1;

            const extracted = extractedData && extractedData.extracted ? extractedData.extracted : {};
            const confidence = Number.isFinite(Number(extractedData && extractedData.confidence))
                ? Number(extractedData.confidence).toFixed(3)
                : '--';
            const hba1c = extracted && extracted.hba1c != null ? extracted.hba1c : '--';
            const glucoseCount = Array.isArray(extracted && extracted.glucoseReadingsMgDl)
                ? extracted.glucoseReadingsMgDl.length
                : 0;
            const bpCount = Array.isArray(extracted && extracted.bloodPressure)
                ? extracted.bloodPressure.length
                : 0;
            const textChars = parsed && parsed.text ? parsed.text.length : 0;
            const cacheHit = Boolean(parsed && parsed.ocrDiagnostics && parsed.ocrDiagnostics.cacheHit);
            const quickAccepted = Boolean(parsed && parsed.ocrDiagnostics && parsed.ocrDiagnostics.quickAccepted);

            console.log([
                '[ocr:test]',
                fileName,
                '| parser=' + parsed.parser,
                '| ms=' + durationMs,
                '| chars=' + textChars,
                '| conf=' + confidence,
                '| hba1c=' + hba1c,
                '| glucose=' + glucoseCount,
                '| bp=' + bpCount,
                '| cache=' + cacheHit,
                '| quick=' + quickAccepted,
            ].join(' '));
        } catch (error) {
            const durationMs = Date.now() - startedAt;
            console.error('[ocr:test] FAILED', fileName, '| ms=' + durationMs, '|', error && error.message ? error.message : error);
        }
    }

    const averageMs = successful ? Math.round(totalMs / successful) : 0;
    console.log('[ocr:test] Complete. success=' + successful + '/' + files.length + ' avgMs=' + averageMs);
}

run().catch((error) => {
    console.error('[ocr:test] Fatal error:', error && error.stack ? error.stack : error);
    process.exitCode = 1;
});
