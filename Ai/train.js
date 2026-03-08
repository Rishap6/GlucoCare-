const fs = require('fs');
const { MODEL_PATH, buildModel, getKnowledgeBase } = require('./ai-engine');

function train() {
    const knowledgeBase = getKnowledgeBase();
    if (!Array.isArray(knowledgeBase) || knowledgeBase.length === 0) {
        throw new Error('Knowledge base is empty. Add entries to Ai/knowledge-base.json or generated geo knowledge first.');
    }

    const model = buildModel(knowledgeBase);
    fs.writeFileSync(MODEL_PATH, JSON.stringify(model, null, 2));

    console.log('AI model trained successfully.');
    console.log(`Documents: ${model.totalDocs}`);
    console.log(`Model path: ${MODEL_PATH}`);
}

train();
