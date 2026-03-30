/**
 * GlucoCare – Diabetes Prediction API Route
 * -------------------------------------------
 * POST /api/predict/diabetes   → predict diabetes risk from patient data
 * GET  /api/predict/model-info → return model metadata
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const { predict, getRiskAssessment, getModelInfo } = require(
    path.join(__dirname, '..', '..', 'Ai', 'diabetes-predictor')
);

/**
 * POST /api/predict/diabetes
 * Body: { age, bmi, glucose_fasting, hba1c, ... }
 * Response: { prediction, probability, riskLevel, highlights, recommendation }
 */
router.post('/diabetes', (req, res) => {
    try {
        const patientData = req.body;

        if (!patientData || typeof patientData !== 'object') {
            return res.status(400).json({ error: 'Request body must be a JSON object with patient data.' });
        }

        const result = getRiskAssessment(patientData);
        res.json({
            success: true,
            data: result,
        });
    } catch (err) {
        console.error('Prediction error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/predict/model-info
 * Returns metadata about the trained model.
 */
router.get('/model-info', (req, res) => {
    try {
        const info = getModelInfo();
        res.json({ success: true, data: info });
    } catch (err) {
        console.error('Model info error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
