const { answerQuestion } = require('../../Ai/ai-engine');
const { askLlmFallback } = require('../../backend/services/llm');
const { extractProjectDataFromDocument, evaluateExtractedData } = require('../../Ai/document-intelligence');
const { verifyReportPatientName } = require('../../backend/services/report-processing');
const { buildDietAiResponse } = require('../../backend/services/diet-analytics');

const AI_HISTORY_MAX_MESSAGES = 80;
const AI_HISTORY_MAX_CHATS = 40;

function shouldUseConciseAiResponse(question, explicit) {
    if (explicit) return true;
    const q = String(question || '').toLowerCase();
    return /\b(summar(y|ize|ise)|brief|concise|short|in short|tldr)\b/.test(q);
}

function toConciseSentence(value, maxSentences, maxChars) {
    const source = String(value || '').replace(/\s+/g, ' ').trim();
    if (!source) return '';

    const chunks = source.match(/[^.!?]+[.!?]?/g) || [source];
    let compact = chunks.slice(0, Math.max(1, Number(maxSentences || 1))).join(' ').trim();

    const limit = Number(maxChars || 280);
    if (compact.length > limit) {
        compact = compact.slice(0, limit).replace(/[\s,;:.!?-]+$/, '') + '...';
    }

    return compact;
}

function applyAiResponseStyle(payload, options) {
    if (!payload || typeof payload !== 'object') return payload;
    const opts = options || {};
    if (!opts.concise) return payload;

    const answer = toConciseSentence(payload.answer, 2, 280);
    const whatItMeans = toConciseSentence(payload.whatItMeans, 1, 140);
    const nextSteps = toConciseSentence(payload.nextSteps, 1, 140);

    const compactAnswer = [
        answer,
        whatItMeans ? `Meaning: ${whatItMeans}` : '',
        nextSteps ? `Next: ${nextSteps}` : '',
    ].filter(Boolean).join(' ');

    return {
        ...payload,
        answer: compactAnswer || answer || payload.answer,
        suggestions: Array.isArray(payload.suggestions) ? payload.suggestions.slice(0, 2) : [],
    };
}

function sanitizeAiHistoryAttachment(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const name = String(raw.name || '').trim();
    if (!name) return null;

    let size = Number(raw.size || 0);
    if (!Number.isFinite(size) || size < 0) size = 0;

    return {
        name,
        size,
        isImage: Boolean(raw.isImage),
        isPdf: Boolean(raw.isPdf),
    };
}

function sanitizeAiHistoryEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const role = String(raw.role || '').trim();
    if (role !== 'assistant' && role !== 'patient') return null;

    const text = String(raw.text || '').trim();
    const attachments = Array.isArray(raw.attachments)
        ? raw.attachments.map(sanitizeAiHistoryAttachment).filter(Boolean).slice(0, 3)
        : [];

    if (!text && attachments.length === 0) return null;

    const entry = {
        role,
        text: text.slice(0, 4000),
        attachments,
    };

    const meta = String(raw.meta || '').trim();
    if (meta) entry.meta = meta.slice(0, 200);

    if (raw.debug && typeof raw.debug === 'object' && raw.debug.engine) {
        entry.debug = {
            engine: String(raw.debug.engine).slice(0, 40),
            provider: raw.debug.provider ? String(raw.debug.provider).slice(0, 40) : null,
        };
    }

    if (Array.isArray(raw.suggestions)) {
        const suggestions = raw.suggestions
            .map((item) => String(item || '').trim())
            .filter(Boolean)
            .slice(0, 3)
            .map((item) => item.slice(0, 200));
        if (suggestions.length > 0) {
            entry.suggestions = suggestions;
        }
    }

    return entry;
}

function sanitizeAiConversation(rawConversation) {
    if (!Array.isArray(rawConversation)) return [];
    return rawConversation
        .map(sanitizeAiHistoryEntry)
        .filter(Boolean)
        .slice(-AI_HISTORY_MAX_MESSAGES);
}

function deriveAiChatTitleFromConversation(conversation) {
    const list = Array.isArray(conversation) ? conversation : [];
    const userEntry = list.find((item) => item && item.role === 'patient' && String(item.text || '').trim());
    const assistantEntry = list.find((item) => item && item.role === 'assistant' && String(item.text || '').trim());
    const sourceText = String((userEntry && userEntry.text) || (assistantEntry && assistantEntry.text) || '').replace(/\s+/g, ' ').trim();
    if (!sourceText) return 'New chat';
    return sourceText.length > 80 ? `${sourceText.slice(0, 80)}...` : sourceText;
}

