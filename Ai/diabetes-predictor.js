/**
 * GlucoCare – Diabetes Predictor
 * --------------------------------
 * Runtime prediction module.  Loads the trained gradient-boosted model from
 * diabetes-model.json and exposes simple prediction and risk-assessment APIs.
 *
 *   const { predict, getRiskAssessment } = require('./diabetes-predictor');
 *   const result = predict({ age: 55, bmi: 30, glucose_fasting: 140, ... });
 */

const fs = require('fs');
const path = require('path');

const MODEL_PATH = path.join(__dirname, 'diabetes-model.json');

let _model = null;

function loadModel() {
    if (_model) return _model;
    if (!fs.existsSync(MODEL_PATH)) {
        throw new Error(
            'Diabetes model not found. Run  node Ai/train-csv.js  first.'
        );
    }
    _model = JSON.parse(fs.readFileSync(MODEL_PATH, 'utf8'));
    return _model;
}

// ── Decision-tree traversal ─────────────────────────────────────────
function predictTree(tree, x) {
    if (tree.leaf) return tree.value;
    if (x[tree.feature] <= tree.threshold) return predictTree(tree.left, x);
    return predictTree(tree.right, x);
}

function sigmoid(x) {
    return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x))));
}

// ── Encode a patient object into the feature vector ─────────────────
function encodePatient(data, model) {
    const features = [];

    // Numeric features
    for (const f of model.numericFeatures) {
        features.push(parseFloat(data[f]) || 0);
    }

    // One-hot categorical features
    for (const [feat, categories] of Object.entries(model.categoricalFeatures)) {
        for (const cat of categories) {
            features.push(String(data[feat]) === cat ? 1 : 0);
        }
    }

    // Binary features
    for (const f of model.binaryFeatures) {
        features.push(parseInt(data[f], 10) || 0);
    }

    // Impute zeros with training medians (if model was trained with imputation)
    if (model.imputeIndices && model.trainMedians) {
        for (const j of model.imputeIndices) {
            if (features[j] === 0) {
                features[j] = model.trainMedians[j] || 0;
            }
        }
    }

    return features;
}

// ── Normalize using saved stats ─────────────────────────────────────
function normalizeVec(vec, norm) {
    return vec.map((v, j) => (v - norm.mean[j]) / norm.std[j]);
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Predict diabetes probability for a patient.
 *
 * @param {Object} patientData  Key-value pairs matching the training features.
 *   At minimum provide: age, bmi, glucose_fasting, hba1c.
 *   Missing keys default to 0 / first category.
 * @returns {{ prediction: 0|1, probability: number, riskLevel: string }}
 */
function predict(patientData) {
    const model = loadModel();
    const raw = encodePatient(patientData, model);
    const x = normalizeVec(raw, model.normalization);

    let logit = model.model.initPred;
    for (const tree of model.model.trees) {
        logit += model.model.learningRate * predictTree(tree, x);
    }
    const probability = sigmoid(logit);
    const prediction = probability >= 0.5 ? 1 : 0;

    let riskLevel;
    if (probability < 0.3) riskLevel = 'Low';
    else if (probability < 0.6) riskLevel = 'Medium';
    else riskLevel = 'High';

    return { prediction, probability: Math.round(probability * 10000) / 10000, riskLevel };
}

/**
 * Detailed risk assessment with human-readable explanation.
 */
function getRiskAssessment(patientData) {
    const result = predict(patientData);
    const model = loadModel();

    const highlights = [];

    // Flag notable values
    const gf = parseFloat(patientData.glucose_fasting) || 0;
    if (gf >= 126) highlights.push(`⚠️ Fasting glucose (${gf} mg/dL) is in the diabetic range (≥126).`);
    else if (gf >= 100) highlights.push(`⚡ Fasting glucose (${gf} mg/dL) is in the pre-diabetic range (100-125).`);

    const hba1c = parseFloat(patientData.hba1c) || 0;
    if (hba1c >= 6.5) highlights.push(`⚠️ HbA1c (${hba1c}%) is in the diabetic range (≥6.5).`);
    else if (hba1c >= 5.7) highlights.push(`⚡ HbA1c (${hba1c}%) is in the pre-diabetic range (5.7-6.4).`);

    const bmi = parseFloat(patientData.bmi) || 0;
    if (bmi >= 30) highlights.push(`⚠️ BMI (${bmi}) falls in the obese range (≥30).`);
    else if (bmi >= 25) highlights.push(`⚡ BMI (${bmi}) falls in the overweight range (25-29.9).`);

    const fam = parseInt(patientData.family_history_diabetes, 10) || 0;
    if (fam === 1) highlights.push('⚠️ Family history of diabetes is a significant risk factor.');

    const bp = parseFloat(patientData.systolic_bp) || 0;
    if (bp >= 140) highlights.push(`⚠️ Systolic BP (${bp} mmHg) is elevated.`);

    const activity = parseFloat(patientData.physical_activity_minutes_per_week) || 0;
    if (activity < 60) highlights.push('⚡ Physical activity is below recommended levels (<150 min/week).');

    return {
        ...result,
        modelVersion: model.version,
        modelAccuracy: model.metrics.accuracy,
        highlights,
        recommendation: result.riskLevel === 'High'
            ? 'We strongly recommend consulting a healthcare provider for further evaluation.'
            : result.riskLevel === 'Medium'
                ? 'Consider scheduling a checkup and improving diet and exercise habits.'
                : 'Your risk appears low. Continue maintaining a healthy lifestyle.',
    };
}

/**
 * Return model meta-info (for admin/debug endpoints).
 */
function getModelInfo() {
    const model = loadModel();
    return {
        version: model.version,
        type: model.type,
        trainedAt: model.trainedAt,
        totalSamples: model.totalSamples,
        metrics: model.metrics,
        featureCount: model.featureNames.length,
    };
}

module.exports = { predict, getRiskAssessment, getModelInfo };
