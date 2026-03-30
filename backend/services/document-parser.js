const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { createWorker } = require('tesseract.js');

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

async function extractImageText(buffer) {
    const worker = await createWorker('eng');
    try {
        const result = await worker.recognize(buffer);
        return String(result && result.data && result.data.text ? result.data.text : '').trim();
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
        const extractedText = await extractImageText(buffer);
        return {
            text: extractedText,
            parser: 'tesseract-ocr',
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
