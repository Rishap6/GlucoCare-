/**
 * GlucoCare – Diabetes Prediction Model Trainer
 * ------------------------------------------------
 * Reads diabetes_dataset.csv and trains a Gradient-Boosted Decision-Tree
 * ensemble entirely in pure JavaScript (no Python, no native modules).
 *
 * Usage:  node Ai/train-csv.js
 * Output: Ai/diabetes-model.json
 */

const fs = require('fs');
const path = require('path');

// ── Configuration ───────────────────────────────────────────────────
const CSV_PATH = path.join(__dirname, '..', 'diabetes_dataset.csv');
const MODEL_PATH = path.join(__dirname, 'diabetes-model.json');

const NUMERIC_FEATURES = [
    'age', 'bmi', 'waist_to_hip_ratio', 'systolic_bp', 'diastolic_bp',
    'heart_rate', 'cholesterol_total', 'hdl_cholesterol', 'ldl_cholesterol',
    'triglycerides', 'glucose_fasting', 'glucose_postprandial', 'insulin_level',
    'hba1c', 'diabetes_risk_score', 'physical_activity_minutes_per_week',
    'diet_score', 'sleep_hours_per_day', 'screen_time_hours_per_day',
    'alcohol_consumption_per_week',
];

const CATEGORICAL_FEATURES = {
    gender: ['Male', 'Female', 'Other'],
    smoking_status: ['Never', 'Former', 'Current'],
};

const BINARY_FEATURES = [
    'family_history_diabetes', 'hypertension_history', 'cardiovascular_history',
];

const TARGET = 'diagnosed_diabetes';

// ── CSV Parser (lightweight, no deps) ───────────────────────────────
function parseCSV(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);
    const header = lines[0].split(',');
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(',');
        if (vals.length !== header.length) continue;
        const obj = {};
        for (let j = 0; j < header.length; j++) {
            obj[header[j]] = vals[j];
        }
        rows.push(obj);
    }
    return rows;
}

// ── Feature Encoding ────────────────────────────────────────────────
function encodeRow(row) {
    const features = [];

    // Numeric features
    for (const f of NUMERIC_FEATURES) {
        features.push(parseFloat(row[f]) || 0);
    }

    // One-hot categorical features
    for (const [feat, categories] of Object.entries(CATEGORICAL_FEATURES)) {
        for (const cat of categories) {
            features.push(row[feat] === cat ? 1 : 0);
        }
    }

    // Binary features
    for (const f of BINARY_FEATURES) {
        features.push(parseInt(row[f], 10) || 0);
    }

    return features;
}

function getFeatureNames() {
    const names = [...NUMERIC_FEATURES];
    for (const [feat, categories] of Object.entries(CATEGORICAL_FEATURES)) {
        for (const cat of categories) {
            names.push(`${feat}_${cat}`);
        }
    }
    names.push(...BINARY_FEATURES);
    return names;
}

// ── Normalization ───────────────────────────────────────────────────
function computeStats(X) {
    const n = X.length;
    const d = X[0].length;
    const mean = new Array(d).fill(0);
    const std = new Array(d).fill(0);

    for (let i = 0; i < n; i++) {
        for (let j = 0; j < d; j++) {
            mean[j] += X[i][j];
        }
    }
    for (let j = 0; j < d; j++) mean[j] /= n;

    for (let i = 0; i < n; i++) {
        for (let j = 0; j < d; j++) {
            std[j] += (X[i][j] - mean[j]) ** 2;
        }
    }
    for (let j = 0; j < d; j++) {
        std[j] = Math.sqrt(std[j] / n);
        if (std[j] === 0) std[j] = 1; // avoid division by zero
    }

    return { mean, std };
}

function normalize(X, stats) {
    return X.map(row =>
        row.map((val, j) => (val - stats.mean[j]) / stats.std[j])
    );
}

