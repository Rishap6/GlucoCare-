/**
 * GlucoCare+ Indian Food Nutrition Database
 * ------------------------------------------
 * Comprehensive dataset of 300+ Indian dishes with per-serving nutrition.
 * Sources: IFCT 2017 (Indian Food Composition Tables), NIN Hyderabad,
 *          USDA cross-referenced for common items.
 *
 * Each entry: { cal, carb, protein, fat, fiber, gi, serving, unit }
 *   cal     = kcal per serving
 *   carb    = grams carbohydrate per serving
 *   protein = grams protein per serving
 *   fat     = grams fat per serving
 *   fiber   = grams dietary fiber per serving
 *   gi      = glycemic index (low <55, medium 56-69, high >=70)
 *   serving = default serving size in grams/ml
 *   unit    = human-readable unit description
 *
 * Keys are lowercase, no spaces (use underscores or single words).
 * Aliases map common spellings/variations to canonical keys.
 */

const fs = require('fs');
const path = require('path');

const TRAINED_FOOD_MODEL_PATH = path.join(__dirname, 'food-nutrition-model.json');
const GLOBAL_FOOD_DATA_PATH = path.join(__dirname, 'global-food-nutrition.tsv');

// Propagate trained values to close equivalents already present in the DB.
const TRAINED_FOOD_EQUIVALENTS = {
    roti: ['chapati', 'phulka'],
    rice: ['white_rice'],
    dal: ['toor_dal'],
    egg: ['boiled_egg'],
};

const DEFAULT_GI_BY_CATEGORY = {
    fruit: 48,
    vegetable: 35,
    protein: 20,
    dairy: 30,
    grain: 62,
    'fast_food': 74,
    'nut_seed': 25,
    snack: 68,
    beverage: 58,
    'oil_fat': 0,
    sweetener: 72,
    condiment: 45,
    indian: 58,
    asian: 60,
    mediterranean: 45,
    western: 62,
    'indian_chinese': 72,
    'indian_fusion': 70,
    'western_fast_food': 75,
};

