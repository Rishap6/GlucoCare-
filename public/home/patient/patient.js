// Logout logic
function logoutPatient() {
    // Remove any session tokens (example: localStorage/sessionStorage)
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    // Redirect to login page
    window.location.href = '/auth/login/login.html';
}

document.addEventListener('DOMContentLoaded', function() {
    var logoutBtn = document.getElementById('patient-logout-link');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            logoutPatient();
        });
    }
});
var state = {
    reports: [],
    records: [],
    doctors: [],
    appointments: [],
    threads: [],
    selectedThreadId: null,
    selectedDoctorId: null,
    chatDoctors: [],
    goals: [],
    badges: [],
    sessions: [],
    auditLog: [],
    exports: [],
    shares: [],
    aiConversation: [],
    aiRequestPending: false,
    reportSubmitPending: false,
    aiAttachedFiles: [],
    charts: {},
    unreadMessageNotifications: [],
    reportMetrics: null,
    activeReportDetails: null,
    currentUser: null,
    dietIntakes: [],
    dietReport: null,
};

function setReportSubmitLoading(isLoading) {
    var form = document.getElementById('report-form');
    var submitBtn = document.getElementById('report-submit-btn');
    if (!form || !submitBtn) return;

    var controls = form.querySelectorAll('input, select, textarea, button');
    controls.forEach(function(ctrl) {
        ctrl.disabled = !!isLoading;
    });

    submitBtn.disabled = !!isLoading;
    submitBtn.textContent = isLoading ? 'Uploading...' : 'Add Report';
}

var REPORT_UPLOAD_STEP_ORDER = ['prepare', 'extract', 'save', 'import'];

function setReportUploadStage(stage, message, options) {
    var container = document.getElementById('report-upload-progress');
    var messageEl = document.getElementById('report-upload-progress-text');
    if (!container || !messageEl) return;

    var opts = options || {};
    if (!stage) {
        container.classList.add('hidden');
        container.classList.remove('completed', 'failed');
        messageEl.textContent = '';
        container.querySelectorAll('[data-upload-step]').forEach(function(stepEl) {
            stepEl.classList.remove('active', 'done', 'skipped');
        });
        return;
    }

    container.classList.remove('hidden');
    container.classList.toggle('completed', Boolean(opts.completed));
    container.classList.toggle('failed', Boolean(opts.failed));

    var activeIndex = REPORT_UPLOAD_STEP_ORDER.indexOf(stage);
    container.querySelectorAll('[data-upload-step]').forEach(function(stepEl, index) {
        var stepKey = stepEl.getAttribute('data-upload-step');
        stepEl.classList.remove('active', 'done', 'skipped');

        if (Array.isArray(opts.skippedSteps) && opts.skippedSteps.indexOf(stepKey) !== -1) {
            stepEl.classList.add('skipped');
            return;
        }

        if (opts.completed) {
            stepEl.classList.add('done');
            return;
        }

        if (index < activeIndex) {
            stepEl.classList.add('done');
        } else if (index === activeIndex) {
            stepEl.classList.add('active');
        }
    });

    messageEl.textContent = message || '';
}

function setManualDataSubmitLoading(isLoading) {
    var form = document.getElementById('manual-data-form');
    var submitBtn = document.getElementById('manual-data-submit-btn');
    if (!form || !submitBtn) return;

    var controls = form.querySelectorAll('input, select, textarea, button');
    controls.forEach(function(ctrl) {
        ctrl.disabled = !!isLoading;
    });

    submitBtn.disabled = !!isLoading;
    submitBtn.textContent = isLoading ? 'Saving...' : 'Save Data';
}

function setManualDataResult(message, tone) {
    var resultEl = document.getElementById('manual-data-result');
    if (!resultEl) return;
    resultEl.textContent = message;

    if (tone === 'error') {
        resultEl.style.color = 'var(--danger)';
        return;
    }
    if (tone === 'success') {
        resultEl.style.color = 'var(--success)';
        return;
    }
    resultEl.style.color = 'var(--gray-500)';
}

function clearManualDataForm() {
    var form = document.getElementById('manual-data-form');
    if (form) form.reset();

    var recordedAtInput = document.getElementById('manual-recorded-at');
    if (recordedAtInput) {
        recordedAtInput.value = getIstTodayInputValue();
    }

    setManualDataResult('Add at least one value and click Save Data.', 'neutral');
}

function toLocalDateTimeInputValue(date) {
    var value = date instanceof Date ? date : new Date();
    var tzOffsetMs = value.getTimezoneOffset() * 60000;
    return new Date(value.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

function setDietIntakeSubmitLoading(isLoading) {
    var form = document.getElementById('diet-intake-form');
    var submitBtn = document.getElementById('diet-intake-submit-btn');
    if (!form || !submitBtn) return;

    var controls = form.querySelectorAll('input, select, textarea, button');
    controls.forEach(function(ctrl) {
        ctrl.disabled = !!isLoading;
    });

    submitBtn.disabled = !!isLoading;
    submitBtn.textContent = isLoading ? 'Saving...' : 'Save Intake';
}

function setDietIntakeResult(message, tone) {
    var el = document.getElementById('diet-intake-result');
    if (!el) return;
    el.textContent = message;

    if (tone === 'error') {
        el.style.color = 'var(--danger)';
        return;
    }
    if (tone === 'success') {
        el.style.color = 'var(--success)';
        return;
    }
    el.style.color = 'var(--gray-500)';
}

function clearDietIntakeForm() {
    var form = document.getElementById('diet-intake-form');
    if (form) form.reset();

    var dateTimeInput = document.getElementById('diet-logged-at');
    if (dateTimeInput) dateTimeInput.value = toLocalDateTimeInputValue(new Date());

    var mealSlotInput = document.getElementById('diet-meal-slot');
    if (mealSlotInput) mealSlotInput.value = 'breakfast';

    var carbsInput = document.getElementById('diet-carbs');
    var caloriesInput = document.getElementById('diet-calories');
    var proteinInput = document.getElementById('diet-protein');
    var fatInput = document.getElementById('diet-fat');
    var fiberInput = document.getElementById('diet-fiber');
    var giInput = document.getElementById('diet-gi');
    var servingInput = document.getElementById('diet-serving');
    if (carbsInput) delete carbsInput.dataset.autofilled;
    if (caloriesInput) delete caloriesInput.dataset.autofilled;
    if (proteinInput) delete proteinInput.dataset.autofilled;
    if (fatInput) delete fatInput.dataset.autofilled;
    if (fiberInput) delete fiberInput.dataset.autofilled;
    if (giInput) delete giInput.dataset.autofilled;
    if (servingInput) delete servingInput.dataset.autofilled;

    setDietIntakeResult('Log at least breakfast, lunch, and dinner with sugar values for best AI insights.', 'neutral');
}

var aiTypingTimer = null;
var chatSocket = null;
var AI_TYPING_BASE_DELAY_MS = 16;
var AI_TYPING_PUNCTUATION_DELAY_MS = 55;
var AI_TYPING_SPACE_DELAY_MS = 7;
var dietEstimateDebounceTimer = null;
var dietEstimateRequestSeq = 0;

function shouldAutoFillDietField(inputEl) {
    if (!inputEl) return false;
    var value = String(inputEl.value || '').trim();
    return !value || inputEl.dataset.autofilled === '1';
}

function formatDietAutoFilledNumber(value, decimals) {
    var num = toNumberOrNull(value);
    if (num === null) return null;

    var clamped = Math.max(0, num);
    if (!decimals || decimals <= 0) {
        return String(Math.round(clamped));
    }
    return String(Number(clamped.toFixed(decimals)));
}

function clearAutoFilledDietEstimate() {
    var carbsInput = document.getElementById('diet-carbs');
    var caloriesInput = document.getElementById('diet-calories');
    var proteinInput = document.getElementById('diet-protein');
    var fatInput = document.getElementById('diet-fat');
    var fiberInput = document.getElementById('diet-fiber');
    var giInput = document.getElementById('diet-gi');
    var servingInput = document.getElementById('diet-serving');

    if (carbsInput && carbsInput.dataset.autofilled === '1') {
        carbsInput.value = '';
        delete carbsInput.dataset.autofilled;
    }
    if (caloriesInput && caloriesInput.dataset.autofilled === '1') {
        caloriesInput.value = '';
        delete caloriesInput.dataset.autofilled;
    }
    if (proteinInput && proteinInput.dataset.autofilled === '1') {
        proteinInput.value = '';
        delete proteinInput.dataset.autofilled;
    }
    if (fatInput && fatInput.dataset.autofilled === '1') {
        fatInput.value = '';
        delete fatInput.dataset.autofilled;
    }
    if (fiberInput && fiberInput.dataset.autofilled === '1') {
        fiberInput.value = '';
        delete fiberInput.dataset.autofilled;
    }
    if (giInput && giInput.dataset.autofilled === '1') {
        giInput.value = '';
        delete giInput.dataset.autofilled;
    }
    if (servingInput && servingInput.dataset.autofilled === '1') {
        servingInput.value = '';
        delete servingInput.dataset.autofilled;
    }
}

function applyDietEstimateToForm(estimate) {
    var carbsInput = document.getElementById('diet-carbs');
    var caloriesInput = document.getElementById('diet-calories');
    var proteinInput = document.getElementById('diet-protein');
    var fatInput = document.getElementById('diet-fat');
    var fiberInput = document.getElementById('diet-fiber');
    var giInput = document.getElementById('diet-gi');
    var servingInput = document.getElementById('diet-serving');

    var carbs = toNumberOrNull(estimate && estimate.carbs);
    var calories = toNumberOrNull(estimate && estimate.calories);
    var protein = toNumberOrNull(estimate && estimate.protein);
    var fat = toNumberOrNull(estimate && estimate.fat);
    var fiber = toNumberOrNull(estimate && estimate.fiber);
    var gi = toNumberOrNull(estimate && estimate.gi);
    var serving = toNumberOrNull(estimate && estimate.serving);
    var servingText = String((estimate && estimate.servingText) || '').trim();

    if (carbsInput && carbs !== null && shouldAutoFillDietField(carbsInput)) {
        carbsInput.value = formatDietAutoFilledNumber(carbs, 0);
        carbsInput.dataset.autofilled = '1';
    }

    if (caloriesInput && calories !== null && shouldAutoFillDietField(caloriesInput)) {
        caloriesInput.value = formatDietAutoFilledNumber(calories, 0);
        caloriesInput.dataset.autofilled = '1';
    }

    if (proteinInput && protein !== null && shouldAutoFillDietField(proteinInput)) {
        proteinInput.value = formatDietAutoFilledNumber(protein, 1);
        proteinInput.dataset.autofilled = '1';
    }

    if (fatInput && fat !== null && shouldAutoFillDietField(fatInput)) {
        fatInput.value = formatDietAutoFilledNumber(fat, 1);
        fatInput.dataset.autofilled = '1';
    }

    if (fiberInput && fiber !== null && shouldAutoFillDietField(fiberInput)) {
        fiberInput.value = formatDietAutoFilledNumber(fiber, 1);
        fiberInput.dataset.autofilled = '1';
    }

    if (giInput && gi !== null && shouldAutoFillDietField(giInput)) {
        giInput.value = formatDietAutoFilledNumber(gi, 1);
        giInput.dataset.autofilled = '1';
    }

    if (servingInput && shouldAutoFillDietField(servingInput)) {
        var resolvedServing = servingText;
        if (!resolvedServing && serving !== null) {
            resolvedServing = String(Number(Math.max(0, serving).toFixed(1))) + ' serving(s)';
        }

        if (resolvedServing) {
            servingInput.value = resolvedServing;
            servingInput.dataset.autofilled = '1';
        }
    }
}

async function requestDietTextEstimate() {
    var intakeInput = document.getElementById('diet-intake-text');
    if (!intakeInput) return;

    var text = String(intakeInput.value || '').trim();
    if (!text) {
        clearAutoFilledDietEstimate();
        return;
    }

    var seq = ++dietEstimateRequestSeq;
    var result = await API.get('/api/patient/diet/intake/estimate?text=' + encodeURIComponent(text), {
        timeoutMs: 12000,
    });

    // Ignore stale responses when user types quickly.
    if (seq !== dietEstimateRequestSeq) return;
    if (!result.ok || !result.data) return;

    applyDietEstimateToForm(result.data);
}

function queueDietTextEstimate() {
    if (dietEstimateDebounceTimer) clearTimeout(dietEstimateDebounceTimer);
    dietEstimateDebounceTimer = setTimeout(function() {
        requestDietTextEstimate().catch(function() {
            // Silent failure: user can still submit manually.
        });
    }, 320);
}

// ── AI File Upload Handling ──────────────────────────────────────────

function handleAiFileSelect(event) {
    var files = event.target.files;
    if (!files || files.length === 0) return;

    var maxFiles = 3;
    var maxSizeMB = 10;

    for (var i = 0; i < files.length; i++) {
        if (state.aiAttachedFiles.length >= maxFiles) {
            alert('Maximum ' + maxFiles + ' files can be attached.');
            break;
        }
        var file = files[i];
        if (file.size > maxSizeMB * 1024 * 1024) {
            alert('File "' + file.name + '" is too large. Maximum size is ' + maxSizeMB + 'MB.');
            continue;
        }
        var isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        var isImage = file.type.startsWith('image/');
        if (!isPdf && !isImage) {
            alert('Only images and PDF files are supported.');
            continue;
        }

        var entry = {
            id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            file: file,
            name: file.name,
            size: file.size,
            type: file.type,
            isImage: isImage,
            isPdf: isPdf,
            thumbUrl: null,
        };

        if (isImage) {
            entry.thumbUrl = URL.createObjectURL(file);
        }

        state.aiAttachedFiles.push(entry);
    }

    event.target.value = '';
    renderAiFilePreview();
}

function removeAiFile(fileId) {
    state.aiAttachedFiles = state.aiAttachedFiles.filter(function(f) {
        if (f.id === fileId && f.thumbUrl) {
            URL.revokeObjectURL(f.thumbUrl);
        }
        return f.id !== fileId;
    });
    renderAiFilePreview();
}

function renderAiFilePreview() {
    var container = document.getElementById('ai-file-preview');
    var attachBtn = document.querySelector('.ai-attach-btn');
    if (!container) return;

    if (state.aiAttachedFiles.length === 0) {
        container.style.display = 'none';
        container.innerHTML = '';
        if (attachBtn) attachBtn.classList.remove('has-files');
        return;
    }

    container.style.display = 'flex';
    if (attachBtn) attachBtn.classList.add('has-files');

    container.innerHTML = state.aiAttachedFiles.map(function(f) {
        var icon = f.isPdf ? 'fas fa-file-pdf' : 'fas fa-image';
        var sizeStr = f.size < 1024 ? f.size + ' B' : (f.size < 1048576 ? Math.round(f.size / 1024) + ' KB' : (f.size / 1048576).toFixed(1) + ' MB');
        var thumb = f.thumbUrl ? '<img class="ai-file-chip-thumb" src="' + f.thumbUrl + '" alt="">' : '<i class="ai-file-chip-icon ' + icon + '"></i>';
        return [
            '<div class="ai-file-chip">',
            thumb,
            '<span class="ai-file-chip-name">' + escapeHtml(f.name) + '</span>',
            '<span class="ai-file-chip-size">' + sizeStr + '</span>',
            '<button class="ai-file-chip-remove" onclick="removeAiFile(\'' + f.id + '\')" title="Remove">&times;</button>',
            '</div>',
        ].join('');
    }).join('');
}

function fileToBase64(file) {
    return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function() {
            var base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return Math.round(bytes / 1024) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

var reportTypeMap = {
    lab: 'Lab Report',
    imaging: 'Imaging',
    clinical: 'Clinical Note',
    diabetes: 'Diabetes Report',
};

var recordTypeMap = {
    diagnosis: 'Diagnosis',
    treatment: 'Treatment',
    medication: 'Other',
    visit: 'Other',
};

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

var IST_TIME_ZONE = 'Asia/Kolkata';

function getIstDateKey(date) {
    return date.toLocaleDateString('sv-SE', {
        timeZone: IST_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
}

function formatIstDate(date, options) {
    var opts = Object.assign({ timeZone: IST_TIME_ZONE }, options || {});
    return date.toLocaleDateString('en-IN', opts);
}

function formatIstTime(date, options) {
    var opts = Object.assign({ timeZone: IST_TIME_ZONE }, options || {});
    return date.toLocaleTimeString('en-IN', opts);
}

function getIstTodayInputValue() {
    return getIstDateKey(new Date());
}

function formatDate(value) {
    if (!value) return '--';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return formatIstDate(date);
}

function formatDateInput(value) {
    if (!value) return '';
    return String(value).slice(0, 10);
}

function toNumberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string') {
        var cleaned = value.trim();
        if (!cleaned) return null;

        // Accept strings like "7.2%", "126 mg/dL", "  85 "
        var direct = Number(cleaned.replace(/,/g, ''));
        if (Number.isFinite(direct)) return direct;

        var match = cleaned.match(/-?\d+(?:\.\d+)?/);
        if (match) {
            var extracted = Number(match[0]);
            return Number.isFinite(extracted) ? extracted : null;
        }
    }
    if (typeof value === 'object') {
        var candidates = [value.value, value.numericValue, value.mgDl, value.amount, value.reading];
        for (var i = 0; i < candidates.length; i++) {
            var parsedCandidate = toNumberOrNull(candidates[i]);
            if (parsedCandidate !== null) return parsedCandidate;
        }
    }
    return null;
}

function inRange(value, min, max) {
    return Number.isFinite(value) && value >= min && value <= max;
}

var REPORT_INLINE_FILE_MAX_BYTES = 350 * 1024;
var REPORT_IMAGE_MAX_EDGE = 1800;
var REPORT_IMAGE_JPEG_QUALITY = 0.82;

function getDataUrlApproxBytes(dataUrl) {
    var value = String(dataUrl || '');
    var parts = value.split(',');
    var base64 = parts.length > 1 ? parts[1] : parts[0];
    if (!base64) return 0;
    return Math.floor((base64.length * 3) / 4);
}

function optimizeImageDataUrl(dataUrl, maxEdge, jpegQuality) {
    return new Promise(function(resolve) {
        var img = new Image();
        img.onload = function() {
            var width = Number(img.naturalWidth || img.width || 0);
            var height = Number(img.naturalHeight || img.height || 0);
            if (!width || !height) {
                resolve(dataUrl);
                return;
            }

            var largest = Math.max(width, height);
            if (largest <= Number(maxEdge || REPORT_IMAGE_MAX_EDGE)) {
                resolve(dataUrl);
                return;
            }

            var scale = Number(maxEdge || REPORT_IMAGE_MAX_EDGE) / largest;
            var targetW = Math.max(1, Math.round(width * scale));
            var targetH = Math.max(1, Math.round(height * scale));
            var canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;

            var ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(dataUrl);
                return;
            }

            ctx.drawImage(img, 0, 0, targetW, targetH);
            try {
                var optimized = canvas.toDataURL('image/jpeg', Number(jpegQuality || REPORT_IMAGE_JPEG_QUALITY));
                resolve(optimized || dataUrl);
            } catch (_err) {
                resolve(dataUrl);
            }
        };
        img.onerror = function() {
            resolve(dataUrl);
        };
        img.src = String(dataUrl || '');
    });
}

async function prepareReportFilePayload(file) {
    var originalDataUrl = await fileToBase64DataUrl(file);
    var isImage = Boolean(
        (file && typeof file.type === 'string' && file.type.indexOf('image/') === 0)
        || /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(String(file && file.name ? file.name : ''))
    );

    var extractionDataUrl = originalDataUrl;
    if (isImage) {
        extractionDataUrl = await optimizeImageDataUrl(originalDataUrl, REPORT_IMAGE_MAX_EDGE, REPORT_IMAGE_JPEG_QUALITY);
    }

    var storageDataUrl = getDataUrlApproxBytes(extractionDataUrl) <= REPORT_INLINE_FILE_MAX_BYTES
        ? extractionDataUrl
        : null;

    return {
        extractionDataUrl: extractionDataUrl,
        storageDataUrl: storageDataUrl,
        optimized: extractionDataUrl !== originalDataUrl,
    };
}

function fileToBase64DataUrl(file) {
    return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function() { resolve(reader.result); };
        reader.onerror = function() { reject(new Error('Failed to read file.')); };
        reader.readAsDataURL(file);
    });
}

function parseReportInsights(report) {
    if (!report || typeof report !== 'object') return null;

    var parsedRaw = report.parsedJson || report.parsed_json || null;
    if (parsedRaw && typeof parsedRaw === 'string') {
        try {
            var parsedJson = JSON.parse(parsedRaw);
            if (parsedJson && typeof parsedJson === 'object') return parsedJson;
        } catch (_) {
        }
    }

    if (parsedRaw && typeof parsedRaw === 'object') {
        return parsedRaw;
    }

    return null;
}

function summarizeExtracted(result) {
    if (!result || typeof result !== 'object') return '';
    var extracted = result.extracted || {};
    var summary = [];
    if (result.review && result.review.label) summary.push('Review: ' + result.review.label);
    if (result.summary) summary.push(String(result.summary));
    if (toNumberOrNull(extracted.hba1c) !== null) summary.push('HbA1c ' + Number(extracted.hba1c).toFixed(1) + '%');
    if (Array.isArray(extracted.glucoseReadingsMgDl) && extracted.glucoseReadingsMgDl.length) {
        summary.push(extracted.glucoseReadingsMgDl.length + ' glucose value(s)');
    }
    if (Array.isArray(extracted.bloodPressure) && extracted.bloodPressure.length) {
        summary.push(extracted.bloodPressure.length + ' BP value(s)');
    }
    if (toNumberOrNull(extracted.weightKg) !== null) {
        summary.push('Weight ' + Number(extracted.weightKg).toFixed(1) + ' kg');
    }
    return summary.join(', ');
}

function formatConfidencePercent(score) {
    var numeric = toNumberOrNull(score);
    if (numeric === null) return '--';
    var clamped = Math.max(0, Math.min(0.99, numeric));
    return Math.round(clamped * 100) + '%';
}

function normalizeReportReviewClass(level) {
    if (level === 'bad') return 'critical';
    if (level === 'caution') return 'warning';
    return 'normal';
}

function renderReportExtractionMetrics() {
    var badge = document.getElementById('extraction-quality-level');
    var totalEl = document.getElementById('metric-reports-total');
    var parsedEl = document.getElementById('metric-reports-extracted');
    var confidenceEl = document.getElementById('metric-reports-confidence');
    var correctedEl = document.getElementById('metric-reports-corrected');
    var fieldsEl = document.getElementById('metric-reports-top-fields');
    if (!badge || !totalEl || !parsedEl || !confidenceEl || !correctedEl || !fieldsEl) return;

    var metrics = state.reportMetrics;
    if (!metrics || !metrics.summary) {
        badge.className = 'status-badge';
        badge.textContent = 'Waiting';
        totalEl.textContent = '--';
        parsedEl.textContent = '--';
        confidenceEl.textContent = '--';
        correctedEl.textContent = '--';
        fieldsEl.textContent = 'No extraction metrics available yet.';
        return;
    }

    var summary = metrics.summary || {};
    var corrections = metrics.corrections || {};
    var avgConfidence = toNumberOrNull(summary.avgConfidence);
    var level = avgConfidence === null
        ? 'normal'
        : avgConfidence >= 0.86
            ? 'normal'
            : avgConfidence >= 0.64
                ? 'warning'
                : 'critical';
    var levelLabel = avgConfidence === null
        ? 'No Data'
        : avgConfidence >= 0.86
            ? 'High Confidence'
            : avgConfidence >= 0.64
                ? 'Medium Confidence'
                : 'Needs Review';

    badge.className = 'status-badge ' + level;
    badge.textContent = levelLabel;
    totalEl.textContent = String(summary.totalReports || 0);
    parsedEl.textContent = String(summary.extractedReports || 0);
    confidenceEl.textContent = avgConfidence === null ? '--' : formatConfidencePercent(avgConfidence);
    correctedEl.textContent = String(corrections.correctedReports || 0);

    var topFields = Array.isArray(corrections.topCorrectedFields) ? corrections.topCorrectedFields : [];
    var topFieldsText = topFields.length === 0
        ? 'No corrections yet.'
        : 'Most corrected fields: ' + topFields
            .slice(0, 4)
            .map(function(entry) {
                return String(entry.fieldKey || '--') + ' (' + String(entry.count || 0) + ')';
            })
            .join(', ');

    var hints = [];
    if (Number(summary.templateMatchedReports || 0) > 0) {
        hints.push('Template matched: ' + String(summary.templateMatchedReports));
    }
    if (Number(summary.missingCriticalSignals || 0) > 0) {
        hints.push('Missing key markers: ' + String(summary.missingCriticalSignals));
    }
    if (Number(summary.nameMismatchReports || 0) > 0) {
        hints.push('Name mismatches: ' + String(summary.nameMismatchReports));
    }

    fieldsEl.textContent = hints.length > 0
        ? topFieldsText + ' | ' + hints.join(' | ')
        : topFieldsText;
}

function formatCorrectionDisplayValue(value) {
    if (value === null || value === undefined) return '--';
    if (Array.isArray(value)) {
        return value.length ? value.map(function(item) { return String(item); }).join(', ') : '--';
    }

    if (typeof value === 'object') {
        var systolic = toNumberOrNull(value.systolic);
        var diastolic = toNumberOrNull(value.diastolic);
        if (systolic !== null && diastolic !== null) {
            return Number(systolic).toFixed(0) + '/' + Number(diastolic).toFixed(0);
        }

        try {
            var objectText = JSON.stringify(value);
            return objectText && objectText !== '{}' ? objectText : '--';
        } catch (_) {
            return '--';
        }
    }

    var text = String(value).trim();
    return text || '--';
}

function renderReportCorrectionHistoryRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return '<div class="muted-note">No correction history yet.</div>';
    }

    return '<div class="report-correction-history-list">' + rows.slice(0, 20).map(function(row) {
        return [
            '<div class="report-correction-history-item">',
            '<div class="report-correction-history-header">',
            '<strong>' + escapeHtml(String(row.fieldKey || '--')) + '</strong>',
            '<span>' + escapeHtml(formatDate(row.createdAt)) + '</span>',
            '</div>',
            '<div class="report-correction-history-values">',
            '<span class="from">From: ' + escapeHtml(formatCorrectionDisplayValue(row.originalValue)) + '</span>',
            '<span class="to">To: ' + escapeHtml(formatCorrectionDisplayValue(row.correctedValue)) + '</span>',
            '</div>',
            (row.note ? '<div class="report-correction-history-note">Note: ' + escapeHtml(String(row.note)) + '</div>' : ''),
            '</div>',
        ].join('');
    }).join('') + '</div>';
}