function sanitizeAiChatItem(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const messages = sanitizeAiConversation(raw.messages || raw.conversation || []);
    const id = String(raw.id || '').trim() || `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const updatedAtRaw = String(raw.updatedAt || '').trim();
    const updatedAt = updatedAtRaw || new Date().toISOString();
    const titleRaw = String(raw.title || '').replace(/\s+/g, ' ').trim();
    const title = titleRaw ? titleRaw.slice(0, 120) : deriveAiChatTitleFromConversation(messages);

    return {
        id,
        title,
        updatedAt,
        messages,
    };
}

function sanitizeAiHistoryPayload(raw) {
    if (!raw || typeof raw !== 'object') {
        return { chats: [], activeChatId: null };
    }

    const chats = Array.isArray(raw.chats)
        ? raw.chats.map(sanitizeAiChatItem).filter(Boolean).slice(0, AI_HISTORY_MAX_CHATS)
        : [];

    let activeChatId = String(raw.activeChatId || '').trim() || null;
    if (chats.length > 0 && !chats.some((item) => item.id === activeChatId)) {
        activeChatId = chats[0].id;
    }

    return { chats, activeChatId };
}

function convertLegacyAiConversationToHistory(rawConversation) {
    const messages = sanitizeAiConversation(rawConversation || []);
    if (messages.length === 0) {
        return { chats: [], activeChatId: null };
    }

    const legacyId = 'legacy-main-chat';
    return {
        chats: [{
            id: legacyId,
            title: deriveAiChatTitleFromConversation(messages),
            updatedAt: new Date().toISOString(),
            messages,
        }],
        activeChatId: legacyId,
    };
}

async function askAssistant(question, user, { conciseRequested = false } = {}) {
    const debugSourceEnabled = String(process.env.AI_DEBUG_SOURCE || 'false').toLowerCase() === 'true';
    const withDebug = (payload, engine) => {
        if (!debugSourceEnabled || !payload || typeof payload !== 'object') return payload;
        return {
            ...payload,
            debug: {
                engine,
                provider: engine === 'llm-fallback' ? String(process.env.LLM_PROVIDER || '').toLowerCase() : 'local',
                sourceId: payload.source && payload.source.id ? payload.source.id : null,
                confidence: typeof payload.confidence === 'number' ? payload.confidence : null,
            },
        };
    };

    const allergies = Array.isArray(user.allergies) ? user.allergies : [];
    const profile = {
        chronicConditions: Array.isArray(user.chronicConditions) ? user.chronicConditions : [],
        bloodType: user.bloodType || null,
        dateOfBirth: user.dateOfBirth || null,
    };

    const dietAnalyticsResponse = buildDietAiResponse(user._id, question);
    if (dietAnalyticsResponse) {
        return withDebug(applyAiResponseStyle(dietAnalyticsResponse, { concise: conciseRequested }), 'diet-analytics');
    }

    const localResponse = answerQuestion(question, { allergies, profile });
    const fallbackThreshold = Number(process.env.LLM_FALLBACK_THRESHOLD || 0.74);
    const lowConfidence = !localResponse
        || typeof localResponse.confidence !== 'number'
        || localResponse.confidence < fallbackThreshold;
    const localLooksVague = !localResponse || !localResponse.source || localResponse.source.id === 'clarify-question-first';
    const fallbackEnabled = String(process.env.LLM_FALLBACK_ENABLED || 'true').toLowerCase() !== 'false';

    if (fallbackEnabled && (lowConfidence || localLooksVague)) {
        const llmResponse = await askLlmFallback({
            question,
            allergies,
            profile,
            localResponse,
        });

        if (llmResponse) {
            return withDebug(applyAiResponseStyle(llmResponse, { concise: conciseRequested }), 'llm-fallback');
        }
    }

    return withDebug(applyAiResponseStyle(localResponse, { concise: conciseRequested }), 'local-ai');
}

async function extractDocumentForAssistant({ fileName, fileType, text, base64Content, patientName }) {
    const { parseDocumentToText } = require('../../Ai/document-reader');
    const parsed = await parseDocumentToText({
        fileName,
        fileType,
        text,
        base64Content,
    });

    if (!parsed.text) {
        return {
            ok: false,
            error: 'Could not read text from the provided document.',
            parser: parsed.parser,
            inferredType: parsed.inferredType,
        };
    }

    const extracted = extractProjectDataFromDocument(parsed.text, {
        fileName,
        fileType: parsed.inferredType,
        parser: parsed.parser,
        ocrDiagnostics: parsed.ocrDiagnostics || null,
    });

    const evaluated = evaluateExtractedData({
        extracted,
        fileName,
        fileType: parsed.inferredType,
        ocrDiagnostics: parsed.ocrDiagnostics || null,
    });

    const extractedPatientName = extracted && extracted.extracted ? extracted.extracted.patientName : null;
    const nameVerification = verifyReportPatientName(extractedPatientName, patientName);
    if (extracted && typeof extracted === 'object') {
        extracted.nameVerification = nameVerification;
        extracted.summary = evaluated.summary;
        extracted.review = evaluated.review;
        extracted.confidence = evaluated.confidence;
        extracted.confidenceDetails = evaluated.confidenceDetails;
        extracted.qualityFlags = evaluated.qualityFlags;
    }

    return {
        ok: true,
        parser: parsed.parser,
        inferredType: parsed.inferredType,
        diagnostics: { ocr: parsed.ocrDiagnostics || null },
        result: extracted,
        nameVerification,
    };
}

module.exports = {
    askAssistant,
    applyAiResponseStyle,
    convertLegacyAiConversationToHistory,
    extractDocumentForAssistant,
    sanitizeAiHistoryPayload,
    shouldUseConciseAiResponse,
};
