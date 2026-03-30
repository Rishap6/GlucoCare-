const path = require('path');

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

async function extractImageText(buffer) {
    const worker = await createWorker('eng');
    try {
        const passes = [
            {
                name: 'psm6',
                params: {
                    tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
                    preserve_interword_spaces: '1',
                },
            },
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

        for (const pass of passes) {
            await worker.setParameters(pass.params);
            const result = await worker.recognize(buffer);
            const text = normalizeOcrArtifacts(result && result.data ? result.data.text : '');
            const score = scoreOcrText(text);
            if (score > bestScore) {
                bestScore = score;
                bestText = text;
                bestPass = pass.name;
            }
        }

        return {
            text: bestText,
            bestPass,
        };
    } finally {
        await worker.terminate();
    }
}

async function parseDocumentToText({ fileName, fileType, text, base64Content }) {
    const plainText = String(text || '').trim();
    if (plainText) {
        return {
            text: plainText,
            parser: 'provided-text',
            inferredType: inferType(fileType, fileName),
        };
    }

    const buffer = decodeBase64Content(base64Content);
    if (!buffer) {
        return {
            text: '',
            parser: 'none',
            inferredType: inferType(fileType, fileName),
        };
    }

    const inferredType = inferType(fileType, fileName);

    if (inferredType === 'pdf') {
        const parsed = await pdfParse(buffer);
        return {
            text: String((parsed && parsed.text) || '').trim(),
            parser: 'pdf-parse',
            inferredType,
        };
    }

    if (inferredType === 'docx') {
        const parsed = await mammoth.extractRawText({ buffer });
        return {
            text: String((parsed && parsed.value) || '').trim(),
            parser: 'mammoth',
            inferredType,
        };
    }

    if (inferredType === 'txt') {
        return {
            text: buffer.toString('utf8').trim(),
            parser: 'utf8',
            inferredType,
        };
    }

    if (['png', 'jpg', 'webp', 'bmp', 'tiff'].includes(inferredType)) {
        const extracted = await extractImageText(buffer);
        return {
            text: extracted.text,
            parser: 'tesseract-ocr:' + extracted.bestPass,
            inferredType,
        };
    }

    return {
        text: buffer.toString('utf8').trim(),
        parser: 'fallback-utf8',
        inferredType,
    };
}

module.exports = {
    parseDocumentToText,
};