async function loadReportCorrectionHistory(reportId) {
    var container = document.getElementById('report-correction-history');
    if (!container) return;

    if (!reportId) {
        container.innerHTML = '<div class="muted-note">Correction history is unavailable for this report.</div>';
        return;
    }

    container.innerHTML = '<div class="muted-note">Loading correction history...</div>';
    try {
        var result = await API.get('/api/patient/reports/' + Number(reportId) + '/corrections');
        if (!result.ok) {
            container.innerHTML = '<div class="muted-note">Failed to load correction history.</div>';
            return;
        }

        container.innerHTML = renderReportCorrectionHistoryRows(Array.isArray(result.data) ? result.data : []);
    } catch (err) {
        container.innerHTML = '<div class="muted-note">Network error while loading correction history.</div>';
    }
}

function mapReviewBadgeClass(level) {
    if (level === 'bad') return 'status-badge critical';
    if (level === 'caution') return 'status-badge warning';
    return 'status-badge normal';
}

function pickLatestReportWithInsights(reports) {
    if (!Array.isArray(reports) || reports.length === 0) return null;

    var enriched = reports.map(function(report) {
        var parsed = parseReportInsights(report);
        return parsed ? { report: report, parsed: parsed } : null;
    }).filter(Boolean);

    if (enriched.length === 0) return null;

    enriched.sort(function(a, b) {
        var dateA = new Date(a.report.date || a.report.createdAt || 0);
        var dateB = new Date(b.report.date || b.report.createdAt || 0);
        var timeA = Number.isNaN(dateA.getTime()) ? 0 : dateA.getTime();
        var timeB = Number.isNaN(dateB.getTime()) ? 0 : dateB.getTime();
        if (timeA !== timeB) return timeA - timeB;
        return (a.report._id || a.report.id || 0) - (b.report._id || b.report.id || 0);
    });

    return enriched[enriched.length - 1];
}

function renderLatestReportInsight(entry) {
    var container = document.getElementById('latest-report-insight');
    var badge = document.getElementById('report-ai-status');
    if (!container || !badge) return;

    if (!entry || !entry.parsed) {
        container.innerHTML = '<p class="report-ai-empty">Upload a PDF or image report to see extracted values here.</p>';
        badge.className = 'status-badge';
        badge.textContent = 'Waiting for upload';
        return;
    }

    var parsed = entry.parsed;
    var report = entry.report || {};
    var extracted = parsed.extracted || {};
    var summary = summarizeExtracted(parsed);
    var metrics = [];

    var hba1c = toNumberOrNull(extracted.hba1c);
    if (inRange(hba1c, 2, 20)) {
        metrics.push({ label: 'HbA1c', value: Number(hba1c).toFixed(1) + '%' });
    }

    var glucoseList = Array.isArray(extracted.glucoseReadingsMgDl) ? extracted.glucoseReadingsMgDl : [];
    if (glucoseList.length > 0) {
        var glucoseVal = toNumberOrNull(glucoseList[0]);
        if (inRange(glucoseVal, 1, 900)) {
            metrics.push({ label: 'Glucose', value: Number(glucoseVal).toFixed(0) + ' mg/dL' });
        }
    }

    var bpList = Array.isArray(extracted.bloodPressure) ? extracted.bloodPressure : [];
    if (bpList.length > 0) {
        var bpEntry = bpList[0];
        var bpValue = null;
        if (typeof bpEntry === 'string') {
            bpValue = bpEntry;
        } else {
            var systolic = toNumberOrNull(bpEntry.systolic);
            var diastolic = toNumberOrNull(bpEntry.diastolic);
            if (inRange(systolic, 40, 300) && inRange(diastolic, 20, 200)) {
                bpValue = Number(systolic).toFixed(0) + '/' + Number(diastolic).toFixed(0) + ' mmHg';
            }
        }
        if (bpValue) {
            metrics.push({ label: 'Blood Pressure', value: bpValue });
        }
    }

    var weight = toNumberOrNull(extracted.weightKg);
    if (inRange(weight, 1, 700)) {
        metrics.push({ label: 'Weight', value: Number(weight).toFixed(1) + ' kg' });
    }

    var confidencePct = (typeof parsed.confidence === 'number')
        ? Math.round(Math.max(0, Math.min(parsed.confidence, 0.99)) * 100)
        : null;
    var confidenceLevel = parsed.confidenceDetails && parsed.confidenceDetails.level
        ? parsed.confidenceDetails.level
        : null;
    var templateName = parsed.confidenceDetails && parsed.confidenceDetails.template && parsed.confidenceDetails.template.name
        ? parsed.confidenceDetails.template.name
        : null;

    var nameVerification = parsed.nameVerification || null;
    var reviewLevel = parsed.review && parsed.review.level ? parsed.review.level : 'normal';
    var reviewLabel = parsed.review && parsed.review.label ? parsed.review.label : 'Analyzed';
    if (nameVerification && nameVerification.isMatch === false) {
        reviewLevel = 'caution';
        reviewLabel = 'Name Mismatch';
    }
    badge.className = mapReviewBadgeClass(reviewLevel);
    badge.textContent = reviewLabel;

    var metaParts = [];
    if (report.date) metaParts.push(formatDate(report.date));
    if (extracted.reportDate && metaParts.indexOf(extracted.reportDate) === -1) metaParts.push(extracted.reportDate);
    if (extracted.patientId) metaParts.push('ID ' + extracted.patientId);
    if (extracted.patientName) metaParts.push(extracted.patientName);

    var metricsHtml = metrics.length
        ? '<div class="report-ai-metrics">' + metrics.map(function(metric) {
            return '<div class="report-ai-metric"><div class="report-ai-metric-label">' + escapeHtml(metric.label) + '</div><div class="report-ai-metric-value">' + escapeHtml(metric.value) + '</div></div>';
        }).join('') + '</div>'
        : '';

    var footParts = [];
    if (parsed.source) footParts.push('Source: ' + escapeHtml(parsed.source));
    if (confidencePct !== null) footParts.push('Confidence ' + confidencePct + '%');
    if (confidenceLevel) footParts.push('Quality ' + escapeHtml(confidenceLevel));
    if (templateName) footParts.push('Template: ' + escapeHtml(templateName));
    if (nameVerification && nameVerification.isMatch === true) footParts.push('Name check: matched');
    if (nameVerification && nameVerification.isMatch === false) footParts.push('Name check: mismatch');

    var reportId = Number(report._id || report.id || 0);
    var footHtml = '<div class="report-ai-foot">'
        + '<span>' + (footParts.length ? footParts.join(' | ') : 'AI extraction ready') + '</span>'
        + (reportId ? '<button type="button" class="btn btn-outline btn-sm" onclick="viewReport(' + reportId + ')"><i class="fas fa-eye"></i> View report</button>' : '')
        + '</div>';

    container.innerHTML = [
        '<div class="report-ai-meta">',
        '  <div class="report-ai-meta-title">' + escapeHtml(report.reportName || 'Uploaded Report') + '</div>',
        metaParts.length ? '  <div class="report-ai-meta-sub">' + escapeHtml(metaParts.join(' | ')) + '</div>' : '',
        '</div>',
        summary ? '<p class="report-ai-summary">' + escapeHtml(summary) + '</p>' : '',
        metricsHtml,
        footHtml,
    ].join('');
}

function updateLatestReportInsightFromState() {
    renderLatestReportInsight(pickLatestReportWithInsights(state.reports));
}

function formatNameInitials(fullName) {
    if (!fullName) return '--';
    var parts = String(fullName).trim().split(/\s+/).slice(0, 2);
    return parts.map(function(part) { return part[0] ? part[0].toUpperCase() : ''; }).join('');
}

function splitName(fullName) {
    var clean = String(fullName || '').trim();
    if (!clean) return { firstName: '', lastName: '' };
    var parts = clean.split(/\s+/);
    return {
        firstName: parts[0],
        lastName: parts.slice(1).join(' '),
    };
}

function extractDoctorName(doctor) {
    if (!doctor) return '--';
    if (typeof doctor === 'object') return doctor.fullName || doctor.name || '--';
    return String(doctor);
}

function getChartRangeDays() {
    var periodEl = document.getElementById('chart-period');
    if (!periodEl) return 30;
    var label = (periodEl.value || '').toLowerCase();
    if (label.indexOf('7') >= 0) return 7;
    if (label.indexOf('30') >= 0) return 30;
    if (label.indexOf('year') >= 0) return 365;
    return 90;
}

function updateNav(section) {
    document.querySelectorAll('.nav-item').forEach(function(nav) {
        var isActive = nav.getAttribute('data-section') === section;
        nav.classList.toggle('active', isActive);
    });

    document.querySelectorAll('.dashboard-section').forEach(function(sec) {
        sec.classList.remove('active');
    });

    var activeSection = document.getElementById(section);
    if (activeSection) {
        activeSection.classList.add('active');
    }

    var isChatSection = section === 'ai-assistant' || section === 'doctor-chat';
    document.body.classList.toggle('chat-section-active', isChatSection);

    var titles = {
        overview: 'Dashboard Overview',
        'ai-assistant': 'Chat',
        'manual-entry': 'Manual Data Entry',
        reports: 'Medical Reports',
        profile: 'Personal Data',
        doctors: 'My Doctors',
        nutritionist: 'Diet & Intake Tracker',
        records: 'Past Medical Records',
        charts: 'Health Trends',
        'doctor-chat': 'Doctor Chat',
        safety: 'Emergency & Safety',
        gamification: 'Goals & Rewards',
        sharing: 'Data Export & Sharing',
        privacy: 'Privacy & Security',
    };

    var titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = titles[section] || 'Dashboard';
}

function initNavigation() {
    document.querySelectorAll('.nav-item').forEach(function(item) {
        item.addEventListener('click', function() {
            var section = this.getAttribute('data-section');
            updateNav(section);
            if (section !== 'ai-assistant') {
                closeAiAssistantPanel();
            }
        });
    });
}

function openModal(modalId) {
    var modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    if (modalId === 'report-modal') {
        setReportUploadStage(null, '');
    }
}

function closeModal(modalId) {
    var modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';

    if (modalId === 'report-modal') {
        setReportUploadStage(null, '');
    }
}

function initModals() {
    document.querySelectorAll('.modal-overlay').forEach(function(overlay) {
        overlay.addEventListener('click', function(e) {
            if (e.target === this) {
                this.classList.remove('active');
                document.body.style.overflow = 'auto';
                if (this.id === 'report-modal') {
                    setReportUploadStage(null, '');
                }
            }
        });
    });
}

function setText(selector, value) {
    var el = document.querySelector(selector);
    if (el) el.textContent = value;
}

function populateProfileView(user) {
    if (!user) return;

    setText('.user-info h3', user.fullName || 'Patient Name');
    setText('.user-info p', 'Patient ID: ' + (user._id || '--'));
    setText('.profile-name', user.fullName || 'Patient Name');
    setText('.profile-id', 'Patient ID: ' + (user._id || '--'));

    var initials = formatNameInitials(user.fullName);
    setText('.user-avatar', initials);
    setText('.profile-avatar-large', initials);

    var profileMeta = document.querySelectorAll('.profile-meta .meta-item span');
    if (profileMeta[0]) profileMeta[0].textContent = 'Member since ' + formatDate(user.createdAt);
    if (profileMeta[1]) profileMeta[1].textContent = user.email || '--';
    if (profileMeta[2]) profileMeta[2].textContent = user.phone || '--';

    var emergencyNumber = document.querySelector('.emergency-number');
    if (emergencyNumber) {
        emergencyNumber.textContent = user.emergencyContact && user.emergencyContact.phone ? user.emergencyContact.phone : '--';
    }

    var medicalFields = document.querySelectorAll('#profile .card .form-grid .form-group > div');
    if (medicalFields[0]) medicalFields[0].textContent = user.bloodType || '--';
    if (medicalFields[1]) medicalFields[1].textContent = formatDate(user.dateOfBirth);

    var allergiesContainer = medicalFields[2];
    if (allergiesContainer) {
        var allergies = Array.isArray(user.allergies) ? user.allergies : [];
        if (allergies.length === 0) {
            allergiesContainer.innerHTML = '<span class="status-badge normal">None</span>';
        } else {
            allergiesContainer.innerHTML = allergies.map(function(item) {
                return '<span class="status-badge warning" style="margin-right: 8px;">' + escapeHtml(item) + '</span>';
            }).join('');
        }
    }

    var conditionsContainer = medicalFields[3];
    if (conditionsContainer) {
        var conditions = Array.isArray(user.chronicConditions) ? user.chronicConditions : [];
        if (conditions.length === 0) {
            conditionsContainer.innerHTML = '<span class="status-badge normal">None</span>';
        } else {
            conditionsContainer.innerHTML = conditions.map(function(item) {
                return '<span class="status-badge warning" style="margin-right: 8px;">' + escapeHtml(item) + '</span>';
            }).join('');
        }
    }
}