// ── Train/Test split ────────────────────────────────────────────────
function shuffle(arr, seed) {
    // Fisher-Yates with seeded PRNG
    let s = seed || 42;
    function rand() {
        s = (s * 16807 + 0) % 2147483647;
        return (s - 1) / 2147483646;
    }
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function trainTestSplit(X, y, testRatio = 0.2) {
    const indices = shuffle(Array.from({ length: X.length }, (_, i) => i), 42);
    const splitAt = Math.floor(X.length * (1 - testRatio));
    const trainIdx = indices.slice(0, splitAt);
    const testIdx = indices.slice(splitAt);
    return {
        X_train: trainIdx.map(i => X[i]),
        y_train: trainIdx.map(i => y[i]),
        X_test: testIdx.map(i => X[i]),
        y_test: testIdx.map(i => y[i]),
    };
}

// ── Decision Tree (CART) ────────────────────────────────────────────
// A simple, from-scratch decision tree for gradient boosting stumps.

function giniImpurity(labels) {
    if (labels.length === 0) return 0;
    const counts = {};
    for (const l of labels) counts[l] = (counts[l] || 0) + 1;
    let impurity = 1;
    for (const c of Object.values(counts)) {
        const p = c / labels.length;
        impurity -= p * p;
    }
    return impurity;
}

function buildTree(X, y, depth = 0, maxDepth = 6, minSamples = 10) {
    // For gradient boosting regression trees, y contains residuals (floats).
    // We use variance reduction instead of gini.
    const n = X.length;

    if (n <= minSamples || depth >= maxDepth) {
        // Leaf: return mean of y
        const sum = y.reduce((a, b) => a + b, 0);
        return { leaf: true, value: sum / n };
    }

    const d = X[0].length;
    let bestFeature = -1;
    let bestThreshold = 0;
    let bestScore = Infinity;
    let bestLeftIdx = null;
    let bestRightIdx = null;

    // Variance of full set
    const meanAll = y.reduce((a, b) => a + b, 0) / n;

    // Sample features for split (use sqrt(d) features — random subspace)
    const featureCount = Math.max(1, Math.floor(Math.sqrt(d)));
    const featureIndices = [];
    const used = new Set();
    let seed = depth * 1000 + n;
    for (let k = 0; k < featureCount; k++) {
        seed = (seed * 16807 + 0) % 2147483647;
        let idx = seed % d;
        while (used.has(idx)) { idx = (idx + 1) % d; }
        used.add(idx);
        featureIndices.push(idx);
    }

    for (const fIdx of featureIndices) {
        // Get unique sorted values for threshold candidates
        const vals = new Set();
        for (let i = 0; i < n; i++) vals.add(X[i][fIdx]);
        const sorted = [...vals].sort((a, b) => a - b);

        // Try midpoints between consecutive sorted unique values (sample up to 20)
        const step = Math.max(1, Math.floor(sorted.length / 20));
        for (let s = 0; s < sorted.length - 1; s += step) {
            const threshold = (sorted[s] + sorted[s + 1]) / 2;

            const leftIdx = [];
            const rightIdx = [];
            for (let i = 0; i < n; i++) {
                if (X[i][fIdx] <= threshold) leftIdx.push(i);
                else rightIdx.push(i);
            }

            if (leftIdx.length < 2 || rightIdx.length < 2) continue;

            const leftY = leftIdx.map(i => y[i]);
            const rightY = rightIdx.map(i => y[i]);
            const leftMean = leftY.reduce((a, b) => a + b, 0) / leftY.length;
            const rightMean = rightY.reduce((a, b) => a + b, 0) / rightY.length;

            let leftVar = 0, rightVar = 0;
            for (const v of leftY) leftVar += (v - leftMean) ** 2;
            for (const v of rightY) rightVar += (v - rightMean) ** 2;

            const score = (leftVar / n) + (rightVar / n);

            if (score < bestScore) {
                bestScore = score;
                bestFeature = fIdx;
                bestThreshold = threshold;
                bestLeftIdx = leftIdx;
                bestRightIdx = rightIdx;
            }
        }
    }

    if (bestFeature === -1) {
        const sum = y.reduce((a, b) => a + b, 0);
        return { leaf: true, value: sum / n };
    }

    const leftX = bestLeftIdx.map(i => X[i]);
    const leftY = bestLeftIdx.map(i => y[i]);
    const rightX = bestRightIdx.map(i => X[i]);
    const rightY = bestRightIdx.map(i => y[i]);

    return {
        leaf: false,
        feature: bestFeature,
        threshold: bestThreshold,
        left: buildTree(leftX, leftY, depth + 1, maxDepth, minSamples),
        right: buildTree(rightX, rightY, depth + 1, maxDepth, minSamples),
    };
}

function predictTree(tree, x) {
    if (tree.leaf) return tree.value;
    if (x[tree.feature] <= tree.threshold) return predictTree(tree.left, x);
    return predictTree(tree.right, x);
}

// ── Gradient Boosting (Binary Classification) ───────────────────────
function sigmoid(x) {
    return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x))));
}