const INDIAN_FOOD_DB = {
    // ── South Indian Breakfast ──────────────────────────────────────
    idli:             { cal: 39,  carb: 8,   protein: 1.5, fat: 0.2, fiber: 0.3, gi: 69, serving: 30,  unit: '1 piece (~30g)' },
    dosa:             { cal: 120, carb: 18,  protein: 3,   fat: 4,   fiber: 0.5, gi: 77, serving: 60,  unit: '1 medium dosa' },
    masala_dosa:      { cal: 206, carb: 28,  protein: 5,   fat: 8,   fiber: 1.5, gi: 77, serving: 120, unit: '1 masala dosa' },
    rava_dosa:        { cal: 150, carb: 20,  protein: 3,   fat: 6,   fiber: 0.5, gi: 70, serving: 80,  unit: '1 rava dosa' },
    uttapam:          { cal: 150, carb: 22,  protein: 4,   fat: 5,   fiber: 1,   gi: 65, serving: 90,  unit: '1 uttapam' },
    appam:            { cal: 120, carb: 22,  protein: 2,   fat: 2.5, fiber: 0.5, gi: 70, serving: 75,  unit: '1 appam' },
    pesarattu:        { cal: 110, carb: 14,  protein: 6,   fat: 3,   fiber: 2,   gi: 45, serving: 70,  unit: '1 pesarattu' },
    vada:             { cal: 129, carb: 11,  protein: 5,   fat: 7,   fiber: 1.5, gi: 55, serving: 45,  unit: '1 piece' },
    medu_vada:        { cal: 129, carb: 11,  protein: 5,   fat: 7,   fiber: 1.5, gi: 55, serving: 45,  unit: '1 piece' },
    upma:             { cal: 189, carb: 28,  protein: 5,   fat: 6,   fiber: 1.5, gi: 65, serving: 150, unit: '1 bowl (150g)' },
    rava_upma:        { cal: 189, carb: 28,  protein: 5,   fat: 6,   fiber: 1.5, gi: 65, serving: 150, unit: '1 bowl (150g)' },
    pongal:           { cal: 210, carb: 30,  protein: 6,   fat: 7,   fiber: 1,   gi: 72, serving: 150, unit: '1 bowl (150g)' },
    ven_pongal:       { cal: 210, carb: 30,  protein: 6,   fat: 7,   fiber: 1,   gi: 72, serving: 150, unit: '1 bowl (150g)' },
    sakkarai_pongal:  { cal: 290, carb: 50,  protein: 5,   fat: 8,   fiber: 0.5, gi: 82, serving: 150, unit: '1 bowl (150g)' },
    puttu:            { cal: 170, carb: 30,  protein: 3,   fat: 4,   fiber: 1,   gi: 70, serving: 100, unit: '1 puttu' },
    idiyappam:        { cal: 120, carb: 25,  protein: 2,   fat: 0.5, fiber: 0.5, gi: 70, serving: 80,  unit: '2 idiyappam' },

    // ── North Indian Breads ─────────────────────────────────────────
    roti:             { cal: 71,  carb: 15,  protein: 2.5, fat: 0.4, fiber: 1.2, gi: 62, serving: 30,  unit: '1 roti (~30g)' },
    chapati:          { cal: 71,  carb: 15,  protein: 2.5, fat: 0.4, fiber: 1.2, gi: 62, serving: 30,  unit: '1 chapati (~30g)' },
    phulka:           { cal: 71,  carb: 15,  protein: 2.5, fat: 0.4, fiber: 1.2, gi: 62, serving: 30,  unit: '1 phulka (~30g)' },
    paratha:          { cal: 150, carb: 18,  protein: 3,   fat: 7,   fiber: 1,   gi: 65, serving: 50,  unit: '1 paratha' },
    aloo_paratha:     { cal: 210, carb: 28,  protein: 4,   fat: 9,   fiber: 1.5, gi: 68, serving: 80,  unit: '1 aloo paratha' },
    gobi_paratha:     { cal: 190, carb: 24,  protein: 4,   fat: 8,   fiber: 2,   gi: 62, serving: 75,  unit: '1 gobi paratha' },
    paneer_paratha:   { cal: 230, carb: 22,  protein: 8,   fat: 12,  fiber: 1,   gi: 60, serving: 85,  unit: '1 paneer paratha' },
    methi_paratha:    { cal: 180, carb: 22,  protein: 4,   fat: 8,   fiber: 2,   gi: 58, serving: 70,  unit: '1 methi paratha' },
    naan:             { cal: 260, carb: 45,  protein: 8,   fat: 5,   fiber: 1.5, gi: 71, serving: 90,  unit: '1 naan' },
    butter_naan:      { cal: 310, carb: 45,  protein: 8,   fat: 10,  fiber: 1.5, gi: 71, serving: 100, unit: '1 butter naan' },
    garlic_naan:      { cal: 300, carb: 46,  protein: 8,   fat: 9,   fiber: 1.5, gi: 71, serving: 100, unit: '1 garlic naan' },
    kulcha:           { cal: 290, carb: 44,  protein: 7,   fat: 9,   fiber: 1,   gi: 72, serving: 95,  unit: '1 kulcha' },
    puri:             { cal: 101, carb: 12,  protein: 2,   fat: 5,   fiber: 0.5, gi: 70, serving: 25,  unit: '1 puri' },
    bhatura:          { cal: 250, carb: 30,  protein: 5,   fat: 12,  fiber: 1,   gi: 75, serving: 70,  unit: '1 bhatura' },
    luchi:            { cal: 105, carb: 12,  protein: 2,   fat: 5.5, fiber: 0.3, gi: 72, serving: 25,  unit: '1 luchi' },
    roomali_roti:     { cal: 90,  carb: 17,  protein: 3,   fat: 1,   fiber: 0.5, gi: 68, serving: 35,  unit: '1 roomali roti' },
    tandoori_roti:    { cal: 120, carb: 22,  protein: 4,   fat: 2,   fiber: 1.5, gi: 60, serving: 45,  unit: '1 tandoori roti' },
    missi_roti:       { cal: 130, carb: 18,  protein: 5,   fat: 4,   fiber: 2.5, gi: 52, serving: 50,  unit: '1 missi roti' },
    bajra_roti:       { cal: 110, carb: 20,  protein: 3,   fat: 2,   fiber: 3,   gi: 52, serving: 40,  unit: '1 bajra roti' },
    jowar_roti:       { cal: 100, carb: 20,  protein: 3,   fat: 1,   fiber: 3,   gi: 50, serving: 40,  unit: '1 jowar roti' },
    makki_roti:       { cal: 110, carb: 22,  protein: 3,   fat: 1.5, fiber: 2.5, gi: 55, serving: 40,  unit: '1 makki roti' },
    ragi_roti:        { cal: 100, carb: 19,  protein: 3,   fat: 1.5, fiber: 4,   gi: 45, serving: 40,  unit: '1 ragi roti' },
    thepla:           { cal: 130, carb: 16,  protein: 3.5, fat: 5.5, fiber: 1.5, gi: 55, serving: 45,  unit: '1 thepla' },

    // ── Rice Dishes ─────────────────────────────────────────────────
    rice:             { cal: 130, carb: 28,  protein: 2.5, fat: 0.3, fiber: 0.4, gi: 73, serving: 100, unit: '1 katori (100g cooked)' },
    white_rice:       { cal: 130, carb: 28,  protein: 2.5, fat: 0.3, fiber: 0.4, gi: 73, serving: 100, unit: '1 katori (100g cooked)' },
    brown_rice:       { cal: 112, carb: 24,  protein: 2.5, fat: 0.9, fiber: 1.8, gi: 50, serving: 100, unit: '1 katori (100g cooked)' },
    jeera_rice:       { cal: 180, carb: 30,  protein: 3,   fat: 5,   fiber: 0.5, gi: 70, serving: 150, unit: '1 serving' },
    biryani:          { cal: 290, carb: 38,  protein: 12,  fat: 10,  fiber: 1,   gi: 72, serving: 200, unit: '1 plate (200g)' },
    chicken_biryani:  { cal: 310, carb: 35,  protein: 16,  fat: 12,  fiber: 1,   gi: 70, serving: 200, unit: '1 plate (200g)' },
    veg_biryani:      { cal: 250, carb: 38,  protein: 6,   fat: 8,   fiber: 2,   gi: 68, serving: 200, unit: '1 plate (200g)' },
    mutton_biryani:   { cal: 340, carb: 35,  protein: 18,  fat: 15,  fiber: 1,   gi: 70, serving: 200, unit: '1 plate (200g)' },
    pulao:            { cal: 210, carb: 32,  protein: 4,   fat: 7,   fiber: 1,   gi: 68, serving: 150, unit: '1 serving' },
    veg_pulao:        { cal: 210, carb: 32,  protein: 4,   fat: 7,   fiber: 1.5, gi: 65, serving: 150, unit: '1 serving' },
    khichdi:          { cal: 200, carb: 30,  protein: 7,   fat: 5,   fiber: 2,   gi: 58, serving: 200, unit: '1 bowl (200g)' },
    dal_khichdi:      { cal: 200, carb: 30,  protein: 7,   fat: 5,   fiber: 2,   gi: 58, serving: 200, unit: '1 bowl (200g)' },
    curd_rice:        { cal: 190, carb: 30,  protein: 5,   fat: 5,   fiber: 0.5, gi: 60, serving: 200, unit: '1 bowl (200g)' },
    lemon_rice:       { cal: 200, carb: 32,  protein: 3,   fat: 6,   fiber: 0.5, gi: 70, serving: 150, unit: '1 serving' },
    tamarind_rice:    { cal: 220, carb: 34,  protein: 3,   fat: 7,   fiber: 1,   gi: 68, serving: 150, unit: '1 serving' },
    poha:             { cal: 180, carb: 30,  protein: 3,   fat: 5,   fiber: 1,   gi: 64, serving: 150, unit: '1 plate (150g)' },
    flattened_rice:   { cal: 180, carb: 30,  protein: 3,   fat: 5,   fiber: 1,   gi: 64, serving: 150, unit: '1 plate (150g)' },

    // ── Dals & Lentils ──────────────────────────────────────────────
    dal:              { cal: 120, carb: 16,  protein: 7,   fat: 3,   fiber: 3,   gi: 42, serving: 150, unit: '1 katori (150ml)' },
    dal_fry:          { cal: 140, carb: 16,  protein: 7,   fat: 5,   fiber: 3,   gi: 42, serving: 150, unit: '1 katori' },
    toor_dal:         { cal: 120, carb: 16,  protein: 7,   fat: 3,   fiber: 3,   gi: 42, serving: 150, unit: '1 katori' },
    moong_dal:        { cal: 110, carb: 14,  protein: 7,   fat: 3,   fiber: 2.5, gi: 38, serving: 150, unit: '1 katori' },
    masoor_dal:       { cal: 115, carb: 15,  protein: 7,   fat: 3,   fiber: 3,   gi: 42, serving: 150, unit: '1 katori' },
    chana_dal:        { cal: 130, carb: 17,  protein: 8,   fat: 3.5, fiber: 4,   gi: 35, serving: 150, unit: '1 katori' },
    urad_dal:         { cal: 120, carb: 14,  protein: 8,   fat: 3.5, fiber: 3,   gi: 43, serving: 150, unit: '1 katori' },
    dal_tadka:        { cal: 150, carb: 16,  protein: 7,   fat: 6,   fiber: 3,   gi: 42, serving: 150, unit: '1 katori' },
    dal_makhani:      { cal: 230, carb: 20,  protein: 9,   fat: 12,  fiber: 4,   gi: 40, serving: 200, unit: '1 bowl (200g)' },
    sambar:           { cal: 130, carb: 18,  protein: 6,   fat: 3,   fiber: 3,   gi: 45, serving: 200, unit: '1 katori (200ml)' },
    sambhar:          { cal: 130, carb: 18,  protein: 6,   fat: 3,   fiber: 3,   gi: 45, serving: 200, unit: '1 katori (200ml)' },
    rasam:            { cal: 50,  carb: 8,   protein: 2,   fat: 1,   fiber: 1,   gi: 40, serving: 200, unit: '1 katori (200ml)' },
    rajma:            { cal: 180, carb: 22,  protein: 9,   fat: 5,   fiber: 5,   gi: 35, serving: 200, unit: '1 katori (200g)' },
    rajma_chawal:     { cal: 340, carb: 52,  protein: 12,  fat: 8,   fiber: 5,   gi: 55, serving: 350, unit: '1 plate' },
    chole:            { cal: 200, carb: 24,  protein: 9,   fat: 7,   fiber: 5,   gi: 36, serving: 200, unit: '1 katori (200g)' },
    chana_masala:     { cal: 200, carb: 24,  protein: 9,   fat: 7,   fiber: 5,   gi: 36, serving: 200, unit: '1 katori' },
    chole_bhature:    { cal: 450, carb: 54,  protein: 14,  fat: 19,  fiber: 5,   gi: 65, serving: 300, unit: '1 plate' },
    kadhi:            { cal: 150, carb: 14,  protein: 5,   fat: 8,   fiber: 1,   gi: 42, serving: 200, unit: '1 katori (200ml)' },
    kadhi_pakora:     { cal: 200, carb: 18,  protein: 6,   fat: 11,  fiber: 1.5, gi: 45, serving: 250, unit: '1 bowl' },
    dal_chawal:       { cal: 280, carb: 46,  protein: 10,  fat: 5,   fiber: 3.5, gi: 58, serving: 300, unit: '1 plate (dal + rice)' },

    // ── Paneer & Vegetarian Curries ─────────────────────────────────
    paneer_butter_masala: { cal: 320, carb: 12, protein: 14, fat: 24, fiber: 1, gi: 30, serving: 200, unit: '1 bowl (200g)' },
    shahi_paneer:     { cal: 340, carb: 14,  protein: 14,  fat: 26,  fiber: 1,   gi: 28, serving: 200, unit: '1 bowl (200g)' },
    palak_paneer:     { cal: 260, carb: 10,  protein: 14,  fat: 18,  fiber: 3,   gi: 25, serving: 200, unit: '1 bowl (200g)' },
    matar_paneer:     { cal: 270, carb: 16,  protein: 13,  fat: 18,  fiber: 3,   gi: 35, serving: 200, unit: '1 bowl (200g)' },
    paneer_tikka:     { cal: 200, carb: 6,   protein: 14,  fat: 14,  fiber: 1,   gi: 25, serving: 120, unit: '4-5 pieces' },
    paneer_bhurji:    { cal: 250, carb: 8,   protein: 15,  fat: 18,  fiber: 1,   gi: 25, serving: 150, unit: '1 serving' },
    aloo_gobi:        { cal: 150, carb: 18,  protein: 3,   fat: 7,   fiber: 3,   gi: 50, serving: 200, unit: '1 katori (200g)' },
    aloo_matar:       { cal: 160, carb: 20,  protein: 4,   fat: 7,   fiber: 3,   gi: 52, serving: 200, unit: '1 katori' },
    aloo_sabzi:       { cal: 140, carb: 18,  protein: 2,   fat: 6,   fiber: 2,   gi: 60, serving: 200, unit: '1 katori' },
    baingan_bharta:   { cal: 120, carb: 10,  protein: 3,   fat: 8,   fiber: 4,   gi: 30, serving: 200, unit: '1 katori' },
    bhindi_masala:    { cal: 100, carb: 8,   protein: 3,   fat: 6,   fiber: 3,   gi: 28, serving: 150, unit: '1 katori' },
    lauki_sabzi:      { cal: 80,  carb: 8,   protein: 2,   fat: 4,   fiber: 2,   gi: 25, serving: 200, unit: '1 katori' },
    mixed_veg:        { cal: 130, carb: 14,  protein: 3,   fat: 6,   fiber: 3,   gi: 40, serving: 200, unit: '1 katori' },
    mixed_vegetable:  { cal: 130, carb: 14,  protein: 3,   fat: 6,   fiber: 3,   gi: 40, serving: 200, unit: '1 katori' },
    sabzi:            { cal: 120, carb: 12,  protein: 3,   fat: 6,   fiber: 3,   gi: 40, serving: 200, unit: '1 katori' },
    pav_bhaji:        { cal: 380, carb: 50,  protein: 8,   fat: 16,  fiber: 4,   gi: 68, serving: 250, unit: '1 plate' },
    malai_kofta:      { cal: 350, carb: 20,  protein: 10,  fat: 26,  fiber: 2,   gi: 40, serving: 250, unit: '1 bowl' },

    // ── Non-Veg Curries ─────────────────────────────────────────────
    chicken_curry:    { cal: 240, carb: 8,   protein: 22,  fat: 14,  fiber: 1,   gi: 20, serving: 200, unit: '1 bowl (200g)' },
    butter_chicken:   { cal: 320, carb: 12,  protein: 20,  fat: 22,  fiber: 1,   gi: 25, serving: 200, unit: '1 bowl (200g)' },
    chicken_tikka_masala: { cal: 300, carb: 10, protein: 22, fat: 20, fiber: 1, gi: 25, serving: 200, unit: '1 bowl (200g)' },
    tandoori_chicken: { cal: 220, carb: 4,   protein: 28,  fat: 10,  fiber: 0.5, gi: 15, serving: 150, unit: '2 pieces' },
    chicken_tikka:    { cal: 180, carb: 4,   protein: 24,  fat: 8,   fiber: 0.5, gi: 15, serving: 120, unit: '4-5 pieces' },
    mutton_curry:     { cal: 300, carb: 8,   protein: 22,  fat: 20,  fiber: 1,   gi: 20, serving: 200, unit: '1 bowl (200g)' },
    keema:            { cal: 280, carb: 8,   protein: 20,  fat: 18,  fiber: 1,   gi: 22, serving: 200, unit: '1 bowl (200g)' },
    fish_curry:       { cal: 200, carb: 8,   protein: 20,  fat: 10,  fiber: 1,   gi: 20, serving: 200, unit: '1 bowl (200g)' },
    fish_fry:         { cal: 180, carb: 6,   protein: 18,  fat: 10,  fiber: 0.5, gi: 20, serving: 100, unit: '1 piece' },
    egg_curry:        { cal: 220, carb: 10,  protein: 14,  fat: 14,  fiber: 1,   gi: 25, serving: 200, unit: '1 bowl (2 eggs)' },
    prawn_curry:      { cal: 180, carb: 8,   protein: 18,  fat: 8,   fiber: 1,   gi: 20, serving: 200, unit: '1 bowl' },

    // ── Eggs ────────────────────────────────────────────────────────
    egg:              { cal: 78,  carb: 0.6, protein: 6,   fat: 5,   fiber: 0,   gi: 0,  serving: 50,  unit: '1 boiled egg' },
    boiled_egg:       { cal: 78,  carb: 0.6, protein: 6,   fat: 5,   fiber: 0,   gi: 0,  serving: 50,  unit: '1 egg' },
    omelette:         { cal: 155, carb: 1,   protein: 10,  fat: 12,  fiber: 0,   gi: 0,  serving: 80,  unit: '1 omelette (2 eggs)' },
    egg_bhurji:       { cal: 170, carb: 3,   protein: 11,  fat: 12,  fiber: 0.5, gi: 5,  serving: 100, unit: '1 serving' },
    anda_bhurji:      { cal: 170, carb: 3,   protein: 11,  fat: 12,  fiber: 0.5, gi: 5,  serving: 100, unit: '1 serving' },

    // ── Snacks & Street Food ────────────────────────────────────────
    samosa:           { cal: 252, carb: 24,  protein: 5,   fat: 15,  fiber: 2,   gi: 65, serving: 80,  unit: '1 samosa' },
    pakora:           { cal: 180, carb: 16,  protein: 4,   fat: 11,  fiber: 1,   gi: 55, serving: 60,  unit: '4-5 pieces' },
    bhajia:           { cal: 180, carb: 16,  protein: 4,   fat: 11,  fiber: 1,   gi: 55, serving: 60,  unit: '4-5 pieces' },
    kachori:          { cal: 200, carb: 22,  protein: 4,   fat: 10,  fiber: 1.5, gi: 65, serving: 60,  unit: '1 kachori' },
    aloo_tikki:       { cal: 160, carb: 20,  protein: 3,   fat: 7,   fiber: 1.5, gi: 60, serving: 70,  unit: '1 piece' },
    chaat:            { cal: 200, carb: 28,  protein: 5,   fat: 8,   fiber: 2,   gi: 55, serving: 150, unit: '1 plate' },
    pani_puri:        { cal: 180, carb: 28,  protein: 3,   fat: 6,   fiber: 1.5, gi: 60, serving: 120, unit: '6 pieces' },
    golgappa:         { cal: 180, carb: 28,  protein: 3,   fat: 6,   fiber: 1.5, gi: 60, serving: 120, unit: '6 pieces' },
    bhel_puri:        { cal: 200, carb: 30,  protein: 4,   fat: 7,   fiber: 2,   gi: 58, serving: 150, unit: '1 plate' },
    sev_puri:         { cal: 220, carb: 26,  protein: 4,   fat: 11,  fiber: 2,   gi: 60, serving: 120, unit: '1 plate' },
    dabeli:           { cal: 250, carb: 32,  protein: 5,   fat: 11,  fiber: 2,   gi: 62, serving: 120, unit: '1 dabeli' },
    vada_pav:         { cal: 290, carb: 36,  protein: 6,   fat: 13,  fiber: 2,   gi: 68, serving: 120, unit: '1 vada pav' },
    pav:              { cal: 120, carb: 22,  protein: 3,   fat: 2,   fiber: 0.5, gi: 72, serving: 40,  unit: '1 pav' },
    bread:            { cal: 80,  carb: 14,  protein: 3,   fat: 1,   fiber: 0.5, gi: 75, serving: 30,  unit: '1 slice' },
    sandwich:         { cal: 200, carb: 28,  protein: 6,   fat: 7,   fiber: 1.5, gi: 65, serving: 120, unit: '1 sandwich' },
    dhokla:           { cal: 130, carb: 20,  protein: 5,   fat: 3,   fiber: 1,   gi: 45, serving: 80,  unit: '2 pieces' },
    khandvi:          { cal: 120, carb: 14,  protein: 5,   fat: 4,   fiber: 1,   gi: 42, serving: 80,  unit: '3-4 rolls' },
    handvo:           { cal: 160, carb: 22,  protein: 5,   fat: 5,   fiber: 2,   gi: 48, serving: 100, unit: '1 piece' },

    // ── Chutney & Accompaniments ────────────────────────────────────
    coconut_chutney:  { cal: 60,  carb: 4,   protein: 1,   fat: 4,   fiber: 1,   gi: 25, serving: 30,  unit: '2 tbsp' },
    mint_chutney:     { cal: 15,  carb: 2,   protein: 0.5, fat: 0.5, fiber: 0.5, gi: 15, serving: 20,  unit: '2 tbsp' },
    tomato_chutney:   { cal: 40,  carb: 5,   protein: 0.5, fat: 2,   fiber: 0.5, gi: 30, serving: 30,  unit: '2 tbsp' },
    pickle:           { cal: 30,  carb: 2,   protein: 0.5, fat: 2,   fiber: 0.5, gi: 15, serving: 15,  unit: '1 tbsp' },
    raita:            { cal: 60,  carb: 5,   protein: 2,   fat: 3,   fiber: 0.5, gi: 25, serving: 100, unit: '1 katori' },
    papad:            { cal: 45,  carb: 7,   protein: 2,   fat: 1,   fiber: 0.5, gi: 55, serving: 10,  unit: '1 papad' },

    // ── Chilla (Besan / Moong) ──────────────────────────────────────
    besan_chilla:     { cal: 130, carb: 14,  protein: 6,   fat: 5,   fiber: 2,   gi: 38, serving: 60,  unit: '1 chilla' },
    moong_chilla:     { cal: 110, carb: 12,  protein: 7,   fat: 3,   fiber: 2,   gi: 35, serving: 60,  unit: '1 chilla' },
    chilla:           { cal: 120, carb: 13,  protein: 6,   fat: 4,   fiber: 2,   gi: 36, serving: 60,  unit: '1 chilla' },

    // ── Beverages ───────────────────────────────────────────────────
    tea:              { cal: 30,  carb: 5,   protein: 1,   fat: 0.5, fiber: 0,   gi: 25, serving: 150, unit: '1 cup (with milk, sugar)' },
    chai:             { cal: 30,  carb: 5,   protein: 1,   fat: 0.5, fiber: 0,   gi: 25, serving: 150, unit: '1 cup' },
    tea_without_sugar:{ cal: 12,  carb: 1,   protein: 1,   fat: 0.5, fiber: 0,   gi: 10, serving: 150, unit: '1 cup (no sugar)' },
    black_tea:        { cal: 2,   carb: 0.5, protein: 0,   fat: 0,   fiber: 0,   gi: 0,  serving: 150, unit: '1 cup' },
    green_tea:        { cal: 2,   carb: 0.5, protein: 0,   fat: 0,   fiber: 0,   gi: 0,  serving: 150, unit: '1 cup' },
    coffee:           { cal: 35,  carb: 5,   protein: 1,   fat: 1,   fiber: 0,   gi: 25, serving: 150, unit: '1 cup (with milk, sugar)' },
    black_coffee:     { cal: 5,   carb: 0.5, protein: 0.3, fat: 0,   fiber: 0,   gi: 0,  serving: 150, unit: '1 cup' },
    filter_coffee:    { cal: 80,  carb: 10,  protein: 2,   fat: 3,   fiber: 0,   gi: 30, serving: 150, unit: '1 cup' },
    lassi:            { cal: 150, carb: 22,  protein: 4,   fat: 4,   fiber: 0,   gi: 55, serving: 200, unit: '1 glass' },
    sweet_lassi:      { cal: 150, carb: 22,  protein: 4,   fat: 4,   fiber: 0,   gi: 55, serving: 200, unit: '1 glass' },
    chaas:            { cal: 40,  carb: 4,   protein: 2,   fat: 1.5, fiber: 0,   gi: 20, serving: 200, unit: '1 glass' },
    buttermilk:       { cal: 40,  carb: 4,   protein: 2,   fat: 1.5, fiber: 0,   gi: 20, serving: 200, unit: '1 glass' },
    nimbu_pani:       { cal: 50,  carb: 12,  protein: 0,   fat: 0,   fiber: 0,   gi: 40, serving: 200, unit: '1 glass' },
    jaljeera:         { cal: 30,  carb: 7,   protein: 0.5, fat: 0,   fiber: 0,   gi: 35, serving: 200, unit: '1 glass' },
    sugarcane_juice:  { cal: 180, carb: 42,  protein: 0.5, fat: 0,   fiber: 0,   gi: 75, serving: 250, unit: '1 glass' },
    mango_shake:      { cal: 200, carb: 35,  protein: 4,   fat: 5,   fiber: 1,   gi: 60, serving: 250, unit: '1 glass' },
    banana_shake:     { cal: 180, carb: 30,  protein: 5,   fat: 4,   fiber: 1,   gi: 55, serving: 250, unit: '1 glass' },
    milk:             { cal: 100, carb: 8,   protein: 5,   fat: 5,   fiber: 0,   gi: 30, serving: 200, unit: '1 glass (200ml)' },
    badam_milk:       { cal: 160, carb: 18,  protein: 6,   fat: 7,   fiber: 1,   gi: 35, serving: 200, unit: '1 glass' },
    haldi_doodh:      { cal: 110, carb: 10,  protein: 5,   fat: 5,   fiber: 0,   gi: 30, serving: 200, unit: '1 glass' },
    coconut_water:    { cal: 45,  carb: 9,   protein: 1.5, fat: 0.5, fiber: 1,   gi: 25, serving: 250, unit: '1 glass' },
    juice:            { cal: 100, carb: 22,  protein: 0.5, fat: 0.2, fiber: 0.5, gi: 55, serving: 200, unit: '1 glass' },

    // ── Dairy & Curd ────────────────────────────────────────────────
    curd:             { cal: 60,  carb: 5,   protein: 3,   fat: 3,   fiber: 0,   gi: 25, serving: 100, unit: '1 katori (100g)' },
    dahi:             { cal: 60,  carb: 5,   protein: 3,   fat: 3,   fiber: 0,   gi: 25, serving: 100, unit: '1 katori (100g)' },
    yogurt:           { cal: 60,  carb: 5,   protein: 3,   fat: 3,   fiber: 0,   gi: 25, serving: 100, unit: '1 katori (100g)' },
    paneer:           { cal: 265, carb: 3,   protein: 18,  fat: 20,  fiber: 0,   gi: 10, serving: 100, unit: '100g' },
    ghee:             { cal: 45,  carb: 0,   protein: 0,   fat: 5,   fiber: 0,   gi: 0,  serving: 5,   unit: '1 tsp (5g)' },
    butter:           { cal: 36,  carb: 0,   protein: 0,   fat: 4,   fiber: 0,   gi: 0,  serving: 5,   unit: '1 tsp (5g)' },

    // ── Sweets & Desserts ───────────────────────────────────────────
    gulab_jamun:      { cal: 150, carb: 22,  protein: 2,   fat: 6,   fiber: 0,   gi: 85, serving: 40,  unit: '1 piece' },
    rasgulla:         { cal: 130, carb: 22,  protein: 3,   fat: 3,   fiber: 0,   gi: 80, serving: 50,  unit: '1 piece' },
    jalebi:           { cal: 150, carb: 30,  protein: 1,   fat: 4,   fiber: 0,   gi: 90, serving: 40,  unit: '1 piece' },
    ladoo:            { cal: 200, carb: 28,  protein: 4,   fat: 8,   fiber: 1,   gi: 75, serving: 40,  unit: '1 piece' },
    laddoo:           { cal: 200, carb: 28,  protein: 4,   fat: 8,   fiber: 1,   gi: 75, serving: 40,  unit: '1 piece' },
    besan_ladoo:      { cal: 200, carb: 22,  protein: 5,   fat: 10,  fiber: 1,   gi: 68, serving: 35,  unit: '1 piece' },
    barfi:            { cal: 170, carb: 22,  protein: 4,   fat: 8,   fiber: 0,   gi: 72, serving: 35,  unit: '1 piece' },
    kaju_katli:       { cal: 180, carb: 18,  protein: 4,   fat: 10,  fiber: 0.5, gi: 65, serving: 30,  unit: '1 piece' },
    halwa:            { cal: 250, carb: 35,  protein: 4,   fat: 11,  fiber: 1,   gi: 78, serving: 100, unit: '1 serving (100g)' },
    gajar_halwa:      { cal: 250, carb: 35,  protein: 4,   fat: 11,  fiber: 1,   gi: 78, serving: 100, unit: '1 serving' },
    moong_dal_halwa:  { cal: 280, carb: 30,  protein: 6,   fat: 14,  fiber: 1.5, gi: 72, serving: 100, unit: '1 serving' },
    sooji_halwa:      { cal: 230, carb: 32,  protein: 3,   fat: 10,  fiber: 0.5, gi: 80, serving: 100, unit: '1 serving' },
    kheer:            { cal: 180, carb: 28,  protein: 5,   fat: 5,   fiber: 0.5, gi: 72, serving: 150, unit: '1 bowl' },
    rice_kheer:       { cal: 180, carb: 28,  protein: 5,   fat: 5,   fiber: 0.5, gi: 72, serving: 150, unit: '1 bowl' },
    payasam:          { cal: 200, carb: 32,  protein: 5,   fat: 6,   fiber: 0.5, gi: 75, serving: 150, unit: '1 bowl' },
    rabri:            { cal: 250, carb: 25,  protein: 7,   fat: 14,  fiber: 0,   gi: 65, serving: 100, unit: '1 katori' },
    kulfi:            { cal: 180, carb: 20,  protein: 5,   fat: 9,   fiber: 0,   gi: 58, serving: 80,  unit: '1 stick' },
    ice_cream:        { cal: 200, carb: 24,  protein: 3,   fat: 10,  fiber: 0,   gi: 62, serving: 100, unit: '1 scoop' },
    mithhai:          { cal: 180, carb: 25,  protein: 3,   fat: 7,   fiber: 0,   gi: 72, serving: 40,  unit: '1 piece' },
    sweet:            { cal: 180, carb: 25,  protein: 3,   fat: 7,   fiber: 0,   gi: 72, serving: 40,  unit: '1 piece' },

    // ── Fruits ──────────────────────────────────────────────────────
    banana:           { cal: 89,  carb: 23,  protein: 1,   fat: 0.3, fiber: 2.6, gi: 51, serving: 100, unit: '1 medium banana' },
    apple:            { cal: 52,  carb: 14,  protein: 0.3, fat: 0.2, fiber: 2.4, gi: 39, serving: 130, unit: '1 medium apple' },
    mango:            { cal: 60,  carb: 15,  protein: 0.5, fat: 0.3, fiber: 1.6, gi: 56, serving: 100, unit: '1 cup sliced' },
    orange:           { cal: 47,  carb: 12,  protein: 1,   fat: 0.1, fiber: 2.4, gi: 43, serving: 130, unit: '1 medium' },
    papaya:           { cal: 43,  carb: 11,  protein: 0.5, fat: 0.3, fiber: 1.7, gi: 60, serving: 150, unit: '1 cup' },
    watermelon:       { cal: 30,  carb: 8,   protein: 0.5, fat: 0.2, fiber: 0.4, gi: 72, serving: 150, unit: '1 cup' },
    grapes:           { cal: 69,  carb: 18,  protein: 0.7, fat: 0.2, fiber: 0.9, gi: 53, serving: 100, unit: '1 cup' },
    guava:            { cal: 68,  carb: 14,  protein: 2.5, fat: 1,   fiber: 5.4, gi: 30, serving: 100, unit: '1 medium' },
    pomegranate:      { cal: 83,  carb: 19,  protein: 1.7, fat: 1.2, fiber: 4,   gi: 35, serving: 100, unit: '1/2 cup seeds' },
    chiku:            { cal: 83,  carb: 20,  protein: 0.4, fat: 1.1, fiber: 5.3, gi: 55, serving: 100, unit: '1 medium' },
    dates:            { cal: 66,  carb: 18,  protein: 0.4, fat: 0,   fiber: 1.6, gi: 42, serving: 25,  unit: '2 dates' },

    // ── Nuts & Seeds ────────────────────────────────────────────────
    almonds:          { cal: 160, carb: 6,   protein: 6,   fat: 14,  fiber: 3.5, gi: 15, serving: 28,  unit: '10-12 almonds' },
    cashews:          { cal: 155, carb: 9,   protein: 5,   fat: 12,  fiber: 1,   gi: 22, serving: 28,  unit: '15-18 cashews' },
    walnuts:          { cal: 185, carb: 4,   protein: 4,   fat: 18,  fiber: 2,   gi: 15, serving: 28,  unit: '7 halves' },
    peanuts:          { cal: 160, carb: 5,   protein: 7,   fat: 14,  fiber: 2.4, gi: 14, serving: 28,  unit: '1 handful' },
    makhana:          { cal: 100, carb: 18,  protein: 3,   fat: 0.5, fiber: 1,   gi: 25, serving: 30,  unit: '1 bowl (30g)' },
    flaxseeds:        { cal: 55,  carb: 3,   protein: 2,   fat: 4,   fiber: 3,   gi: 10, serving: 10,  unit: '1 tbsp' },
    chia_seeds:       { cal: 50,  carb: 4,   protein: 2,   fat: 3,   fiber: 3.5, gi: 10, serving: 10,  unit: '1 tbsp' },

    // ── Oats & Cereals ──────────────────────────────────────────────
    oats:             { cal: 150, carb: 25,  protein: 5,   fat: 3,   fiber: 4,   gi: 55, serving: 40,  unit: '1 bowl (40g dry)' },
    oatmeal:          { cal: 150, carb: 25,  protein: 5,   fat: 3,   fiber: 4,   gi: 55, serving: 40,  unit: '1 bowl' },
    muesli:           { cal: 180, carb: 30,  protein: 5,   fat: 4,   fiber: 3,   gi: 50, serving: 50,  unit: '1 bowl (50g)' },
    cornflakes:       { cal: 150, carb: 32,  protein: 2,   fat: 0.5, fiber: 0.5, gi: 82, serving: 40,  unit: '1 bowl (40g)' },
    daliya:           { cal: 160, carb: 28,  protein: 5,   fat: 2,   fiber: 4,   gi: 48, serving: 150, unit: '1 bowl (150g cooked)' },
    dalia:            { cal: 160, carb: 28,  protein: 5,   fat: 2,   fiber: 4,   gi: 48, serving: 150, unit: '1 bowl (150g cooked)' },

    // ── Sprouts & Salads ────────────────────────────────────────────
    sprouts:          { cal: 80,  carb: 10,  protein: 6,   fat: 1,   fiber: 3,   gi: 28, serving: 100, unit: '1 katori' },
    moong_sprouts:    { cal: 80,  carb: 10,  protein: 6,   fat: 1,   fiber: 3,   gi: 28, serving: 100, unit: '1 katori' },
    salad:            { cal: 40,  carb: 6,   protein: 1,   fat: 1,   fiber: 2,   gi: 15, serving: 100, unit: '1 katori' },
    cucumber:         { cal: 15,  carb: 3,   protein: 0.5, fat: 0,   fiber: 0.5, gi: 15, serving: 100, unit: '1 cup sliced' },
    tomato:           { cal: 18,  carb: 4,   protein: 1,   fat: 0.2, fiber: 1.2, gi: 15, serving: 100, unit: '1 medium' },

    // ── Poriyal & South Indian Sides ────────────────────────────────
    poriyal:          { cal: 80,  carb: 8,   protein: 2,   fat: 4,   fiber: 3,   gi: 30, serving: 100, unit: '1 katori' },
    kootu:            { cal: 110, carb: 12,  protein: 5,   fat: 4,   fiber: 3,   gi: 35, serving: 150, unit: '1 katori' },
    avial:            { cal: 120, carb: 10,  protein: 3,   fat: 7,   fiber: 3,   gi: 30, serving: 150, unit: '1 katori' },
    thoran:           { cal: 80,  carb: 6,   protein: 2,   fat: 5,   fiber: 3,   gi: 25, serving: 100, unit: '1 katori' },

    // ── Millet-based ────────────────────────────────────────────────
    ragi_mudde:       { cal: 140, carb: 28,  protein: 4,   fat: 1,   fiber: 4,   gi: 45, serving: 100, unit: '1 ball' },
    ragi_dosa:        { cal: 100, carb: 18,  protein: 3,   fat: 2,   fiber: 3,   gi: 42, serving: 60,  unit: '1 dosa' },
    bajra_khichdi:    { cal: 190, carb: 28,  protein: 6,   fat: 5,   fiber: 4,   gi: 45, serving: 200, unit: '1 bowl' },

    // ── Combo plates (common descriptions) ──────────────────────────
    thali:            { cal: 700, carb: 100, protein: 18,  fat: 22,  fiber: 8,   gi: 60, serving: 500, unit: '1 full thali' },
    south_indian_meals: { cal: 650, carb: 95, protein: 15, fat: 20,  fiber: 7,   gi: 62, serving: 500, unit: '1 full meals' },
};