function populateProfileModal(user) {
    if (!user) return;
    var split = splitName(user.fullName);
    var firstName = document.getElementById('first-name');
    var lastName = document.getElementById('last-name');
    var email = document.getElementById('email');
    var phone = document.getElementById('phone');
    var dob = document.getElementById('dob');
    var emergencyName = document.getElementById('emergency-name');
    var emergencyPhone = document.getElementById('emergency-phone');

    if (firstName) firstName.value = split.firstName;
    if (lastName) lastName.value = split.lastName;
    if (email) {
        email.value = user.email || '';
        email.readOnly = true;
    }
    if (phone) phone.value = user.phone || '';
    if (dob) dob.value = formatDateInput(user.dateOfBirth);
    if (emergencyName) emergencyName.value = user.emergencyContact && user.emergencyContact.name ? user.emergencyContact.name : '';
    if (emergencyPhone) emergencyPhone.value = user.emergencyContact && user.emergencyContact.phone ? user.emergencyContact.phone : '';
}

function renderReports() {
    var tbody = document.getElementById('reports-table-body');
    if (!tbody) return;

    if (state.reports.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--gray-500);">No reports available.</td></tr>';
        return;
    }

    tbody.innerHTML = state.reports.map(function(report) {
        var statusLower = String(report.status || '').toLowerCase();
        var statusClass = (statusLower.indexOf('stable') >= 0 || statusLower.indexOf('reviewed') >= 0 || statusLower.indexOf('not bad') >= 0 || statusLower.indexOf('complete') >= 0)
            ? 'normal'
            : 'warning';
        var insights = parseReportInsights(report);
        var summary = summarizeExtracted(insights);
        return [
            '<tr data-report-id="' + report._id + '">',
            '<td><div class="report-name-cell">' + escapeHtml(report.reportName) + '</div>' + (summary ? '<div class="report-insight">' + escapeHtml(summary) + '</div>' : '') + '</td>',
            '<td>' + escapeHtml(report.type) + '</td>',
            '<td>' + formatDate(report.date) + '</td>',
            '<td>' + escapeHtml(extractDoctorName(report.doctor)) + '</td>',
            '<td><span class="status-badge ' + statusClass + '">' + escapeHtml(report.status || 'Pending') + '</span></td>',
            '<td style="display:flex; gap:8px; flex-wrap:wrap;">'
                + '<button class="btn btn-primary btn-sm" onclick="viewReport(' + Number(report._id) + ')">View</button>'
                + '<button class="btn btn-outline btn-sm" onclick="deleteReport(' + Number(report._id) + ')">Delete</button>'
                + '</td>',
            '</tr>',
        ].join('');
    }).join('');
}

function renderReportDetails(report) {
    var content = document.getElementById('report-view-content');
    if (!content) return;

    if (!report || typeof report !== 'object') {
        content.innerHTML = '<div class="empty-state">Unable to load report details.</div>';
        return;
    }

    state.activeReportDetails = report;

    var insights = parseReportInsights(report);
    var summary = summarizeExtracted(insights);
    var extracted = insights && insights.extracted ? insights.extracted : {};
    var confidenceDetails = insights && insights.confidenceDetails ? insights.confidenceDetails : null;
    var doctorName = extractDoctorName(report.doctor);
    var reportId = Number(report._id || report.id || 0);
    var fileUrl = report.fileUrl || report.file_url || '';
    var fileType = report.fileType || report.file_type || '';
    var isDataUrl = typeof fileUrl === 'string' && fileUrl.indexOf('data:') === 0;
    var isPdf = String(fileType).toLowerCase() === 'application/pdf' || fileUrl.indexOf('data:application/pdf') === 0;
    var isImage = String(fileType).toLowerCase().indexOf('image/') === 0 || fileUrl.indexOf('data:image/') === 0;
    var fileLabel = '--';
    var viewerHtml = '';
    var primaryGlucose = Array.isArray(extracted.glucoseReadingsMgDl) && extracted.glucoseReadingsMgDl.length > 0
        ? toNumberOrNull(extracted.glucoseReadingsMgDl[0])
        : null;
    var bpEntry = Array.isArray(extracted.bloodPressure) && extracted.bloodPressure.length > 0
        ? extracted.bloodPressure[0]
        : null;
    var systolic = null;
    var diastolic = null;
    if (typeof bpEntry === 'string') {
        var bpMatch = bpEntry.match(/(\d{2,3})\s*[\/\-]\s*(\d{2,3})/);
        if (bpMatch) {
            systolic = toNumberOrNull(bpMatch[1]);
            diastolic = toNumberOrNull(bpMatch[2]);
        }
    } else {
        systolic = toNumberOrNull(bpEntry && bpEntry.systolic);
        diastolic = toNumberOrNull(bpEntry && bpEntry.diastolic);
    }

    var confidenceClass = 'status-badge';
    var confidenceLevelLabel = '--';
    if (confidenceDetails && confidenceDetails.level) {
        confidenceLevelLabel = String(confidenceDetails.level).toUpperCase();
        confidenceClass = 'status-badge ' + (confidenceDetails.level === 'high' ? 'normal' : confidenceDetails.level === 'medium' ? 'warning' : 'critical');
    }

    var fieldConfidenceHtml = '';
    if (confidenceDetails && confidenceDetails.fields) {
        var fieldEntries = Object.keys(confidenceDetails.fields)
            .filter(function(key) { return key !== 'template'; })
            .slice(0, 12)
            .map(function(key) {
                var info = confidenceDetails.fields[key] || {};
                var pct = formatConfidencePercent(info.confidence);
                return '<div class="report-confidence-item"><div class="report-confidence-item-label">' + escapeHtml(key) + '</div><div class="report-confidence-item-value">' + escapeHtml(pct) + '</div></div>';
            });
        if (fieldEntries.length > 0) {
            fieldConfidenceHtml = '<div class="report-confidence-grid">' + fieldEntries.join('') + '</div>';
        }
    }

    var confidencePanelHtml = '<div class="report-detail-section">'
        + '<h4>Extraction Confidence</h4>'
        + '<div class="report-confidence-grid">'
        + '<div class="report-confidence-item"><div class="report-confidence-item-label">Overall</div><div class="report-confidence-item-value">' + escapeHtml(formatConfidencePercent(insights && insights.confidence)) + '</div></div>'
        + '<div class="report-confidence-item"><div class="report-confidence-item-label">Level</div><div class="report-confidence-item-value"><span class="' + confidenceClass + '">' + escapeHtml(confidenceLevelLabel) + '</span></div></div>'
        + '<div class="report-confidence-item"><div class="report-confidence-item-label">Template</div><div class="report-confidence-item-value">' + escapeHtml(confidenceDetails && confidenceDetails.template && confidenceDetails.template.name ? confidenceDetails.template.name : 'Generic') + '</div></div>'
        + '<div class="report-confidence-item"><div class="report-confidence-item-label">Signals</div><div class="report-confidence-item-value">' + escapeHtml(String(confidenceDetails && confidenceDetails.signalCount ? confidenceDetails.signalCount : '--')) + '</div></div>'
        + '</div>'
        + fieldConfidenceHtml
        + '</div>';

    var correctionFormHtml = '<div class="report-detail-section">'
        + '<h4>Correct Extracted Values</h4>'
        + '<form id="report-correction-form" onsubmit="submitReportCorrections(event, ' + reportId + ')">'
        + '<div class="report-correction-grid">'
        + '<div class="form-group"><label class="form-label">Patient Name</label><input class="form-input" id="corr-patient-name" type="text" value="' + escapeHtml(extracted.patientName || '') + '"></div>'
        + '<div class="form-group"><label class="form-label">Patient ID</label><input class="form-input" id="corr-patient-id" type="text" value="' + escapeHtml(extracted.patientId || '') + '"></div>'
        + '<div class="form-group"><label class="form-label">Report Date</label><input class="form-input" id="corr-report-date" type="text" value="' + escapeHtml(extracted.reportDate || '') + '" placeholder="e.g. 24 Apr 2024"></div>'
        + '<div class="form-group"><label class="form-label">HbA1c (%)</label><input class="form-input" id="corr-hba1c" type="number" step="0.1" min="2" max="20" value="' + escapeHtml(extracted.hba1c != null ? String(extracted.hba1c) : '') + '"></div>'
        + '<div class="form-group"><label class="form-label">Primary Glucose (mg/dL)</label><input class="form-input" id="corr-glucose" type="number" step="1" min="20" max="700" value="' + escapeHtml(primaryGlucose != null ? String(primaryGlucose) : '') + '"></div>'
        + '<div class="form-group"><label class="form-label">Average Glucose / ABG</label><input class="form-input" id="corr-abg" type="number" step="1" min="20" max="700" value="' + escapeHtml(extracted.averageGlucoseMgDl != null ? String(extracted.averageGlucoseMgDl) : '') + '"></div>'
        + '<div class="form-group"><label class="form-label">Systolic BP</label><input class="form-input" id="corr-systolic" type="number" step="1" min="40" max="300" value="' + escapeHtml(systolic != null ? String(systolic) : '') + '"></div>'
        + '<div class="form-group"><label class="form-label">Diastolic BP</label><input class="form-input" id="corr-diastolic" type="number" step="1" min="20" max="200" value="' + escapeHtml(diastolic != null ? String(diastolic) : '') + '"></div>'
        + '<div class="form-group"><label class="form-label">Weight (kg)</label><input class="form-input" id="corr-weight" type="number" step="0.1" min="1" max="700" value="' + escapeHtml(extracted.weightKg != null ? String(extracted.weightKg) : '') + '"></div>'
        + '<div class="form-group full-width"><label class="form-label">Medications (comma separated)</label><input class="form-input" id="corr-medications" type="text" value="' + escapeHtml(Array.isArray(extracted.medications) ? extracted.medications.join(', ') : '') + '"></div>'
        + '<div class="form-group full-width"><label class="form-label">Diagnoses (comma separated)</label><input class="form-input" id="corr-diagnoses" type="text" value="' + escapeHtml(Array.isArray(extracted.diagnoses) ? extracted.diagnoses.join(', ') : '') + '"></div>'
        + '<div class="form-group full-width"><label class="form-label">Allergies (comma separated)</label><input class="form-input" id="corr-allergies" type="text" value="' + escapeHtml(Array.isArray(extracted.allergies) ? extracted.allergies.join(', ') : '') + '"></div>'
        + '<div class="form-group full-width"><label class="form-label">Correction Note</label><textarea class="form-textarea" id="corr-note" rows="2" placeholder="Optional note for this correction"></textarea></div>'
        + '</div>'
        + '<div class="modal-actions" style="margin-top:0;"><button class="btn btn-primary" id="report-correction-submit-btn" type="submit">Apply Corrections</button></div>'
        + '<div class="muted-note" id="report-correction-result">Submit only fields that should change.</div>'
        + '</form>'
        + '</div>';

    var correctionHistoryHtml = '<div class="report-detail-section">'
        + '<h4>Correction History</h4>'
        + '<div id="report-correction-history"><div class="muted-note">Loading correction history...</div></div>'
        + '</div>';

    if (fileUrl) {
        if (isDataUrl) {
            fileLabel = 'Uploaded file' + (fileType ? ' (' + fileType + ')' : '');
        } else {
            fileLabel = fileUrl;
        }

        if (isPdf) {
            viewerHtml = '<div class="form-group" style="margin-top: 12px;"><label class="form-label">Document Preview</label><iframe src="' + escapeHtml(fileUrl) + '" title="Report PDF" style="width:100%; height:520px; border:1px solid var(--gray-200); border-radius:10px; background:#fff;"></iframe></div>';
        } else if (isImage) {
            viewerHtml = '<div class="form-group" style="margin-top: 12px;"><label class="form-label">Image Preview</label><div style="border:1px solid var(--gray-200); border-radius:10px; background:#f8fafc; padding:10px;"><img src="' + escapeHtml(fileUrl) + '" alt="Report image" style="display:block; width:100%; max-height:520px; object-fit:contain;"></div></div>';
        } else if (/^https?:\/\//i.test(fileUrl)) {
            viewerHtml = '<div class="form-group" style="margin-top: 12px;"><label class="form-label">Document</label><a class="btn btn-outline btn-sm" href="' + escapeHtml(fileUrl) + '" target="_blank" rel="noopener noreferrer">Open File</a></div>';
        }
    }

    content.innerHTML = [
        '<div class="form-grid">',
        '  <div class="form-group">',
        '    <label class="form-label">Report Name</label>',
        '    <div style="padding: 12px; background: var(--gray-50); border-radius: 10px; font-weight: 600;">' + escapeHtml(report.reportName || '--') + '</div>',
        '  </div>',
        '  <div class="form-group">',
        '    <label class="form-label">Type</label>',
        '    <div style="padding: 12px; background: var(--gray-50); border-radius: 10px; font-weight: 600;">' + escapeHtml(report.type || '--') + '</div>',
        '  </div>',
        '  <div class="form-group">',
        '    <label class="form-label">Date</label>',
        '    <div style="padding: 12px; background: var(--gray-50); border-radius: 10px; font-weight: 600;">' + escapeHtml(formatDate(report.date)) + '</div>',
        '  </div>',
        '  <div class="form-group">',
        '    <label class="form-label">Doctor</label>',
        '    <div style="padding: 12px; background: var(--gray-50); border-radius: 10px; font-weight: 600;">' + escapeHtml(doctorName) + '</div>',
        '  </div>',
        '  <div class="form-group">',
        '    <label class="form-label">Status</label>',
        '    <div style="padding: 12px; background: var(--gray-50); border-radius: 10px; font-weight: 600;">' + escapeHtml(report.status || 'Pending') + '</div>',
        '  </div>',
        '  <div class="form-group">',
        '    <label class="form-label">File</label>',
        '    <div style="padding: 12px; background: var(--gray-50); border-radius: 10px; font-weight: 600;">' + escapeHtml(fileLabel) + '</div>',
        '  </div>',
        '</div>',
        (viewerHtml || (fileUrl ? '<div class="form-group" style="margin-top: 12px;"><div class="empty-state" style="text-align:left;">Preview is not available for this file format.</div></div>' : '<div class="form-group" style="margin-top: 12px;"><div class="empty-state" style="text-align:left;">No uploaded file is available for preview for this report.</div></div>')),
        (summary ? '<div class="form-group" style="margin-top: 12px;"><label class="form-label">AI Summary</label><div style="padding: 12px; background: var(--gray-50); border-radius: 10px;">' + escapeHtml(summary) + '</div></div>' : ''),
        confidencePanelHtml,
        correctionFormHtml,
        correctionHistoryHtml,
    ].join('');

    loadReportCorrectionHistory(reportId);
}

async function viewReport(id) {
    var content = document.getElementById('report-view-content');
    if (content) {
        content.innerHTML = '<div class="empty-state">Loading report details...</div>';
    }
    openModal('report-view-modal');

    try {
        var result = await API.get('/api/patient/reports/' + Number(id));
        if (!result.ok) {
            if (content) {
                content.innerHTML = '<div class="empty-state">' + escapeHtml((result.data && result.data.error) || 'Failed to load report details.') + '</div>';
            }
            return;
        }

        renderReportDetails(result.data || {});
    } catch (err) {
        if (content) {
            content.innerHTML = '<div class="empty-state">Network error while loading report details.</div>';
        }
    }
}

async function submitReportCorrections(event, reportId) {
    if (event) event.preventDefault();

    var submitBtn = document.getElementById('report-correction-submit-btn');
    var resultEl = document.getElementById('report-correction-result');
    function setResult(message, tone) {
        if (!resultEl) return;
        resultEl.textContent = message;
        if (tone === 'error') resultEl.style.color = 'var(--danger)';
        else if (tone === 'success') resultEl.style.color = 'var(--success)';
        else resultEl.style.color = 'var(--gray-500)';
    }

    var fields = [
        { fieldKey: 'patientName', value: (document.getElementById('corr-patient-name') || {}).value },
        { fieldKey: 'patientId', value: (document.getElementById('corr-patient-id') || {}).value },
        { fieldKey: 'reportDate', value: (document.getElementById('corr-report-date') || {}).value },
        { fieldKey: 'hba1c', value: (document.getElementById('corr-hba1c') || {}).value },
        { fieldKey: 'glucose', value: (document.getElementById('corr-glucose') || {}).value },
        { fieldKey: 'abg', value: (document.getElementById('corr-abg') || {}).value },
        { fieldKey: 'systolic', value: (document.getElementById('corr-systolic') || {}).value },
        { fieldKey: 'diastolic', value: (document.getElementById('corr-diastolic') || {}).value },
        { fieldKey: 'weight', value: (document.getElementById('corr-weight') || {}).value },
        { fieldKey: 'medications', value: (document.getElementById('corr-medications') || {}).value },
        { fieldKey: 'diagnoses', value: (document.getElementById('corr-diagnoses') || {}).value },
        { fieldKey: 'allergies', value: (document.getElementById('corr-allergies') || {}).value },
    ];

    var note = ((document.getElementById('corr-note') || {}).value || '').trim();
    var corrections = fields
        .map(function(item) {
            var value = (item.value == null ? '' : String(item.value)).trim();
            if (!value) return null;
            return {
                fieldKey: item.fieldKey,
                value: value,
                note: note || null,
            };
        })
        .filter(Boolean);

    if (corrections.length === 0) {
        setResult('Enter at least one field value to apply correction.', 'error');
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Applying...';
    }
    setResult('Applying corrections...', 'neutral');

    try {
        var response = await API.post('/api/patient/reports/' + Number(reportId) + '/corrections', {
            corrections: corrections,
        });

        if (!response.ok) {
            setResult((response.data && response.data.error) || 'Failed to apply corrections.', 'error');
            return;
        }

        var updatedReport = response.data && response.data.report ? response.data.report : null;
        if (updatedReport) {
            state.reports = state.reports.map(function(item) {
                return Number(item._id || item.id) === Number(updatedReport._id || updatedReport.id)
                    ? updatedReport
                    : item;
            });
            renderReports();
            filterReports();
            updateLatestReportInsightFromState();
            renderReportDetails(updatedReport);
            resultEl = document.getElementById('report-correction-result');
        }

        await loadReportExtractionMetrics();
        setResult('Corrections applied and report insights updated.', 'success');
    } catch (err) {
        setResult('Network error while applying corrections.', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Apply Corrections';
        }
    }
}

function renderRecords() {
    var list = document.getElementById('records-list');
    if (!list) return;

    if (state.records.length === 0) {
        list.innerHTML = '<div class="empty-state">No medical records available.</div>';
        return;
    }

    list.innerHTML = state.records.map(function(record) {
        return [
            '<div class="record-card card" data-record-id="' + record._id + '">',
            '<div style="display:flex; justify-content:space-between; gap:16px; align-items:flex-start;">',
            '<div>',
            '<div style="font-weight:700; font-size:16px; margin-bottom:6px;">' + escapeHtml(record.title) + '</div>',
            '<div class="record-type" style="color: var(--gray-500); margin-bottom:6px;">' + escapeHtml(record.type) + '</div>',
            '<div style="color: var(--gray-500); font-size:14px;">' + formatDate(record.date) + '</div>',
            '</div>',
            '<span class="status-badge normal">Stored</span>',
            '</div>',
            '<div style="margin-top:12px; color: var(--gray-700);">' + escapeHtml(record.description || '--') + '</div>',
            '</div>',
        ].join('');
    }).join('');
}

function renderDoctors() {
    var grid = document.querySelector('.doctor-grid');
    if (!grid) return;

    if (state.doctors.length === 0) {
        grid.innerHTML = '<div class="card"><div class="empty-state">No assigned doctors yet.</div></div>';
        return;
    }

    grid.innerHTML = state.doctors.map(function(doctor) {
        var online = Number(doctor.isLoggedIn || 0) === 1;
        var onlineBadge = online
            ? '<span class="status-badge normal" style="margin-top: 6px;">Online</span>'
            : '<span class="status-badge warning" style="margin-top: 6px;">Offline</span>';
        return [
            '<div class="doctor-card">',
            '<div class="doctor-header">',
            '<div class="doctor-avatar"><i class="fas fa-user"></i></div>',
            '<div>',
            '<div class="doctor-name">' + escapeHtml(doctor.fullName || 'Doctor') + '</div>',
            '<div class="doctor-specialty">' + escapeHtml(doctor.specialization || 'General Practitioner') + '</div>',
            onlineBadge,
            '</div>',
            '</div>',
            '<div class="doctor-details">',
            '<div class="doctor-detail"><i class="fas fa-hospital"></i>' + escapeHtml(doctor.clinicName || '--') + '</div>',
            '<div class="doctor-detail"><i class="fas fa-phone"></i>' + escapeHtml(doctor.phone || '--') + '</div>',
            '<div class="doctor-detail"><i class="fas fa-envelope"></i>' + escapeHtml(doctor.email || '--') + '</div>',
            '</div>',
            '<div class="doctor-actions">',
            '<button class="btn btn-primary btn-sm" onclick="scheduleWithDoctor(' + Number(doctor._id || doctor.id || 0) + ')"><i class="fas fa-calendar"></i>Schedule</button>',
            '</div>',
            '</div>',
        ].join('');
    }).join('');

    populateDoctorSelect();
}

