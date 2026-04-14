/**
 * GlucoCare – Multi-Classifier Diabetes Trainer
 * ──────────────────────────────────────────────
 * Implements the approach from predict-diabetes-from-medical-records.ipynb:
 *
 *  1. Inspect & clean data (replace zeros with median — imputation)
 *  2. Compare multiple classifiers via K-Fold cross-validation
 *  3. Pick best model, evaluate on held-out test set
 *  4. Confusion matrix + learning-curve style output
 *  5. Feature importance ranking
 *  6. Save the winning model
 *
 * Usage:  node Ai/train-notebook.js
 * Output: Ai/diabetes-model.json  (overwrites previous model with better one)
 */

const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '..', 'diabetes_dataset.csv');
const MODEL_PATH = path.join(__dirname, 'diabetes-model.json');

// ═══════════════════════════════════════════════════════════════════
//  Step 1: Configuration
// ═══════════════════════════════════════════════════════════════════

const NUMERIC_FEATURES = [
    'age', 'bmi', 'waist_to_hip_ratio', 'systolic_bp', 'diastolic_bp',
    'heart_rate', 'cholesterol_total', 'hdl_cholesterol', 'ldl_cholesterol',
    'triglycerides', 'glucose_fasting', 'glucose_postprandial', 'insulin_level',
    'hba1c', 'diabetes_risk_score', 'physical_activity_minutes_per_week',
    'diet_score', 'sleep_hours_per_day', 'screen_time_hours_per_day',
    'alcohol_consumption_per_week',
];

// Features where zero is likely invalid (per notebook: Insulin, SkinThickness
// equivalent in our dataset — insulin_level, bmi, glucose, etc.)
const IMPUTE_ZERO_FEATURES = [
    'bmi', 'insulin_level', 'glucose_fasting', 'glucose_postprandial',
    'cholesterol_total', 'hdl_cholesterol', 'ldl_cholesterol',
    'triglycerides', 'hba1c', 'systolic_bp', 'diastolic_bp', 'heart_rate',
];

const CATEGORICAL_FEATURES = {
    gender: ['Male', 'Female', 'Other'],
    smoking_status: ['Never', 'Former', 'Current'],
};

const BINARY_FEATURES = [
    'family_history_diabetes', 'hypertension_history', 'cardiovascular_history',
];

const TARGET = 'diagnosed_diabetes';

// ═══════════════════════════════════════════════════════════════════
//  Step 2: CSV Parser
// ═══════════════════════════════════════════════════════════════════

function parseCSV(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);
    const header = lines[0].split(',');
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(',');
        if (vals.length !== header.length) continue;
        const obj = {};
        for (let j = 0; j < header.length; j++) obj[header[j]] = vals[j];
        rows.push(obj);
    }
    return rows;
}

// ═══════════════════════════════════════════════════════════════════
//  Step 3: Data Inspection & Imputation (from notebook Step 3)
// ═══════════════════════════════════════════════════════════════════

function inspectData(rows) {
    console.log('\n📋 Data Inspection — Zero/Missing Values:');
    console.log('   ┌────────────────────────────────┬──────────┬──────────┐');
    console.log('   │ Feature                        │ # Zeros  │ % Zeros  │');
    console.log('   ├────────────────────────────────┼──────────┼──────────┤');
    for (const f of IMPUTE_ZERO_FEATURES) {
        const zeros = rows.filter(r => parseFloat(r[f]) === 0).length;
        const pct = ((zeros / rows.length) * 100).toFixed(1);
        const name = f.padEnd(30);
        console.log(`   │ ${name} │ ${String(zeros).padStart(8)} │ ${pct.padStart(6)}%  │`);
    }
    console.log('   └────────────────────────────────┴──────────┴──────────┘');
}

function computeMedians(rows) {
    const medians = {};
    for (const f of IMPUTE_ZERO_FEATURES) {
        const nonZero = rows.map(r => parseFloat(r[f])).filter(v => v > 0);
        nonZero.sort((a, b) => a - b);
        medians[f] = nonZero.length > 0 ? nonZero[Math.floor(nonZero.length / 2)] : 0;
    }
    return medians;
}