function trainGradientBoosting(X, y, {
    nEstimators = 80,
    learningRate = 0.1,
    maxDepth = 5,
    minSamples = 20,
} = {}) {
    const n = X.length;

    // Initial prediction: log-odds of positive class
    const posCount = y.filter(v => v === 1).length;
    const initPred = Math.log(posCount / (n - posCount));

    const F = new Array(n).fill(initPred); // current predictions (logits)
    const trees = [];

    for (let t = 0; t < nEstimators; t++) {
        // Compute residuals (negative gradient of log-loss)
        const residuals = new Array(n);
        for (let i = 0; i < n; i++) {
            const p = sigmoid(F[i]);
            residuals[i] = y[i] - p;
        }

        // Fit a regression tree to residuals
        const tree = buildTree(X, residuals, 0, maxDepth, minSamples);
        trees.push(tree);

        // Update predictions
        for (let i = 0; i < n; i++) {
            F[i] += learningRate * predictTree(tree, X[i]);
        }

        // Log progress every 10 rounds
        if ((t + 1) % 10 === 0 || t === 0) {
            let loss = 0;
            for (let i = 0; i < n; i++) {
                const p = sigmoid(F[i]);
                loss -= y[i] * Math.log(p + 1e-15) + (1 - y[i]) * Math.log(1 - p + 1e-15);
            }
            loss /= n;
            console.log(`  Round ${t + 1}/${nEstimators} — Log-Loss: ${loss.toFixed(5)}`);
        }
    }

    return { initPred, learningRate, trees };
}

function predictGBM(model, x) {
    let logit = model.initPred;
    for (const tree of model.trees) {
        logit += model.learningRate * predictTree(tree, x);
    }
    return sigmoid(logit);
}

// ── Metrics ─────────────────────────────────────────────────────────
function computeMetrics(yTrue, yPred) {
    let tp = 0, tn = 0, fp = 0, fn = 0;
    for (let i = 0; i < yTrue.length; i++) {
        const pred = yPred[i] >= 0.5 ? 1 : 0;
        if (pred === 1 && yTrue[i] === 1) tp++;
        else if (pred === 0 && yTrue[i] === 0) tn++;
        else if (pred === 1 && yTrue[i] === 0) fp++;
        else fn++;
    }
    const accuracy = (tp + tn) / (tp + tn + fp + fn);
    const precision = tp / (tp + fp || 1);
    const recall = tp / (tp + fn || 1);
    const f1 = 2 * precision * recall / (precision + recall || 1);
    return { accuracy, precision, recall, f1, tp, tn, fp, fn };
}