function renderAppointments() {
    var body = document.querySelector('#doctors .data-table tbody');
    if (!body) return;

    if (state.appointments.length === 0) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--gray-500);">No appointments yet.</td></tr>';
        return;
    }

    body.innerHTML = state.appointments.map(function(appt) {
        var doctorName = extractDoctorName(appt.doctor);
        var specialization = appt.doctor && appt.doctor.specialization ? appt.doctor.specialization : '--';
        var status = appt.status || 'Scheduled';
        var statusClass = String(status).toLowerCase() === 'completed' ? 'normal' : 'warning';
        return [
            '<tr>',
            '<td>' + formatDate(appt.date) + '</td>',
            '<td>' + escapeHtml(doctorName) + '</td>',
            '<td>' + escapeHtml(specialization) + '</td>',
            '<td>' + escapeHtml(appt.reason || '--') + '</td>',
            '<td><span class="status-badge ' + statusClass + '">' + escapeHtml(status) + '</span></td>',
            '</tr>',
        ].join('');
    }).join('');
}

function populateDoctorSelect() {
    var select = document.getElementById('appointment-doctor');
    var messageSelect = document.getElementById('new-thread-doctor');
    if (!select && !messageSelect) return;

    var options = ['<option value="">Choose a doctor...</option>'];
    state.doctors.forEach(function(doctor) {
        options.push(
            '<option value="' + Number(doctor._id) + '">' +
            escapeHtml((doctor.fullName || 'Doctor') + ' - ' + (doctor.specialization || 'General Practitioner')) +
            '</option>'
        );
    });
    if (select) {
        select.innerHTML = options.join('');
    }
    if (messageSelect) {
        messageSelect.innerHTML = options.join('');
    }
}

function updateOverviewSummary(dashboard) {
    var statValues = document.querySelectorAll('.quick-stats .stat-value');
    var latestGlucoseValue = toNumberOrNull(dashboard.latestGlucose);
    var latestGlucoseType = String(dashboard.latestGlucose && dashboard.latestGlucose.type || '').toLowerCase();
    var latestWeightValue = toNumberOrNull(dashboard.latestMetric && dashboard.latestMetric.weight);
    var systolicValue = toNumberOrNull(dashboard.latestMetric && dashboard.latestMetric.systolic);
    var diastolicValue = toNumberOrNull(dashboard.latestMetric && dashboard.latestMetric.diastolic);
    var ageProfile = getAgeAwareGlucoseProfile(getCurrentPatientAgeYears());

    if (statValues[0]) {
        statValues[0].textContent = latestGlucoseValue === null ? '--' : latestGlucoseValue.toFixed(0);
    }
    if (statValues[1]) {
        statValues[1].textContent = latestWeightValue === null ? '--' : latestWeightValue.toFixed(1);
    }

    if (statValues[2]) {
        var bpText = '--';
        if (systolicValue !== null && diastolicValue !== null) {
            bpText = systolicValue.toFixed(0) + '/' + diastolicValue.toFixed(0);
        }
        statValues[2].textContent = bpText;
    }

    if (statValues[3]) {
        var upcomingCount = Array.isArray(dashboard.upcomingAppointments) ? dashboard.upcomingAppointments.length : 0;
        statValues[3].textContent = String(upcomingCount);
    }

    var statTrends = document.querySelectorAll('.quick-stats .stat-card .stat-trend');

    function setTrendState(index, trendState) {
        if (!statTrends[index] || !trendState) return;
        statTrends[index].classList.remove('up', 'down', 'warning');
        statTrends[index].classList.add(trendState.trendClass);
        statTrends[index].innerHTML = '<i class="fas ' + trendState.icon + '"></i> ' + escapeHtml(trendState.text);
    }

    function toggleTrend(index, visible) {
        if (!statTrends[index]) return;
        statTrends[index].style.display = visible ? '' : 'none';
    }

    if (latestGlucoseValue !== null) {
        var glucoseLevel = (latestGlucoseType === 'postprandial' || latestGlucoseType === 'random')
            ? classifyPostprandialGlucose(latestGlucoseValue, ageProfile)
            : classifyFastingGlucose(latestGlucoseValue, ageProfile);
        setTrendState(0, getTrendState(glucoseLevel.level, glucoseLevel.label));
    }

    if (systolicValue !== null && diastolicValue !== null) {
        var bpLevel = classifyBloodPressure(systolicValue, diastolicValue);
        setTrendState(2, getTrendState(bpLevel.level, bpLevel.label));
    }

    toggleTrend(0, latestGlucoseValue !== null);
    toggleTrend(1, latestWeightValue !== null);
    toggleTrend(2, systolicValue !== null && diastolicValue !== null);
}

function getCurrentPatientAgeYears() {
    var user = state.currentUser || (typeof API !== 'undefined' && API.getUser ? API.getUser() : null);
    var dobValue = user && user.dateOfBirth ? user.dateOfBirth : null;
    if (!dobValue) return null;

    var dob = new Date(dobValue);
    if (Number.isNaN(dob.getTime())) return null;

    var now = new Date();
    var age = now.getFullYear() - dob.getFullYear();
    var monthDiff = now.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
        age -= 1;
    }

    if (!Number.isFinite(age) || age < 0 || age > 125) return null;
    return age;
}

function getAgeAwareGlucoseProfile(ageYears) {
    var age = Number(ageYears);
    if (Number.isFinite(age) && age < 18) {
        return {
            key: 'children',
            label: 'Children',
            fastingHealthyMax: 100,
            postMealHealthyMax: 140,
            hba1cHealthyMax: 5.7,
        };
    }

    if (Number.isFinite(age) && age >= 65) {
        return {
            key: 'seniors',
            label: 'Seniors',
            fastingHealthyMax: 110,
            postMealHealthyMax: 160,
            hba1cHealthyMax: 6.0,
        };
    }

    if (Number.isFinite(age) && age >= 40) {
        return {
            key: 'middle-age',
            label: 'Middle Age',
            fastingHealthyMax: 100,
            postMealHealthyMax: 160,
            hba1cHealthyMax: 5.7,
        };
    }

    return {
        key: 'adults',
        label: 'Adults',
        fastingHealthyMax: 99,
        postMealHealthyMax: 140,
        hba1cHealthyMax: 5.6,
    };
}

function getMetricVisual(level) {
    if (level === 'healthy') {
        return { badgeClass: 'normal', label: 'Healthy', progressClass: 'success', progress: 82 };
    }
    if (level === 'borderline') {
        return { badgeClass: 'warning', label: 'Borderline', progressClass: 'warning', progress: 60 };
    }
    if (level === 'bad') {
        return { badgeClass: 'critical', label: 'Bad', progressClass: 'danger', progress: 34 };
    }
    return { badgeClass: 'critical', label: 'Dangerous', progressClass: 'danger', progress: 16 };
}

function getTrendState(level, label) {
    if (level === 'healthy') {
        return { trendClass: 'up', icon: 'fa-check', text: label || 'Healthy' };
    }
    if (level === 'borderline') {
        return { trendClass: 'warning', icon: 'fa-exclamation-triangle', text: label || 'Borderline' };
    }
    return { trendClass: 'down', icon: 'fa-exclamation-circle', text: label || (level === 'bad' ? 'Bad' : 'Dangerous') };
}

function classifyFastingGlucose(value, ageProfile) {
    var numeric = toNumberOrNull(value);
    if (numeric === null) return { level: 'unknown', label: '--' };

    var profile = ageProfile || getAgeAwareGlucoseProfile(null);
    if (numeric < 70) return { level: 'dangerous', label: 'Dangerous (Low)' };
    if (numeric <= profile.fastingHealthyMax) return { level: 'healthy', label: 'Healthy' };
    if (numeric <= 125) return { level: 'borderline', label: 'Borderline' };
    if (numeric <= 199) return { level: 'bad', label: 'Bad' };
    return { level: 'dangerous', label: 'Dangerous' };
}

function classifyPostprandialGlucose(value, ageProfile) {
    var numeric = toNumberOrNull(value);
    if (numeric === null) return { level: 'unknown', label: '--' };

    var profile = ageProfile || getAgeAwareGlucoseProfile(null);
    if (numeric < 70) return { level: 'dangerous', label: 'Dangerous (Low)' };
    if (numeric < profile.postMealHealthyMax) return { level: 'healthy', label: 'Healthy' };
    if (numeric <= 199) return { level: 'borderline', label: 'Borderline' };
    if (numeric < 300) return { level: 'bad', label: 'Bad' };
    return { level: 'dangerous', label: 'Dangerous' };
}

function classifyHba1c(value, ageProfile) {
    var numeric = toNumberOrNull(value);
    if (numeric === null) return { level: 'unknown', label: '--' };

    var profile = ageProfile || getAgeAwareGlucoseProfile(null);
    if (numeric < 4.0) return { level: 'dangerous', label: 'Dangerous (Low)' };
    if (numeric < profile.hba1cHealthyMax) return { level: 'healthy', label: 'Healthy' };
    if (numeric <= 6.4) return { level: 'borderline', label: 'Borderline' };
    if (numeric < 8.0) return { level: 'bad', label: 'Bad' };
    return { level: 'dangerous', label: 'Dangerous' };
}

function classifyBloodPressure(systolic, diastolic) {
    var s = toNumberOrNull(systolic);
    var d = toNumberOrNull(diastolic);
    if (s === null || d === null) return { level: 'unknown', label: '--' };

    if (s < 90 || d < 60) return { level: 'dangerous', label: 'Dangerous (Low)' };
    if (s < 120 && d < 80) return { level: 'healthy', label: 'Healthy' };
    if (s >= 120 && s <= 129 && d < 80) return { level: 'borderline', label: 'Borderline' };
    if ((s >= 130 && s <= 139) || (d >= 80 && d <= 89)) return { level: 'bad', label: 'Bad' };
    if (s >= 140 || d >= 90) return { level: 'dangerous', label: 'Dangerous' };
    return { level: 'borderline', label: 'Borderline' };
}

function updateOverviewMetrics(glucoseReadings, healthMetrics, scoreData) {
    glucoseReadings = Array.isArray(glucoseReadings) ? glucoseReadings : [];
    healthMetrics = Array.isArray(healthMetrics) ? healthMetrics : [];

    var metricValues = document.querySelectorAll('#overview .metrics-grid .metric-card .metric-value');
    if (metricValues.length < 3) return;

    var fastingValues = [];
    var postprandialValues = [];
    for (var i = 0; i < glucoseReadings.length; i += 1) {
        var reading = glucoseReadings[i];
        if (!reading) continue;
        var numeric = toNumberOrNull(reading.value);
        if (numeric === null) continue;
        if (reading.type === 'fasting') fastingValues.push(numeric);
        if (reading.type === 'postprandial') postprandialValues.push(numeric);
    }

    function average(values) {
        if (!values.length) return null;
        var sum = 0;
        for (var idx = 0; idx < values.length; idx += 1) {
            sum += values[idx];
        }
        return sum / values.length;
    }

    var fastingAvg = average(fastingValues);
    var ppAvg = average(postprandialValues);

    var latestHba1cRecord = null;
    var latestHba1cValue = null;
    for (var j = 0; j < healthMetrics.length; j += 1) {
        var candidate = healthMetrics[j];
        var numericValue = toNumberOrNull(candidate && candidate.hba1c);
        if (numericValue !== null) {
            latestHba1cRecord = candidate;
            latestHba1cValue = numericValue;
            break;
        }
    }

    metricValues[0].textContent = fastingAvg === null ? '--' : fastingAvg.toFixed(1);
    metricValues[1].textContent = ppAvg === null ? '--' : ppAvg.toFixed(1);
    metricValues[2].textContent = latestHba1cValue === null ? '--' : latestHba1cValue.toFixed(1) + '%';

    var metricUnits = document.querySelectorAll('#overview .metrics-grid .metric-card .metric-unit');
    if (metricUnits[2]) {
        metricUnits[2].textContent = latestHba1cRecord
            ? 'Last test: ' + formatDate(latestHba1cRecord.recordedAt)
            : 'Last test: --';
    }

    var statusBadges = document.querySelectorAll('#overview .metrics-grid .metric-card .status-badge');

    function setMetricBadge(index, classification) {
        if (!statusBadges[index] || !classification || !classification.level || classification.level === 'unknown') return;
        var visual = getMetricVisual(classification.level);
        statusBadges[index].className = 'status-badge ' + visual.badgeClass;
        statusBadges[index].textContent = visual.label;
    }

    function toggleBadge(index, visible) {
        if (!statusBadges[index]) return;
        statusBadges[index].style.display = visible ? '' : 'none';
    }

    toggleBadge(0, fastingAvg !== null);
    toggleBadge(1, ppAvg !== null);
    toggleBadge(2, latestHba1cValue !== null);

    var progressContainers = document.querySelectorAll('#overview .metrics-grid .metric-card .metric-progress');
    var progressBars = document.querySelectorAll('#overview .metrics-grid .metric-card .metric-progress-bar');

    function updateProgress(index, classification) {
        if (!progressContainers[index] || !progressBars[index]) return;
        if (!classification || !classification.level || classification.level === 'unknown') {
            progressContainers[index].style.display = 'none';
            return;
        }

        var visual = getMetricVisual(classification.level);
        progressContainers[index].style.display = '';
        var clamped = Math.max(0, Math.min(100, visual.progress));
        progressBars[index].classList.remove('success', 'warning', 'danger');
        progressBars[index].classList.add(visual.progressClass);
        progressBars[index].style.width = clamped + '%';
    }

    var ageProfile = getAgeAwareGlucoseProfile(getCurrentPatientAgeYears());
    var fastingClassification = classifyFastingGlucose(fastingAvg, ageProfile);
    var ppClassification = classifyPostprandialGlucose(ppAvg, ageProfile);
    var hba1cClassification = classifyHba1c(latestHba1cValue, ageProfile);

    setMetricBadge(0, fastingClassification);
    setMetricBadge(1, ppClassification);
    setMetricBadge(2, hba1cClassification);

    updateProgress(0, fastingAvg !== null ? fastingClassification : null);
    updateProgress(1, ppAvg !== null ? ppClassification : null);
    updateProgress(2, latestHba1cValue !== null ? hba1cClassification : null);
}

function initCharts() {
    var glucoseCtx = document.getElementById('glucoseChart').getContext('2d');
    state.charts.glucose = new Chart(glucoseCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Fasting Glucose',
                    data: [],
                    borderColor: '#0D9488',
                    backgroundColor: 'rgba(13, 148, 136, 0.1)',
                    tension: 0.4,
                    fill: true,
                },
                {
                    label: 'Postprandial',
                    data: [],
                    borderColor: '#F59E0B',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    tension: 0.4,
                    fill: true,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: false,
                    min: 60,
                    max: 240,
                },
            },
        },
    });

    var weightCtx = document.getElementById('weightChart').getContext('2d');
    state.charts.weight = new Chart(weightCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Weight (kg)',
                    data: [],
                    borderColor: '#3B82F6',
                    backgroundColor: 'rgba(59, 130, 246, 0.12)',
                    tension: 0.35,
                    fill: true,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
        },
    });

    var trendsGlucoseCtx = document.getElementById('trendsGlucoseChart').getContext('2d');
    state.charts.trendsGlucose = new Chart(trendsGlucoseCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Average Glucose',
                    data: [],
                    borderColor: '#0D9488',
                    backgroundColor: 'rgba(13, 148, 136, 0.1)',
                    tension: 0.4,
                    fill: true,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
        },
    });

    var trendsWeightCtx = document.getElementById('trendsWeightChart').getContext('2d');
    state.charts.trendsWeight = new Chart(trendsWeightCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Weight',
                    data: [],
                    borderColor: '#3B82F6',
                    backgroundColor: 'rgba(59, 130, 246, 0.12)',
                    tension: 0.35,
                    fill: true,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
        },
    });

    var trendsBPCtx = document.getElementById('trendsBPChart').getContext('2d');
    state.charts.trendsBP = new Chart(trendsBPCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Systolic',
                    data: [],
                    borderColor: '#EF4444',
                    tension: 0.35,
                },
                {
                    label: 'Diastolic',
                    data: [],
                    borderColor: '#10B981',
                    tension: 0.35,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
        },
    });

    var trendsHbA1cCtx = document.getElementById('trendsHbA1cChart').getContext('2d');
    state.charts.trendsHba1c = new Chart(trendsHbA1cCtx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'HbA1c %',
                    data: [],
                    backgroundColor: 'rgba(16, 185, 129, 0.7)',
                    borderRadius: 8,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    min: 4,
                    max: 12,
                },
            },
        },
    });
}

function updateOverviewCharts(glucoseReadings, healthMetrics) {
    var byDate = {};
    glucoseReadings.forEach(function(reading) {
        var key = String(reading.recordedAt || '').slice(0, 10);
        if (!byDate[key]) byDate[key] = { fasting: [], postprandial: [] };
        if (reading.type === 'fasting') byDate[key].fasting.push(Number(reading.value));
        if (reading.type === 'postprandial') byDate[key].postprandial.push(Number(reading.value));
    });

    var labels = Object.keys(byDate).sort();
    var fastingSeries = labels.map(function(key) {
        var arr = byDate[key].fasting;
        if (arr.length === 0) return null;
        return Number((arr.reduce(function(a, b) { return a + b; }, 0) / arr.length).toFixed(2));
    });
    var ppSeries = labels.map(function(key) {
        var arr = byDate[key].postprandial;
        if (arr.length === 0) return null;
        return Number((arr.reduce(function(a, b) { return a + b; }, 0) / arr.length).toFixed(2));
    });

    state.charts.glucose.data.labels = labels;
    state.charts.glucose.data.datasets[0].data = fastingSeries;
    state.charts.glucose.data.datasets[1].data = ppSeries;
    state.charts.glucose.update();

    var metricLabels = healthMetrics.map(function(item) { return String(item.recordedAt || '').slice(0, 10); }).reverse();
    var weightSeries = healthMetrics.map(function(item) { return item.weight ? Number(item.weight) : null; }).reverse();

    state.charts.weight.data.labels = metricLabels;
    state.charts.weight.data.datasets[0].data = weightSeries;
    state.charts.weight.update();
}

function updateTrendCharts(trendPayload) {
    var glucose = Array.isArray(trendPayload.glucose) ? trendPayload.glucose.slice().reverse() : [];
    var metrics = Array.isArray(trendPayload.metrics) ? trendPayload.metrics.slice().reverse() : [];

    state.charts.trendsGlucose.data.labels = glucose.map(function(item) { return String(item.recordedAt || '').slice(0, 10); });
    state.charts.trendsGlucose.data.datasets[0].data = glucose.map(function(item) { return Number(item.value); });
    state.charts.trendsGlucose.update();

    state.charts.trendsWeight.data.labels = metrics.map(function(item) { return String(item.recordedAt || '').slice(0, 10); });
    state.charts.trendsWeight.data.datasets[0].data = metrics.map(function(item) { return item.weight ? Number(item.weight) : null; });
    state.charts.trendsWeight.update();

    state.charts.trendsBP.data.labels = metrics.map(function(item) { return String(item.recordedAt || '').slice(0, 10); });
    state.charts.trendsBP.data.datasets[0].data = metrics.map(function(item) { return item.systolic ? Number(item.systolic) : null; });
    state.charts.trendsBP.data.datasets[1].data = metrics.map(function(item) { return item.diastolic ? Number(item.diastolic) : null; });
    state.charts.trendsBP.update();

    var hba1c = metrics.filter(function(item) {
        return item.hba1c !== null && item.hba1c !== undefined && item.hba1c !== '';
    });
    state.charts.trendsHba1c.data.labels = hba1c.map(function(item) { return String(item.recordedAt || '').slice(0, 10); });
    state.charts.trendsHba1c.data.datasets[0].data = hba1c.map(function(item) { return Number(item.hba1c); });
    state.charts.trendsHba1c.update();
}

