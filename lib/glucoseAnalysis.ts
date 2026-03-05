type ReadingInput = {
    value: number;
    createdAt: Date;
};

type TriggeredAlert = {
    alertType: 'threshold_exceeded' | 'rapid_spike' | 'repeated_high';
    severity: 'high' | 'moderate';
    message: string;
};

export type RiskLevel = 'Low Risk' | 'Moderate Risk' | 'High Risk' | 'No Data';

type AnalysisResult = {
    riskLevel: RiskLevel;
    alerts: TriggeredAlert[];
};

const HIGH_THRESHOLD = 180;
const MODERATE_THRESHOLD = 140;
const SPIKE_DELTA = 40;

export function analyzeGlucoseReadings(readings: ReadingInput[]): AnalysisResult {
    if (readings.length === 0) {
        return { riskLevel: 'No Data', alerts: [] };
    }

    const sorted = [...readings].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const latest = sorted[0];
    const previous = sorted[1] || null;
    const recentFive = sorted.slice(0, 5);

    const alerts: TriggeredAlert[] = [];

    if (latest.value > HIGH_THRESHOLD) {
        alerts.push({
            alertType: 'threshold_exceeded',
            severity: 'high',
            message: `Latest glucose reading (${latest.value} mg/dL) exceeded the high-risk threshold.`
        });
    }

    if (previous && latest.value - previous.value >= SPIKE_DELTA) {
        alerts.push({
            alertType: 'rapid_spike',
            severity: 'moderate',
            message: `Rapid glucose spike detected (+${Math.round(latest.value - previous.value)} mg/dL).`
        });
    }

    const highCount = recentFive.filter((item) => item.value > MODERATE_THRESHOLD).length;
    if (highCount >= 3) {
        alerts.push({
            alertType: 'repeated_high',
            severity: 'high',
            message: `Repeated high glucose pattern detected (${highCount} of last ${recentFive.length} readings above ${MODERATE_THRESHOLD} mg/dL).`
        });
    }

    let riskLevel: RiskLevel = 'Low Risk';
    if (alerts.some((alert) => alert.severity === 'high')) {
        riskLevel = 'High Risk';
    } else if (alerts.length > 0 || latest.value > MODERATE_THRESHOLD || latest.value < 70) {
        riskLevel = 'Moderate Risk';
    }

    return { riskLevel, alerts };
}