# GlucoCare AI Module

This folder contains a trainable diabetes knowledge model used by the patient dashboard AI assistant.

## Files
- `knowledge-base.json`: source content used for training
- `knowledge-india-geo.js`: generated India state/UT/city specific food-risk knowledge
- `knowledge-expanded.js`: extended FAQ coverage for broader real-world diabetes situations
- `ai-engine.js`: inference + scoring logic
- `document-intelligence.js`: extract structured diabetes/project data from document text
- `document-reader.js`: AI-side document parsing (PDF/DOCX/TXT + image OCR with multi-pass strategy for noisy/handwritten text)
- `train.js`: training script that produces `model.json`
- `model.json`: generated model artifact after training

## Train
From `backend/`:

```bash
npm run train:ai
```

## API Usage
The patient dashboard calls:

- `POST /api/patient/ai/ask`
- `POST /api/patient/ai/extract-document`

Request body:

```json
{ "question": "Difference between type 1 and type 2 diabetes" }
```

The API combines question text with patient allergy context for alternative-medicine guidance.

### Document Extraction API

Use this endpoint when a patient uploads a file and you want structured data (HbA1c, glucose values, medications, diagnoses, allergies, BP, dates).

Request body options:

```json
{
	"fileName": "lab-report.pdf",
	"fileType": "application/pdf",
	"base64Content": "<base64 string or data URL>"
}
```

Or provide already extracted text:

```json
{
	"fileName": "doctor-note.txt",
	"fileType": "text/plain",
	"text": "Patient Name: ... HbA1c: 7.2% ..."
}
```

Response includes parser details and extracted structured fields.

The extraction result also includes a `review` block for quick clinical-style triage in UI:

```json
{
	"review": {
		"level": "bad | caution | not-bad",
		"label": "Bad | Needs Attention | Not Bad",
		"isHealthBad": true,
		"summary": "Report review text",
		"reasons": ["..."]
	}
}
```

This review is shown in report UI and can drive report status labels. Extracted metrics (`hba1c`, `bloodPressure`, `glucoseReadingsMgDl`, `weightKg`) are used by dashboard chart endpoints.

### Handwritten/Noisy Text Support

The AI document reader runs multiple OCR passes for images and selects the best recognized text based on a score that favors diabetes-related signal quality (HbA1c, glucose, BP, mg/dL patterns). This improves extraction for handwritten or low-quality scans.

## India Geo Coverage
- All Indian states and all union territories are included with location-specific "what to avoid" entries.
- A broad city map is included for major and high-population cities.
- If a city is not explicitly mapped, the assistant returns a safe city-query fallback using diabetes risk heuristics.

## Safety
This assistant is educational support only and should not replace clinician advice.

All generated answers also append the line: `You can consult a doctor.`