function updateNutritionSummary(summary) {
    var values = document.querySelectorAll('.nutrition-grid .nutrition-value');
    if (values[0]) values[0].textContent = summary.totalCalories + ' kcal';
    if (values[1]) values[1].textContent = summary.totalCarbs + 'g';
    if (values[2]) values[2].textContent = summary.activeMinutes + ' min';
    if (values[3]) values[3].textContent = summary.mealCount;

    var labels = document.querySelectorAll('.nutrition-grid .nutrition-label');
    if (labels[2]) labels[2].textContent = 'Activity Minutes';
    if (labels[3]) labels[3].textContent = 'Meals Logged';
}

function formatMealSlotLabel(slot) {
    var key = String(slot || '').toLowerCase();
    if (key === 'breakfast') return 'Breakfast';
    if (key === 'lunch') return 'Lunch';
    if (key === 'dinner') return 'Dinner';
    if (key === 'snack') return 'Snack';
    return key || '--';
}

function renderTodayMealSnapshot(entries) {
    var bySlot = {
        breakfast: null,
        lunch: null,
        dinner: null,
    };

    entries.forEach(function(item) {
        var slot = String(item.mealSlot || '').toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(bySlot, slot)) return;
        if (!bySlot[slot]) bySlot[slot] = item;
    });

    ['breakfast', 'lunch', 'dinner'].forEach(function(slot) {
        var itemEl = document.getElementById('diet-' + slot + '-items');
        var metaEl = document.getElementById('diet-' + slot + '-meta');
        var entry = bySlot[slot];

        if (!entry) {
            if (itemEl) itemEl.textContent = 'No intake logged yet.';
            if (metaEl) metaEl.textContent = 'Sugar: --';
            return;
        }

        if (itemEl) itemEl.textContent = entry.intakeText || 'Logged';

        var sugar = Number(entry.bloodSugarMgDl);
        var sugarText = Number.isFinite(sugar) ? sugar + ' mg/dL' : '--';
        var timing = entry.sugarTiming ? ' (' + String(entry.sugarTiming).toLowerCase() + ')' : '';
        if (metaEl) metaEl.textContent = 'Sugar: ' + sugarText + timing;
    });
}

function renderDietIntakeTable(entries) {
    var body = document.getElementById('diet-intake-table-body');
    if (!body) return;

    if (!Array.isArray(entries) || entries.length === 0) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--gray-500);">No diet intake logs yet.</td></tr>';
        return;
    }

    body.innerHTML = entries.slice(0, 20).map(function(item) {
        var loggedAt = item.loggedAt ? formatDate(item.loggedAt) + ' ' + formatIstTime(new Date(item.loggedAt), { hour: '2-digit', minute: '2-digit' }) : '--';
        var sugar = Number(item.bloodSugarMgDl);
        var sugarText = Number.isFinite(sugar) ? (sugar + ' mg/dL') : '--';
        var sugarClass = Number.isFinite(sugar) && sugar >= 180 ? 'warning' : 'normal';
        var timing = item.sugarTiming
            ? (String(item.sugarTiming).charAt(0).toUpperCase() + String(item.sugarTiming).slice(1))
            : '--';

        return [
            '<tr>',
            '<td>' + escapeHtml(loggedAt) + '</td>',
            '<td>' + escapeHtml(formatMealSlotLabel(item.mealSlot)) + '</td>',
            '<td>' + escapeHtml(item.intakeText || '--') + '</td>',
            '<td><span class="status-badge ' + sugarClass + '">' + escapeHtml(sugarText) + '</span></td>',
            '<td>' + escapeHtml(timing) + '</td>',
            '</tr>',
        ].join('');
    }).join('');
}

function renderDietReport(report) {
    var statusEl = document.getElementById('diet-report-status');
    var bodyEl = document.getElementById('diet-ai-report');
    var avoidEl = document.getElementById('diet-avoid-foods');
    var metrics = document.querySelectorAll('#nutritionist .metrics-grid .metric-card .metric-value');
    var progressBars = document.querySelectorAll('#nutritionist .metrics-grid .metric-card .metric-progress-bar');

    if (!report || !bodyEl) {
        if (statusEl) statusEl.textContent = 'No data';
        if (bodyEl) bodyEl.innerHTML = '<p class="report-ai-empty">Log meals to generate your personalized diet report.</p>';
        if (avoidEl) avoidEl.textContent = 'No flagged foods yet.';
        if (metrics[2]) metrics[2].textContent = '--';
        if (progressBars[2]) progressBars[2].style.width = '0%';
        return;
    }

    var summary = report.summary || {};
    var recommendations = Array.isArray(report.recommendations) ? report.recommendations : [];
    var avoidFoods = Array.isArray(report.avoidFoods) ? report.avoidFoods : [];
    var highEvents = Number(summary.highSugarEvents || 0);
    var sugarCount = Number(summary.sugarEntryCount || 0);
    var highPct = sugarCount > 0 ? Math.min(100, Math.round((highEvents / sugarCount) * 100)) : 0;

    if (statusEl) {
        if (summary.entryCount > 0 && highEvents === 0) {
            statusEl.textContent = 'Stable';
            statusEl.className = 'status-badge normal';
        } else if (highEvents > 0) {
            statusEl.textContent = highEvents >= 3 ? 'Needs Control' : 'Watch Meals';
            statusEl.className = 'status-badge warning';
        } else {
            statusEl.textContent = 'Building Data';
            statusEl.className = 'status-badge';
        }
    }

    bodyEl.innerHTML = [
        '<p class="report-ai-summary">' + escapeHtml(report.narrative || 'Diet report is ready.') + '</p>',
        recommendations.length > 0
            ? ('<ul class="diet-recommendation-list">' + recommendations.slice(0, 4).map(function(item) {
                return '<li>' + escapeHtml(item) + '</li>';
            }).join('') + '</ul>')
            : '',
    ].join('');

    if (avoidEl) {
        if (avoidFoods.length === 0) {
            avoidEl.textContent = 'No strong trigger foods detected yet.';
        } else {
            avoidEl.textContent = 'Foods to limit: ' + avoidFoods.map(function(item) {
                return item.label;
            }).join(', ');
        }
    }

    if (metrics[2]) metrics[2].textContent = String(highEvents);
    if (progressBars[2]) progressBars[2].style.width = highPct + '%';
}

function boolFromSelectValue(value) {
    return String(value) === 'true';
}

function threadInitials(name) {
    if (!name) return 'DR';
    var parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
}

function shortTime(value) {
    if (!value) return '';
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    var now = new Date();
    var dateKey = getIstDateKey(d);
    if (dateKey === getIstDateKey(now)) return formatIstTime(d, { hour: '2-digit', minute: '2-digit' });
    var yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (dateKey === getIstDateKey(yesterday)) return 'Yesterday';
    return formatIstDate(d, { month: 'short', day: 'numeric' });
}

function renderMessageThreads() {
    var container = document.getElementById('message-threads-list');
    if (!container) return;

    var searchVal = '';
    var searchEl = document.getElementById('wa-thread-search');
    if (searchEl) searchVal = (searchEl.value || '').trim().toLowerCase();

    var doctors = state.chatDoctors;
    if (searchVal) {
        doctors = doctors.filter(function(doc) {
            return (doc.fullName || '').toLowerCase().indexOf(searchVal) >= 0 ||
                   (doc.specialization || '').toLowerCase().indexOf(searchVal) >= 0;
        });
    }

    if (doctors.length === 0) {
        container.innerHTML = '<div class="wa-empty">No doctors found</div>';
        return;
    }

    container.innerHTML = doctors.map(function(doc) {
        var docId = Number(doc._id || doc.id);
        var isActive = docId === state.selectedDoctorId;
        var thread = state.threads.find(function(t) { return Number(t.doctor_id) === docId; });
        var lastMsg = thread ? shortTime(thread.last_message_at) : '';
        var snippet = thread && thread.lastMessageBody ? thread.lastMessageBody : (thread ? (thread.subject || '') : 'Tap to start chatting');
        if (thread && thread.lastMessageBody && thread.lastMessageSenderRole === 'patient') {
            snippet = 'You: ' + snippet;
        }
        var unread = thread && thread.unreadCount ? thread.unreadCount : 0;

        return [
            '<div class="wa-thread-item' + (isActive ? ' active' : '') + '" onclick="openDoctorChat(' + docId + ')" data-doctor-id="' + docId + '">',
            '  <div class="wa-thread-avatar">' + escapeHtml(threadInitials(doc.fullName)) + '</div>',
            '  <div class="wa-thread-info">',
            '    <div class="wa-thread-name">' + escapeHtml(doc.fullName || 'Doctor') + '</div>',
            '    <div class="wa-thread-snippet">' + escapeHtml(snippet) + '</div>',
            '  </div>',
            '  <div style="text-align:right; flex-shrink:0;">',
            '    <div class="wa-thread-time">' + escapeHtml(lastMsg) + '</div>',
            (unread > 0 ? '<div style="background:var(--primary-teal); color:#fff; border-radius:50%; width:20px; height:20px; font-size:11px; display:flex; align-items:center; justify-content:center; margin-left:auto; margin-top:4px;">' + unread + '</div>' : ''),
            '  </div>',
            '</div>',
        ].join('');
    }).join('');
}

function buildUnreadMessageNotifications() {
    var notifications = [];

    if (!Array.isArray(state.threads) || state.threads.length === 0) {
        state.unreadMessageNotifications = notifications;
        return notifications;
    }

    state.threads.forEach(function(thread) {
        var unread = Number(thread.unreadCount || 0);
        if (unread <= 0) return;

        var doctor = state.chatDoctors.find(function(doc) {
            return Number(doc._id || doc.id) === Number(thread.doctor_id);
        });

        notifications.push({
            type: 'doctor-message',
            threadId: Number(thread.id || thread._id),
            doctorId: Number(thread.doctor_id),
            doctorName: doctor && doctor.fullName ? doctor.fullName : 'Doctor',
            snippet: thread.lastMessageBody || 'You have a new message from your doctor.',
            unreadCount: unread,
            lastMessageAt: thread.last_message_at || null,
        });
    });

    notifications.sort(function(a, b) {
        return new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime();
    });

    state.unreadMessageNotifications = notifications;
    return notifications;
}

function updateNotificationsUI() {
    var bell = document.getElementById('notification-btn');
    var badge = document.getElementById('notification-badge');
    var panel = document.getElementById('notification-panel');
    var list = document.getElementById('notification-list');
    var notifications = buildUnreadMessageNotifications();

    var unreadTotal = notifications.reduce(function(sum, item) {
        return sum + Number(item.unreadCount || 0);
    }, 0);

    if (badge) {
        if (unreadTotal > 0) {
            badge.style.display = 'flex';
            badge.textContent = unreadTotal > 99 ? '99+' : String(unreadTotal);
        } else {
            badge.style.display = 'none';
            badge.textContent = '0';
        }
    }

    if (bell) {
        bell.classList.toggle('has-unread', unreadTotal > 0);
    }

    if (!list) return;
    if (notifications.length === 0) {
        list.innerHTML = '<div class="notification-empty">No new notifications.</div>';
        return;
    }

    list.innerHTML = notifications.map(function(item) {
        var msgLabel = item.unreadCount === 1 ? '1 unread message' : (item.unreadCount + ' unread messages');
        return [
            '<button type="button" class="notification-item" onclick="openNotificationThread(' + item.doctorId + ')">',
            '<div class="notification-item-title">' + escapeHtml(item.doctorName) + '</div>',
            '<div class="notification-item-body">' + escapeHtml(item.snippet) + '</div>',
            '<div class="notification-item-meta">' + escapeHtml(msgLabel + ' - ' + shortTime(item.lastMessageAt)) + '</div>',
            '</button>',
        ].join('');
    }).join('');

    if (panel) {
        panel.setAttribute('aria-hidden', panel.classList.contains('open') ? 'false' : 'true');
    }
}

function toggleNotificationPanel(forceOpen) {
    var panel = document.getElementById('notification-panel');
    var btn = document.getElementById('notification-btn');
    if (!panel || !btn) return;

    var shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !panel.classList.contains('open');
    panel.classList.toggle('open', shouldOpen);
    panel.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
    btn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
}

async function openNotificationThread(doctorId) {
    toggleNotificationPanel(false);
    updateNav('doctor-chat');
    await openDoctorChat(doctorId);
}

function msgTime(value) {
    if (!value) return '';
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return formatIstTime(d, { hour: '2-digit', minute: '2-digit' });
}

function msgStatusIcon(msg) {
    // Only show status on messages sent by the current user (patient)
    if (msg.sender_role !== 'patient') return '';
    if (msg.read_at) {
        return '<span class="msg-status read" title="Read">&#10003;&#10003;</span>';
    }
    if (msg.delivered_at) {
        return '<span class="msg-status delivered" title="Delivered">&#10003;&#10003;</span>';
    }
    return '<span class="msg-status sent" title="Sent">&#10003;</span>';
}

function msgDateLabel(value) {
    if (!value) return '';
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    var now = new Date();
    var dateKey = getIstDateKey(d);
    if (dateKey === getIstDateKey(now)) return 'Today';
    var yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (dateKey === getIstDateKey(yesterday)) return 'Yesterday';
    return formatIstDate(d, { weekday: 'long', month: 'short', day: 'numeric' });
}

function renderThreadMessages(messages) {
    var container = document.getElementById('thread-messages');
    if (!container) return;

    if (!Array.isArray(messages) || messages.length === 0) {
        container.innerHTML = '<div class="wa-empty">No messages in this thread yet.</div>';
        return;
    }

    var html = '';
    var lastDateLabel = '';

    messages.forEach(function(msg) {
        var ts = msg.sent_at || msg.createdAt;
        var dateLabel = msgDateLabel(ts);
        if (dateLabel && dateLabel !== lastDateLabel) {
            html += '<div class="wa-msg-date-divider"><span>' + escapeHtml(dateLabel) + '</span></div>';
            lastDateLabel = dateLabel;
        }
        var senderClass = msg.sender_role === 'patient' ? 'patient' : 'doctor';
        var statusHtml = msg.sender_role === 'patient' ? ' ' + msgStatusIcon(msg) : '';
        html += [
            '<div class="wa-msg ' + senderClass + '" data-msg-id="' + (msg.id || '') + '">',
            '<div>' + escapeHtml(msg.body || '') + '</div>',
            '<div class="wa-msg-time">' + msgTime(ts) + statusHtml + '</div>',
            '</div>',
        ].join('');
    });

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
}

function renderGoals() {
    var container = document.getElementById('goals-list');
    if (!container) return;

    if (state.goals.length === 0) {
        container.innerHTML = '<div class="empty-state">No goals yet.</div>';
        return;
    }

    container.innerHTML = state.goals.map(function(goal) {
        var status = goal.status || 'active';
        var badgeClass = status === 'completed' ? 'normal' : 'warning';
        return [
            '<div class="stack-item">',
            '<div class="stack-item-header">',
            '<div class="stack-item-title">' + escapeHtml(goal.type) + '</div>',
            '<span class="status-badge ' + badgeClass + '">' + escapeHtml(status) + '</span>',
            '</div>',
            '<div class="stack-item-meta">Target: ' + escapeHtml(goal.target_value || '--') + '</div>',
            '<div class="stack-item-actions">',
            '<button class="btn btn-outline btn-sm" onclick="markGoalCompleted(' + Number(goal.id || goal._id) + ')">Mark Completed</button>',
            '</div>',
            '</div>',
        ].join('');
    }).join('');
}

function renderBadges() {
    var container = document.getElementById('badges-list');
    if (!container) return;

    if (state.badges.length === 0) {
        container.innerHTML = '<div class="empty-state">No badges earned yet.</div>';
        return;
    }

    container.innerHTML = state.badges.map(function(badge) {
        return [
            '<div class="stack-item">',
            '<div class="stack-item-header">',
            '<div class="stack-item-title">' + escapeHtml(badge.name || badge.code || 'Badge') + '</div>',
            '<div class="stack-item-meta">Earned: ' + formatDate(badge.earned_at || badge.createdAt) + '</div>',
            '</div>',
            '<div class="stack-item-meta">Code: ' + escapeHtml(badge.code || '--') + '</div>',
            '</div>',
        ].join('');
    }).join('');
}

function renderExports() {
    var container = document.getElementById('exports-list');
    if (!container) return;

    if (state.exports.length === 0) {
        container.innerHTML = '<div class="empty-state">No exports created in this session.</div>';
        return;
    }

    container.innerHTML = state.exports.map(function(item) {
        return [
            '<div class="stack-item">',
            '<div class="stack-item-header">',
            '<div class="stack-item-title">' + escapeHtml(item.format || 'Export') + '</div>',
            '<div class="stack-item-meta">' + escapeHtml(item.status || 'ready') + '</div>',
            '</div>',
            '<div class="stack-item-meta">File: ' + escapeHtml(item.file_url || '--') + '</div>',
            '</div>',
        ].join('');
    }).join('');
}

function renderShares() {
    var container = document.getElementById('shares-list');
    if (!container) return;

    if (state.shares.length === 0) {
        container.innerHTML = '<div class="empty-state">No shares created in this session.</div>';
        return;
    }

    container.innerHTML = state.shares.map(function(item) {
        return [
            '<div class="stack-item">',
            '<div class="stack-item-header">',
            '<div class="stack-item-title">' + escapeHtml(item.target_type || 'share') + '</div>',
            '<div class="stack-item-meta">' + escapeHtml(item.target_value || '--') + '</div>',
            '</div>',
            '<div class="stack-item-meta">Token: ' + escapeHtml(item.token || '--') + '</div>',
            '<div class="stack-item-actions">',
            '<button class="btn btn-outline btn-sm" onclick="revokeShare(' + Number(item.id || item._id) + ')">Revoke</button>',
            '</div>',
            '</div>',
        ].join('');
    }).join('');
}

function renderSessions() {
    var container = document.getElementById('sessions-list');
    if (!container) return;

    if (state.sessions.length === 0) {
        container.innerHTML = '<div class="empty-state">No sessions found.</div>';
        return;
    }

    container.innerHTML = state.sessions.map(function(session) {
        return [
            '<div class="stack-item">',
            '<div class="stack-item-header">',
            '<div class="stack-item-title">Session #' + Number(session.id || session._id) + '</div>',
            '<div class="stack-item-meta">' + formatDate(session.createdAt) + '</div>',
            '</div>',
            '<div class="stack-item-meta">Revoked: ' + escapeHtml(session.revoked_at || 'No') + '</div>',
            '<div class="stack-item-actions">',
            '<button class="btn btn-outline btn-sm" onclick="revokeSession(' + Number(session.id || session._id) + ')">Revoke</button>',
            '</div>',
            '</div>',
        ].join('');
    }).join('');
}

function renderAuditLog() {
    var container = document.getElementById('audit-log-list');
    if (!container) return;

    if (state.auditLog.length === 0) {
        container.innerHTML = '<div class="empty-state">No audit entries available.</div>';
        return;
    }

    container.innerHTML = state.auditLog.slice(0, 30).map(function(item) {
        return [
            '<div class="stack-item">',
            '<div class="stack-item-header">',
            '<div class="stack-item-title">' + escapeHtml(item.action || item.event || 'Access Event') + '</div>',
            '<div class="stack-item-meta">' + formatDate(item.createdAt || item.timestamp) + '</div>',
            '</div>',
            '<div class="stack-item-meta">' + escapeHtml(item.resource || item.path || '--') + '</div>',
            '</div>',
        ].join('');
    }).join('');
}