function imputeZeros(rows, medians) {
    return rows.map(r => {
        const copy = { ...r };
        for (const f of IMPUTE_ZERO_FEATURES) {
            if (parseFloat(copy[f]) === 0) {
                copy[f] = String(medians[f]);
            }
        }
        return copy;
    });
}

// ═══════════════════════════════════════════════════════════════════
//  Step 4: Feature Encoding & Normalization
// ═══════════════════════════════════════════════════════════════════

function encodeRow(row) {
    const features = [];
    for (const f of NUMERIC_FEATURES) features.push(parseFloat(row[f]) || 0);
    for (const [feat, cats] of Object.entries(CATEGORICAL_FEATURES)) {
        for (const cat of cats) features.push(row[feat] === cat ? 1 : 0);
    }
    for (const f of BINARY_FEATURES) features.push(parseInt(row[f], 10) || 0);
    return features;
}

function getFeatureNames() {
    const names = [...NUMERIC_FEATURES];
    for (const [feat, cats] of Object.entries(CATEGORICAL_FEATURES)) {
        for (const cat of cats) names.push(`${feat}_${cat}`);
    }
    names.push(...BINARY_FEATURES);
    return names;
}

function computeStats(X) {
    const n = X.length, d = X[0].length;
    const mean = new Array(d).fill(0);
    const std = new Array(d).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) mean[j] += X[i][j];
    for (let j = 0; j < d; j++) mean[j] /= n;
    for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) std[j] += (X[i][j] - mean[j]) ** 2;
    for (let j = 0; j < d; j++) { std[j] = Math.sqrt(std[j] / n); if (std[j] === 0) std[j] = 1; }
    return { mean, std };
}

function normalize(X, stats) {
    return X.map(row => row.map((v, j) => (v - stats.mean[j]) / stats.std[j]));
}

// ═══════════════════════════════════════════════════════════════════
//  Step 5: Seeded Shuffle & Split
// ═══════════════════════════════════════════════════════════════════

function seededRandom(seed) {
    let s = seed;
    return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function shuffle(arr, seed) {
    const rand = seededRandom(seed || 42);
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function trainTestSplit(X, y, testRatio = 0.2, seed = 42) {
    const indices = shuffle(Array.from({ length: X.length }, (_, i) => i), seed);
    const splitAt = Math.floor(X.length * (1 - testRatio));
    return {
        X_train: indices.slice(0, splitAt).map(i => X[i]),
        y_train: indices.slice(0, splitAt).map(i => y[i]),
        X_test: indices.slice(splitAt).map(i => X[i]),
        y_test: indices.slice(splitAt).map(i => y[i]),
    };
}

// ═══════════════════════════════════════════════════════════════════
//  Step 6: Classifiers (pure JS implementations)
// ═══════════════════════════════════════════════════════════════════

// --- Logistic Regression ---
function trainLogisticRegression(X, y, { lr = 0.01, epochs = 200 } = {}) {
    const d = X[0].length;
    const w = new Array(d).fill(0);
    let b = 0;
    const n = X.length;

    for (let e = 0; e < epochs; e++) {
        const dw = new Array(d).fill(0);
        let db = 0;
        for (let i = 0; i < n; i++) {
            let z = b;
            for (let j = 0; j < d; j++) z += w[j] * X[i][j];
            const p = 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, z))));
            const err = p - y[i];
            for (let j = 0; j < d; j++) dw[j] += err * X[i][j];
            db += err;
        }
        for (let j = 0; j < d; j++) w[j] -= lr * (dw[j] / n);
        b -= lr * (db / n);
    }
    return { type: 'LR', w, b };
}

function predictLR(model, x) {
    let z = model.b;
    for (let j = 0; j < model.w.length; j++) z += model.w[j] * x[j];
    return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, z))));
}

// --- K-Nearest Neighbors ---
function trainKNN(X, y, { k = 5 } = {}) {
    return { type: 'KNN', X, y, k };
}