/**
 * Alias map: common misspellings, regional names, and alternate forms
 * mapped to canonical keys in INDIAN_FOOD_DB.
 */
const FOOD_ALIASES = {
    // Spelling variants
    'idly': 'idli', 'idlis': 'idli', 'idle': 'idli', 'idlies': 'idli',
    'dosas': 'dosa', 'dosai': 'dosa', 'dosae': 'dosa',
    'rotis': 'roti', 'chapatis': 'chapati', 'chapathi': 'chapati', 'chapattis': 'chapati',
    'parathas': 'paratha', 'pratha': 'paratha', 'parantha': 'paratha',
    'naans': 'naan', 'nan': 'naan',
    'puris': 'puri', 'poori': 'puri', 'pooris': 'puri',
    'samosas': 'samosa',
    'pakoras': 'pakora', 'pakoda': 'pakora', 'pakodas': 'pakora', 'bhajiya': 'bhajia',
    'vadas': 'vada', 'wade': 'vada', 'bada': 'vada', 'bara': 'vada',
    'sambhaji': 'sambar', 'sambaar': 'sambar', 'sambar': 'sambar',
    'biryaani': 'biryani', 'biriyani': 'biryani',
    'pulav': 'pulao', 'pilaf': 'pulao', 'pilau': 'pulao',
    'kitchdi': 'khichdi', 'kichdi': 'khichdi', 'kitchri': 'khichdi',
    'rajmah': 'rajma',
    'choley': 'chole', 'chholey': 'chole', 'channay': 'chole',
    'daal': 'dal', 'dhal': 'dal', 'dhaal': 'dal',
    'panir': 'paneer',
    'chappati': 'chapati',
    'aloo_ka_paratha': 'aloo_paratha',
    'potato_paratha': 'aloo_paratha',
    'egg_omelette': 'omelette', 'omelete': 'omelette', 'omlet': 'omelette',
    'eggs': 'egg', 'anda': 'egg', 'boiled_eggs': 'boiled_egg',
    'phulke': 'phulka',
    'bhaturas': 'bhatura', 'bhature': 'bhatura',
    'chawal': 'rice', 'bhaat': 'rice', 'bhat': 'rice',
    'plain_rice': 'rice', 'steamed_rice': 'rice',
    'sabji': 'sabzi', 'subzi': 'sabzi', 'subji': 'sabzi',
    'dal_rice': 'dal_chawal', 'daal_chawal': 'dal_chawal', 'daal_rice': 'dal_chawal',
    'chai_tea': 'chai', 'masala_chai': 'chai',
    'kaapi': 'filter_coffee',
    'rasgullas': 'rasgulla',
    'gulab_jamuns': 'gulab_jamun',
    'jalebis': 'jalebi',
    'laddu': 'ladoo', 'laddus': 'ladoo', 'ladoos': 'ladoo',
    'pohe': 'poha', 'pohay': 'poha',
    'dahee': 'dahi', 'curds': 'curd',
    'makhane': 'makhana', 'fox_nuts': 'makhana',
    'mattar_paneer': 'matar_paneer', 'mutter_paneer': 'matar_paneer',
    'palak': 'palak_paneer',
    'saag_paneer': 'palak_paneer', 'saag': 'palak_paneer',
    'bhindi': 'bhindi_masala', 'okra': 'bhindi_masala', 'lady_finger': 'bhindi_masala',
    'baingan': 'baingan_bharta', 'brinjal': 'baingan_bharta',
    'aloo': 'aloo_sabzi', 'potato': 'aloo_sabzi',
    'raayata': 'raita', 'rayata': 'raita',
    'badam': 'almonds', 'kaju': 'cashews', 'akhrot': 'walnuts',
    'moongfali': 'peanuts', 'mungfali': 'peanuts',
    'kela': 'banana', 'seb': 'apple', 'aam': 'mango', 'santra': 'orange',
    'fruit': 'apple',
    'meetha': 'sweet', 'mithai': 'mithhai',
    'ragi_ball': 'ragi_mudde', 'ragi_balls': 'ragi_mudde',
    'uttappam': 'uttapam',
    'upama': 'upma',
    'gosht': 'mutton_curry', 'goat_curry': 'mutton_curry', 'lamb_curry': 'mutton_curry',
    'murgh': 'chicken_curry', 'chicken': 'chicken_curry',
    'machhi': 'fish_curry', 'machli': 'fish_curry', 'fish': 'fish_curry',
    'jhinga': 'prawn_curry', 'prawns': 'prawn_curry', 'shrimp': 'prawn_curry',
    'kheema': 'keema', 'qeema': 'keema', 'mince': 'keema',
    'gobi': 'aloo_gobi', 'cauliflower': 'aloo_gobi',
    'bhature': 'bhatura',
    'pav_bhajee': 'pav_bhaji',
    'veg': 'mixed_veg', 'vegetable': 'mixed_vegetable', 'vegetables': 'mixed_vegetable',
    'sprout': 'sprouts', 'ankurit': 'sprouts',
    'doodh': 'milk', 'dudh': 'milk',
    'nimbu_paani': 'nimbu_pani', 'lemon_water': 'nimbu_pani', 'shikanji': 'nimbu_pani',
    'lemon_juice': 'nimbu_pani',
    'ganne_ka_ras': 'sugarcane_juice',
    'dahibare': 'raita', 'dahi_vada': 'raita',
    'papadam': 'papad', 'pappadom': 'papad', 'pappad': 'papad',
    'makke_ki_roti': 'makki_roti', 'makki_di_roti': 'makki_roti',
    'sarson_da_saag': 'palak_paneer',
    'wheat_porridge': 'daliya', 'broken_wheat': 'daliya',
    'sevpuri': 'sev_puri',
    'bhelpuri': 'bhel_puri',
    'puchka': 'pani_puri', 'golgappe': 'pani_puri', 'gol_gappe': 'pani_puri',
    'aachari': 'pickle', 'achaar': 'pickle', 'achar': 'pickle',
    'butter_roti': 'roti',
    'ghevar': 'sweet',
    'imarti': 'jalebi',
    'rabdi': 'rabri',
    'seviyan': 'kheer', 'vermicelli': 'kheer',
    'phirni': 'kheer',
    'ras_malai': 'rasgulla', 'rasmalai': 'rasgulla',
    'sandesh': 'barfi',
    'schezwan': 'schezwan_fried_rice', 'shezwan': 'schezwan_fried_rice',
    'szechuan': 'schezwan_fried_rice', 'schezwan_rice': 'schezwan_fried_rice',
    'schezwan_fried_rice': 'schezwan_fried_rice',
    'triple_schezwan': 'triple_schezwan_fried_rice',
    'triple_schezwan_rice': 'triple_schezwan_fried_rice',
    'triple_schezwan_fried_rice': 'triple_schezwan_fried_rice',
    'triple_schezwan_fried': 'triple_schezwan_fried_rice',
    'hakka_noodles': 'veg_hakka_noodles',
    'veg_hakka': 'veg_hakka_noodles',
    'chicken_hakka': 'chicken_hakka_noodles',
    'chilli_paneer': 'paneer_chilli_dry', 'chilly_paneer': 'paneer_chilli_dry',
    'chilli_chicken': 'chicken_chilli_dry', 'chilly_chicken': 'chicken_chilli_dry',
    'manchurian': 'veg_manchurian_gravy',
    'gobi_manchurian': 'gobi_manchurian',
    'chicken_manchurian': 'chicken_manchurian',
    'schezwan_noodles': 'schezwan_noodles',
    'paneer_fried_rice': 'paneer_fried_rice',
    'cheese_rice': 'cheese_corn_rice',
    'cheese_on_rice': 'cheese_corn_rice',
    'triple_cheese_rice': 'cheese_corn_rice',
    'triple_cheese_on_rice': 'cheese_corn_rice',
    'triple_cheese_on': 'cheese_corn_rice',
    'triple_cheese_pizza': 'triple_cheese_pizza_slice',
};