function renderAiConversation() {
    var container = document.getElementById('ai-conversation');
    if (!container) return;

    // Hide suggestion chips once conversation starts
    var suggestionsRow = document.getElementById('ai-suggestions-row');
    if (suggestionsRow) {
        suggestionsRow.style.display = state.aiConversation.length > 0 ? 'none' : 'flex';
    }

    if (state.aiConversation.length === 0) {
        container.innerHTML = [
            '<div class="ai-welcome-state">',
            '<div class="ai-welcome-icon">',
            '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.2">',
            '<circle cx="24" cy="24" r="20" stroke-opacity="0.15"/>',
            '<path d="M24 8a12 12 0 0 0-12 12c0 4.1 2 7.7 5.2 9.9V34a3 3 0 0 0 3 3h7.6a3 3 0 0 0 3-3v-4.1C34 27.7 36 24.1 36 20a12 12 0 0 0-12-12Z" stroke-opacity="0.5"/>',
            '<circle cx="19" cy="18" r="1.5" fill="currentColor" fill-opacity="0.5"/>',
            '<circle cx="29" cy="18" r="1.5" fill="currentColor" fill-opacity="0.5"/>',
            '<path d="M16 24h16" stroke-opacity="0.3"/>',
            '</svg>',
            '</div>',
            '<h3>How can I help you today?</h3>',
            '<p>Ask me anything about diabetes care, symptoms, nutrition, medications, or safety.</p>',
            '</div>',
        ].join('');
        return;
    }

    var html = state.aiConversation.map(function(item, index) {
        var roleClass = item.role === 'assistant' ? 'doctor' : 'patient';
        // Stability fix: Only animate if it's the last message AND NOT currently typing.
        // Typing messages are updated via targeted DOM manipulation to avoid the dreaded innerHTML "flicker".
        var isLast = (index === state.aiConversation.length - 1);
        var noAnimate = (!isLast || item.typing) ? ' no-animate' : '';

        if (item.loading) {
            var loadingText = escapeHtml(item.loadingText || 'Thinking...');
            return [
                '<div class="message-bubble ' + roleClass + ' is-loading' + noAnimate + '">',
                '<div class="ai-loading-dots" aria-hidden="true"><span></span><span></span><span></span></div>',
                '<div class="message-bubble-meta">' + loadingText + '</div>',
                '</div>',
            ].join('');
        }

        // File attachments in user message
        var attachmentsHtml = '';
        if (item.attachments && item.attachments.length > 0) {
            attachmentsHtml = item.attachments.map(function(att) {
                var h = '';
                if (att.isImage && att.thumbUrl) {
                    h += '<img class="ai-msg-image-preview" src="' + att.thumbUrl + '" alt="' + escapeHtml(att.name) + '">';
                } else {
                    var icon = att.isPdf ? 'fas fa-file-pdf' : 'fas fa-file';
                    h += '<div class="ai-msg-attachment"><i class="' + icon + '"></i><span class="ai-msg-attachment-name">' + escapeHtml(att.name) + '</span><span class="ai-msg-attachment-size">' + formatFileSize(att.size) + '</span></div>';
                }
                return h;
            }).join('');
        }

        var safeText = escapeHtml(item.text || '');
        var meta = item.meta ? '<div class="message-bubble-meta">' + escapeHtml(item.meta) + '</div>' : '';
        var debugMeta = '';
        if (item.debug && item.debug.engine) {
            var engineLabel = item.debug.engine === 'llm-fallback'
                ? 'Engine: LLM Fallback (' + String(item.debug.provider || 'llm').toUpperCase() + ')'
                : 'Engine: Local AI';
            debugMeta = '<div class="message-bubble-meta debug-engine">' + escapeHtml(engineLabel) + '</div>';
        }
        var typingClass = item.typing ? ' is-typing' : '';
        var suggestions = '';
        if (item.role === 'assistant' && Array.isArray(item.suggestions) && item.suggestions.length > 0) {
            suggestions = '<div class="ai-rephrase-list">' + item.suggestions.slice(0, 3).map(function(suggestion) {
                var encoded = encodeURIComponent(String(suggestion || ''));
                return '<button class="btn btn-outline btn-sm ai-rephrase-btn" onclick="askAiSuggestion(\'' + encoded + '\')">' + escapeHtml(suggestion) + '</button>';
            }).join('') + '</div>';
        }
        // Use a span container for the AI text to allow efficient direct updates.
        return '<div class="message-bubble ' + roleClass + typingClass + noAnimate + '">' + attachmentsHtml + '<span class="bubble-txt">' + safeText + '</span>' + meta + debugMeta + suggestions + '</div>';
    }).join('');

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
}

function setAiComposerBusy(isBusy) {
    state.aiRequestPending = Boolean(isBusy);
    var input = document.getElementById('ai-question');
    var sendBtn = document.getElementById('ai-send-btn');
    if (input) input.disabled = state.aiRequestPending;
    if (sendBtn) sendBtn.disabled = state.aiRequestPending;
}

function stopAiTypingAnimation() {
    if (aiTypingTimer) {
        clearTimeout(aiTypingTimer);
        aiTypingTimer = null;
    }
}

function getAiTypingDelay(character) {
    if (!character) return AI_TYPING_BASE_DELAY_MS;
    if (/[,.;:!?]/.test(character)) return AI_TYPING_PUNCTUATION_DELAY_MS;
    if (/\s/.test(character)) return AI_TYPING_SPACE_DELAY_MS;
    return AI_TYPING_BASE_DELAY_MS;
}

function animateAssistantMessage(messageItem, finalText, done) {
    stopAiTypingAnimation();

    var fullText = String(finalText || '');
    if (!fullText) {
        messageItem.typing = false;
        messageItem.text = '';
        renderAiConversation();
        if (typeof done === 'function') done();
        return;
    }

    var reduceMotion = typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
        messageItem.typing = false;
        messageItem.text = fullText;
        renderAiConversation();
        if (typeof done === 'function') done();
        return;
    }

    messageItem.typing = true;
    messageItem.text = '';
    renderAiConversation();

    var idx = 0;

    function flushTypingFrame() {
        var conversationEl = document.getElementById('ai-conversation');
        var bubbleTextEl = null;
        if (conversationEl) {
            var bubbleTextNodes = conversationEl.querySelectorAll('.message-bubble.doctor .bubble-txt');
            if (bubbleTextNodes.length > 0) {
                bubbleTextEl = bubbleTextNodes[bubbleTextNodes.length - 1];
            }
        }

        if (bubbleTextEl) {
            bubbleTextEl.textContent = messageItem.text;
            conversationEl.scrollTop = conversationEl.scrollHeight;
        } else {
            renderAiConversation();
        }
    }

    function finishTyping() {
        messageItem.typing = false;
        messageItem.text = fullText;
        renderAiConversation();
        if (typeof done === 'function') done();
    }

    function typeNextCharacter() {
        if (idx >= fullText.length) {
            finishTyping();
            return;
        }

        idx += 1;
        messageItem.text = fullText.slice(0, idx);
        flushTypingFrame();

        var nextCharacter = fullText.charAt(idx);
        aiTypingTimer = setTimeout(typeNextCharacter, getAiTypingDelay(nextCharacter));
    }

    typeNextCharacter();
}

async function askAiAssistant() {
    var input = document.getElementById('ai-question');
    if (!input) return;
    if (state.aiRequestPending) return;

    var question = String(input.value || '').trim();
    var hasFiles = state.aiAttachedFiles.length > 0;

    if (!question && !hasFiles) {
        alert('Please enter a question or attach a file.');
        return;
    }

    // Prepare user message with attachments
    var userMsg = { role: 'patient', text: question, attachments: [] };

    // Copy attached files info for display
    var filesToProcess = state.aiAttachedFiles.slice();
    if (filesToProcess.length > 0) {
        userMsg.attachments = filesToProcess.map(function(f) {
            return {
                name: f.name,
                size: f.size,
                isImage: f.isImage,
                isPdf: f.isPdf,
                thumbUrl: f.thumbUrl || null,
            };
        });
    }

    state.aiConversation.push(userMsg);
    input.value = '';
    autoResizeAiInput();

    // Clear attached files
    state.aiAttachedFiles = [];
    renderAiFilePreview();

    var loadingEntry = {
        role: 'assistant',
        text: '',
        loading: true,
        loadingText: hasFiles ? 'Analyzing your file...' : 'Thinking...',
    };
    state.aiConversation.push(loadingEntry);
    renderAiConversation();

    setAiComposerBusy(true);

    var slowHintTimer = setTimeout(function() {
        if (loadingEntry.loading) {
            loadingEntry.loadingText = hasFiles
                ? 'Still analyzing. Processing document content...'
                : 'Still thinking. Preparing the best answer...';
            renderAiConversation();
        }
    }, 12000);

    var result;
    try {
        if (hasFiles) {
            // Process files: extract text and ask about them
            var extractedTexts = [];
            for (var i = 0; i < filesToProcess.length; i++) {
                var f = filesToProcess[i];
                try {
                    var base64 = await fileToBase64(f.file);
                    var extractResult = await API.post('/api/patient/ai/extract-document', {
                        fileName: f.name,
                        fileType: f.type,
                        base64Content: base64,
                    }, {
                        timeoutMs: 45000,
                    });
                    if (extractResult.ok && extractResult.data && extractResult.data.result) {
                        var docText = extractResult.data.result.summary || extractResult.data.result.extractedText || JSON.stringify(extractResult.data.result);
                        extractedTexts.push('--- File: ' + f.name + ' ---\n' + docText);
                    } else {
                        extractedTexts.push('--- File: ' + f.name + ' --- (Could not extract content)');
                    }
                } catch (err) {
                    extractedTexts.push('--- File: ' + f.name + ' --- (Error reading file)');
                }
            }

            var contextQuestion = question || 'Please analyze the attached document(s) and provide relevant health insights.';
            var fullQuestion = contextQuestion + '\n\n[Attached Document Content]:\n' + extractedTexts.join('\n\n');

            result = await API.post('/api/patient/ai/ask', { question: fullQuestion }, { timeoutMs: 30000 });
        } else {
            result = await API.post('/api/patient/ai/ask', { question: question }, { timeoutMs: 30000 });
        }
    } catch (e) {
        result = { ok: false, data: { error: (e && e.message) || 'AI request failed. Please try again.' } };
    }

    clearTimeout(slowHintTimer);
    loadingEntry.loading = false;

    if (!result.ok) {
        loadingEntry.text = (result.data && result.data.error) || 'AI request failed. Please try again.';
        loadingEntry.meta = null;
        loadingEntry.typing = false;
        renderAiConversation();
        setAiComposerBusy(false);
        return;
    }

    var confidence = result.data && typeof result.data.confidence === 'number'
        ? 'Confidence: ' + Math.round(result.data.confidence * 100) + '%'
        : null;

    loadingEntry.meta = confidence;
    loadingEntry.debug = result.data && result.data.debug ? result.data.debug : null;
    loadingEntry.suggestions = result.data && Array.isArray(result.data.suggestions) ? result.data.suggestions : null;

    var finalAnswer = result.data && result.data.answer ? result.data.answer : 'No answer available.';
    animateAssistantMessage(loadingEntry, finalAnswer, function() {
        if (result.data && result.data.disclaimer) {
            state.aiConversation.push({ role: 'assistant', text: result.data.disclaimer });
            renderAiConversation();
        }
        setAiComposerBusy(false);
    });
}

function askAiPreset(question) {
    var input = document.getElementById('ai-question');
    if (!input) return;
    input.value = String(question || '');
    askAiAssistant();
}

function askAiSuggestion(encodedQuestion) {
    var decoded = '';
    try {
        decoded = decodeURIComponent(String(encodedQuestion || ''));
    } catch {
        decoded = String(encodedQuestion || '');
    }
    if (!decoded.trim()) return;
    askAiPreset(decoded);
}

function openAiAssistantPanel() {
    updateNav('ai-assistant');
    document.body.classList.add('ai-panel-open');
    var input = document.getElementById('ai-question');
    if (!input) return;
    setTimeout(function() {
        input.focus();
    }, 120);
}

function closeAiAssistantPanel() {
    document.body.classList.remove('ai-panel-open');
}

function autoResizeAiInput() {
    var textarea = document.getElementById('ai-question');
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

function initAiAssistantPanel() {
    var overlay = document.getElementById('ai-panel-overlay');
    if (overlay) {
        overlay.addEventListener('click', function() {
            closeAiAssistantPanel();
        });
    }

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && document.body.classList.contains('ai-panel-open')) {
            closeAiAssistantPanel();
        }
    });

    // Auto-resize textarea on input
    var aiInput = document.getElementById('ai-question');
    if (aiInput) {
        aiInput.addEventListener('input', autoResizeAiInput);
        aiInput.addEventListener('keydown', function(event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                askAiAssistant();
            }
        });
    }

    // Support drag-and-drop on the chat area
    var chatBody = document.querySelector('.ai-chat-body');
    if (chatBody) {
        chatBody.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.stopPropagation();
            chatBody.style.outline = '2px dashed rgba(107, 216, 203, 0.4)';
            chatBody.style.outlineOffset = '-8px';
        });
        chatBody.addEventListener('dragleave', function(e) {
            e.preventDefault();
            chatBody.style.outline = 'none';
        });
        chatBody.addEventListener('drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
            chatBody.style.outline = 'none';
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleAiFileSelect({ target: { files: e.dataTransfer.files } });
            }
        });
    }
}

async function openDoctorChat(doctorId) {
    doctorId = Number(doctorId);
    state.selectedDoctorId = doctorId;

    // Find the doctor info
    var doc = state.chatDoctors.find(function(d) { return Number(d._id || d.id) === doctorId; });
    var headerName = document.getElementById('wa-chat-header-name');
    var headerStatus = document.getElementById('wa-chat-header-status');
    var headerAvatar = document.getElementById('wa-chat-avatar');
    if (headerName) headerName.textContent = doc ? doc.fullName : 'Doctor';
    if (headerStatus) headerStatus.textContent = doc ? (doc.specialization || 'Doctor') : '';
    if (headerAvatar) headerAvatar.textContent = doc ? threadInitials(doc.fullName) : 'DR';

    renderMessageThreads();

    // Find existing thread with this doctor
    var thread = state.threads.find(function(t) { return Number(t.doctor_id) === doctorId; });

    if (thread) {
        state.selectedThreadId = Number(thread.id || thread._id);
        var result = await API.get('/api/patient/messages/threads/' + state.selectedThreadId);
        if (result.ok) {
            renderThreadMessages(result.data.messages || []);
            await loadMessages();
        } else {
            renderThreadMessages([]);
        }
    } else {
        // No thread yet — show empty, thread will be created on first message
        state.selectedThreadId = null;
        renderThreadMessages([]);
    }
}

async function sendThreadReply() {
    if (!state.selectedDoctorId) {
        alert('Select a doctor first.');
        return;
    }

    var inputEl = document.getElementById('thread-reply-body');
    var body = (inputEl.value || '').trim();
    if (!body) return;

    // If no thread yet, create one with the first message
    if (!state.selectedThreadId) {
        var doc = state.chatDoctors.find(function(d) { return Number(d._id || d.id) === state.selectedDoctorId; });
        var subject = 'Chat with ' + (doc ? doc.fullName : 'Doctor');
        var createResult = await API.post('/api/patient/messages/threads', {
            doctorId: state.selectedDoctorId,
            subject: subject,
            body: body,
        });
        if (!createResult.ok) {
            alert((createResult.data && createResult.data.error) || 'Failed to send message.');
            return;
        }
        inputEl.value = '';
        await loadMessages();
        // Select the newly created thread
        var newThread = state.threads.find(function(t) { return Number(t.doctor_id) === state.selectedDoctorId; });
        if (newThread) {
            state.selectedThreadId = Number(newThread.id || newThread._id);
        }
        await openDoctorChat(state.selectedDoctorId);
        return;
    }

    var result = await API.post('/api/patient/messages/threads/' + state.selectedThreadId, { body: body });
    if (!result.ok) {
        alert((result.data && result.data.error) || 'Failed to send message.');
        return;
    }

    inputEl.value = '';

    // Append the new message to the UI immediately for snappy feel
    var container = document.getElementById('thread-messages');
    if (container && result.data) {
        var emptyEl = container.querySelector('.wa-empty');
        if (emptyEl) emptyEl.remove();

        var msgDiv = document.createElement('div');
        msgDiv.className = 'wa-msg patient';
        msgDiv.setAttribute('data-msg-id', result.data.id || '');
        var sentIcon = '<span class="msg-status sent" title="Sent">&#10003;</span>';
        msgDiv.innerHTML = '<div>' + escapeHtml(result.data.body || body) + '</div><div class="wa-msg-time">' + msgTime(result.data.sent_at || new Date().toISOString()) + ' ' + sentIcon + '</div>';
        container.appendChild(msgDiv);
        container.scrollTop = container.scrollHeight;
    }

    // Update thread list
    await loadMessages();
}

async function saveSafetyProfile() {
    var result = await API.patch('/api/patient/safety/profile', {
        emergencyContactName: document.getElementById('safety-contact-name').value || null,
        emergencyContactPhone: document.getElementById('safety-contact-phone').value || null,
        severeLowThreshold: Number(document.getElementById('safety-low-threshold').value || 60),
        autoNotifyEnabled: boolFromSelectValue(document.getElementById('safety-auto-notify').value),
    });

    if (!result.ok) {
        alert((result.data && result.data.error) || 'Failed to update safety profile.');
        return;
    }

    alert('Safety profile updated.');
}

async function triggerSafetyEvent() {
    var eventType = document.getElementById('safety-event-type').value;
    var severity = document.getElementById('safety-event-severity').value;

    var result = await API.post('/api/patient/safety/trigger', {
        eventType: eventType,
        severity: severity,
        details: { source: 'patient-dashboard-manual-trigger' },
    });

    var info = document.getElementById('safety-event-result');
    if (!result.ok) {
        if (info) info.textContent = (result.data && result.data.error) || 'Failed to trigger event.';
        return;
    }
    if (info) info.textContent = 'Safety event logged successfully at ' + formatDate(result.data.triggered_at || result.data.createdAt);
}

async function createGoal() {
    var type = document.getElementById('goal-type').value;
    var targetValue = Number(document.getElementById('goal-target').value || 0);
    if (!type || targetValue <= 0) {
        alert('Goal type and positive target are required.');
        return;
    }

    var result = await API.post('/api/patient/gamification/goals', {
        type: type,
        targetValue: targetValue,
        period: 'daily',
        status: 'active',
    });

    if (!result.ok) {
        alert((result.data && result.data.error) || 'Failed to create goal.');
        return;
    }

    document.getElementById('goal-target').value = '';
    await loadGamification();
}

async function markGoalCompleted(goalId) {
    var result = await API.patch('/api/patient/gamification/goals/' + Number(goalId), { status: 'completed' });
    if (!result.ok) {
        alert((result.data && result.data.error) || 'Failed to update goal.');
        return;
    }
    await loadGamification();
}

async function createExport() {
    var format = document.getElementById('export-format').value;
    var scope = document.getElementById('export-scope').value;

    var result = await API.post('/api/patient/exports', { format: format, scope: { preset: scope } });
    if (!result.ok) {
        alert((result.data && result.data.error) || 'Failed to create export.');
        return;
    }

    state.exports.unshift(result.data);
    renderExports();
}

async function createShare() {
    var targetType = document.getElementById('share-target-type').value;
    var targetValue = (document.getElementById('share-target-value').value || '').trim();
    if (!targetValue) {
        alert('Target value is required.');
        return;
    }

    var result = await API.post('/api/patient/shares', {
        targetType: targetType,
        targetValue: targetValue,
        scope: { preset: 'summary' },
    });

    if (!result.ok) {
        alert((result.data && result.data.error) || 'Failed to create share.');
        return;
    }

    state.shares.unshift(result.data);
    renderShares();
}

async function revokeShare(shareId) {
    var result = await API.patch('/api/patient/shares/' + Number(shareId) + '/revoke', {});
    if (!result.ok) {
        alert((result.data && result.data.error) || 'Failed to revoke share.');
        return;
    }

    state.shares = state.shares.filter(function(item) { return Number(item.id || item._id) !== Number(shareId); });
    renderShares();
}