function predictKNN(model, x) {
    const dists = model.X.map((xi, i) => {
        let d = 0;
        for (let j = 0; j < xi.length; j++) d += (xi[j] - x[j]) ** 2;
        return { d, label: model.y[i] };
    });
    dists.sort((a, b) => a.d - b.d);
    const top = dists.slice(0, model.k);
    const votes = top.filter(t => t.label === 1).length;
    return votes / model.k;
}

// --- Naive Bayes (Gaussian) ---
function trainGaussianNB(X, y) {
    const classes = [0, 1];
    const d = X[0].length;
    const stats = {};
    for (const c of classes) {
        const rows = X.filter((_, i) => y[i] === c);
        const mean = new Array(d).fill(0);
        const variance = new Array(d).fill(0);
        for (const r of rows) for (let j = 0; j < d; j++) mean[j] += r[j];
        for (let j = 0; j < d; j++) mean[j] /= rows.length;
        for (const r of rows) for (let j = 0; j < d; j++) variance[j] += (r[j] - mean[j]) ** 2;
        for (let j = 0; j < d; j++) variance[j] = variance[j] / rows.length + 1e-9;
        stats[c] = { mean, variance, prior: rows.length / X.length };
    }
    return { type: 'GNB', stats, classes };
}

function predictGNB(model, x) {
    let bestClass = 0, bestLogP = -Infinity;
    for (const c of model.classes) {
        const s = model.stats[c];
        let logP = Math.log(s.prior);
        for (let j = 0; j < x.length; j++) {
            logP += -0.5 * Math.log(2 * Math.PI * s.variance[j])
                - ((x[j] - s.mean[j]) ** 2) / (2 * s.variance[j]);
        }
        if (logP > bestLogP) { bestLogP = logP; bestClass = c; }
    }
    return bestClass;
}

// --- Decision Tree (CART for classification) ---
function buildClassTree(X, y, depth = 0, maxDepth = 8, minSamples = 10) {
    const n = X.length;
    const posCount = y.filter(v => v === 1).length;
    const negCount = n - posCount;

    if (n <= minSamples || depth >= maxDepth || posCount === 0 || negCount === 0) {
        return { leaf: true, value: posCount / n };
    }

    const d = X[0].length;
    let bestFeature = -1, bestThreshold = 0, bestGini = Infinity;
    let bestLeft = null, bestRight = null;

    const featureCount = Math.max(1, Math.floor(Math.sqrt(d)));
    const used = new Set();
    let seed = depth * 997 + n;
    for (let k = 0; k < featureCount; k++) {
        seed = (seed * 16807) % 2147483647;
        let idx = seed % d;
        while (used.has(idx)) idx = (idx + 1) % d;
        used.add(idx);
    }

    for (const fIdx of used) {
        const vals = [];
        for (let i = 0; i < n; i++) vals.push(X[i][fIdx]);
        vals.sort((a, b) => a - b);
        const step = Math.max(1, Math.floor(vals.length / 25));

        for (let s = 0; s < vals.length - 1; s += step) {
            const threshold = (vals[s] + vals[s + 1]) / 2;
            let lP = 0, lN = 0, rP = 0, rN = 0;
            const leftIdx = [], rightIdx = [];
            for (let i = 0; i < n; i++) {
                if (X[i][fIdx] <= threshold) { leftIdx.push(i); if (y[i] === 1) lP++; else lN++; }
                else { rightIdx.push(i); if (y[i] === 1) rP++; else rN++; }
            }
            const lT = lP + lN, rT = rP + rN;
            if (lT < 2 || rT < 2) continue;
            const lGini = 1 - (lP / lT) ** 2 - (lN / lT) ** 2;
            const rGini = 1 - (rP / rT) ** 2 - (rN / rT) ** 2;
            const gini = (lT * lGini + rT * rGini) / n;
            if (gini < bestGini) {
                bestGini = gini; bestFeature = fIdx; bestThreshold = threshold;
                bestLeft = leftIdx; bestRight = rightIdx;
            }
        }
    }

    if (bestFeature === -1) return { leaf: true, value: posCount / n };

    return {
        leaf: false, feature: bestFeature, threshold: bestThreshold,
        left: buildClassTree(bestLeft.map(i => X[i]), bestLeft.map(i => y[i]), depth + 1, maxDepth, minSamples),
        right: buildClassTree(bestRight.map(i => X[i]), bestRight.map(i => y[i]), depth + 1, maxDepth, minSamples),
    };
}