function normalizeExternalFoodKey(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/['"`]/g, '')
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_+/g, '_');
}

function toFiniteNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function parseDelimitedLine(line, delimiter) {
    const out = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];

        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (ch === delimiter && !inQuotes) {
            out.push(current.trim());
            current = '';
            continue;
        }

        current += ch;
    }

    out.push(current.trim());
    return out;
}

function inferGiFromRow(category, carbs) {
    const safeCategory = normalizeExternalFoodKey(category || '');
    const carb = Number.isFinite(carbs) ? carbs : 0;
    const fallback = Object.prototype.hasOwnProperty.call(DEFAULT_GI_BY_CATEGORY, safeCategory)
        ? DEFAULT_GI_BY_CATEGORY[safeCategory]
        : 55;

    if (fallback === 0) return 0;
    if (carb >= 40) return Math.min(95, fallback + 10);
    if (carb <= 8) return Math.max(5, fallback - 10);
    return fallback;
}

function inferServingUnit(size, unit) {
    const servingSize = Number.isFinite(size) ? size : null;
    const servingUnit = String(unit || '').trim().toLowerCase();
    if (!servingSize || !servingUnit) return '1 serving';
    return '1 serving (' + servingSize + servingUnit + ')';
}

function addAliasIfMissing(aliasKey, canonicalKey) {
    if (!aliasKey || !canonicalKey || aliasKey === canonicalKey) return;
    if (INDIAN_FOOD_DB[aliasKey]) return;
    if (FOOD_ALIASES[aliasKey]) return;
    FOOD_ALIASES[aliasKey] = canonicalKey;
}