async function savePrivacySettings() {
    var result = await API.patch('/api/patient/privacy/settings', {
        shareWithDoctor: boolFromSelectValue(document.getElementById('privacy-share-doctor').value),
        shareWithCaregiver: boolFromSelectValue(document.getElementById('privacy-share-caregiver').value),
        researchOptIn: boolFromSelectValue(document.getElementById('privacy-research').value),
        marketingOptIn: boolFromSelectValue(document.getElementById('privacy-marketing').value),
    });

    if (!result.ok) {
        alert((result.data && result.data.error) || 'Failed to save privacy settings.');
        return;
    }

    alert('Privacy settings saved.');
}

async function revokeSession(sessionId) {
    var result = await API.delete('/api/patient/security/sessions/' + Number(sessionId));
    if (!result.ok) {
        alert((result.data && result.data.error) || 'Failed to revoke session.');
        return;
    }
    await loadPrivacyAndSecurity();
}

function filterReports() {
    var search = (document.getElementById('report-search').value || '').toLowerCase();
    var type = (document.getElementById('report-type-filter').value || '').toLowerCase();
    var rows = document.querySelectorAll('#reports-table-body tr');

    rows.forEach(function(row) {
        var text = row.textContent.toLowerCase();
        var rowTypeCell = row.querySelector('td:nth-child(2)');
        var rowType = rowTypeCell ? rowTypeCell.textContent.toLowerCase() : '';

        var matchesSearch = text.indexOf(search) >= 0;
        var matchesType = !type || rowType.indexOf(type) >= 0;
        row.style.display = matchesSearch && matchesType ? '' : 'none';
    });
}

function filterRecords() {
    var search = (document.getElementById('record-search').value || '').toLowerCase();
    var type = (document.getElementById('record-type-filter').value || '').toLowerCase();
    var records = document.querySelectorAll('#records-list .record-card');

    records.forEach(function(record) {
        var text = record.textContent.toLowerCase();
        var typeEl = record.querySelector('.record-type');
        var rowType = typeEl ? typeEl.textContent.toLowerCase() : '';
        var matchesSearch = text.indexOf(search) >= 0;
        var matchesType = !type || rowType.indexOf(type) >= 0;
        record.style.display = matchesSearch && matchesType ? '' : 'none';
    });
}

async function submitDietIntake(e) {
    e.preventDefault();

    var mealSlot = String((document.getElementById('diet-meal-slot').value || 'breakfast')).toLowerCase();
    var intakeText = String(document.getElementById('diet-intake-text').value || '').trim();
    var loggedAtRaw = document.getElementById('diet-logged-at').value || '';
    var bloodSugarMgDl = toNumberOrNull(document.getElementById('diet-blood-sugar').value);
    var sugarTiming = String(document.getElementById('diet-sugar-timing').value || '').toLowerCase();
    var carbsG = toNumberOrNull(document.getElementById('diet-carbs').value);
    var calories = toNumberOrNull(document.getElementById('diet-calories').value);
    var note = String(document.getElementById('diet-note').value || '').trim();

    if (!intakeText) {
        setDietIntakeResult('Please describe what you ate.', 'error');
        return;
    }

    if (intakeText.length > 600) {
        setDietIntakeResult('Intake details are too long (max 600 characters).', 'error');
        return;
    }

    if (bloodSugarMgDl !== null && !inRange(bloodSugarMgDl, 40, 700)) {
        setDietIntakeResult('Blood sugar should be between 40 and 700 mg/dL.', 'error');
        return;
    }

    if (carbsG !== null && !inRange(carbsG, 0, 1200)) {
        setDietIntakeResult('Carbs should be between 0 and 1200 grams.', 'error');
        return;
    }

    if (calories !== null && !inRange(calories, 0, 10000)) {
        setDietIntakeResult('Calories should be between 0 and 10000.', 'error');
        return;
    }

    var payload = {
        mealSlot: mealSlot,
        intakeText: intakeText,
        bloodSugarMgDl: bloodSugarMgDl,
        sugarTiming: sugarTiming || null,
        carbsG: carbsG,
        calories: calories,
        note: note || null,
    };

    if (loggedAtRaw) {
        var loggedDate = new Date(loggedAtRaw);
        if (!Number.isNaN(loggedDate.getTime())) {
            payload.loggedAt = loggedDate.toISOString();
        }
    }

    setDietIntakeSubmitLoading(true);
    setDietIntakeResult('Saving intake...', 'neutral');

    try {
        var result = await API.post('/api/patient/diet/intake', payload);
        if (!result.ok) {
            setDietIntakeResult((result.data && result.data.error) || 'Failed to save intake.', 'error');
            return;
        }

        setDietIntakeResult('Intake saved. AI diet report has been refreshed.', 'success');
        await loadNutrition();
    } catch (_err) {
        setDietIntakeResult('Network error while saving intake.', 'error');
    } finally {
        setDietIntakeSubmitLoading(false);
    }
}

async function askAiDietReport() {
    var report = state.dietReport;
    if (!report) {
        var reportRes = await API.get('/api/patient/diet/report?range=30d');
        if (reportRes.ok && reportRes.data) {
            report = reportRes.data;
            state.dietReport = report;
            renderDietReport(report);
        }
    }

    var prompt = 'Give me my personalized diet report based on my meal intake logs and blood sugar values. Tell me clearly what foods I should avoid and what safer alternatives I should use.';
    if (report && report.summary && Number(report.summary.entryCount || 0) > 0) {
        var high = Number(report.summary.highSugarEvents || 0);
        var avgSugar = report.summary.averageSugar;
        prompt += ' I have logged ' + Number(report.summary.entryCount || 0) + ' meals recently';
        if (avgSugar !== null && avgSugar !== undefined) {
            prompt += ', with average sugar around ' + avgSugar + ' mg/dL';
        }
        prompt += high > 0 ? ', and I had ' + high + ' high sugar events.' : ', and no major high sugar events.';
    }

    var input = document.getElementById('ai-question');
    if (!input) return;
    input.value = prompt;
    updateNav('ai-assistant');
    openAiAssistantPanel();
    await askAiAssistant();
}

function saveDiet(e) {
    e.preventDefault();
    alert('Dietary preferences saved locally. Clinical meal plans are provided by your care team.');
    closeModal('diet-modal');
}

function scheduleWithDoctor(doctorId) {
    var select = document.getElementById('appointment-doctor');
    if (select && doctorId) {
        select.value = String(Number(doctorId));
    }
    openModal('appointment-modal');
}

async function saveProfile(e) {
    e.preventDefault();

    var firstName = (document.getElementById('first-name').value || '').trim();
    var lastName = (document.getElementById('last-name').value || '').trim();
    var phone = (document.getElementById('phone').value || '').trim();
    var dob = document.getElementById('dob').value || null;
    var emergencyName = (document.getElementById('emergency-name').value || '').trim();
    var emergencyPhone = (document.getElementById('emergency-phone').value || '').trim();

    var fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    if (!fullName) {
        alert('Please enter a first and/or last name.');
        return;
    }

    try {
        var result = await API.put('/api/patient/profile', {
            fullName: fullName,
            phone: phone || null,
            dateOfBirth: dob,
            emergencyContact: {
                name: emergencyName || null,
                phone: emergencyPhone || null,
            },
        });

        if (!result.ok) {
            alert((result.data && result.data.error) || 'Failed to update profile.');
            return;
        }

        sessionStorage.setItem('user', JSON.stringify(result.data));
        state.currentUser = result.data;
        populateProfileView(result.data);
        populateProfileModal(result.data);
        alert('Profile updated successfully.');
        closeModal('profile-modal');
    } catch (err) {
        alert('Network error while updating profile.');
    }
}

async function bookAppointment(e) {
    e.preventDefault();

    var doctor = Number(document.getElementById('appointment-doctor').value);
    var date = document.getElementById('appointment-date').value;
    var time = document.getElementById('appointment-time').value;
    var reason = (document.getElementById('appointment-reason').value || '').trim();

    if (!doctor || !date || !time) {
        alert('Doctor, date, and time are required.');
        return;
    }

    try {
        var result = await API.post('/api/patient/appointments', {
            doctor: doctor,
            date: date,
            time: time,
            reason: reason || null,
        });

        if (!result.ok) {
            alert((result.data && result.data.error) || 'Failed to book appointment.');
            return;
        }

        alert('Appointment booked successfully.');
        closeModal('appointment-modal');
        await loadAppointments();
    } catch (err) {
        alert('Network error while booking appointment.');
    }
}

async function addReport(e) {
    e.preventDefault();

    if (state.reportSubmitPending) {
        return;
    }

    var reportName = (document.getElementById('report-name').value || '').trim();
    var reportTypeKey = document.getElementById('report-type').value || 'lab';
    var reportType = reportTypeMap[reportTypeKey] || 'Lab Report';
    var date = document.getElementById('report-date').value || getIstTodayInputValue();
    var reportFileInput = document.getElementById('report-file');
    var reportFile = reportFileInput && reportFileInput.files && reportFileInput.files[0] ? reportFileInput.files[0] : null;
    var hasReportFile = Boolean(reportFile);

    if (!reportName) {
        alert('Report name is required.');
        return;
    }

    state.reportSubmitPending = true;
    setReportSubmitLoading(true);
    setReportUploadStage('prepare', hasReportFile ? 'Preparing file for upload...' : 'Preparing report details...');
    try {
        var parsedResult = null;
        var reportFileDataUrl = null;
        var extractionInputDataUrl = null;
        var nameVerification = null;
        var allowAutoImport = true;
        var extractionSkipped = false;
        var skippedProgressSteps = hasReportFile ? [] : ['extract', 'import'];
        if (reportFile) {
            try {
                var filePayload = await prepareReportFilePayload(reportFile);
                extractionInputDataUrl = filePayload.extractionDataUrl;
                reportFileDataUrl = filePayload.storageDataUrl;

                setReportUploadStage(
                    'extract',
                    filePayload.optimized
                        ? 'Extracting text from optimized image...'
                        : 'Extracting text from report...'
                );
                var extracted = await API.post('/api/patient/ai/extract-document', {
                    fileName: reportFile.name,
                    fileType: reportFile.type || null,
                    base64Content: extractionInputDataUrl,
                }, {
                    timeoutMs: 45000,
                });

                if (!extracted.ok) {
                    var extractionError = (extracted.data && extracted.data.error) || 'Failed to analyze report file.';
                    var proceedWithoutExtraction = confirm(
                        extractionError + '\n\n'
                        + 'Press OK to upload the report without AI extraction and auto-import.\n'
                        + 'Press Cancel to try again.'
                    );
                    if (!proceedWithoutExtraction) {
                        return;
                    }
                    parsedResult = null;
                    nameVerification = null;
                    allowAutoImport = false;
                    extractionSkipped = true;
                    if (skippedProgressSteps.indexOf('import') === -1) skippedProgressSteps.push('import');
                    setReportUploadStage('save', 'Saving report without AI extraction...', { skippedSteps: ['import'] });
                } else {
                    parsedResult = extracted.data && extracted.data.result ? extracted.data.result : null;
                    nameVerification = extracted.data && extracted.data.nameVerification
                        ? extracted.data.nameVerification
                        : (parsedResult && parsedResult.nameVerification ? parsedResult.nameVerification : null);

                    if (parsedResult && nameVerification) {
                        parsedResult.nameVerification = nameVerification;
                    }

                    if (nameVerification && nameVerification.isMatch === false) {
                        var reportPatientName = nameVerification.reportPatientName || (parsedResult && parsedResult.extracted ? parsedResult.extracted.patientName : '--');
                        var profileName = nameVerification.profileName || ((API.getUser() && API.getUser().fullName) || '--');
                        var proceed = confirm(
                            'Patient name mismatch detected.\n\n'
                            + 'Report name: ' + reportPatientName + '\n'
                            + 'Profile name: ' + profileName + '\n\n'
                            + 'Press OK to upload the report WITHOUT auto-importing values to Overview.\n'
                            + 'Press Cancel to stop and check the file.'
                        );
                        if (!proceed) {
                            return;
                        }
                        allowAutoImport = false;
                        if (skippedProgressSteps.indexOf('import') === -1) skippedProgressSteps.push('import');
                    }
                }
            } catch (err) {
                if (!extractionInputDataUrl) {
                    setReportUploadStage('prepare', 'Could not read selected file.', { failed: true });
                    alert('Failed to read uploaded file.');
                    return;
                }

                var unexpectedExtractionError = (err && err.message) || 'Failed to analyze report file.';
                var continueWithoutExtraction = confirm(
                    unexpectedExtractionError + '\n\n'
                    + 'Press OK to upload the report without AI extraction and auto-import.\n'
                    + 'Press Cancel to try again.'
                );
                if (!continueWithoutExtraction) {
                    return;
                }
                parsedResult = null;
                nameVerification = null;
                allowAutoImport = false;
                extractionSkipped = true;
                if (skippedProgressSteps.indexOf('import') === -1) skippedProgressSteps.push('import');
                setReportUploadStage('save', 'Saving report without AI extraction...', { skippedSteps: ['import'] });
            }
        }

        var reportStatus = 'Pending';
        if (parsedResult && parsedResult.review && parsedResult.review.label) {
            if (parsedResult.review.level === 'bad' || parsedResult.review.level === 'caution') {
                reportStatus = 'Needs Attention';
            } else {
                reportStatus = 'Reviewed - Not Bad';
            }
        } else if (parsedResult) {
            reportStatus = 'Analyzed';
        }
        if (nameVerification && nameVerification.isMatch === false) {
            reportStatus = 'Name Mismatch - Review';
        }

        setReportUploadStage('save', 'Saving report record...', { skippedSteps: skippedProgressSteps });
        var result = await API.post('/api/patient/reports/upload', {
            reportName: reportName,
            type: reportType,
            date: date,
            status: reportStatus,
            fileUrl: reportFileDataUrl,
            fileType: reportFile ? (reportFile.type || null) : null,
            parsed: parsedResult,
        }, {
            timeoutMs: 30000,
        });

        if (!result.ok) {
            if (result.data && result.data.code === 'duplicate_report') {
                setReportUploadStage('save', 'Duplicate report found. Existing report is already saved.', {
                    failed: true,
                });
                alert('This report was already added a moment ago.');
                closeModal('report-modal');
                document.getElementById('report-form').reset();
                await Promise.all([loadReports(), loadOverview(), loadTrends()]);
                return;
            }
            setReportUploadStage('save', (result.data && result.data.error) || 'Failed to save report.', {
                failed: true,
            });
            alert((result.data && result.data.error) || 'Failed to add report.');
            return;
        }

        var createdReport = result.data || null;
        if (parsedResult && createdReport) {
            renderLatestReportInsight({ report: createdReport, parsed: parsedResult });
        }

        if (allowAutoImport && parsedResult && parsedResult.extracted) {
            skippedProgressSteps = skippedProgressSteps.filter(function(step) { return step !== 'import'; });
            setReportUploadStage('import', 'Importing extracted values to Overview...');
            var extractedValues = parsedResult.extracted;
            var healthPayload = { recordedAt: date };
            var hba1c = toNumberOrNull(extractedValues.hba1c);
            if (inRange(hba1c, 2, 20)) healthPayload.hba1c = hba1c;
            var weightKg = toNumberOrNull(extractedValues.weightKg);
            if (inRange(weightKg, 1, 700)) healthPayload.weight = weightKg;

            if (Array.isArray(extractedValues.bloodPressure) && extractedValues.bloodPressure.length > 0) {
                var bp = extractedValues.bloodPressure[0] || {};
                var systolic = null;
                var diastolic = null;

                if (typeof bp === 'string') {
                    var bpMatch = bp.match(/(\d{2,3})\s*[\/-]\s*(\d{2,3})/);
                    if (bpMatch) {
                        systolic = toNumberOrNull(bpMatch[1]);
                        diastolic = toNumberOrNull(bpMatch[2]);
                    }
                } else {
                    systolic = toNumberOrNull(bp.systolic);
                    diastolic = toNumberOrNull(bp.diastolic);
                }

                if (inRange(systolic, 40, 300)) healthPayload.systolic = systolic;
                if (inRange(diastolic, 20, 200)) healthPayload.diastolic = diastolic;
            }

            var ingestionTasks = [];
            if (healthPayload.hba1c !== undefined || healthPayload.systolic !== undefined || healthPayload.diastolic !== undefined || healthPayload.weight !== undefined) {
                ingestionTasks.push(API.post('/api/patient/health-metrics', healthPayload, { timeoutMs: 15000 }));
            }

            var glucoseValues = Array.isArray(extractedValues.glucoseReadingsMgDl) ? extractedValues.glucoseReadingsMgDl : [];
            glucoseValues.slice(0, 8).forEach(function(value, index) {
                var glucose = toNumberOrNull(value);
                if (!inRange(glucose, 1, 900)) return;
                ingestionTasks.push(API.post('/api/patient/glucose', {
                    value: glucose,
                    type: index === 0 ? 'fasting' : 'random',
                    notes: 'Imported from AI report upload',
                    recordedAt: date,
                }, { timeoutMs: 15000 }));
            });

            if (ingestionTasks.length > 0) {
                await Promise.allSettled(ingestionTasks);
            } else {
                if (skippedProgressSteps.indexOf('import') === -1) skippedProgressSteps.push('import');
                setReportUploadStage('import', 'No importable metric values were found.', {
                    skippedSteps: ['import'],
                });
            }
        }

        setReportUploadStage('import', 'Upload complete.', {
            completed: true,
            skippedSteps: skippedProgressSteps,
        });

        if (parsedResult && !allowAutoImport) {
            alert('Report uploaded. Auto-import to Overview was skipped because patient name did not match your profile.');
        } else if (extractionSkipped) {
            alert('Report uploaded without AI extraction. You can still view it in Reports.');
        } else {
            alert(parsedResult ? 'Report uploaded, analyzed, review generated, and charts updated.' : 'Report added successfully.');
        }
        closeModal('report-modal');
        document.getElementById('report-form').reset();
        await Promise.all([loadReports(), loadOverview(), loadTrends()]);
    } catch (err) {
        setReportUploadStage('save', 'Upload failed. Please try again.', { failed: true });
        alert('Network error while adding report.');
    } finally {
        state.reportSubmitPending = false;
        setReportSubmitLoading(false);
    }
}

async function deleteReport(id) {
    if (!confirm('Delete this report?')) return;
    try {
        var result = await API.request('/api/patient/reports/' + Number(id), { method: 'DELETE' });
        if (!result.ok) {
            alert((result.data && result.data.error) || 'Failed to delete report.');
            return;
        }
        await Promise.all([loadReports(), loadOverview(), loadTrends()]);
    } catch (err) {
        alert('Network error while deleting report.');
    }
}

async function addRecord(e) {
    e.preventDefault();

    var typeKey = document.getElementById('record-type').value || 'diagnosis';
    var type = recordTypeMap[typeKey] || 'Other';
    var date = document.getElementById('record-date').value || getIstTodayInputValue();
    var title = (document.getElementById('record-title').value || '').trim();
    var description = (document.getElementById('record-description').value || '').trim();

    if (!title) {
        alert('Record title is required.');
        return;
    }

    try {
        var result = await API.post('/api/patient/records', {
            title: title,
            type: type,
            date: date,
            description: description || null,
        });

        if (!result.ok) {
            alert((result.data && result.data.error) || 'Failed to add record.');
            return;
        }

        alert('Medical record added successfully.');
        closeModal('record-modal');
        document.getElementById('record-form').reset();
        await loadRecords();
    } catch (err) {
        alert('Network error while adding record.');
    }
}