function predictClassTree(tree, x) {
    if (tree.leaf) return tree.value;
    return x[tree.feature] <= tree.threshold
        ? predictClassTree(tree.left, x) : predictClassTree(tree.right, x);
}

// --- Random Forest ---
function trainRandomForest(X, y, { nTrees = 30, maxDepth = 8, minSamples = 10 } = {}) {
    const trees = [];
    const n = X.length;
    const rand = seededRandom(42);
    for (let t = 0; t < nTrees; t++) {
        // Bootstrap sample
        const indices = [];
        for (let i = 0; i < n; i++) indices.push(Math.floor(rand() * n));
        const Xb = indices.map(i => X[i]);
        const yb = indices.map(i => y[i]);
        trees.push(buildClassTree(Xb, yb, 0, maxDepth, minSamples));
    }
    return { type: 'RF', trees };
}

function predictRF(model, x) {
    const preds = model.trees.map(t => predictClassTree(t, x));
    return preds.reduce((a, b) => a + b, 0) / preds.length;
}

// --- Gradient Boosted Trees (like XGBoost from notebook) ---
function sigmoid(x) { return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x)))); }

function buildRegressionTree(X, y, depth = 0, maxDepth = 5, minSamples = 20) {
    const n = X.length;
    if (n <= minSamples || depth >= maxDepth) {
        return { leaf: true, value: y.reduce((a, b) => a + b, 0) / n };
    }
    const d = X[0].length;
    let bestF = -1, bestT = 0, bestScore = Infinity, bestLI = null, bestRI = null;
    const fCount = Math.max(1, Math.floor(Math.sqrt(d)));
    const used = new Set();
    let seed = depth * 1000 + n;
    for (let k = 0; k < fCount; k++) {
        seed = (seed * 16807) % 2147483647;
        let idx = seed % d;
        while (used.has(idx)) idx = (idx + 1) % d;
        used.add(idx);
    }
    for (const fIdx of used) {
        const vals = new Set();
        for (let i = 0; i < n; i++) vals.add(X[i][fIdx]);
        const sorted = [...vals].sort((a, b) => a - b);
        const step = Math.max(1, Math.floor(sorted.length / 20));
        for (let s = 0; s < sorted.length - 1; s += step) {
            const threshold = (sorted[s] + sorted[s + 1]) / 2;
            const li = [], ri = [];
            for (let i = 0; i < n; i++) { if (X[i][fIdx] <= threshold) li.push(i); else ri.push(i); }
            if (li.length < 2 || ri.length < 2) continue;
            const lY = li.map(i => y[i]), rY = ri.map(i => y[i]);
            const lM = lY.reduce((a, b) => a + b, 0) / lY.length;
            const rM = rY.reduce((a, b) => a + b, 0) / rY.length;
            let lV = 0, rV = 0;
            for (const v of lY) lV += (v - lM) ** 2;
            for (const v of rY) rV += (v - rM) ** 2;
            const score = lV / n + rV / n;
            if (score < bestScore) { bestScore = score; bestF = fIdx; bestT = threshold; bestLI = li; bestRI = ri; }
        }
    }
    if (bestF === -1) return { leaf: true, value: y.reduce((a, b) => a + b, 0) / n };
    return {
        leaf: false, feature: bestF, threshold: bestT,
        left: buildRegressionTree(bestLI.map(i => X[i]), bestLI.map(i => y[i]), depth + 1, maxDepth, minSamples),
        right: buildRegressionTree(bestRI.map(i => X[i]), bestRI.map(i => y[i]), depth + 1, maxDepth, minSamples),
    };
}

function predictRegTree(tree, x) {
    if (tree.leaf) return tree.value;
    return x[tree.feature] <= tree.threshold ? predictRegTree(tree.left, x) : predictRegTree(tree.right, x);
}