// ── Main ────────────────────────────────────────────────────────────
function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  GlucoCare — Diabetes Prediction Model Trainer');
    console.log('═══════════════════════════════════════════════════════\n');

    // 1. Load CSV
    console.log('📂 Loading dataset...');
    const rows = parseCSV(CSV_PATH);
    console.log(`   Loaded ${rows.length} rows\n`);

    // 2. Encode features
    console.log('🔧 Encoding features...');
    const featureNames = getFeatureNames();
    console.log(`   Feature count: ${featureNames.length}`);

    const X = [];
    const y = [];
    let skipped = 0;

    for (const row of rows) {
        const label = parseInt(row[TARGET], 10);
        if (isNaN(label)) { skipped++; continue; }
        X.push(encodeRow(row));
        y.push(label);
    }

    console.log(`   Valid samples: ${X.length}`);
    if (skipped > 0) console.log(`   Skipped (missing target): ${skipped}`);

    const posCount = y.filter(v => v === 1).length;
    console.log(`   Class distribution: ${posCount} diabetic (${(posCount / y.length * 100).toFixed(1)}%) | ${y.length - posCount} healthy (${((y.length - posCount) / y.length * 100).toFixed(1)}%)\n`);

    // 3. Normalize
    console.log('📊 Normalizing features...');
    const stats = computeStats(X);
    const Xn = normalize(X, stats);

    // 4. Train/Test split
    console.log('✂️  Splitting 80/20 train/test...');
    const { X_train, y_train, X_test, y_test } = trainTestSplit(Xn, y);
    console.log(`   Train: ${X_train.length} | Test: ${X_test.length}\n`);

    // 5. Train model
    console.log('🚀 Training Gradient Boosted Trees...');
    const startTime = Date.now();
    const gbm = trainGradientBoosting(X_train, y_train, {
        nEstimators: 80,
        learningRate: 0.1,
        maxDepth: 5,
        minSamples: 20,
    });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`   Training completed in ${elapsed}s\n`);

    // 6. Evaluate
    console.log('📈 Evaluating on test set...');
    const testPreds = X_test.map(x => predictGBM(gbm, x));
    const metrics = computeMetrics(y_test, testPreds);

    console.log('');
    console.log('   ┌─────────────────────────────────────┐');
    console.log(`   │  Accuracy:   ${(metrics.accuracy * 100).toFixed(2)}%                │`);
    console.log(`   │  Precision:  ${(metrics.precision * 100).toFixed(2)}%                │`);
    console.log(`   │  Recall:     ${(metrics.recall * 100).toFixed(2)}%                │`);
    console.log(`   │  F1 Score:   ${(metrics.f1 * 100).toFixed(2)}%                │`);
    console.log('   └─────────────────────────────────────┘');
    console.log(`   Confusion: TP=${metrics.tp} TN=${metrics.tn} FP=${metrics.fp} FN=${metrics.fn}\n`);

    // 7. Save model
    console.log('💾 Saving model...');
    const modelData = {
        version: 2,
        type: 'gradient_boosted_trees',
        trainedAt: new Date().toISOString(),
        totalSamples: X.length,
        trainSamples: X_train.length,
        testSamples: X_test.length,
        featureNames,
        numericFeatures: NUMERIC_FEATURES,
        categoricalFeatures: CATEGORICAL_FEATURES,
        binaryFeatures: BINARY_FEATURES,
        normalization: stats,
        metrics: {
            accuracy: metrics.accuracy,
            precision: metrics.precision,
            recall: metrics.recall,
            f1: metrics.f1,
        },
        model: {
            initPred: gbm.initPred,
            learningRate: gbm.learningRate,
            trees: gbm.trees,
        },
    };

    fs.writeFileSync(MODEL_PATH, JSON.stringify(modelData));
    const sizeMB = (fs.statSync(MODEL_PATH).size / (1024 * 1024)).toFixed(2);
    console.log(`   Saved to: ${MODEL_PATH} (${sizeMB} MB)\n`);

    console.log('✅ Training complete!');
}

main();