async function submitManualData(e) {
    e.preventDefault();

    var recordedAtInput = document.getElementById('manual-recorded-at');
    var recordedAt = recordedAtInput && recordedAtInput.value ? recordedAtInput.value : getIstTodayInputValue();
    var notes = (document.getElementById('manual-notes').value || '').trim();

    var fasting = toNumberOrNull(document.getElementById('manual-fasting').value);
    var postprandial = toNumberOrNull(document.getElementById('manual-postprandial').value);
    var random = toNumberOrNull(document.getElementById('manual-random').value);
    var weight = toNumberOrNull(document.getElementById('manual-weight').value);
    var systolic = toNumberOrNull(document.getElementById('manual-systolic').value);
    var diastolic = toNumberOrNull(document.getElementById('manual-diastolic').value);
    var hba1c = toNumberOrNull(document.getElementById('manual-hba1c').value);

    var errors = [];
    if (fasting !== null && !inRange(fasting, 1, 900)) errors.push('Fasting glucose must be between 1 and 900 mg/dL.');
    if (postprandial !== null && !inRange(postprandial, 1, 900)) errors.push('Postprandial glucose must be between 1 and 900 mg/dL.');
    if (random !== null && !inRange(random, 1, 900)) errors.push('Random glucose must be between 1 and 900 mg/dL.');
    if (weight !== null && !inRange(weight, 1, 700)) errors.push('Weight must be between 1 and 700 kg.');
    if (systolic !== null && !inRange(systolic, 40, 300)) errors.push('Systolic BP must be between 40 and 300.');
    if (diastolic !== null && !inRange(diastolic, 20, 200)) errors.push('Diastolic BP must be between 20 and 200.');
    if (hba1c !== null && !inRange(hba1c, 2, 20)) errors.push('HbA1c must be between 2 and 20%.');

    if (errors.length > 0) {
        setManualDataResult(errors[0], 'error');
        return;
    }

    var hasGlucose = fasting !== null || postprandial !== null || random !== null;
    var hasMetric = weight !== null || systolic !== null || diastolic !== null || hba1c !== null;

    if (!hasGlucose && !hasMetric) {
        setManualDataResult('Enter at least one value to save.', 'error');
        return;
    }

    var tasks = [];
    function queueGlucose(value, type) {
        if (value === null) return;
        tasks.push(API.post('/api/patient/glucose', {
            value: value,
            type: type,
            notes: notes || null,
            recordedAt: recordedAt,
        }));
    }

    queueGlucose(fasting, 'fasting');
    queueGlucose(postprandial, 'postprandial');
    queueGlucose(random, 'random');

    if (hasMetric) {
        var metricPayload = { recordedAt: recordedAt };
        if (weight !== null) metricPayload.weight = weight;
        if (systolic !== null) metricPayload.systolic = systolic;
        if (diastolic !== null) metricPayload.diastolic = diastolic;
        if (hba1c !== null) metricPayload.hba1c = hba1c;
        tasks.push(API.post('/api/patient/health-metrics', metricPayload));
    }

    setManualDataSubmitLoading(true);
    setManualDataResult('Saving data...', 'neutral');

    try {
        var responses = await Promise.all(tasks);
        var failed = responses.filter(function(item) { return !item || !item.ok; });

        if (failed.length > 0) {
            var firstError = failed[0] && failed[0].data && failed[0].data.error
                ? failed[0].data.error
                : 'Failed to save one or more values.';
            setManualDataResult(firstError, 'error');
            return;
        }

        setManualDataResult('Saved successfully. Overview cards and trends are updated.', 'success');
        await Promise.all([loadOverview(), loadTrends()]);
    } catch (err) {
        setManualDataResult('Network error while saving manual data.', 'error');
    } finally {
        setManualDataSubmitLoading(false);
    }
}

async function loadProfile() {
    var result = await API.get('/api/patient/profile');
    if (!result.ok) return;
    sessionStorage.setItem('user', JSON.stringify(result.data));
    state.currentUser = result.data;
    populateProfileView(result.data);
    populateProfileModal(result.data);
}

async function loadDoctors() {
    var result = await API.get('/api/patient/doctors');
    state.doctors = result.ok && Array.isArray(result.data) ? result.data : [];
    renderDoctors();
}

async function loadAppointments() {
    var result = await API.get('/api/patient/appointments');
    state.appointments = result.ok && Array.isArray(result.data) ? result.data : [];
    renderAppointments();
}

async function loadReports() {
    var result = await API.get('/api/patient/reports');
    state.reports = result.ok && Array.isArray(result.data) ? result.data : [];
    renderReports();
    filterReports();
    updateLatestReportInsightFromState();
    await loadReportExtractionMetrics();
}

async function loadReportExtractionMetrics() {
    var result = await API.get('/api/patient/reports/extraction-metrics?range=30d');
    state.reportMetrics = result.ok && result.data ? result.data : null;
    renderReportExtractionMetrics();
}

async function loadRecords() {
    var result = await API.get('/api/patient/records');
    state.records = result.ok && Array.isArray(result.data) ? result.data : [];
    renderRecords();
    filterRecords();
}

async function loadOverview() {
    var dashboardRes = await API.get('/api/patient/dashboard');
    var glucoseRes = await API.get('/api/patient/glucose?days=30');
    var metricsRes = await API.get('/api/patient/health-metrics?days=30');
    var scoreRes = await API.get('/api/patient/score/today');

    var dashboard = dashboardRes.ok ? dashboardRes.data : {};
    var glucose = glucoseRes.ok && Array.isArray(glucoseRes.data) ? glucoseRes.data : [];
    var metrics = metricsRes.ok && Array.isArray(metricsRes.data) ? metricsRes.data : [];
    var score = scoreRes.ok ? scoreRes.data : null;

    updateOverviewSummary(dashboard);
    updateOverviewMetrics(glucose, metrics, score);
    updateOverviewCharts(glucose, metrics);
}

async function loadNutrition() {
    var intakeRes = await API.get('/api/patient/diet/intake?range=7d');
    var reportRes = await API.get('/api/patient/diet/report?range=7d');
    var activityRes = await API.get('/api/patient/activities?range=7d');

    var intakes = intakeRes.ok && Array.isArray(intakeRes.data) ? intakeRes.data : [];
    var activities = activityRes.ok && Array.isArray(activityRes.data) ? activityRes.data : [];
    var dietReport = reportRes.ok && reportRes.data ? reportRes.data : null;

    state.dietIntakes = intakes;
    state.dietReport = dietReport;

    var todayIst = getIstTodayInputValue();
    var todaysIntakes = intakes.filter(function(item) {
        var loggedAt = new Date(item.loggedAt || '');
        return !Number.isNaN(loggedAt.getTime()) && getIstDateKey(loggedAt) === todayIst;
    });
    var todaysActivities = activities.filter(function(item) {
        var loggedAt = new Date(item.logged_at || '');
        return !Number.isNaN(loggedAt.getTime()) && getIstDateKey(loggedAt) === todayIst;
    });

    var totalCalories = todaysIntakes.reduce(function(sum, item) { return sum + Number(item.calories || 0); }, 0);
    var totalCarbs = todaysIntakes.reduce(function(sum, item) { return sum + Number(item.carbsG || 0); }, 0);
    var activeMinutes = todaysActivities.reduce(function(sum, item) { return sum + Number(item.duration_min || 0); }, 0);

    updateNutritionSummary({
        totalCalories: Number(totalCalories.toFixed(0)),
        totalCarbs: Number(totalCarbs.toFixed(0)),
        activeMinutes: Number(activeMinutes.toFixed(0)),
        mealCount: todaysIntakes.length,
    });

    renderTodayMealSnapshot(todaysIntakes);
    renderDietIntakeTable(intakes);
    renderDietReport(dietReport);

    var goalMetrics = document.querySelectorAll('#nutritionist .metrics-grid .metric-card .metric-value');
    if (goalMetrics[0]) goalMetrics[0].textContent = Number(totalCalories.toFixed(0));
    if (goalMetrics[1]) goalMetrics[1].textContent = Number(totalCarbs.toFixed(0)) + 'g';
    if (goalMetrics[2]) {
        var highEvents = dietReport && dietReport.summary ? Number(dietReport.summary.highSugarEvents || 0) : 0;
        goalMetrics[2].textContent = String(highEvents);
    }
}

async function loadTrends() {
    var days = getChartRangeDays();
    var range = days + 'd';
    var trendRes = await API.get('/api/patient/biometrics/trends?range=' + encodeURIComponent(range));
    if (trendRes.ok) {
        updateTrendCharts(trendRes.data || {});
    }
}

async function loadMessages() {
    // Load assigned doctors and existing threads in parallel
    var doctorsResult = await API.get('/api/patient/doctors');
    var threadsResult = await API.get('/api/patient/messages/threads');

    // Keep chat usable if doctors endpoint fails transiently.
    if (doctorsResult.ok && Array.isArray(doctorsResult.data) && doctorsResult.data.length > 0) {
        state.chatDoctors = doctorsResult.data;
    } else if (Array.isArray(state.doctors) && state.doctors.length > 0) {
        state.chatDoctors = state.doctors;
    } else {
        state.chatDoctors = [];
    }
    state.threads = threadsResult.ok && Array.isArray(threadsResult.data) ? threadsResult.data : [];

    renderMessageThreads();
    updateNotificationsUI();
}

async function loadSafety() {
    var result = await API.get('/api/patient/safety/profile');
    if (!result.ok || !result.data) return;

    var profile = result.data;
    var name = document.getElementById('safety-contact-name');
    var phone = document.getElementById('safety-contact-phone');
    var threshold = document.getElementById('safety-low-threshold');
    var autoNotify = document.getElementById('safety-auto-notify');

    if (name) name.value = profile.emergency_contact_name || '';
    if (phone) phone.value = profile.emergency_contact_phone || '';
    if (threshold) threshold.value = profile.severe_low_threshold || 60;
    if (autoNotify) autoNotify.value = profile.auto_notify_enabled === 1 ? 'true' : 'false';
}

async function loadGamification() {
    var result = await API.get('/api/patient/gamification/progress');
    if (!result.ok || !result.data) {
        state.goals = [];
        state.badges = [];
    } else {
        state.goals = Array.isArray(result.data.goals) ? result.data.goals : [];
        state.badges = Array.isArray(result.data.badges) ? result.data.badges : [];
    }

    renderGoals();
    renderBadges();
}

async function loadPrivacyAndSecurity() {
    var privacy = await API.get('/api/patient/privacy/settings');
    if (privacy.ok && privacy.data) {
        var row = privacy.data;
        var shareDoctor = document.getElementById('privacy-share-doctor');
        var shareCaregiver = document.getElementById('privacy-share-caregiver');
        var research = document.getElementById('privacy-research');
        var marketing = document.getElementById('privacy-marketing');

        if (shareDoctor) shareDoctor.value = row.share_with_doctor === 1 ? 'true' : 'false';
        if (shareCaregiver) shareCaregiver.value = row.share_with_caregiver === 1 ? 'true' : 'false';
        if (research) research.value = row.research_opt_in === 1 ? 'true' : 'false';
        if (marketing) marketing.value = row.marketing_opt_in === 1 ? 'true' : 'false';
    }

    var sessions = await API.get('/api/patient/security/sessions');
    state.sessions = sessions.ok && Array.isArray(sessions.data) ? sessions.data : [];
    renderSessions();

    var audit = await API.get('/api/patient/audit/access-log');
    state.auditLog = audit.ok && Array.isArray(audit.data) ? audit.data : [];
    renderAuditLog();
}

function initInteractions() {
    var globalSearch = document.getElementById('global-search');
    if (globalSearch) {
        globalSearch.addEventListener('input', function(e) {
            var value = String(e.target.value || '').toLowerCase();
            if (document.getElementById('reports').classList.contains('active')) {
                document.getElementById('report-search').value = value;
                filterReports();
            }
            if (document.getElementById('records').classList.contains('active')) {
                document.getElementById('record-search').value = value;
                filterRecords();
            }
        });
    }

    var reportSearch = document.getElementById('report-search');
    if (reportSearch) reportSearch.addEventListener('input', filterReports);
    var reportType = document.getElementById('report-type-filter');
    if (reportType) reportType.addEventListener('change', filterReports);

    var recordSearch = document.getElementById('record-search');
    if (recordSearch) recordSearch.addEventListener('input', filterRecords);
    var recordType = document.getElementById('record-type-filter');
    if (recordType) recordType.addEventListener('change', filterRecords);

    var chartPeriod = document.getElementById('chart-period');
    if (chartPeriod) {
        chartPeriod.addEventListener('change', function() {
            loadTrends().catch(function() {
                console.error('Failed to reload trend charts.');
            });
        });
    }

    var appointmentDate = document.getElementById('appointment-date');
    if (appointmentDate) {
        appointmentDate.min = getIstTodayInputValue();
    }

    var manualDate = document.getElementById('manual-recorded-at');
    if (manualDate && !manualDate.value) {
        manualDate.value = getIstTodayInputValue();
    }

    var dietDateTime = document.getElementById('diet-logged-at');
    if (dietDateTime && !dietDateTime.value) {
        dietDateTime.value = toLocalDateTimeInputValue(new Date());
    }

    var dietIntakeText = document.getElementById('diet-intake-text');
    if (dietIntakeText) {
        dietIntakeText.addEventListener('input', queueDietTextEstimate);
    }

    var dietCarbs = document.getElementById('diet-carbs');
    if (dietCarbs) {
        dietCarbs.addEventListener('input', function() {
            if (document.activeElement === dietCarbs) {
                dietCarbs.dataset.autofilled = '0';
            }
        });
    }

    var dietCalories = document.getElementById('diet-calories');
    if (dietCalories) {
        dietCalories.addEventListener('input', function() {
            if (document.activeElement === dietCalories) {
                dietCalories.dataset.autofilled = '0';
            }
        });
    }

    var aiQuestion = document.getElementById('ai-question');
    if (aiQuestion) {
        aiQuestion.addEventListener('keydown', function(event) {
            if (event.isComposing) return;
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                askAiAssistant().catch(function() {
                    console.error('Failed to ask AI assistant.');
                });
            }
        });
    }

    var aiFab = document.querySelector('.floating-ai-btn');
    if (aiFab) {
        aiFab.classList.add('pulse-once');
        setTimeout(function() {
            aiFab.classList.remove('pulse-once');
        }, 2800);
    }

    // Doctor-chat: thread search
    var waSearch = document.getElementById('wa-thread-search');
    if (waSearch) {
        waSearch.addEventListener('input', function() {
            renderMessageThreads();
        });
    }

    // Doctor-chat: reply on Enter
    var replyInput = document.getElementById('thread-reply-body');
    if (replyInput) {
        replyInput.addEventListener('keydown', function(event) {
            if (event.isComposing) return;
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendThreadReply();
            }
        });
    }

    var notificationBtn = document.getElementById('notification-btn');
    if (notificationBtn) {
        notificationBtn.addEventListener('click', function(event) {
            event.stopPropagation();
            toggleNotificationPanel();
        });
    }

    document.addEventListener('click', function(event) {
        var panel = document.getElementById('notification-panel');
        var btn = document.getElementById('notification-btn');
        if (!panel || !btn) return;
        if (panel.contains(event.target) || btn.contains(event.target)) return;
        toggleNotificationPanel(false);
    });
}

function initChatSocket() {
    if (typeof io === 'undefined') return;
    var token = (typeof API !== 'undefined' && API.getToken) ? API.getToken() : null;
    if (!token) return;

    chatSocket = io({ auth: { token: token } });

    chatSocket.on('connect', function() {
        console.log('Chat socket connected');
    });

    chatSocket.on('new_message', function(data) {
        // A doctor sent a new message
        if (data && data.message && data.threadId) {
            // Acknowledge delivery to the sender (doctor)
            chatSocket.emit('message_delivered', {
                messageIds: [data.message.id],
                senderId: data.message.sender_id,
                threadId: data.threadId
            });

            // If we're viewing this thread, append the message live and mark as read
            if (state.selectedThreadId === data.threadId) {
                var container = document.getElementById('thread-messages');
                if (container) {
                    var emptyEl = container.querySelector('.wa-empty');
                    if (emptyEl) emptyEl.remove();

                    var msgDiv = document.createElement('div');
                    msgDiv.className = 'wa-msg doctor';
                    msgDiv.setAttribute('data-msg-id', data.message.id || '');
                    msgDiv.innerHTML = '<div>' + escapeHtml(data.message.body || '') + '</div><div class="wa-msg-time">' + msgTime(data.message.sent_at || new Date().toISOString()) + '</div>';
                    container.appendChild(msgDiv);
                    container.scrollTop = container.scrollHeight;
                }
                // Since we're viewing it, also mark as read
                chatSocket.emit('messages_read', {
                    messageIds: [data.message.id],
                    senderId: data.message.sender_id,
                    threadId: data.threadId
                });
            }
            // Refresh thread list to update last message / unread
            loadMessages();
        }
    });

    // Our sent messages were delivered to the doctor's device
    chatSocket.on('messages_delivered', function(data) {
        if (!data || !Array.isArray(data.messageIds)) return;
        data.messageIds.forEach(function(id) {
            var el = document.querySelector('.wa-msg[data-msg-id="' + id + '"] .msg-status');
            if (el) {
                el.className = 'msg-status delivered';
                el.title = 'Delivered';
                el.innerHTML = '&#10003;&#10003;';
            }
        });
    });

    // Our sent messages were read by the doctor
    chatSocket.on('messages_read_ack', function(data) {
        if (!data || !Array.isArray(data.messageIds)) return;
        data.messageIds.forEach(function(id) {
            var el = document.querySelector('.wa-msg[data-msg-id="' + id + '"] .msg-status');
            if (el) {
                el.className = 'msg-status read';
                el.title = 'Read';
                el.innerHTML = '&#10003;&#10003;';
            }
        });
    });

    chatSocket.on('disconnect', function() {
        console.log('Chat socket disconnected');
    });
}

async function bootstrap() {
    if (typeof API === 'undefined') return;
    var authorized = await verifyAuthRole('patient');
    if (!authorized) return;

    initNavigation();
    initModals();
    initAiAssistantPanel();
    initCharts();
    initInteractions();
    initChatSocket();

    var localUser = API.getUser();
    if (localUser) {
        state.currentUser = localUser;
        populateProfileView(localUser);
        populateProfileModal(localUser);
    }

    try {
        renderAiConversation();
        await Promise.all([
            loadProfile(),
            loadDoctors(),
            loadAppointments(),
            loadReports(),
            loadRecords(),
            loadOverview(),
            loadNutrition(),
            loadTrends(),
            loadMessages(),
            loadSafety(),
            loadGamification(),
            loadPrivacyAndSecurity(),
        ]);
        renderExports();
        renderShares();
    } catch (err) {
        console.error('Failed to load patient dashboard:', err);
    }
}

window.openModal = openModal;
window.closeModal = closeModal;
window.saveProfile = saveProfile;
window.bookAppointment = bookAppointment;
window.saveDiet = saveDiet;
window.submitDietIntake = submitDietIntake;
window.clearDietIntakeForm = clearDietIntakeForm;
window.addReport = addReport;
window.addRecord = addRecord;
window.submitManualData = submitManualData;
window.clearManualDataForm = clearManualDataForm;
window.filterReports = filterReports;
window.filterRecords = filterRecords;
window.deleteReport = deleteReport;
window.viewReport = viewReport;
window.submitReportCorrections = submitReportCorrections;
window.scheduleWithDoctor = scheduleWithDoctor;
window.openDoctorChat = openDoctorChat;
window.sendThreadReply = sendThreadReply;
window.saveSafetyProfile = saveSafetyProfile;
window.triggerSafetyEvent = triggerSafetyEvent;
window.createGoal = createGoal;
window.markGoalCompleted = markGoalCompleted;
window.createExport = createExport;
window.createShare = createShare;
window.revokeShare = revokeShare;
window.savePrivacySettings = savePrivacySettings;
window.revokeSession = revokeSession;
window.askAiAssistant = askAiAssistant;
window.askAiPreset = askAiPreset;
window.askAiSuggestion = askAiSuggestion;
window.askAiDietReport = askAiDietReport;
window.openAiAssistantPanel = openAiAssistantPanel;
window.closeAiAssistantPanel = closeAiAssistantPanel;
window.handleAiFileSelect = handleAiFileSelect;
window.removeAiFile = removeAiFile;
window.autoResizeAiInput = autoResizeAiInput;
window.openNotificationThread = openNotificationThread;

bootstrap();

