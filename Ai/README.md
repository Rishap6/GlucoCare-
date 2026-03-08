# GlucoCare AI Module

This folder contains a trainable diabetes knowledge model used by the patient dashboard AI assistant.

## Files
- `knowledge-base.json`: source content used for training
- `knowledge-india-geo.js`: generated India state/UT/city specific food-risk knowledge
- `knowledge-expanded.js`: extended FAQ coverage for broader real-world diabetes situations
- `ai-engine.js`: inference + scoring logic
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

Request body:

```json
{ "question": "Difference between type 1 and type 2 diabetes" }
```

The API combines question text with patient allergy context for alternative-medicine guidance.

## India Geo Coverage
- All Indian states and all union territories are included with location-specific "what to avoid" entries.
- A broad city map is included for major and high-population cities.
- If a city is not explicitly mapped, the assistant returns a safe city-query fallback using diabetes risk heuristics.

## Safety
This assistant is educational support only and should not replace clinician advice.

All generated answers also append the line: `You can consult a doctor.`