function loadGlobalFoodDataset() {
    if (!fs.existsSync(GLOBAL_FOOD_DATA_PATH)) return;

    try {
        const raw = fs.readFileSync(GLOBAL_FOOD_DATA_PATH, 'utf8');
        const lines = raw
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

        if (lines.length < 2) return;

        const headers = parseDelimitedLine(lines[0], '\t');
        const headerIndex = headers.reduce((acc, header, idx) => {
            acc[header] = idx;
            return acc;
        }, {});

        for (let i = 1; i < lines.length; i++) {
            const row = parseDelimitedLine(lines[i], '\t');
            const foodItem = row[headerIndex.Food_Item] || '';
            if (!foodItem) continue;

            const key = normalizeExternalFoodKey(foodItem);
            if (!key) continue;

            const category = row[headerIndex.Category] || '';
            const serving = toFiniteNumber(row[headerIndex.Serving_Size]);
            const servingUnitRaw = row[headerIndex.Serving_Unit] || '';
            const calories = toFiniteNumber(row[headerIndex.Calories_kcal]);
            const carbs = toFiniteNumber(row[headerIndex.Carbohydrates_g]);
            const protein = toFiniteNumber(row[headerIndex.Protein_g]);
            const fat = toFiniteNumber(row[headerIndex.Total_Fat_g]);
            const fiber = toFiniteNumber(row[headerIndex.Fiber_g]);
            const sugar = toFiniteNumber(row[headerIndex.Sugar_g]);
            const sodium = toFiniteNumber(row[headerIndex.Sodium_mg]);
            const cholesterol = toFiniteNumber(row[headerIndex.Cholesterol_mg]);
            const satFat = toFiniteNumber(row[headerIndex.Saturated_Fat_g]);
            const unsatFat = toFiniteNumber(row[headerIndex.Unsaturated_Fat_g]);

            if (calories === null || carbs === null || protein === null || fat === null || fiber === null) {
                continue;
            }

            const existing = INDIAN_FOOD_DB[key] || {};
            INDIAN_FOOD_DB[key] = {
                ...existing,
                cal: calories,
                carb: carbs,
                protein: protein,
                fat: fat,
                fiber: fiber,
                gi: Number.isFinite(existing.gi) ? existing.gi : inferGiFromRow(category, carbs),
                serving: serving !== null ? serving : (Number.isFinite(existing.serving) ? existing.serving : 100),
                unit: inferServingUnit(serving, servingUnitRaw) || existing.unit || '1 serving',
                sugar: sugar !== null ? sugar : existing.sugar,
                sodium: sodium !== null ? sodium : existing.sodium,
                cholesterol: cholesterol !== null ? cholesterol : existing.cholesterol,
                saturated_fat: satFat !== null ? satFat : existing.saturated_fat,
                unsaturated_fat: unsatFat !== null ? unsatFat : existing.unsaturated_fat,
            };

            const simplifiedKey = normalizeExternalFoodKey(String(foodItem).replace(/\([^)]*\)/g, ' '));
            addAliasIfMissing(simplifiedKey, key);

            const simpleTokens = simplifiedKey.split('_').filter(Boolean);
            if (simpleTokens.length >= 2) {
                addAliasIfMissing(simpleTokens.slice(0, 2).join('_'), key);
            }
            if (simpleTokens.length >= 3) {
                addAliasIfMissing(simpleTokens.slice(0, 3).join('_'), key);
            }
        }
    } catch (error) {
        console.warn('Failed to load global food dataset:', error.message);
    }
}