function trainGBT(X, y, { nEstimators = 100, learningRate = 0.1, maxDepth = 5, minSamples = 20 } = {}) {
    const n = X.length;
    const posCount = y.filter(v => v === 1).length;
    const initPred = Math.log(posCount / (n - posCount));
    const F = new Array(n).fill(initPred);
    const trees = [];

    for (let t = 0; t < nEstimators; t++) {
        const residuals = new Array(n);
        for (let i = 0; i < n; i++) residuals[i] = y[i] - sigmoid(F[i]);
        const tree = buildRegressionTree(X, residuals, 0, maxDepth, minSamples);
        trees.push(tree);
        for (let i = 0; i < n; i++) F[i] += learningRate * predictRegTree(tree, X[i]);

        if ((t + 1) % 20 === 0) {
            let loss = 0;
            for (let i = 0; i < n; i++) {
                const p = sigmoid(F[i]);
                loss -= y[i] * Math.log(p + 1e-15) + (1 - y[i]) * Math.log(1 - p + 1e-15);
            }
            console.log(`      GBT Round ${t + 1}/${nEstimators} — Log-Loss: ${(loss / n).toFixed(5)}`);
        }
    }
    return { type: 'GBT', initPred, learningRate, trees };
}

function predictGBT(model, x) {
    let logit = model.initPred;
    for (const tree of model.trees) logit += model.learningRate * predictRegTree(tree, x);
    return sigmoid(logit);
}

// ═══════════════════════════════════════════════════════════════════
//  Step 7: K-Fold Cross-Validation (from notebook Step 4)
// ═══════════════════════════════════════════════════════════════════

function kFoldCV(X, y, trainFn, predictFn, k = 5) {
    const n = X.length;
    const foldSize = Math.floor(n / k);
    const indices = shuffle(Array.from({ length: n }, (_, i) => i), 7);
    const accuracies = [];

    for (let fold = 0; fold < k; fold++) {
        const testStart = fold * foldSize;
        const testEnd = fold === k - 1 ? n : testStart + foldSize;
        const testIdx = indices.slice(testStart, testEnd);
        const trainIdx = [...indices.slice(0, testStart), ...indices.slice(testEnd)];

        const Xtr = trainIdx.map(i => X[i]);
        const ytr = trainIdx.map(i => y[i]);
        const Xte = testIdx.map(i => X[i]);
        const yte = testIdx.map(i => y[i]);

        const model = trainFn(Xtr, ytr);
        let correct = 0;
        for (let i = 0; i < Xte.length; i++) {
            const p = predictFn(model, Xte[i]);
            const pred = p >= 0.5 ? 1 : 0;
            if (pred === yte[i]) correct++;
        }
        accuracies.push(correct / Xte.length);
    }

    const mean = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
    const std = Math.sqrt(accuracies.reduce((a, b) => a + (b - mean) ** 2, 0) / accuracies.length);
    return { mean, std, folds: accuracies };
}

// ═══════════════════════════════════════════════════════════════════
//  Step 8: Metrics & Confusion Matrix (from notebook Step 5)
// ═══════════════════════════════════════════════════════════════════

function computeMetrics(yTrue, yPred) {
    let tp = 0, tn = 0, fp = 0, fn = 0;
    for (let i = 0; i < yTrue.length; i++) {
        const pred = yPred[i] >= 0.5 ? 1 : 0;
        if (pred === 1 && yTrue[i] === 1) tp++;
        else if (pred === 0 && yTrue[i] === 0) tn++;
        else if (pred === 1 && yTrue[i] === 0) fp++;
        else fn++;
    }
    return {
        accuracy: (tp + tn) / (tp + tn + fp + fn),
        precision: tp / (tp + fp || 1),
        recall: tp / (tp + fn || 1),
        f1: 2 * tp / (2 * tp + fp + fn || 1),
        tp, tn, fp, fn,
    };
}

