function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function cleanList(value) {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .slice(0, 3);
}

function parseJsonSafe(raw) {
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function getProviderConfig() {
    const provider = String(process.env.LLM_PROVIDER || '').trim().toLowerCase();
    const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || 10000);

    if (provider === 'openai') {
        return {
            provider,
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            apiKey: process.env.OPENAI_API_KEY || '',
            timeoutMs,
        };
    }

    if (provider === 'gemini') {
        return {
            provider,
            model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
            apiKey: process.env.GEMINI_API_KEY || '',
            timeoutMs,
        };
    }

    return { provider: '', model: '', apiKey: '', timeoutMs };
}

function buildPrompt(payload) {
    const question = String(payload.question || '').trim();
    const allergies = Array.isArray(payload.allergies) ? payload.allergies : [];
    const chronicConditions = Array.isArray(payload.profile && payload.profile.chronicConditions)
        ? payload.profile.chronicConditions
        : [];
    const localAnswer = payload.localResponse && payload.localResponse.answer
        ? String(payload.localResponse.answer)
        : '';

    return [
        'You are a diabetes education assistant for patient chat.',
        'Write in clear, warm, natural English with concise structure.',
        'Never diagnose. Never tell patient to start/stop/replace medicine independently.',
        'If urgent red flags appear, advise immediate clinical/emergency care.',
        'Return ONLY strict JSON with keys: answer, whatItMeans, nextSteps, confidence, suggestions.',
        'confidence must be a number 0 to 1.',
        'suggestions must be an array of up to 3 short follow-up questions.',
        '',
        `Patient question: ${question}`,
        `Known allergies: ${allergies.length ? allergies.join(', ') : 'none listed'}`,
        `Known chronic conditions: ${chronicConditions.length ? chronicConditions.join(', ') : 'none listed'}`,
        localAnswer ? `Local assistant draft answer: ${localAnswer}` : 'Local assistant draft answer: not available',
    ].join('\n');
}

async function callOpenAI(config, prompt) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
                model: config.model,
                temperature: 0.3,
                response_format: { type: 'json_object' },
                messages: [
                    {
                        role: 'system',
                        content: 'You are a careful diabetes education assistant. Output must be valid JSON only.',
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
            }),
            signal: controller.signal,
        });

        if (!response.ok) return null;
        const data = await response.json();
        return data && data.choices && data.choices[0] && data.choices[0].message
            ? data.choices[0].message.content
            : null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

async function callGemini(config, prompt) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: prompt }],
                    },
                ],
                generationConfig: {
                    temperature: 0.3,
                    responseMimeType: 'application/json',
                },
            }),
            signal: controller.signal,
        });

        if (!response.ok) return null;
        const data = await response.json();
        const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content
            ? data.candidates[0].content.parts
            : null;
        if (!Array.isArray(parts) || parts.length === 0) return null;
        return parts.map((part) => String((part && part.text) || '')).join('\n').trim() || null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

function normalizeLlmResponse(parsed, provider, model) {
    if (!parsed || typeof parsed !== 'object') return null;

    const answer = String(parsed.answer || '').trim();
    const meaning = String(parsed.whatItMeans || '').trim();
    const nextSteps = String(parsed.nextSteps || '').trim();

    if (!answer) return null;

    const combined = [
        `Quick answer: ${answer}`,
        meaning ? `What this means: ${meaning}` : '',
        nextSteps ? `Next steps: ${nextSteps}` : '',
        'You can consult a doctor.',
    ].filter(Boolean).join(' ');

    const confidenceRaw = Number(parsed.confidence);
    const confidence = Number.isFinite(confidenceRaw) ? clamp(confidenceRaw, 0, 0.99) : 0.78;

    return {
        answer: combined,
        confidence: Number(confidence.toFixed(3)),
        suggestions: cleanList(parsed.suggestions),
        source: {
            id: `${provider}-fallback`,
            title: `${provider.toUpperCase()} Fallback (${model})`,
            tags: ['llm', provider, 'fallback'],
        },
        disclaimer: 'Educational support only. Do not start, stop, or replace medicines without clinician guidance.',
    };
}

async function askLlmFallback(payload) {
    const cfg = getProviderConfig();
    if (!cfg.provider || !cfg.apiKey) return null;

    const prompt = buildPrompt(payload);
    let raw = null;

    if (cfg.provider === 'openai') {
        raw = await callOpenAI(cfg, prompt);
    } else if (cfg.provider === 'gemini') {
        raw = await callGemini(cfg, prompt);
    }

    const parsed = parseJsonSafe(raw);
    return normalizeLlmResponse(parsed, cfg.provider, cfg.model);
}

module.exports = {
    askLlmFallback,
};