function applyTrainedNutritionOverrides() {
    if (!fs.existsSync(TRAINED_FOOD_MODEL_PATH)) return;

    try {
        const raw = fs.readFileSync(TRAINED_FOOD_MODEL_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        const trainedFoods = parsed && typeof parsed === 'object'
            ? (parsed.foods || parsed)
            : null;

        if (!trainedFoods || typeof trainedFoods !== 'object') return;

        function mergeNutrition(current, data, keepUnitFromCurrent = false) {
            return {
                ...current,
                cal: Number.isFinite(data.cal) ? data.cal : current.cal,
                carb: Number.isFinite(data.carb) ? data.carb : current.carb,
                protein: Number.isFinite(data.protein) ? data.protein : current.protein,
                fat: Number.isFinite(data.fat) ? data.fat : current.fat,
                fiber: Number.isFinite(data.fiber) ? data.fiber : current.fiber,
                gi: Number.isFinite(data.gi) ? data.gi : current.gi,
                serving: Number.isFinite(data.serving) ? data.serving : current.serving,
                unit: keepUnitFromCurrent
                    ? (current.unit || data.unit)
                    : (typeof data.unit === 'string' && data.unit.trim() ? data.unit : current.unit),
            };
        }

        for (const [key, data] of Object.entries(trainedFoods)) {
            if (!data || typeof data !== 'object') continue;

            INDIAN_FOOD_DB[key] = mergeNutrition(INDIAN_FOOD_DB[key] || {}, data, false);

            const equivalentKeys = TRAINED_FOOD_EQUIVALENTS[key] || [];
            for (const equivalentKey of equivalentKeys) {
                if (!INDIAN_FOOD_DB[equivalentKey]) continue;
                INDIAN_FOOD_DB[equivalentKey] = mergeNutrition(
                    INDIAN_FOOD_DB[equivalentKey],
                    data,
                    true,
                );
            }
        }
    } catch (error) {
        console.warn('Failed to apply trained food nutrition overrides:', error.message);
    }
}

applyTrainedNutritionOverrides();
loadGlobalFoodDataset();

module.exports = { INDIAN_FOOD_DB, FOOD_ALIASES };