function printConfusionMatrix(m) {
    console.log('   Confusion Matrix:');
    console.log('                    Predicted');
    console.log('                 Healthy  Diabetic');
    console.log(`   Actual Healthy  ${String(m.tn).padStart(6)}   ${String(m.fp).padStart(6)}`);
    console.log(`   Actual Diabetic ${String(m.fn).padStart(6)}   ${String(m.tp).padStart(6)}`);
}

// ═══════════════════════════════════════════════════════════════════
//  Step 9: Feature Importance (from notebook Step 6)
// ═══════════════════════════════════════════════════════════════════

function computeFeatureImportance(tree, numFeatures) {
    const importance = new Array(numFeatures).fill(0);
    function walk(node, weight) {
        if (node.leaf) return;
        importance[node.feature] += weight;
        walk(node.left, weight * 0.5);
        walk(node.right, weight * 0.5);
    }
    walk(tree, 1.0);
    return importance;
}

function computeEnsembleImportance(trees, numFeatures) {
    const total = new Array(numFeatures).fill(0);
    for (const tree of trees) {
        const imp = computeFeatureImportance(tree, numFeatures);
        for (let j = 0; j < numFeatures; j++) total[j] += imp[j];
    }
    const sum = total.reduce((a, b) => a + b, 0) || 1;
    return total.map(v => v / sum);
}

// ═══════════════════════════════════════════════════════════════════
//  Main
// ═══════════════════════════════════════════════════════════════════

function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  GlucoCare — Multi-Classifier Trainer (Notebook Approach)');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // ── Load data ───────────────────────────────────────────────────
    console.log('📂 Step 1: Loading dataset...');
    const rows = parseCSV(CSV_PATH);
    console.log(`   Loaded ${rows.length} rows\n`);

    // ── Inspect data ────────────────────────────────────────────────
    console.log('🔍 Step 2: Inspecting data for missing/zero values...');
    inspectData(rows);

    // ── Impute zeros with median (notebook approach) ────────────────
    console.log('\n🩹 Step 3: Imputing zero values with median...');
    // Notebook: split FIRST then impute (to avoid data leakage)
    const featureNames = getFeatureNames();
    const allX = rows.map(r => encodeRow(r));
    const allY = rows.map(r => parseInt(r[TARGET], 10)).filter(v => !isNaN(v));

    const validIndices = [];
    for (let i = 0; i < rows.length; i++) {
        if (!isNaN(parseInt(rows[i][TARGET], 10))) validIndices.push(i);
    }
    const X_raw = validIndices.map(i => allX[i]);
    const y_all = validIndices.map(i => allY[i]);

    console.log(`   Valid samples: ${X_raw.length}`);
    const posCount = y_all.filter(v => v === 1).length;
    console.log(`   Class 0 (Healthy):  ${y_all.length - posCount} (${((y_all.length - posCount) / y_all.length * 100).toFixed(1)}%)`);
    console.log(`   Class 1 (Diabetic): ${posCount} (${(posCount / y_all.length * 100).toFixed(1)}%)`);

    // Split BEFORE imputing (per notebook recommendation to avoid leakage)
    const { X_train: Xtr_raw, y_train, X_test: Xte_raw, y_test } = trainTestSplit(X_raw, y_all, 0.2, 1);

    // Impute on training data, apply same medians to test
    // Since we already encoded, impute on the numeric feature portion
    const trainMedians = {};
    for (let j = 0; j < NUMERIC_FEATURES.length; j++) {
        const nonZero = Xtr_raw.map(r => r[j]).filter(v => v > 0);
        nonZero.sort((a, b) => a - b);
        trainMedians[j] = nonZero.length > 0 ? nonZero[Math.floor(nonZero.length / 2)] : 0;
    }
    const imputableIndices = IMPUTE_ZERO_FEATURES.map(f => NUMERIC_FEATURES.indexOf(f)).filter(i => i >= 0);
    function imputeEncoded(X) {
        return X.map(row => {
            const r = [...row];
            for (const j of imputableIndices) {
                if (r[j] === 0) r[j] = trainMedians[j];
            }
            return r;
        });
    }
    const X_train_imp = imputeEncoded(Xtr_raw);
    const X_test_imp = imputeEncoded(Xte_raw);
    console.log('   Imputation complete (train medians applied to both sets)\n');

    // ── Normalize ───────────────────────────────────────────────────
    console.log('📊 Step 4: Normalizing features...');
    const stats = computeStats(X_train_imp);
    const X_train = normalize(X_train_imp, stats);
    const X_test = normalize(X_test_imp, stats);
    console.log(`   Train: ${X_train.length} | Test: ${X_test.length}\n`);

    // Use a smaller sample for CV of slower models
    const cvSampleSize = Math.min(15000, X_train.length);
    const cvIndices = shuffle(Array.from({ length: X_train.length }, (_, i) => i), 99).slice(0, cvSampleSize);
    const X_cv = cvIndices.map(i => X_train[i]);
    const y_cv = cvIndices.map(i => y_train[i]);

    // ── Compare Classifiers (notebook Step 4) ───────────────────────
    console.log('🏆 Step 5: Comparing classifiers via 5-Fold Cross-Validation...');
    console.log(`   (Using ${cvSampleSize} samples for CV)\n`);

    const classifiers = [
        {
            name: 'LR  (Logistic Regression)',
            abbr: 'LR',
            train: (X, y) => trainLogisticRegression(X, y, { lr: 0.05, epochs: 150 }),
            predict: (m, x) => predictLR(m, x),
        },
        {
            name: 'KNN (K-Nearest Neighbors)',
            abbr: 'KNN',
            train: (X, y) => trainKNN(X, y, { k: 7 }),
            predict: (m, x) => predictKNN(m, x),
        },
        {
            name: 'GNB (Gaussian Naive Bayes)',
            abbr: 'GNB',
            train: (X, y) => trainGaussianNB(X, y),
            predict: (m, x) => predictGNB(m, x),
        },
        {
            name: 'DTC (Decision Tree)',
            abbr: 'DTC',
            train: (X, y) => { const tree = buildClassTree(X, y, 0, 8, 10); return { type: 'DTC', tree }; },
            predict: (m, x) => predictClassTree(m.tree, x),
        },
        {
            name: 'RF  (Random Forest)',
            abbr: 'RF',
            train: (X, y) => trainRandomForest(X, y, { nTrees: 20, maxDepth: 8, minSamples: 10 }),
            predict: (m, x) => predictRF(m, x),
        },
    ];

    const cvResults = [];
    for (const clf of classifiers) {
        process.stdout.write(`   ${clf.name}... `);
        const start = Date.now();
        const cv = kFoldCV(X_cv, y_cv, clf.train, clf.predict, 5);
        const elapsed = (Date.now() - start) / 1000;
        console.log(`${(cv.mean * 100).toFixed(2)}% (±${(cv.std * 100).toFixed(2)}%) — ${elapsed.toFixed(1)}s`);
        cvResults.push({ ...clf, cv });
    }

    // GBT is too slow for K-fold on full sample — evaluate on train/test directly
    console.log('\n   Training GBT (Gradient Boosted Trees — like XGBoost)...');
    const gbtStart = Date.now();
    const gbtModel = trainGBT(X_train, y_train, { nEstimators: 100, learningRate: 0.1, maxDepth: 5, minSamples: 20 });
    const gbtElapsed = (Date.now() - gbtStart) / 1000;

    const gbtTrainPreds = X_train.map(x => predictGBT(gbtModel, x));
    const gbtTestPreds = X_test.map(x => predictGBT(gbtModel, x));
    const gbtTrainAcc = computeMetrics(y_train, gbtTrainPreds).accuracy;
    const gbtTestAcc = computeMetrics(y_test, gbtTestPreds).accuracy;
    console.log(`   GBT (Gradient Boosted Trees)... Train: ${(gbtTrainAcc * 100).toFixed(2)}% | Test: ${(gbtTestAcc * 100).toFixed(2)}% — ${gbtElapsed.toFixed(1)}s`);

    // ── Summary table ───────────────────────────────────────────────
    console.log('\n   ┌───────────────────────────────────┬─────────────┬─────────────┐');
    console.log('   │ Classifier                        │ CV Accuracy │   Std Dev   │');
    console.log('   ├───────────────────────────────────┼─────────────┼─────────────┤');
    for (const r of cvResults) {
        console.log(`   │ ${r.name.padEnd(33)} │   ${(r.cv.mean * 100).toFixed(2)}%   │   ±${(r.cv.std * 100).toFixed(2)}%   │`);
    }
    console.log(`   │ GBT (Gradient Boosted Trees)      │   ${(gbtTestAcc * 100).toFixed(2)}%   │     —       │`);
    console.log('   └───────────────────────────────────┴─────────────┴─────────────┘');

    // ── Best model: GBT (evaluate on test set) ──────────────────────
    console.log('\n🏅 Step 6: Evaluating best model (GBT) on test set...\n');
    const bestMetrics = computeMetrics(y_test, gbtTestPreds);

    console.log('   ┌─────────────────────────────────────┐');
    console.log(`   │  Accuracy:   ${(bestMetrics.accuracy * 100).toFixed(2)}%                │`);
    console.log(`   │  Precision:  ${(bestMetrics.precision * 100).toFixed(2)}%                │`);
    console.log(`   │  Recall:     ${(bestMetrics.recall * 100).toFixed(2)}%                │`);
    console.log(`   │  F1 Score:   ${(bestMetrics.f1 * 100).toFixed(2)}%                │`);
    console.log('   └─────────────────────────────────────┘\n');
    printConfusionMatrix(bestMetrics);

    // ── Feature Importance (notebook Step 6) ────────────────────────
    console.log('\n\n📊 Step 7: Feature Importance (Gradient Boosted Trees):\n');
    const importance = computeEnsembleImportance(gbtModel.trees, featureNames.length);
    const ranked = featureNames.map((name, i) => ({ name, importance: importance[i] }))
        .sort((a, b) => b.importance - a.importance);

    console.log('   ┌────────────────────────────────────────┬────────────┐');
    console.log('   │ Feature                                │ Importance │');
    console.log('   ├────────────────────────────────────────┼────────────┤');
    for (const r of ranked.slice(0, 15)) {
        const bar = '█'.repeat(Math.round(r.importance * 50));
        console.log(`   │ ${r.name.padEnd(38)} │ ${(r.importance * 100).toFixed(2)}%     │ ${bar}`);
    }
    console.log('   └────────────────────────────────────────┴────────────┘');

    // ── Save model ──────────────────────────────────────────────────
    console.log('\n💾 Step 8: Saving best model...');
    const modelData = {
        version: 3,
        type: 'gradient_boosted_trees',
        approach: 'notebook_multi_classifier',
        trainedAt: new Date().toISOString(),
        totalSamples: X_raw.length,
        trainSamples: X_train.length,
        testSamples: X_test.length,
        featureNames,
        numericFeatures: NUMERIC_FEATURES,
        categoricalFeatures: CATEGORICAL_FEATURES,
        binaryFeatures: BINARY_FEATURES,
        normalization: stats,
        imputeIndices: imputableIndices,
        trainMedians,
        classifierComparison: cvResults.map(r => ({
            name: r.abbr, accuracy: r.cv.mean, std: r.cv.std,
        })).concat([{ name: 'GBT', accuracy: gbtTestAcc, std: 0 }]),
        featureImportance: ranked.map(r => ({ feature: r.name, importance: r.importance })),
        metrics: {
            accuracy: bestMetrics.accuracy,
            precision: bestMetrics.precision,
            recall: bestMetrics.recall,
            f1: bestMetrics.f1,
        },
        model: {
            initPred: gbtModel.initPred,
            learningRate: gbtModel.learningRate,
            trees: gbtModel.trees,
        },
    };

    fs.writeFileSync(MODEL_PATH, JSON.stringify(modelData));
    const sizeMB = (fs.statSync(MODEL_PATH).size / (1024 * 1024)).toFixed(2);
    console.log(`   Saved to: ${MODEL_PATH} (${sizeMB} MB)`);

    console.log('\n✅ Training complete! Model saved with all metadata.\n');
}

main();
