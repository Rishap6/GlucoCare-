const fs = require('fs');
const path = require('path');
const { buildIndiaGeoKnowledge } = require('./knowledge-india-geo');
const { buildExpandedKnowledge } = require('./knowledge-expanded');

const KB_PATH = path.join(__dirname, 'knowledge-base.json');
const MODEL_PATH = path.join(__dirname, 'model.json');

const STOPWORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'i', 'if', 'in', 'is', 'it',
    'me', 'my', 'of', 'on', 'or', 'the', 'to', 'what', 'when', 'where', 'which', 'with', 'you', 'your',
    'why', 'should', 'can', 'do', 'does', 'not', 'more', 'much', 'very', 'just', 'about', 'so',
    'could', 'would', 'will', 'did', 'has', 'have', 'was', 'also', 'too', 'been', 'being',
    'than', 'then', 'this', 'that', 'these', 'those', 'am', 'but', 'some', 'any', 'all',
    'tell', 'know', 'please', 'really', 'want', 'need', 'think', 'like', 'get',
]);

const TERM_CANONICAL = {
    sugars: 'sugar',
    glucose: 'sugar',
    glycemia: 'sugar',
    hypoglycemia: 'low',
    hypo: 'low',
    hyperglycemia: 'high',
    medicine: 'medication',
    medicines: 'medication',
    drug: 'medication',
    drugs: 'medication',
    dietitian: 'nutritionist',
    foods: 'food',
    meals: 'meal',
    alternatives: 'alternative',
    allergic: 'allergy',
    intolerant: 'intolerance',
    diabetic: 'diabetes',
    diabetics: 'diabetes',
    drinks: 'drink',
    drinking: 'drink',
    eating: 'eat',
    exercises: 'exercise',
    exercising: 'exercise',
    walking: 'walk',
    running: 'run',
    jogging: 'run',
    symptoms: 'symptom',
    readings: 'reading',
    levels: 'level',
    tablets: 'tablet',
    pills: 'tablet',
    injections: 'injection',
    tests: 'test',
    reports: 'report',
    complications: 'complication',
    kidneys: 'kidney',
    eyes: 'eye',
    feet: 'foot',
    calories: 'calorie',
    carbs: 'carbohydrate',
    carbohydrates: 'carbohydrate',
    proteins: 'protein',
    vitamins: 'vitamin',
    snacks: 'snack',
    fruits: 'fruit',
    vegetables: 'vegetable',
    veggies: 'vegetable',
    cramps: 'cramp',
    cramping: 'cramp',
    sweats: 'sweat',
    sweating: 'sweat',
    floaters: 'floater',
    tattoos: 'tattoo',
    piercings: 'piercing',
    gums: 'gum',
    teeth: 'tooth',
    nerves: 'nerve',
    livers: 'liver',
    brains: 'brain',
    surgeries: 'surgery',
    infections: 'infection',
    children: 'child',
    kids: 'child',
    babies: 'baby',
    periods: 'period',
    supplements: 'supplement',
    fibers: 'fiber',
    fibres: 'fiber',
    fibre: 'fiber',
    constipated: 'constipation',
    numb: 'numbness',
    tingling: 'numbness',
    driving: 'drive',
    drivers: 'driver',
};

/* ------------------------------------------------------------------ */
/*  Topic detection + dynamic response pools                          */
/* ------------------------------------------------------------------ */

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function detectTopic(normalizedQ) {
    if (/food|eat|diet|meal|sweet|sweets|fruit|rice|roti|snack|breakfast|lunch|dinner|gulab|jalebi|samosa|biryani|chapati|dosa|idli|drink|juice|tea|coffee|cook|recipe|mango|banana|apple|milk|curd|yogurt|ghee|egg|chicken|fish|dal|paneer|oats|millet|bread|chocolate|cake|ice cream|fructose|fiber|fibre|isabgol|probiotic|ferment/.test(normalizedQ)) return 'food';
    if (/sugar|glucose|reading|level|number|high|low|spike|drop|fasting|hba1c|a1c|240|300|400|450|500|200|150|70|80|monitor|check|test|normal|range|prediabetes|borderline|dawn phenomenon|dawn effect|morning.*high|c.peptide/.test(normalizedQ)) return 'glucose';
    if (/medicine|medication|drug|tablet|insulin|metformin|allergy|side effect|dose|prescription|pharmacy|glimepiride|sitagliptin|dapagliflozin|empagliflozin|before food|after food|glucagon|painkiller|pain.?killer|nsaid|ibuprofen|paracetamol/.test(normalizedQ)) return 'medicine';
    if (/exercise|walk|run|gym|activity|yoga|swim|cycling|sport|workout|training|step|jogging|dancing|weight lifting|stretching|altitude|trek|hiking/.test(normalizedQ)) return 'exercise';
    if (/tired|fatigue|thirst|urination|blur|vision|numb|tingling|wound|heal|itch|skin|shak|sweat|dizzy|pain|symptom|sign|feel|cramp|hair.*loss|floater|constipat|gastroparesis|night.*sweat|acanthosis|dark.*patch/.test(normalizedQ)) return 'glucose';
    if (/dental|teeth|tooth|gum|oral health|periodontal/.test(normalizedQ)) return 'general';
    if (/sex|erect|libido|impotence|vaginal/.test(normalizedQ)) return 'general';
    if (/driv|work|office|job|career|school|child|kid|teen|surgery|operat|insurance|tattoo|pierc/.test(normalizedQ)) return 'general';
    if (/liver|fatty liver|nafld|brain|memory|dementia|kidney|retinopath|eye|neuropath/.test(normalizedQ)) return 'general';
    if (/period|menstr|pcos|menopause|postpartum|pregnan|gestational|honeymoon phase/.test(normalizedQ)) return 'general';
    if (/vitamin|b12|supplement|deficien/.test(normalizedQ)) return 'general';
    return 'general';
}

const DYNAMIC_CONTEXT = {
    food: {
        meanings: [
            'Food choices directly affect your post-meal glucose — small swaps make a real difference over time.',
            'How you combine foods matters. Adding protein and fiber to carbs slows the sugar rise.',
            'Portion size matters as much as food choice. Even healthy carbs spike sugar when oversized.',
            'Your body processes different foods at different speeds — pairing wisely keeps levels steadier.',
            'Eating slowly and chewing well gives your brain time to register fullness, reducing overeating.',
            'The order you eat matters too — starting with vegetables or protein before carbs can reduce the spike.',
            'Cooking method changes everything — grilled, baked, or steamed beats deep-fried every time.',
            'Fiber is your friend in diabetes — it slows digestion and smooths out the blood sugar curve.',
        ],
        nextSteps: [
            'Try swapping one sugary item for a fiber-rich alternative this week and see how your sugar responds.',
            'Track your meals and post-meal sugar for a few days to spot patterns that matter.',
            'Discuss a personalized meal plan with your doctor or dietitian at your next visit.',
            'Start with smaller portions of carbs and recheck sugar 2 hours after eating to compare.',
            'Try the plate method: half vegetables, quarter protein, quarter whole grains.',
            'Read nutrition labels for hidden sugars — many "healthy" packaged foods contain surprising amounts.',
            'Prepare simple snacks in advance so you are not tempted by unhealthy options when hungry.',
            'Try eating your meals at consistent times each day — your body responds better to a routine.',
        ],
    },
    glucose: {
        meanings: [
            'A single reading is just a snapshot — what really matters is the pattern over several days.',
            'Blood sugar shifts throughout the day depending on food, activity, stress, sleep, and medication timing.',
            'Tracking your numbers alongside what you ate helps your doctor see the bigger picture.',
            'Your ideal target range depends on your age, medications, and overall health — it is personalized to you.',
            'Both fasting and post-meal readings matter — together they tell a more complete story.',
            'Dehydration can concentrate your blood and make readings appear higher — always stay well hydrated.',
            'Stress alone can push sugar up even when your diet is perfect — the mind-body connection is real.',
            'Two-hour post-meal readings reveal how well your body handles the food you just ate.',
        ],
        nextSteps: [
            'Log your readings at consistent times so your doctor sees a clear pattern next visit.',
            'If readings stay above target for 2-3 days straight, reach out to your care team.',
            'Check both fasting and 2-hour post-meal values to understand the full picture.',
            'Stay well hydrated and keep your medication schedule steady while you monitor.',
            'Try noting what you ate before unusual readings — you will start spotting the triggers.',
            'Keep your glucose meter and strips stored properly — expired or heat-damaged strips give inaccurate results.',
            'Test from clean, dry fingertips — residue from food or lotion can skew readings.',
            'If a reading seems off, wash your hands and test again before reacting.',
        ],
    },
    medicine: {
        meanings: [
            'Medication responses vary person to person — your doctor adjusts based on your labs and history.',
            'Medicines work best paired with proper eating and activity, not as a standalone fix.',
            'A side effect does not always mean you must stop a medicine — dose or timing tweaks often help.',
            'Your kidney and liver function influence which medicines are safest for you specifically.',
            'Some medicines need time to show full effect — give a new prescription at least a few weeks before judging.',
            'Taking medicine at the same time every day helps maintain steady levels in your body.',
            'Some diabetes medicines work on different organs — your doctor picks the best combination for your situation.',
            'Generic medicines contain the same active ingredient and are equally effective — do not worry if the brand changes.',
        ],
        nextSteps: [
            'Bring a list of all medicines and any side effects to your next appointment.',
            'Never stop or change your medicine dose without talking to your doctor first.',
            'Note exactly when a side effect happens and share those details with your doctor.',
            'Ask your doctor whether a lower dose, different timing, or alternative could help.',
            'Use a pill organizer or phone alarm to never miss a dose.',
            'Store insulin properly — most types should be refrigerated, and never frozen or left in a hot car.',
            'If you are taking multiple medicines, ask your pharmacist about any interactions to be safe.',
            'Carry a medicine list with doses in your wallet in case of emergencies.',
        ],
    },
    exercise: {
        meanings: [
            'Regular movement improves how your body uses insulin, even without weight loss.',
            'Post-meal walking is one of the simplest ways to lower sugar spikes naturally.',
            'Consistency matters more than intensity — daily moderate activity beats rare hard workouts.',
            'Activity also helps blood pressure, cholesterol, mood, and sleep — all important in diabetes.',
            'Your muscles absorb glucose during exercise without needing insulin — that is why movement helps so much.',
            'Even standing and moving around every 30 minutes during desk work makes a measurable difference.',
            'Exercise benefits last 24-48 hours — that is why regular activity works better than weekend-only workouts.',
            'Both aerobic exercise (walking, cycling) and strength training (weights, resistance bands) help blood sugar.',
        ],
        nextSteps: [
            'Start with a 10-15 minute walk after your largest meal and build up from there.',
            'Check sugar before exercising if you take insulin or sulfonylureas to avoid going too low.',
            'Aim for at least 150 minutes of moderate activity per week, spread across most days.',
            'Find something you enjoy — walking, cycling, yoga, or dancing all count.',
            'Keep a pair of walking shoes at work or near your door so there is no excuse to skip.',
            'Exercise with a friend or family member — accountability makes consistency easier.',
            'On days you cannot do a full workout, even 5-10 minutes of stretching or stair climbing helps.',
            'Track your steps or activity minutes — seeing progress is motivating.',
        ],
    },
    general: {
        meanings: [
            'Diabetes management works best with consistent small habits rather than drastic changes.',
            'Understanding your condition helps you ask better questions and make informed choices.',
            'Every person\'s diabetes journey is different — what works for one may not suit another.',
            'Knowledge is your tool, but always cross-check with your care team before acting.',
            'Diabetes affects the whole family — when everyone understands it, support comes naturally.',
            'Small daily wins add up — do not underestimate the power of steady, incremental progress.',
            'Managing diabetes is not about perfection — it is about making better choices more often than not.',
            'Your mental health matters too — feeling overwhelmed is normal, and asking for help is a sign of strength.',
        ],
        nextSteps: [
            'Write down your top question for your next doctor visit so nothing gets forgotten.',
            'Pick one small habit to improve this week — even one change adds up.',
            'Share what you learned with your family so they can support you better.',
            'Keep a simple daily log of meals, medicines, and readings for easier tracking.',
            'Set a phone reminder for your next lab test or doctor appointment.',
            'If you are feeling overwhelmed, focus on just one thing today — hydration, a walk, or proper medication timing.',
            'Join a diabetes support group — connecting with others who understand can make a real difference.',
            'Celebrate your small wins — every good meal choice or walk taken is a step in the right direction.',
        ],
    },
};

/* ------------------------------------------------------------------ */
/*  Direct-answer synthesis for specific questions                    */
/* ------------------------------------------------------------------ */

function synthesizeDirectAnswer(normalizedQ, kbAnswer) {
    const sweetFoods = normalizedQ.match(/\b(gulab jamun|jalebi|rasgulla|laddoo|barfi|halwa|cake|pastry|chocolate|ice cream|mithai)\b/);
    const friedFoods = normalizedQ.match(/\b(samosa|pakora|puri|bhatura|chips|french fries|fries)\b/);
    const beverages = normalizedQ.match(/\b(tea|coffee|chai|juice|coke|cola|soda|pepsi|sprite|lassi|milkshake|smoothie|beer|wine|alcohol|whiskey|rum)\b/);
    const grains = normalizedQ.match(/\b(rice|white rice|brown rice|roti|chapati|naan|bread|white bread|maida|oats|oatmeal|millet|bajra|ragi|jowar|quinoa|poha|upma|dosa|idli)\b/);
    const proteins = normalizedQ.match(/\b(egg|eggs|chicken|fish|paneer|tofu|dal|lentils|rajma|chole|chana|soybean|meat|mutton|pork)\b/);
    const fruits = normalizedQ.match(/\b(banana|mango|apple|orange|grapes|watermelon|papaya|guava|pomegranate|pineapple|chiku|sapota|dates|raisins|dry fruits)\b/);
    const dairy = normalizedQ.match(/\b(milk|curd|yogurt|cheese|butter|ghee|paneer|buttermilk|chaas)\b/);
    const askingGoodBad = /good|safe|okay|fine|suitable|allowed|can i eat|should i eat|can i have|can diabetic|can a diabetic|is it ok|is it bad|harmful|healthy|unhealthy|beneficial|better|eat.*daily|eat.*everyday/.test(normalizedQ);
    const askingHowMuch = /how much|how many|portion|serving|quantity|amount/.test(normalizedQ);
    const mentionsHighSugar = /\b(high|two forty|240|250|300|350|400|450|500|200|spike|elevated|above)\b/.test(normalizedQ);
    const numberMatch = normalizedQ.match(/\b(\d{2,3})\b/);
    const wantsMore = /should i eat more|eat more|have more/.test(normalizedQ);
    const askingSafe = /safe|dangerous|risky|serious|normal|okay|worried|scared|concern|afraid|bad|harmful/.test(normalizedQ);
    const wantsToLower = /lower|reduce|bring down|decrease|control|manage|fix|correct|treat|handle/.test(normalizedQ);
    const askingWhy = /why|reason|cause|how come/.test(normalizedQ);
    const askingSymptoms = /symptom|sign|feel|feeling|indication/.test(normalizedQ);
    const askingPrevent = /prevent|avoid|stop|protect|reduce risk/.test(normalizedQ);

    // === EMERGENCY: Dangerous high sugar (>= 250) with safety/lowering question ===
    if (numberMatch) {
        const num = parseInt(numberMatch[1], 10);
        if (num >= 400 && (askingSafe || wantsToLower || askingWhy)) {
            return `No, a blood sugar of ${num} mg/dL is not safe \u2014 this is dangerously high and needs urgent attention. I want to be very clear about this because your health matters. At this level, you could be at risk for diabetic ketoacidosis (DKA) or hyperosmolar syndrome, both of which are medical emergencies. Here is exactly what to do right now: (1) Drink plenty of water \u2014 sip steadily, do not gulp. Dehydration makes this worse. (2) Take your prescribed diabetes medication or insulin if you have it \u2014 but do NOT double your dose. (3) Do NOT exercise \u2014 at levels this high, exercise can actually raise sugar further and stress your body. (4) Check for ketones if you have urine test strips. (5) Watch for these danger signs: nausea or vomiting, stomach pain, rapid or deep breathing, fruity-smelling breath, confusion, or extreme drowsiness. If you notice ANY of these, go to the emergency room immediately \u2014 do not wait. (6) Even without symptoms, contact your doctor right away at this level. Please do not take this lightly or wait to see if it comes down on its own. A reading of ${num} needs medical guidance today.`;
        }
        if (num >= 300 && (askingSafe || wantsToLower)) {
            return `A blood sugar of ${num} mg/dL is significantly high and needs your attention right now. While it may not be an immediate emergency for most people, it is definitely above the safe range and should not be ignored. Let me walk you through what to do: (1) Start drinking water right away \u2014 aim for a glass every 30-60 minutes. Staying hydrated helps your kidneys clear excess sugar. (2) Take your prescribed medicine on schedule \u2014 do not skip it, and do not take extra without your doctor saying so. (3) Skip all carbs and sugary foods right now \u2014 no rice, bread, sweets, or fruit. Stick to water, non-starchy vegetables (like cucumber, salad, spinach), and small portions of protein if hungry. (4) A gentle 15-minute walk may help if you feel physically okay \u2014 but stop immediately if you feel dizzy, nauseous, or short of breath. (5) Recheck your sugar in 1-2 hours. If it is not coming down, or if you start feeling worse \u2014 nausea, vomiting, confusion, chest pain, or rapid breathing \u2014 contact your doctor or go to urgent care. Consistent readings above 300 can lead to serious problems over even a few days, so please take this seriously and follow up with your doctor.`;
        }
        if (num >= 250 && (askingSafe || wantsToLower)) {
            return `A reading of ${num} mg/dL is above the target range and worth taking action on. For most people this is not an immediate crisis, but it is your body telling you something needs adjusting. Here is a practical plan: (1) Drink water generously \u2014 this helps your body flush out excess glucose through your kidneys. (2) Follow your medication schedule carefully. (3) For your next meal or snack, go very light on carbs \u2014 choose grilled vegetables, a small portion of dal or egg, cucumber, or salad. Avoid rice, bread, and anything sweet. (4) Take a 15-20 minute walk after eating if you feel stable. (5) Recheck in 1-2 hours to see which direction the number is moving. If this keeps happening and readings regularly stay above 250, it is time to talk to your doctor about adjusting your medication \u2014 you may need a dosage change or an additional medicine.`;
        }
        if (num >= 180 && (askingSafe || wantsToLower)) {
            return `A reading of ${num} mg/dL is above the ideal post-meal target for most people with diabetes. It is not dangerous right now, but it does mean your sugar management could use some fine-tuning. A few things to consider: (1) Think about what you ate recently \u2014 a large carb-heavy meal can push readings above 180 even with medication. (2) A 15-minute post-meal walk can make a noticeable difference. (3) Make sure you are taking your medication at the right time \u2014 timing matters as much as the dose. (4) Stay hydrated. (5) If you see readings consistently above 180 after meals, mention it to your doctor. They may suggest adjusting medication timing, adding a low-carb emphasis, or checking your HbA1c to see the bigger picture.`;
        }
        if (num >= 140 && /after eat|after food|after meal|post meal|postmeal|after lunch|after dinner|after breakfast/.test(normalizedQ)) {
            return `A post-meal reading of ${num} mg/dL is above the ideal target of under 140 for most people with diabetes, though it is not dangerously high. This suggests the meal may have had too many carbs, or your medication timing might need adjustment. Tips for better post-meal numbers: (1) Reduce the carb portion in your meals \u2014 swap some rice or bread for vegetables. (2) Eat protein and vegetables first, carbs last. (3) Take a 10-15 minute walk after eating. (4) Make sure you take your medicine at the right time before or with the meal. (5) If this happens regularly, discuss with your doctor about meal-time medication adjustments.`;
        }
    }

    // === FOOD-SPECIFIC: Sweets ===
    if (sweetFoods && askingGoodBad) {
        const food = sweetFoods[1];
        const cap = food.charAt(0).toUpperCase() + food.slice(1);
        return `I will be honest with you \u2014 ${cap} is not a good choice if you are trying to manage blood sugar. It is loaded with sugar and refined carbs that cause your glucose to spike rapidly. I know it is hard, especially during festivals and family gatherings, but here is the reality: even a moderate portion can push your sugar up significantly. That said, an occasional tiny piece during a special occasion is not the end of the world for some people \u2014 but it should be rare, not routine. Better alternatives that still satisfy your sweet tooth: sugar-free versions if available, a small portion of fresh fruit with a handful of nuts, a piece of dark chocolate (70%+ cocoa), or homemade sweets using sugar substitutes and whole grain flour.`;
    }

    // === FOOD-SPECIFIC: Fried foods ===
    if (friedFoods && askingGoodBad) {
        const food = friedFoods[1];
        const cap = food.charAt(0).toUpperCase() + food.slice(1);
        return `${cap} is deep-fried and usually made with refined flour (maida), which is a double hit for blood sugar. The refined carbs spike your glucose, and the excessive oil adds unhealthy calories and slows digestion in ways that can affect your readings. Here is a practical approach: instead of eliminating it entirely (which is hard), try these swaps \u2014 baked samosa, air-fried versions, roasted chana or makhana for crunch, or grilled snacks. If you do eat fried food occasionally, keep the portion very small and pair it with a salad or vegetables. Your sugar response to fried foods also depends on portion size, so even small changes help.`;
    }

    // === FOOD-SPECIFIC: Beverages ===
    if (beverages) {
        const drink = beverages[1];
        const cap = drink.charAt(0).toUpperCase() + drink.slice(1);
        if (/juice/.test(drink)) {
            return `${cap} is tricky for people with diabetes. Even 100% natural fruit juice, without added sugar, is essentially a concentrated dose of fruit sugar without the fiber that whole fruit provides. A glass of orange juice has the sugar of 3-4 oranges but none of the fiber to slow absorption. The result? A fast, sharp blood sugar spike. My suggestion: eat the whole fruit instead in moderate portions \u2014 the fiber makes a big difference. If you love the taste, try infused water with fruit slices. And packaged juices with added sugar \u2014 those should be avoided completely.`;
        }
        if (/tea|coffee|chai/.test(drink)) {
            return `${cap} itself is not bad for diabetes \u2014 the issue is what you add to it. Plain black tea, green tea, or black coffee actually have some health benefits. But here is where most people go wrong: adding 2-3 spoons of sugar per cup, having 4-5 cups a day, or drinking chai with lots of sugar and full-fat milk. That adds up to a huge amount of hidden sugar. My suggestion: gradually reduce sugar in your tea/coffee \u2014 cut half a spoon each week until you get used to less. Try it unsweetened or with a small amount of a doctor-approved sweetener. Avoid pre-mixed sweet drinks, chai from roadside stalls with lots of sugar, and sweetened creamers.`;
        }
        if (/coke|cola|soda|pepsi|sprite/.test(drink)) {
            return `${cap} and other sugary sodas are among the worst things for blood sugar \u2014 I would strongly recommend cutting them out completely. A single can of regular cola has about 35-40 grams of pure sugar, which is more than your entire daily sugar budget. It causes a rapid, sharp blood sugar spike because there is no fiber, fat, or protein to slow absorption. Diet versions with zero sugar are better for blood sugar, but they are still not great for overall health. Best options: plain water, sparkling water with lemon, unsweetened iced tea, or buttermilk (chaas).`;
        }
        if (/beer|wine|alcohol|whiskey|rum/.test(drink)) {
            return `Alcohol and diabetes is a complicated topic. Here is what you need to know: (1) Alcohol can cause delayed low blood sugar, sometimes hours later, especially if you take insulin or sulfonylureas. (2) Beer and sweet wines have carbs that raise sugar initially, then alcohol may drop it later \u2014 a confusing seesaw. (3) If you choose to drink, eat food with it (never drink on an empty stomach), limit to 1 drink for women or 2 for men, check sugar before bed, and keep a snack nearby. (4) Some people with diabetes should avoid alcohol entirely \u2014 ask your doctor if it is safe for your specific situation. (5) Avoid cocktails and sweet mixers as they are loaded with sugar.`;
        }
        if (/lassi|milkshake|smoothie/.test(drink)) {
            return `${cap} can be tricky for blood sugar depending on how it is made. Sweet lassi, milkshakes, and fruit smoothies often have added sugar, honey, or large amounts of fruit that spike glucose quickly. A better approach: make a plain unsweetened lassi or buttermilk (chaas) \u2014 the protein in curd actually helps blood sugar. For smoothies, use low-sugar fruits (berries, half a green apple), add protein (like nut butter or protein powder), and skip the honey or sugar. Keep portions small \u2014 even a healthy-sounding smoothie can have as much sugar as a soda if it is loaded with fruit and sweeteners.`;
        }
    }

    // === FOOD-SPECIFIC: Grains ===
    if (grains && (askingGoodBad || askingHowMuch)) {
        const grain = grains[1];
        const cap = grain.charAt(0).toUpperCase() + grain.slice(1);
        if (/white rice/.test(grain) || (grain === 'rice' && !/brown/.test(normalizedQ))) {
            return `White rice is a high glycemic food that can spike blood sugar noticeably, especially in large portions. But here is the practical truth \u2014 for many Indians, completely giving up rice is very hard and not necessary either. What helps: (1) Reduce your portion to about half a cup to one small cup of cooked rice per meal. (2) Always eat rice with dal/protein, vegetables, and a source of fiber first \u2014 this slows sugar absorption. (3) Try mixing white rice with brown rice or millets for a lower glycemic impact. (4) Slightly cooled or reheated rice has more resistant starch, which affects sugar less. (5) Avoid rice at dinner if your morning fasting sugar tends to be high. Small changes in how you eat rice matter more than cutting it out entirely.`;
        }
        if (/brown rice/.test(grain)) {
            return `Brown rice is a better option than white rice for diabetes because it has more fiber, which slows down sugar absorption. However, it still has carbs, so portion control matters. Stick to about half to one small cup per meal, and combine it with vegetables and protein. Some people find it harder to digest or less tasty \u2014 mixing brown and white rice 50/50 is a good middle ground that still improves your glycemic response compared to all-white rice.`;
        }
        if (/oats|oatmeal/.test(grain)) {
            return `Plain oats (steel-cut or rolled) are a good breakfast option for diabetes \u2014 the soluble fiber (beta-glucan) helps slow sugar absorption and can improve cholesterol. But watch out: instant oat packets often have added sugar and flavoring. The best way to eat oats: cook plain oats with water or milk, add nuts, seeds, and cinnamon for flavor, and avoid sugar or honey. A portion of about half a cup (dry measure) is reasonable. You can add vegetables or eggs on the side for a more balanced meal that keeps you full longer.`;
        }
        if (/roti|chapati|naan/.test(grain)) {
            return `${cap} made from whole wheat flour is a reasonable carb choice for diabetes \u2014 better than maida products. But portion still matters: 1-2 rotis per meal is usually fine for most people with diabetes, depending on your activity level and medication. To make it even better: mix wheat flour with besan (gram flour), ragi, or flaxseed powder for extra fiber and protein. Naan is usually made with maida and sometimes has butter, so it is not as good. Multigrain roti or millet roti (bajra, jowar) are excellent options that have lower glycemic impact.`;
        }
        if (/millet|bajra|ragi|jowar/.test(grain)) {
            return `${cap} is an excellent choice for diabetes! Millets generally have a lower glycemic index than white rice and wheat, meaning they cause a slower and smaller rise in blood sugar. They are also rich in fiber, minerals, and protein. You can use millet flour for rotis, cook them like rice, or have them as porridge. Ragi (finger millet) is particularly good for calcium and fiber. Just remember \u2014 even healthier grains need portion control. About one cup of cooked millet per meal is a good target.`;
        }
        if (/dosa|idli/.test(grain)) {
            return `${cap} can be part of a diabetes-friendly diet with some adjustments. Plain idli or dosa made from a standard rice-urad batter does raise blood sugar, but the fermentation process helps a bit. To make it better: (1) Use millet-based batters (ragi dosa, oats idli) when possible. (2) Add more dal or vegetables \u2014 sambar, chutney with coconut, and a boiled egg on the side make it more balanced. (3) Keep to 2-3 idlis or one medium dosa rather than overeating. (4) Avoid potato masala filling and use paneer or vegetables instead. (5) A set dosa is usually thinner and better than a thick sponge dosa portion-wise.`;
        }
    }

    // === FOOD-SPECIFIC: Fruits ===
    if (fruits && (askingGoodBad || askingHowMuch)) {
        const fruit = fruits[1];
        const cap = fruit.charAt(0).toUpperCase() + fruit.slice(1);
        if (/mango/.test(fruit)) {
            return `I know mangoes are hard to resist, especially in summer! Here is the honest answer: mangoes are high in natural sugar and will raise your blood sugar, but they are not completely off-limits. The key is portion \u2014 a few small slices (about half a cup or a quarter of a medium mango) is much safer than eating a whole mango at once. Eat it as part of a meal, not alone on an empty stomach, and pair it with some nuts to slow the sugar absorption. Check your sugar 2 hours after to see how your body responds. If your sugar is already high that day, it is better to skip the mango.`;
        }
        if (/banana/.test(fruit)) {
            return `Bananas are moderate on the glycemic scale \u2014 not the worst fruit, but not the best either for diabetes. A small banana is about 20-25 grams of carbs. Here is a smart approach: (1) Choose smaller bananas over large ones. (2) Slightly green bananas have less sugar than very ripe yellow ones. (3) Pair it with a handful of nuts or peanut butter for slower absorption. (4) Limit to one small banana per day and count it as part of your carb intake. (5) Do not have it as a standalone snack on an empty stomach \u2014 eat it with a protein source. Some people with very tight sugar control may need to avoid bananas \u2014 test and see your personal response.`;
        }
        if (/apple|guava|orange|papaya|pomegranate/.test(fruit)) {
            return `${cap} is actually one of the better fruit choices for diabetes! It has a reasonable glycemic index and provides vitamins, fiber, and antioxidants. The key rules still apply though: (1) Eat the whole fruit, not juice. (2) Keep portions to about one medium-sized fruit or one cup of chopped fruit per serving. (3) Pair with a few nuts for slower sugar absorption. (4) Spread fruit servings across the day rather than eating multiple fruits at once. Guava and apple are particularly good choices because of their high fiber content.`;
        }
        if (/watermelon|grapes|pineapple|chiku|sapota/.test(fruit)) {
            return `${cap} is on the higher glycemic side among fruits, which means it can raise blood sugar faster than options like guava or apple. That does not mean you can never have it, but be more careful: keep the portion very small (about half a cup), avoid eating it on an empty stomach, and check your sugar 2 hours after to see your personal response. If your sugar tends to run high, choose lower-glycemic fruits like guava, apple, pear, or berries instead, and save ${fruit} for occasional small servings when your sugar is well controlled.`;
        }
        if (/dates|raisins|dry fruits/.test(fruit)) {
            return `Dried fruits are concentrated in sugar because the water has been removed \u2014 so a small handful packs a lot more sugar than the same amount of fresh fruit. Dates and raisins are especially high. For diabetes: (1) If you eat them, keep it to 1-2 dates or a small pinch of raisins at a time. (2) Pair with nuts (almonds, walnuts) to slow sugar absorption. (3) Avoid date syrup, raisin-heavy trail mixes, or dried fruit in large quantities. (4) Unsweetened nuts (almonds, walnuts, pistachios) are a much better snack choice for blood sugar. (5) During festivals, a single date with a nut is better than a full helping of mithai.`;
        }
    }

    // === FOOD-SPECIFIC: Dairy ===
    if (dairy && (askingGoodBad || askingHowMuch)) {
        const item = dairy[1];
        const cap = item.charAt(0).toUpperCase() + item.slice(1);
        if (/milk/.test(item)) {
            return `Milk has lactose (milk sugar), so it does affect blood sugar \u2014 but moderately. A glass of plain milk (about 200ml) is generally fine for most people with diabetes. Whole milk has more fat which slows absorption, but also more calories. Low-fat or toned milk is a reasonable choice. Avoid: flavored milk, chocolate milk, sweetened milk drinks, and kulfi. Tip: warm milk with a pinch of turmeric before bed is a common Indian habit and is fine for most people with diabetes.`;
        }
        if (/curd|yogurt|buttermilk|chaas/.test(item)) {
            return `${cap} is actually one of the better dairy options for diabetes! The fermentation process and protein content help moderate the blood sugar impact compared to plain milk. Unsweetened curd/yogurt is a great addition to meals. Buttermilk (chaas) is excellent \u2014 low calorie, cooling, and good for digestion. Avoid: sweetened yogurt, fruit-flavored yogurt, or sweetened lassi. Greek yogurt (if available) is even better because of higher protein. Having a small bowl of plain curd with meals is a good everyday habit.`;
        }
        if (/ghee|butter/.test(item)) {
            return `${cap} in small amounts is not as bad for diabetes as many people think. Fat does not directly spike blood sugar \u2014 it is carbs that do. A small teaspoon of ghee on your roti is generally fine and may actually slow the absorption of carbs from the meal. However, ghee and butter are calorie-dense, so keep it moderate (1-2 teaspoons per meal). If you are overweight or have high cholesterol, be more conservative. Do not fry in excess ghee or drench your food in it. Used wisely, a little ghee can be part of a balanced diabetes diet.`;
        }
    }

    // === FOOD-SPECIFIC: Proteins ===
    if (proteins && (askingGoodBad || askingHowMuch)) {
        const item = proteins[1];
        const cap = item.charAt(0).toUpperCase() + item.slice(1);
        return `${cap} is generally a good choice for people with diabetes! Protein has minimal direct impact on blood sugar and helps you feel full longer, which reduces overeating. A few tips: (1) Include a protein source in every meal \u2014 it helps balance the carbs. (2) Prefer grilled, baked, boiled, or lightly sauteed over deep-fried preparations. (3) For vegetarians, dal, paneer, curd, tofu, and chana are excellent protein sources. (4) For non-vegetarians, grilled chicken, fish (especially fatty fish like salmon), and eggs are all great. (5) Watch for hidden carbs in gravies and sauces \u2014 thick tomato or cream-based curries can add up. A good target is about a palm-sized portion of protein with each meal.`;
    }

    // === HIGH SUGAR + EATING SWEETS ===
    if (mentionsHighSugar && (wantsMore || (/sweet|sugary|mithai/.test(normalizedQ) && /eat|have/.test(normalizedQ) && !/what should|what can|what to/.test(normalizedQ)))) {
        const num = numberMatch ? `${numberMatch[1]} mg/dL` : 'already high';
        return `Definitely not \u2014 this is really important to understand. When your blood sugar is ${num}, eating sweets or sugary foods is like adding fuel to a fire. It will push your sugar even higher and can become genuinely dangerous. At elevated levels, your body is already struggling to process the glucose it has. What you should do instead: drink plenty of water (this helps flush excess sugar), eat only non-starchy vegetables and lean protein if hungry, take your prescribed medication on schedule, and go for a short walk if you feel stable. Recheck in 1-2 hours. If it does not come down, contact your doctor. Save sweets for rare occasions when your sugar is well within range.`;
    }

    // === NUMBER + ACTION QUESTION ===
    if (numberMatch && /what should|what do|what can|what to|how to|how do|how can|tell me|help|advise/.test(normalizedQ)) {
        const num = parseInt(numberMatch[1], 10);
        if (num >= 200) {
            return `With a reading of ${num} mg/dL, your sugar is above the target range, and I want to help you bring it down safely. Here is a step-by-step plan: First, start drinking water right now \u2014 dehydration makes high sugar worse, so aim for a glass every 30-60 minutes. Second, follow your prescribed medicine plan without skipping or doubling doses. Third, for your next meal, avoid all sugary and high-carb foods \u2014 stick to non-starchy vegetables (cucumber, spinach, salad), lean protein (dal, egg, grilled chicken), and skip the rice, bread, and fruit for now. Fourth, take a 15-20 minute walk if you feel physically okay \u2014 light movement helps your body use the extra glucose. Fifth, recheck in 1-2 hours to see if it is trending down. If it stays this high or goes higher, or if you feel nauseous, dizzy, confused, or develop stomach pain, contact your doctor today.`;
        }
        if (num <= 70) {
            return `A reading of ${num} mg/dL means your sugar is low, and this needs quick action \u2014 let me walk you through it. Step 1: Take 15 grams of fast-acting carbs right now. Good options: 3-4 glucose tablets, half a cup (4 oz) of fruit juice or regular soda (not diet), a tablespoon of sugar or honey dissolved in water, or 5-6 hard candies. Step 2: Sit down somewhere safe and wait 15 minutes. Step 3: Recheck your sugar. If still below 70, repeat step 1 once more. Step 4: Once above 70, eat a small snack with protein and carbs to stabilize \u2014 peanut butter crackers, cheese with bread, or a handful of nuts with a biscuit. Important: if you feel confused, very shaky, cannot swallow safely, or your vision is blurring, get help from someone nearby immediately. Do not drive or use any equipment until your sugar is back above 80 and you feel normal.`;
        }
    }

    // === GENERAL NUMBER MENTION (fallback for any sugar reading) ===
    if (numberMatch) {
        const num = parseInt(numberMatch[1], 10);
        if (num >= 200) {
            return `I see your blood sugar is at ${num} mg/dL \u2014 that is above the healthy range and worth paying attention to. Do not panic, but do take action. Here is what helps: stay well hydrated with water, follow your medication schedule carefully, choose low-carb meals for now (vegetables, protein, skip the rice and bread), and take a short walk after eating if you feel up to it. Recheck in a couple of hours. If it does not trend down, or you notice symptoms like nausea, extreme thirst, blurry vision, or feeling foggy, reach out to your doctor. One high reading is not a crisis by itself, but it is your body's signal to pay attention.`;
        }
        if (num <= 70) {
            return `A reading of ${num} mg/dL is on the low side and needs attention. Take 15 grams of fast-acting sugar right away \u2014 juice, glucose tablets, honey, or regular soda work well. Wait 15 minutes and recheck. If symptoms persist or it stays low, get medical help. Once stable, have a small balanced snack to prevent it from dropping again. If you are getting frequent low readings, tell your doctor \u2014 your medication may need adjusting.`;
        }
        if (num >= 100 && num <= 125) {
            return `A reading of ${num} mg/dL is in the prediabetes or borderline range if fasting, or could be a normal post-meal value. Context matters: if this is fasting (first thing in the morning, before eating), it suggests your blood sugar regulation is not quite optimal. If it is 2 hours after a meal, this is actually a reasonable reading. Either way, this is a good time to focus on prevention: regular exercise, portion control with carbs, fiber-rich meals, and maintaining a healthy weight can keep this from getting higher.`;
        }
        if (num >= 70 && num < 100) {
            return `A reading of ${num} mg/dL is within the normal fasting range \u2014 that is a good number! If you are checking because you felt symptomatic (dizzy, shaky, sweaty), those symptoms may have other causes, or your sugar might have been lower earlier and recovered. Keep doing what you are doing, and monitor at regular intervals to make sure things stay consistent.`;
        }
    }

    // === WHY QUESTIONS ===
    if (askingWhy && /high|spike|elevated|goes up|rising/.test(normalizedQ) && /sugar|glucose/.test(normalizedQ)) {
        return `Blood sugar can go high for several reasons, and understanding the cause helps you fix it. Common reasons: (1) Eating too many carbs in one meal \u2014 rice, bread, sweets, potatoes, and sugary drinks are the biggest culprits. (2) Missing or delaying your medication. (3) Stress \u2014 stress hormones like cortisol directly raise blood sugar. (4) Poor sleep or irregular sleep pattern. (5) Illness or infection \u2014 your body releases stress hormones when fighting sickness. (6) Not enough physical activity. (7) Dawn phenomenon \u2014 your liver releases stored sugar in the early morning. (8) Dehydration. To figure out your personal pattern, try logging your meals, medication timing, activity, and readings for a few days. This gives your doctor the clearest picture to help you.`;
    }
    if (askingWhy && /low|drop|falling/.test(normalizedQ) && /sugar|glucose/.test(normalizedQ)) {
        return `Blood sugar can drop too low (hypoglycemia) for several reasons: (1) Taking too much diabetes medication or insulin. (2) Skipping or delaying meals after taking your medicine. (3) Exercising more than usual without adjusting food intake. (4) Drinking alcohol, especially on an empty stomach \u2014 alcohol blocks your liver from releasing stored sugar. (5) Being more active than normal (like a day of heavy housework or physical labor). (6) Hot weather, which can affect how some medicines work. If you are getting frequent low sugar episodes (below 70), it is important to talk to your doctor about adjusting your medication dose or timing. Always carry a fast-acting sugar source (glucose tablets, juice box, or sugar sachets) with you.`;
    }

    // === CURE / REVERSAL QUESTIONS ===
    if (/cure|reverse|go away|permanent|completely|heal/.test(normalizedQ) && /diabetes/.test(normalizedQ)) {
        return `This is one of the most common questions, and I want to give you an honest answer. Type 1 diabetes cannot currently be cured \u2014 it is an autoimmune condition that requires lifelong insulin. For Type 2 diabetes, the picture is more nuanced. While it may not be completely \"cured\" in the traditional sense, many people can achieve remission \u2014 meaning blood sugar returns to normal levels without medication \u2014 through significant lifestyle changes: substantial weight loss (if overweight), regular exercise, and a controlled diet. Some people maintain remission for years. However, the underlying tendency remains, so healthy habits need to continue lifelong. The earlier you catch it and act, the better your chances. No supplement, herbal remedy, or product can \"cure\" diabetes despite what some advertisements claim. Work with your doctor on an evidence-based plan.`;
    }

    // === PREVENTION QUESTIONS ===
    if (askingPrevent && /diabetes|sugar/.test(normalizedQ)) {
        return `Prevention is absolutely possible for Type 2 diabetes, especially if you are at the prediabetes stage. Here is what research shows works: (1) Maintain a healthy weight \u2014 even a 5-7% weight loss significantly reduces risk. (2) Exercise regularly \u2014 150 minutes per week of moderate activity like brisk walking. (3) Eat a balanced diet rich in fiber, vegetables, lean protein, and whole grains. Minimize refined carbs, sugary drinks, and processed foods. (4) Get good sleep \u2014 7-8 hours consistently. (5) Manage stress \u2014 chronic stress raises blood sugar. (6) Get screened regularly if you have risk factors (family history, obesity, PCOS, gestational diabetes history). Type 1 diabetes cannot currently be prevented as it is autoimmune.`;
    }

    // === FASTING QUESTION (not intermittent) ===  
    if (/fasting sugar|morning sugar|fasting reading|fasting glucose/.test(normalizedQ) && (askingWhy || /high/.test(normalizedQ))) {
        return `A high fasting blood sugar (the reading first thing in the morning before eating) is frustrating because you have not eaten all night yet the number is still high. Here are the most common reasons: (1) Dawn phenomenon \u2014 your body naturally releases stored glucose and hormones in the early morning hours to prepare you for waking up. This raises blood sugar between 3-8 AM. (2) Not enough evening medication \u2014 your medicine may wear off overnight. (3) Eating a heavy or late dinner \u2014 a big carb-rich meal at 10 PM can still affect your 7 AM reading. (4) Poor sleep quality. What helps: try eating dinner earlier and lighter, include protein in your dinner, take a short walk after dinner, and discuss with your doctor whether an evening medication adjustment might help. Consistent patterns over several days help diagnosis more than single readings.`;
    }

    // === WHAT TO EAT WHEN SUGAR IS HIGH ===
    if (/what.*(eat|food|have)/.test(normalizedQ) && /high|elevated|spike|above/.test(normalizedQ) && /sugar|glucose/.test(normalizedQ)) {
        return `When your blood sugar is high, what you eat (and avoid) makes a big difference. Avoid: (1) Rice, bread, roti, and other refined carbs. (2) Sugary foods and sweets. (3) Fruit and fruit juices. (4) Sugary drinks and soda. What to eat instead: (1) Non-starchy vegetables \u2014 cucumber, spinach, salad greens, broccoli, cauliflower, bottle gourd, bitter gourd. (2) Lean protein \u2014 dal, egg whites, grilled chicken, fish, tofu, small portion of paneer. (3) Drink plenty of water \u2014 this helps your kidneys flush excess glucose. (4) If very hungry, a small handful of nuts (almonds, walnuts) can satisfy without spiking sugar. Also important: take your prescribed medicines, go for a 15-20 minute walk if you feel stable, and recheck sugar in 1-2 hours.`;
    }

    // === NORMAL BLOOD SUGAR LEVELS ===
    if (/normal|target|healthy|ideal/.test(normalizedQ) && /sugar|glucose|level|range|reading/.test(normalizedQ) && !numberMatch) {
        return `Here are the standard blood sugar ranges for reference: Fasting (before breakfast): 70-100 mg/dL is normal, 100-125 mg/dL is prediabetes range, and 126 mg/dL or above (on two separate tests) suggests diabetes. After meals (2 hours post-meal): below 140 mg/dL is normal, 140-199 is prediabetes range, and 200+ suggests diabetes. HbA1c: below 5.7% is normal, 5.7-6.4% is prediabetes, and 6.5%+ suggests diabetes. For people already diagnosed with diabetes, common targets are: fasting 80-130 mg/dL, post-meal below 180 mg/dL, and HbA1c below 7% \u2014 but your doctor may set different targets based on your age, medications, and overall health.`;
    }

    // === SYMPTOM-SPECIFIC: Frequent urination ===
    if (/frequent urin|urinating|pee|peeing|bathroom|toilet/.test(normalizedQ) && /often|lot|many|too much|frequent|night|always/.test(normalizedQ)) {
        return `Frequent urination is one of the classic signs that blood sugar is running high. When your blood sugar is elevated, your kidneys work overtime to filter and absorb the excess glucose. When they cannot keep up, the extra sugar goes into your urine, pulling fluids from your body along with it. This creates a cycle: high sugar leads to more urination, which leads to dehydration, which makes you more thirsty, which makes you drink more, which leads to more urination. What to do: (1) Check your blood sugar — frequent urination often means it is above 180-200. (2) Drink water to replace lost fluids (not juice or sugary drinks). (3) Take your prescribed medications. (4) If this is a new symptom or getting worse, see your doctor — it could mean your current treatment needs adjusting. Waking up more than once or twice at night to urinate is also worth mentioning to your doctor.`;
    }

    // === SYMPTOM-SPECIFIC: Extreme thirst ===
    if (/thirsty|thirst|dry mouth|parched/.test(normalizedQ) && /very|extreme|always|so|too|constant|excessive/.test(normalizedQ)) {
        return `Excessive thirst (polydipsia) is a hallmark symptom of high blood sugar. When sugar levels are elevated, your body pulls water from your cells to try to dilute the excess glucose, and your kidneys flush out extra sugar through urine — both of which dehydrate you and trigger intense thirst. What to do: (1) Check your blood sugar immediately. (2) Drink water steadily — sip, do not gulp. (3) If sugar is high (above 250), follow your high-sugar action plan and contact your doctor. (4) Avoid sugary drinks — they will make both the thirst and the sugar worse. If you are newly experiencing extreme thirst along with frequent urination and unexplained weight loss, see a doctor promptly as these could be signs of undiagnosed or poorly controlled diabetes.`;
    }

    // === SYMPTOM-SPECIFIC: Blurry vision ===
    if (/blur|blurry|blurred|vision|see|sight|eye/.test(normalizedQ) && (/problem|issue|cannot|can.t|trouble|difficulty|worse|change|sudden|diabetes|diabetic|sugar|affect/.test(normalizedQ) || (/blur|blurry|blurred/.test(normalizedQ) && /vision|eye|diabetes|sugar/.test(normalizedQ)))) {
        return `Blurry vision can be a symptom of both high and low blood sugar. When sugar is high, fluid shifts in the lens of your eye cause temporary blurriness — this often improves once sugar comes back to normal. However, if you experience: sudden vision changes, floating dark spots, flashes of light, dark or empty areas in your vision, or progressive blurriness that does not improve — see an eye doctor urgently. These could be signs of diabetic retinopathy, a serious complication that can lead to vision loss if not treated early. All people with diabetes should get a dilated eye exam at least once a year, even if vision seems fine.`;
    }

    // === SYMPTOM-SPECIFIC: Fatigue / tiredness ===
    if (/tired|fatigue|exhausted|weak|weakness|energy|no energy|lethargy|sluggish|drowsy/.test(normalizedQ)) {
        return `Feeling tired or low on energy is very common with diabetes, and there are several possible reasons: (1) High blood sugar — when sugar is elevated, your body cannot use glucose efficiently for energy, leaving you tired. (2) Low blood sugar — drops below 70 can cause weakness and fatigue. (3) Poor sleep or sleep apnea, which is more common in diabetes. (4) Dehydration from high sugar flushing fluids. (5) Anemia or thyroid issues, which are more common in people with diabetes. (6) The emotional burden of managing a chronic condition. What helps: check your sugar to rule out highs or lows, stay hydrated, ensure 7-8 hours of sleep, eat balanced meals (do not skip meals), and stay active — even when tired, a short walk can boost energy. If fatigue persists despite good sugar control, ask your doctor to check your thyroid, iron levels, and kidney function.`;
    }

    // === SYMPTOM-SPECIFIC: Slow healing wounds ===
    if (/wound|cut|heal|healing|sore|bruise|scratch|injury/.test(normalizedQ) && /slow|not|long|time|take|delayed|poor/.test(normalizedQ)) {
        return `Slow wound healing is a well-known complication of diabetes, especially when sugar is poorly controlled. High blood sugar impairs blood flow and damages small blood vessels, reducing the delivery of oxygen and nutrients needed for healing. It also weakens the immune system, making infections more likely. What you should do: (1) Keep the wound clean and dry. (2) Apply an antiseptic and cover it. (3) Check it daily for signs of infection — redness spreading, warmth, swelling, pus, foul smell, or increasing pain. (4) Keep your blood sugar as well controlled as possible — this directly affects healing speed. (5) If a wound on your foot is not improving after a few days, or shows any signs of infection, see a doctor urgently — foot wounds in diabetes can escalate quickly. Good sugar control is the best preventive measure for healing problems.`;
    }

    // === SYMPTOM-SPECIFIC: Sweating, shaking, dizziness ===
    if (/shak|shaking|trembl|sweat|sweating|dizzy|dizziness|lightheaded|faint|foggy|confused|confus/.test(normalizedQ)) {
        return `Symptoms like shaking, sweating, dizziness, lightheadedness, or confusion are classic warning signs of low blood sugar (hypoglycemia, typically below 70 mg/dL). Your brain depends heavily on glucose, so when levels drop, it sends urgent signals. Immediate steps: (1) Check your blood sugar if a meter is available. (2) Take 15 grams of fast-acting sugar right now: 3-4 glucose tablets, 4 oz of juice or regular soda, a tablespoon of honey or sugar in water. (3) Sit down somewhere safe. (4) Wait 15 minutes and recheck. (5) Once above 70, eat a small snack with protein to stabilize (peanut butter crackers, cheese with bread, nuts with a biscuit). If symptoms do not improve or you cannot eat safely, get help immediately. If these episodes happen frequently, talk to your doctor about adjusting your medication dose or timing.`;
    }

    // === SYMPTOM-SPECIFIC: Itching / skin problems ===
    if (/itch|itching|skin|rash|dry skin|fungal|infection/.test(normalizedQ) && /diabetes|sugar|diabetic/.test(normalizedQ)) {
        return `Skin problems are common in diabetes. High blood sugar can cause: (1) Dry, itchy skin — poor circulation and dehydration reduce skin moisture. (2) Fungal infections — yeast thrives on sugar, causing itching in warm, moist areas (under breasts, between toes, groin area). (3) Bacterial skin infections — boils, sties, and infected hair follicles. (4) Dark patches on the neck, armpits, or groin (acanthosis nigricans) — a sign of insulin resistance. What helps: keep blood sugar well controlled (this is the most important factor), moisturize dry skin daily, keep skin folds clean and dry, wear breathable cotton clothing, and see a doctor for persistent itching, spreading rashes, or any signs of infection. Do not scratch aggressively — broken skin heals slowly with diabetes.`;
    }

    // === MEDICATION TIMING ===
    if (/before food|after food|before meal|after meal|empty stomach|with food|when to take|timing|before eating|after eating/.test(normalizedQ) && /medicine|medication|tablet|pill|metformin|dose/.test(normalizedQ)) {
        return `Medicine timing depends on the specific drug — here is a general guide: Metformin is usually taken with or after food to reduce stomach upset. Sulfonylureas (like glimepiride, gliclazide) are typically taken 15-30 minutes before meals. DPP-4 inhibitors (like sitagliptin, teneligliptin) can usually be taken with or without food. SGLT2 inhibitors (like dapagliflozin, empagliflozin) are usually taken in the morning. Insulin timing varies by type — rapid-acting before meals, long-acting at the same time each day. The most important things: (1) Take your medicine at the same time every day. (2) Follow the specific instructions your doctor or pharmacist gave you. (3) If you are unsure, ask your pharmacist — they can clarify. (4) Never double a dose if you miss one without checking with your doctor first.`;
    }

    // === WATER / HYDRATION ===
    if (/water|hydrat|dehydrat|drink|fluid/.test(normalizedQ) && /how much|how many|enough|should|daily|glasses|liters|litres/.test(normalizedQ) && !/alcohol|beer|wine|tea|coffee|juice|soda/.test(normalizedQ)) {
        return `Staying well hydrated is especially important with diabetes. Aim for 8-10 glasses (2-2.5 liters) of water daily. When blood sugar is high, your kidneys work harder to filter excess glucose, and you lose more water through urination — so drink even more during high sugar episodes. Signs of dehydration include dark urine, dry mouth, headache, and fatigue. Water, plain buttermilk (chaas), and unsweetened herbal tea are the best choices. Tips: keep a water bottle with you throughout the day, set phone reminders if you forget to drink, and have a glass of water before each meal. Avoid sugary drinks, packaged juices, and excessive caffeinated beverages as substitutes for water.`;
    }

    // === WHAT IS DIABETES / HOW DOES IT AFFECT THE BODY ===
    if (/what is diabetes|what.s diabetes/.test(normalizedQ) || (/diabetes/.test(normalizedQ) && /affect.*body|how does it affect/.test(normalizedQ))) {
        return `Diabetes is a chronic condition where your body either does not produce enough insulin (Type 1) or cannot use insulin effectively (Type 2). Insulin is a hormone that helps glucose from your food enter your cells for energy. Without proper insulin function, sugar builds up in your blood instead of being used. Over time, this high blood sugar can damage: (1) Blood vessels — leading to heart disease, stroke, and poor circulation. (2) Nerves — causing numbness, tingling, and pain especially in feet and hands. (3) Kidneys — potentially leading to kidney failure. (4) Eyes — causing diabetic retinopathy and vision loss. (5) Immune system — making infections harder to fight and wounds slower to heal. The good news is that with proper management through diet, exercise, medication, and monitoring, most people with diabetes can live full, healthy lives and prevent or delay these complications.`;
    }

    // === IS DIABETES HEREDITARY / GENETIC ===
    if (/hereditary|genetic|family|inherit|run in|passed down|born with/.test(normalizedQ) && /diabetes/.test(normalizedQ)) {
        return `Yes, genetics play a significant role in diabetes risk. If a parent or sibling has Type 2 diabetes, your risk is 2-6 times higher than someone without family history. For Type 1 diabetes, the genetic link is also present but less predictable. However, having the gene does not guarantee you will develop diabetes — lifestyle factors make a huge difference. Many people with strong family history avoid diabetes through: (1) Maintaining a healthy weight. (2) Regular physical activity — 150 minutes per week. (3) Balanced diet with limited refined carbs and sugary foods. (4) Regular screening — get fasting sugar and HbA1c checked annually if you have family history. (5) Managing stress and sleeping well. Think of it this way: genetics loads the gun, but lifestyle pulls the trigger. You have significant power to prevent or delay Type 2 diabetes even with a family history.`;
    }

    // === AT WHAT AGE CAN DIABETES START ===
    if (/\bage\b|how old|when.*start|when.*develop|young|child|kid|teenager/.test(normalizedQ) && /diabetes|sugar/.test(normalizedQ)) {
        return `Diabetes can start at any age — there is no safe threshold. Type 1 diabetes most commonly appears in children and young adults (ages 5-15), though it can develop at any age. Type 2 diabetes was traditionally seen in adults over 40, but it is increasingly being diagnosed in younger people, even teenagers, due to rising obesity and sedentary lifestyles. Gestational diabetes occurs during pregnancy, usually in the second or third trimester. Risk factors that may cause earlier onset of Type 2: (1) Family history of diabetes. (2) Being overweight, especially around the belly. (3) Sedentary lifestyle. (4) PCOS in women. (5) History of gestational diabetes. If you have risk factors, screening should start at age 35 or earlier. For children with risk factors like obesity and family history, screening may start even younger.`;
    }

    // === WHAT HAPPENS IF DIABETES IS NOT CONTROLLED ===
    if ((/what happens|consequences|uncontrolled|not controlled|ignore|neglect|untreated/.test(normalizedQ) && /diabetes|sugar/.test(normalizedQ)) || (/complications/.test(normalizedQ) && /long.term|diabetes/.test(normalizedQ))) {
        return `Uncontrolled diabetes causes serious damage over time — often silently before symptoms appear. The main complications include: (1) Heart disease and stroke — diabetes doubles the risk of cardiovascular problems. (2) Kidney damage (nephropathy) — can progress to kidney failure requiring dialysis. (3) Eye damage (retinopathy) — leading cause of blindness in working-age adults. (4) Nerve damage (neuropathy) — numbness, pain, and tingling in feet and hands, plus digestive issues. (5) Foot problems — poor circulation and nerve damage can lead to infections, ulcers, and in severe cases, amputation. (6) Skin infections and slow wound healing. (7) Dental problems — increased risk of gum disease. (8) Sexual dysfunction. (9) Increased risk of dementia. The critical message: most of these complications are preventable or can be significantly delayed with good blood sugar control, regular checkups, medication compliance, and a healthy lifestyle. Starting early makes a huge difference.`;
    }

    // === HUNGER / POLYPHAGIA ===
    if (/hungry|hunger|appetite|polyphagia|eating a lot|starving/.test(normalizedQ) && /often|always|very|constant|excessive|too much|why|extreme|increased/.test(normalizedQ)) {
        return `Excessive hunger (polyphagia) is one of the classic symptoms of diabetes, along with excessive thirst and frequent urination. Here is why it happens: when your body cannot use insulin properly, glucose stays in your blood instead of entering your cells for energy. Your cells are essentially starving even though there is plenty of sugar in your blood. So your body signals for more food. What to do: (1) Check your blood sugar — persistent hunger often means levels are running high. (2) Eat protein-rich and fiber-rich meals that keep you full longer (eggs, dal, vegetables, nuts). (3) Avoid refined carbs and sugary snacks — they spike and crash your sugar, making you hungrier. (4) Eat smaller, more frequent meals instead of large infrequent ones. (5) Stay hydrated — sometimes thirst is mistaken for hunger. If you are newly experiencing extreme hunger with weight loss and frequent urination, see a doctor for blood sugar testing.`;
    }

    // === WEIGHT LOSS AS SYMPTOM ===
    if (/weight loss|losing weight|lost weight/.test(normalizedQ) && /symptom|sign|sudden|unexplained|diabetes|without trying/.test(normalizedQ)) {
        return `Yes, unexplained weight loss can be an important symptom of diabetes — especially Type 1 diabetes or advanced Type 2. Here is why: when your body cannot use glucose for energy (due to lack of insulin or insulin resistance), it starts breaking down fat and muscle for fuel instead. This causes weight loss even though you may be eating normally or even more than usual. Key warning signs to watch for: weight loss combined with increased thirst, frequent urination, extreme fatigue, and increased hunger. If you are losing weight without trying and have these symptoms, please see a doctor and get your blood sugar tested promptly. For people already diagnosed with diabetes, unexpected weight loss could mean your blood sugar is poorly controlled and needs medical attention.`;
    }

    // === FREQUENT INFECTIONS ===
    if (/infection|infected/.test(normalizedQ) && /frequent|sign|symptom|diabetes|often|recurring|repeated/.test(normalizedQ)) {
        return `Yes, frequent infections can be a sign of diabetes or poorly controlled blood sugar. High blood sugar weakens your immune system in several ways: (1) White blood cells function less effectively when bathed in excess glucose. (2) Poor blood circulation reduces the delivery of immune cells to infection sites. (3) High sugar in body tissues creates a favorable environment for bacteria and fungi to grow. Common infections more frequent in diabetes: urinary tract infections (UTIs), yeast infections, skin infections (boils, fungal rashes), gum infections, and respiratory infections. If you are experiencing recurring infections, get your blood sugar tested if you have not already. For those with diagnosed diabetes, frequent infections often signal that blood sugar control needs improvement — talk to your doctor about adjusting your treatment plan.`;
    }

    // === CHAPATI vs RICE ===
    if (/chapati|roti/.test(normalizedQ) && /rice/.test(normalizedQ) && /better|compare|versus|vs|or|which/.test(normalizedQ)) {
        return `Whole wheat chapati is generally a better choice than white rice for blood sugar management. Here is why: chapati has a lower glycemic index (around 55-60) compared to white rice (around 70-73), meaning it raises blood sugar more slowly. Chapati also has more fiber and protein per serving, which helps you feel full longer. However, the real-world answer is more nuanced: (1) Portion matters more than choice — 1-2 rotis is better than 4 rotis, just as a small cup of rice is better than a heaping plate. (2) What you eat WITH it matters — dal, vegetables, and curd alongside either option improves the meal. (3) You do not have to completely give up rice — try smaller portions mixed with brown rice or millets. (4) Multigrain roti (with besan, ragi, or bajra flour) is even better than plain wheat roti. The best approach is variety and moderation rather than strict elimination.`;
    }

    // === JAGGERY / GUR ===
    if (/jaggery|gur|gud/.test(normalizedQ) && /sugar|diabetes|better|safe|alternative|instead|replace/.test(normalizedQ)) {
        return `This is a very common myth that needs clearing up. Jaggery (gur) is NOT significantly better than white sugar for people with diabetes. While jaggery has some trace minerals like iron and potassium that refined sugar lacks, it still has nearly the same impact on blood sugar. Both are sucrose-based and will spike your glucose similarly. The glycemic index of jaggery (84) is very close to white sugar (65-80). So substituting jaggery for sugar will not help your blood sugar control. What does help: (1) Reduce overall sweetener use gradually. (2) Use doctor-approved artificial sweeteners like stevia if you need sweetness. (3) Satisfy sweet cravings with small portions of fruit paired with nuts. (4) Do not believe marketing claims that jaggery, honey, or coconut sugar are "diabetes-safe" — they all raise blood sugar.`;
    }

    // === IS FRUIT SAFE ===
    if (/fruit/.test(normalizedQ) && /safe|good|okay|fine|eat|can i|allowed|diabetes/.test(normalizedQ) && !/specific|which|mango|banana|apple|watermelon|grapes|dates/.test(normalizedQ)) {
        return `Yes, most fruits are safe for people with diabetes when eaten in moderation and with the right approach. Fruits contain natural sugar, but they also provide fiber, vitamins, and antioxidants that are important for health. The key guidelines: (1) Eat whole fruits, not juice — the fiber in whole fruit slows sugar absorption significantly. (2) Stick to 1-2 servings per day spread across different meals. (3) Best choices: guava, apple, pear, orange, papaya, berries, and plums — these have lower glycemic impact. (4) Moderate carefully: mango, banana, grapes, chiku, and watermelon — smaller portions of these as they raise sugar faster. (5) Pair fruit with protein: a few nuts alongside fruit slows the sugar response. (6) Avoid dried fruits in large quantities — they are concentrated sugar. (7) Check your post-meal sugar 2 hours after eating fruit to learn your personal response.`;
    }

    // === INDIAN FOODS TO CONTROL BLOOD SUGAR ===
    if (/indian food|desi food|which food|what food/.test(normalizedQ) && /help|control|lower|reduce|good|manage|diabetes/.test(normalizedQ)) {
        return `There are many excellent Indian foods that help manage blood sugar: (1) Bitter gourd (karela) — has compounds that mimic insulin and help lower blood sugar. (2) Fenugreek seeds (methi) — soak overnight and eat in the morning, or add methi leaves to rotis. (3) Indian gooseberry (amla) — rich in vitamin C and helps with glucose metabolism. (4) Drumstick (moringa/sahjan) — helps reduce blood sugar spikes. (5) Cinnamon (dalchini) — half a teaspoon daily may improve insulin sensitivity. (6) Turmeric (haldi) — anti-inflammatory properties help with insulin resistance. (7) Millets (bajra, ragi, jowar) — excellent low-glycemic alternatives to rice. (8) Green leafy vegetables — spinach (palak), fenugreek leaves (methi), amaranth. (9) Dal and legumes — good protein and fiber, slower sugar release. (10) Curd/yogurt — probiotic benefits and protein. Include these regularly in your meals alongside proper medication and exercise.`;
    }

    // === CARB INTAKE FOR DIABETICS ===
    if (/how many carb|carb.*per day|daily carb|carbohydrate.*intake|carb.*count.*diabetic/.test(normalizedQ) && /diabeti|diabetes|per day|daily|should/.test(normalizedQ)) {
        return `Carbohydrate needs vary by individual, but here are general guidelines for people with diabetes: (1) Most adults with diabetes do well with 130-230 grams of carbs per day, which translates to about 45-60 grams per meal and 15-20 grams per snack. (2) The American Diabetes Association does not prescribe a single carb target — it depends on your activity level, medications, weight goals, and blood sugar patterns. (3) Carb counting is one of the most effective tools for blood sugar management. Learn to read nutrition labels and measure portions. (4) Focus on quality: choose complex carbs (whole grains, legumes, vegetables) over simple carbs (white bread, sugar, refined flour). (5) Pair carbs with protein, fat, or fiber to slow glucose absorption. (6) A registered dietitian can help create a personalized meal plan. (7) For low-carb approaches, some people with Type 2 diabetes see excellent results with 50-130 grams per day, but this should be done under medical supervision especially if you take insulin or sulfonylureas, as medication doses may need adjustment. Monitor your blood sugar response to find your personal carb tolerance.`;
    }

    // === SUGAR-FREE FOOD SAFETY ===
    if (/sugar.free|sugar free|artificial sweetener|zero sugar/.test(normalizedQ) && /safe|good|ok|diabeti|eat|use|healthy/.test(normalizedQ)) {
        return `Sugar-free foods can be part of a diabetes diet, but they are not automatically healthy. Here is what you need to know: (1) Sugar-free does NOT mean carb-free — many sugar-free products still contain carbohydrates from flour, starch, or fillers that raise blood sugar. Always check the total carb count on the label. (2) Artificial sweeteners (aspartame, sucralose, stevia, saccharin) do not directly raise blood sugar and are generally considered safe in moderate amounts. The FDA has approved them. (3) Sugar alcohols (sorbitol, xylitol, erythritol, maltitol) are common in sugar-free sweets. They have fewer calories but can still raise blood sugar somewhat, and excessive intake causes bloating, gas, and diarrhea. (4) Sugar-free biscuits, chocolates, and desserts marketed for diabetics often have similar calories and fat as regular versions. (5) Best approach: use sugar-free products as occasional treats, not daily staples. Focus on naturally low-sugar foods like vegetables, nuts, seeds, and lean proteins. (6) Stevia and erythritol are among the best-tolerated sugar substitutes for most people with diabetes.`;
    }

    // === VEGETABLES FOR DIABETES ===
    if (/vegetable.*good|vegetable.*diabetes|vegetable.*diabetic|best vegetable|which vegetable|what vegetable/.test(normalizedQ)) {
        return `Most non-starchy vegetables are excellent for diabetes — they are low in carbs, high in fiber, and packed with vitamins. Top picks: (1) Leafy greens — spinach, kale, methi (fenugreek leaves), lettuce, amaranth. Very low carb, high in magnesium which improves insulin sensitivity. (2) Bitter gourd (karela) — has compounds that mimic insulin and can help lower blood sugar. (3) Broccoli and cauliflower — rich in fiber and sulforaphane, which may reduce blood sugar. (4) Okra (bhindi) — contains polysaccharides that may help lower blood sugar. (5) Tomatoes — low GI, rich in lycopene (heart-protective). (6) Cucumber and bottle gourd (lauki) — very low calorie, hydrating. (7) Bell peppers — low carb, high in vitamin C. (8) Beans and legumes — lentils (dal), chickpeas, kidney beans are high in fiber and protein, causing slow glucose release. (9) Onions and garlic — contain compounds that may improve insulin sensitivity. Aim for half your plate to be non-starchy vegetables at each meal. Limit starchy vegetables like potatoes, yam, and corn to small portions. Cooking method matters — steamed, sauteed, or raw is better than deep-fried.`;
    }

    // === POTATOES AND DIABETES ===
    if (/potato/.test(normalizedQ) && /diabeti|diabetes|eat|safe|good|blood sugar|ok|can/.test(normalizedQ)) {
        return `Potatoes can be eaten by diabetics, but with some important caveats: (1) Potatoes are high on the glycemic index (GI 70-90 depending on preparation), meaning they cause rapid blood sugar spikes. (2) Portion control is key — limit to about half a cup or one small potato per meal. (3) Preparation method matters significantly: boiled and cooled potatoes have lower GI due to resistant starch formation. Baked and mashed potatoes spike sugar the most. Fried potatoes (chips, french fries) are the worst due to added fat and high GI. (4) Better strategies: pair potatoes with protein (dal, chicken, fish) and fiber (vegetables, salad) to slow glucose absorption. Add vinegar or lemon juice which can lower the glycemic response. (5) Sweet potatoes are a better alternative — they have a lower GI (44-61) and more fiber than white potatoes. (6) If you eat potatoes, check your blood sugar 2 hours after to see your personal response. Some people tolerate them well, others spike significantly. (7) Consider replacing potatoes with cauliflower, turnips, or radishes for a lower-carb alternative in recipes.`;
    }

    // === DANGEROUS BLOOD SUGAR LEVELS ===
    if (/dangerous.*blood sugar|dangerous.*glucose|blood sugar.*dangerous|blood sugar.*emergency|critically.*high.*sugar|critically.*low.*sugar|what level.*dangerous/.test(normalizedQ)) {
        return `Dangerous blood sugar levels require immediate attention: DANGEROUSLY HIGH (hyperglycemia): (1) Above 250 mg/dL — concerning, especially with ketones. Check for ketones if Type 1. (2) Above 300 mg/dL — serious. May cause diabetic ketoacidosis (DKA) in Type 1 or hyperosmolar hyperglycemic state (HHS) in Type 2. Symptoms: excessive thirst, frequent urination, nausea, confusion, fruity breath. (3) Above 400 mg/dL — medical emergency. (4) Above 600 mg/dL — life-threatening, can cause coma and organ damage. DANGEROUSLY LOW (hypoglycemia): (1) Below 70 mg/dL — mild low, treat with 15g fast-acting carbs (glucose tablets, juice, candy). (2) Below 54 mg/dL — serious hypoglycemia. May need assistance from others. (3) Below 40 mg/dL — severe, risk of seizures, loss of consciousness, brain damage. Call emergency services. Immediate action: For highs above 300: drink water, take correction insulin if prescribed, check ketones, seek medical help if not improving. For lows below 70: follow the 15-15 rule — eat 15g sugar, wait 15 minutes, recheck. If someone is unconscious, use glucagon injection and call emergency services. Normal target: 80-130 mg/dL fasting, below 180 mg/dL after meals.`;
    }

    // === FASTING VS RANDOM BLOOD SUGAR ===
    if (/fasting.*random|random.*fasting|difference.*fasting.*blood|difference.*random.*blood|fasting.*vs.*random|random.*vs.*fasting/.test(normalizedQ) && /sugar|glucose|blood|test|differ/.test(normalizedQ)) {
        return `Fasting and random blood sugar are two different types of glucose measurements: FASTING BLOOD SUGAR (FBS/FPG): (1) Taken after at least 8 hours of no eating or drinking (except water). (2) Usually done first thing in the morning. (3) Measures your baseline glucose without food influence. (4) Normal: below 100 mg/dL. Prediabetes: 100-125 mg/dL. Diabetes: 126 mg/dL or above (confirmed on two separate tests). (5) Best for: diagnosing diabetes, monitoring overnight glucose control, adjusting long-acting insulin or bedtime medications. RANDOM BLOOD SUGAR (RBS): (1) Taken at any time of day, regardless of meals. (2) No fasting required. (3) Normal: varies, but generally below 140 mg/dL if more than 2 hours after eating. (4) Diabetes suspected: 200 mg/dL or above with symptoms (thirst, frequent urination, weight loss). (5) Best for: quick screening, checking during illness, confirming suspected highs or lows. Key differences: FBS is more standardized and reliable for diagnosis and trends. RBS is convenient for spot-checks but varies based on meals and timing. Post-meal blood sugar (taken 2 hours after eating) is a third type — normal is below 140 mg/dL, diabetes threshold is 200 mg/dL. Your doctor may order both FBS and a post-meal test for a complete picture.`;
    }

    // === DIABETES SCREENING FREQUENCY ===
    if (/screen.*diabetes|screening.*frequen|how often.*screen|how frequently.*screen|population.*screen|who should.*screen|when.*screen.*diabetes/.test(normalizedQ)) {
        return `Diabetes screening guidelines vary by risk factors and population: GENERAL ADULTS: (1) All adults aged 35 and older should be screened every 3 years (updated ADA 2024 guidelines). (2) If results are normal and no risk factors, rescreen every 3 years. HIGH-RISK ADULTS (screen earlier and more often — every 1-2 years): (1) BMI 25+ (or 23+ for Asian populations) with any risk factor: family history, physical inactivity, high-risk ethnicity (South Asian, African American, Hispanic, Native American), history of gestational diabetes, polycystic ovary syndrome, hypertension, abnormal cholesterol, history of heart disease, or HbA1c above 5.7%. CHILDREN AND ADOLESCENTS: (1) Screen if overweight (BMI above 85th percentile) plus risk factors, starting at age 10 or puberty onset, whichever is earlier. (2) Rescreen every 2 years. PREGNANCY: (1) Screen for gestational diabetes at 24-28 weeks for all pregnancies. (2) Screen earlier if high risk (obesity, prior GDM, family history). PREDIABETES: (1) If diagnosed with prediabetes, retest annually. Why screening matters: Type 2 diabetes can be silent for years — up to 50% of people with diabetes are undiagnosed. Early detection allows lifestyle changes that can prevent or delay progression. Common screening tests: fasting glucose, HbA1c, or OGTT.`;
    }

    // === LEMON WATER ===
    if (/lemon/.test(normalizedQ) && /water|drink|good|benefit|help|diabetes/.test(normalizedQ)) {
        return `Yes, lemon water is a great choice for people with diabetes! It is essentially calorie-free and sugar-free when made without added sugar or honey. Benefits: (1) Keeps you hydrated without adding sugar or calories. (2) Lemon has vitamin C, which supports immune function. (3) The citric acid may help slow digestion slightly, which can help with post-meal sugar spikes. (4) It is a good replacement for sugary drinks, packaged juices, and sodas. How to have it: squeeze half a lemon into a glass of warm or room temperature water. Do NOT add sugar or honey — that defeats the purpose. You can add a pinch of salt or a few mint leaves for flavor. Have it in the morning or before meals. It is safe to drink daily and most people with diabetes can benefit from this simple habit.`;
    }

    // === EXERCISE HELP DIABETES (GENERAL) ===
    if (/how.*exercise.*help.*diabetes|how.*exercise.*benefit.*diabetes|exercise.*help.*manag|benefit.*exercise.*diabetes|why.*exercise.*important.*diabetes/.test(normalizedQ)) {
        return `Exercise is one of the most powerful tools for managing diabetes — nearly as impactful as medication for many people. Here is how it helps: (1) Muscles use glucose directly for fuel during activity, lowering blood sugar without extra insulin. (2) Exercise increases insulin sensitivity for 24-48 hours after each session — meaning your body uses insulin more efficiently. (3) Regular exercise reduces visceral (belly) fat, which is the fat most linked to insulin resistance. (4) It improves cardiovascular health — critical because diabetes doubles heart disease risk. (5) Exercise lowers blood pressure and cholesterol, both common diabetes complications. (6) It helps with weight management, stress reduction, better sleep, and mood — all of which affect blood sugar control. (7) Strength training builds muscle, and muscle is the largest glucose-absorbing tissue in the body. Guidelines: aim for 150 minutes of moderate aerobic exercise per week (brisk walking, cycling, swimming) plus 2-3 resistance training sessions. Even a 10-15 minute walk after meals reduces sugar spikes by 20-30%. Start gradually and check blood sugar before and after exercise if you take insulin or sulfonylureas.`;
    }

    // === HOW OFTEN CHECK BLOOD SUGAR ===
    if (/how often.*check.*blood sugar|how often.*test.*blood sugar|how often.*monitor.*blood sugar|how often.*check.*glucose|frequency.*blood sugar.*check|how often.*diabetic.*check/.test(normalizedQ)) {
        return `Blood sugar monitoring frequency depends on your diabetes type and treatment: Type 1 diabetes or insulin-dependent Type 2: (1) Check 4-10 times daily — before meals, before bedtime, before exercise, and whenever you feel low or high. (2) CGM (Continuous Glucose Monitor) is ideal if available, providing readings every 5 minutes. Type 2 on oral medications: (1) Typically 1-3 times daily. (2) Fasting (morning) readings are most important for tracking trends. (3) Occasional post-meal checks (2 hours after eating) help identify food impacts. Type 2 managed with diet and exercise only: (1) 2-4 times per week may be sufficient. (2) Check fasting levels and occasional post-meal readings. When to check extra: when sick, changing medications, trying new foods, under stress, or if symptoms suggest high/low sugar. Key targets: fasting 80-130 mg/dL, 2 hours after meals below 180 mg/dL, bedtime 100-150 mg/dL. Always follow your doctor's specific recommendations as these may vary based on your individual situation.`;
    }

    // === WALKING AND BLOOD SUGAR ===
    if (/walk|walking/.test(normalizedQ) && /reduce|lower|help|blood sugar|glucose|diabetes|control|benefit/.test(normalizedQ)) {
        return `Absolutely — walking is one of the most effective and accessible ways to lower blood sugar. Here is the evidence: (1) A 15-minute walk after meals can reduce post-meal blood sugar spikes by 20-30%. (2) Your muscles use glucose for fuel during exercise, pulling it directly from your blood without needing insulin. (3) Regular walking improves insulin sensitivity, meaning your body uses insulin more efficiently even when you are not walking. (4) It also helps with weight management, blood pressure, cholesterol, mood, and sleep — all important in diabetes. Practical tips: start with 10-15 minutes after your largest meal, wear comfortable shoes, walk at a brisk pace (fast enough that you can talk but not sing), and build up to 30-45 minutes daily. Aim for 150 minutes of walking per week. Even breaking it into three 10-minute walks throughout the day gives significant benefits.`;
    }

    // === HOW MUCH EXERCISE ===
    if (/how much exercise|how long.*exercise|exercise.*daily|exercise.*per day|exercise.*per week/.test(normalizedQ) && /diabetes|diabetic|should/.test(normalizedQ)) {
        return `For people with diabetes, the recommended exercise amount is: (1) At least 150 minutes of moderate aerobic activity per week — that is about 30 minutes, 5 days a week. Brisk walking, cycling, swimming, or dancing all count. (2) Plus 2-3 sessions of strength/resistance training per week — this builds muscle which absorbs more glucose. Bodyweight exercises, resistance bands, or light weights work. (3) Do not go more than 2 consecutive days without exercise — the insulin sensitivity benefit fades after 48 hours. (4) Post-meal walking (even 10-15 minutes) is especially effective at reducing sugar spikes. Start wherever you are and build gradually. If you are currently inactive, even 10 minutes of walking daily is a great start. Check your sugar before exercising if you take insulin or sulfonylureas. Keep a glucose tablet or juice handy in case of lows during exercise.`;
    }

    // === SLEEP AND DIABETES RISK ===
    if (/sleep/.test(normalizedQ) && /increase|risk|diabetes|cause|affect|lack|poor|less/.test(normalizedQ)) {
        return `Yes, poor sleep significantly increases diabetes risk and worsens control for those who already have it. Research shows: (1) Sleeping less than 6 hours regularly increases Type 2 diabetes risk by up to 28%. (2) Even one night of poor sleep can temporarily increase insulin resistance. (3) Sleep deprivation raises cortisol (stress hormone) which directly raises blood sugar. (4) Poor sleep increases hunger hormones, leading to overeating and weight gain. (5) Sleep apnea — very common in people with diabetes — causes intermittent oxygen drops that worsen insulin resistance. What to do: aim for 7-8 hours of consistent sleep, go to bed and wake up at the same time, avoid screens and caffeine before bed, keep your room cool and dark, and talk to your doctor if you snore heavily or feel unrefreshed despite sleeping (possible sleep apnea).`;
    }

    // === OBESITY AND DIABETES ===
    if (/obes|overweight|fat|bmi/.test(normalizedQ) && /cause|diabetes|risk|lead|increase|develop/.test(normalizedQ)) {
        return `Yes, obesity is the single biggest modifiable risk factor for Type 2 diabetes. About 80-90% of people with Type 2 diabetes are overweight or obese. Here is why: (1) Excess fat, especially around the belly (visceral fat), causes chronic inflammation that makes cells resistant to insulin. (2) The more resistant your cells become, the more insulin your pancreas has to produce, and eventually it cannot keep up. (3) This insulin resistance is the core mechanism of Type 2 diabetes. The good news is that even modest weight loss makes a dramatic difference — losing just 5-7% of body weight (about 4-6 kg for a 80 kg person) can reduce diabetes risk by up to 58%. Focus on: sustainable dietary changes (not crash diets), regular physical activity, adequate sleep, and stress management. If you are overweight and have family history of diabetes, regular blood sugar screening is important.`;
    }

    // === SITTING / SEDENTARY LIFESTYLE ===
    if (/sit|sitting|sedentary|inactive|desk|office/.test(normalizedQ) && /diabetes|risk|increase|cause|blood sugar/.test(normalizedQ)) {
        return `Yes, prolonged sitting and a sedentary lifestyle significantly increase diabetes risk. Studies show that sitting for more than 8 hours daily without breaks increases Type 2 diabetes risk by 90% compared to active individuals. Here is why: (1) Muscles are the body's largest glucose consumer — when inactive, they absorb much less glucose. (2) Sitting for hours reduces insulin sensitivity. (3) Sedentary behavior promotes weight gain, especially around the belly. Simple fixes: (1) Get up and move for 2-3 minutes every 30 minutes — set a phone timer. (2) Take walking meetings or phone calls. (3) Use stairs instead of elevators. (4) Stand while working for parts of the day. (5) Take a short walk after meals. (6) Even light activity like stretching or standing reduces the harmful effects of sitting. Combining these small movement habits throughout the day can significantly improve your blood sugar and reduce diabetes risk.`;
    }

    // === YOGA AND DIABETES ===
    if (/yoga/.test(normalizedQ) && /diabetes|blood sugar|help|benefit|control|useful|good/.test(normalizedQ)) {
        return `Yes, yoga is genuinely helpful for diabetes management — and there is growing scientific evidence to support it. Benefits: (1) Reduces stress and cortisol levels — stress directly raises blood sugar. (2) Improves insulin sensitivity. (3) Helps with weight management. (4) Lowers blood pressure and improves circulation. (5) Improves sleep quality. Particularly helpful yoga practices: Surya Namaskar (Sun Salutation), Pranayama (breathing exercises, especially Kapalbhati and Anulom Vilom), Vajrasana (sitting after meals aids digestion), and gentle asanas focusing on abdominal compression. Tips: (1) Practice regularly — 20-30 minutes daily is ideal. (2) Do under guidance initially to learn proper form. (3) Yoga complements but does not replace your medication and diet plan. (4) Check sugar before practice if you take insulin. (5) Combine yoga with walking or other aerobic exercise for the best overall benefit.`;
    }

    // === HEART DISEASE AND DIABETES ===
    if (/heart/.test(normalizedQ) && /diabetes|cause|risk|disease|attack|affect/.test(normalizedQ)) {
        return `Yes, diabetes significantly increases the risk of heart disease — it is actually the leading cause of death in people with diabetes. Having diabetes makes you 2-4 times more likely to develop heart disease or have a stroke compared to someone without diabetes. Here is why: (1) High blood sugar damages blood vessel walls over time, promoting plaque buildup (atherosclerosis). (2) Diabetes often coexists with high blood pressure and abnormal cholesterol, multiplying the risk. (3) Insulin resistance itself promotes inflammation that damages arteries. To protect your heart: (1) Keep blood sugar well controlled (HbA1c under 7% for most people). (2) Control blood pressure (target usually below 130/80). (3) Manage cholesterol — take statins if prescribed. (4) Do not smoke. (5) Exercise regularly. (6) Maintain a healthy weight. (7) Report any chest pain, breathlessness, or unusual fatigue to your doctor immediately. Heart checkups should be part of your regular diabetes care.`;
    }

    // === PREDIABETES ===
    if (/prediabetes|pre diabetes|pre-diabetes|borderline/.test(normalizedQ) && /turn|become|progress|develop|diabetes|worsen|convert/.test(normalizedQ)) {
        return `Yes, prediabetes can turn into Type 2 diabetes — but it does not have to. Prediabetes means your blood sugar is higher than normal but not yet in the diabetes range (fasting 100-125 mg/dL or HbA1c 5.7-6.4%). Without intervention, about 15-30% of people with prediabetes develop Type 2 diabetes within 5 years. The critical good news: prediabetes is the stage where you have the most power to change course. Research shows that lifestyle changes can reduce the risk of progressing to diabetes by up to 58%. The proven formula: (1) Lose 5-7% of body weight if overweight. (2) Exercise 150 minutes per week (brisk walking works). (3) Eat more vegetables, whole grains, and lean protein. (4) Reduce refined carbs, sugary drinks, and processed foods. (5) Get regular sleep and manage stress. (6) Monitor your blood sugar every 3-6 months. This is genuinely the best time to act — think of prediabetes as an early warning signal, not a diagnosis.`;
    }

    // === CAN DIABETES BE CONTROLLED WITHOUT MEDICINE ===
    if (/without medicine|without medication|without tablet|without drug|no medicine|no medication/.test(normalizedQ) && /diabetes|sugar|controlled|manage|control/.test(normalizedQ)) {
        return `It depends on the type and stage of diabetes. For many people with early Type 2 diabetes or prediabetes, lifestyle changes alone can effectively control blood sugar: (1) Diet modification — reducing refined carbs, eating more vegetables and protein, portion control. (2) Regular exercise — 150 minutes per week of brisk walking or equivalent. (3) Weight loss — even 5-7% body weight loss makes a significant difference. (4) Stress management and adequate sleep. However, this is not possible for everyone: (1) Type 1 diabetes always requires insulin — there are no exceptions. (2) Advanced Type 2 diabetes usually needs medication as the pancreas produces less insulin over time. (3) Some people have such strong genetic factors that lifestyle alone is not sufficient. Important: never stop or reduce your medicines without discussing with your doctor first. Your doctor may reduce medication gradually as your lifestyle improvements show results in your blood sugar numbers and HbA1c.`;
    }

    // === WHEN TO VISIT DOCTOR ===
    if (/when.*visit|when.*see|when.*go|when.*consult|when.*call/.test(normalizedQ) && /doctor|hospital|clinic|medical|emergency/.test(normalizedQ) && /diabetes|diabetic|sugar/.test(normalizedQ)) {
        return `Regular and emergency doctor visits are both important in diabetes management. Routine visits: (1) Every 3 months for HbA1c check and medication review. (2) Annual comprehensive exam including eye exam, kidney function tests, foot exam, cholesterol, and blood pressure. (3) Whenever your doctor asks you to follow up after a medication change. See your doctor sooner if: (1) Blood sugar consistently above 250 or below 70 despite following your plan. (2) You develop new symptoms — increased thirst, frequent urination, unexplained weight loss, persistent fatigue. (3) Numbness or tingling in hands/feet that is new or worsening. (4) Any wound on your foot that is not healing within a few days. (5) Recurring infections. Go to emergency care immediately for: blood sugar above 400, signs of DKA (vomiting, stomach pain, fruity breath, confusion), severe low sugar you cannot treat, chest pain, sudden vision changes, or difficulty breathing.`;
    }

    // === RICE DAILY ===
    if (/rice/.test(normalizedQ) && /daily|every day|everyday|regularly/.test(normalizedQ) && /diabetes|diabetic|eat|can/.test(normalizedQ)) {
        return `You can eat rice daily with diabetes, but portion control and how you eat it matters a lot. Rice is a staple for millions of Indians with diabetes — completely giving it up is not realistic or necessary. Smart rice strategies: (1) Reduce your portion to half a cup to one small cup of cooked rice per meal. (2) Always eat rice with dal, vegetables, and protein — this slows sugar absorption. (3) Eat your vegetables and dal first, then the rice. (4) Try mixing white rice 50/50 with brown rice or millets. (5) Slightly cooled and reheated rice has more resistant starch which affects sugar less. (6) Consider replacing rice at dinner if your fasting morning sugar is high — use roti or millets instead. (7) Check your sugar 2 hours after eating to see your personal response to different rice portions. The goal is not to eliminate rice but to find the right amount that works for your body and your blood sugar targets.`;
    }

    // === MANGOES FOR DIABETICS (broader match) ===
    if (/mango/.test(normalizedQ) && /diabetes|diabetic|eat|safe|can|good|bad|okay/.test(normalizedQ) && !askingHowMuch) {
        return `I know mangoes are hard to resist, especially in summer! Here is the honest answer: mangoes are high in natural sugar and will raise your blood sugar, but they are not completely off-limits for most people with controlled diabetes. The key is portion: a few small slices (about half a cup or a quarter of a medium mango) is much safer than eating a whole mango at once. Tips: (1) Eat it as part of a meal, not alone on an empty stomach. (2) Pair with a handful of nuts to slow sugar absorption. (3) Check your sugar 2 hours after to see how YOUR body responds. (4) If your sugar is already running high that day, skip the mango. (5) Choose less ripe mangoes which have slightly less sugar. (6) Count it as your fruit serving for the day. Some people with very tight sugar control may need to avoid mangoes entirely — test and know your personal response.`;
    }

    // === HOW IS DIABETES DIAGNOSED ===
    if (/diagnos|test.*diabetes|detect.*diabetes|how.*know.*diabetes/.test(normalizedQ)) {
        return `Diabetes is diagnosed through blood tests. The main tests are: (1) Fasting Blood Sugar (FBS) — blood drawn after 8+ hours of fasting. Normal is below 100 mg/dL, prediabetes is 100-125, diabetes is 126 or above. (2) HbA1c — measures average blood sugar over 2-3 months. Normal is below 5.7%, prediabetes is 5.7-6.4%, diabetes is 6.5% or above. (3) Oral Glucose Tolerance Test (OGTT) — you drink a glucose solution and blood is tested after 2 hours. Normal is below 140, prediabetes is 140-199, diabetes is 200 or above. (4) Random Blood Sugar — taken anytime without fasting. A reading of 200 or above with symptoms like excessive thirst, urination, or weight loss suggests diabetes. Usually, two abnormal test results on different days are needed to confirm the diagnosis. If you suspect diabetes, ask your doctor for a fasting blood sugar and HbA1c test as a starting point.`;
    }

    // === WHAT IS HbA1c ===
    if (/hba1c|a1c|glycated hemoglobin|hemoglobin a1c/.test(normalizedQ) && /what|why|important|mean|explain/.test(normalizedQ)) {
        return `HbA1c (also called A1c or glycated hemoglobin) is a blood test that measures your average blood sugar over the past 2-3 months. Unlike daily finger prick tests that show a snapshot, HbA1c shows the bigger picture of how well your diabetes is being managed overall. How to read it: below 5.7% is normal, 5.7-6.4% indicates prediabetes, and 6.5% or above indicates diabetes. For most people with diabetes, the target is below 7%, though your doctor may set a personalized goal. Why it is important: (1) It predicts your risk of complications — every 1% reduction significantly lowers risk of eye, kidney, and nerve damage. (2) It helps your doctor decide if your treatment plan is working. (3) It catches trends that daily readings might miss. Get this test every 3-6 months. It does not require fasting.`;
    }

    // === ROLE OF INSULIN ===
    if (/role.*insulin|insulin.*role|what.*insulin do|what.*insulin play|how.*insulin work|insulin function|insulin.*body|hormone insulin/.test(normalizedQ) && !/inject|take|dose|type|start/.test(normalizedQ)) {
        return `Insulin is a hormone produced by the pancreas that acts like a key, unlocking your cells so glucose (sugar) from your food can enter and be used for energy. Without insulin, glucose stays trapped in your blood, causing high blood sugar. Here is what insulin does: (1) After you eat, carbohydrates are broken down into glucose. (2) Your pancreas detects rising blood sugar and releases insulin. (3) Insulin signals cells in your muscles, fat, and liver to absorb glucose. (4) This brings blood sugar back to normal levels. (5) Insulin also tells the liver to store extra glucose for later use. In Type 1 diabetes, the pancreas makes little or no insulin, so it must be injected. In Type 2 diabetes, cells become resistant to insulin's effects, so the pancreas has to produce more and more until it cannot keep up. Understanding insulin's role helps you see why medication, diet, and exercise all matter — they all affect how well your body manages this process.`;
    }

    // === EARLY SIGNS OF DIABETES ===
    if (/early signs|first signs|initial symptoms|warning signs|symptoms of diabetes|signs of diabetes|how.*know.*have diabetes/.test(normalizedQ) && !/high sugar|low sugar|hypo|hyper/.test(normalizedQ)) {
        return `The early signs of diabetes often develop gradually and can be easy to miss. Watch for: (1) Increased thirst (polydipsia) — feeling unusually thirsty even after drinking water. (2) Frequent urination (polyuria) — especially at night. (3) Unexplained weight loss — losing weight without trying, even while eating normally. (4) Constant hunger (polyphagia) — feeling hungry soon after eating. (5) Extreme fatigue — feeling tired despite adequate rest. (6) Blurred vision — high sugar causes fluid changes in your eye lens. (7) Slow wound healing — cuts and bruises take longer to heal. (8) Frequent infections — especially urinary tract, skin, or gum infections. (9) Tingling or numbness in hands and feet. (10) Dark patches on skin (acanthosis nigricans) — especially on the neck and armpits. Many people have Type 2 diabetes for years without knowing. If you notice any combination of these symptoms, please get a fasting blood sugar and HbA1c test done promptly.`;
    }

    // === EXCESSIVE THIRST ===
    if (/thirst|thirsty|drinking.*water|dry mouth|pyaas/.test(normalizedQ) && /why|all the time|always|constant|excessive|so much|very|symptom|sign/.test(normalizedQ)) {
        return `Excessive thirst (polydipsia) is one of the hallmark symptoms of diabetes or poorly controlled blood sugar. Here is why it happens: when blood sugar is high, your kidneys try to filter out the excess glucose by producing more urine. This increased urination causes fluid loss, triggering your body's thirst response to replace the lost water. It becomes a cycle: high sugar → more urination → dehydration → more thirst. What to do: (1) Check your blood sugar — persistent thirst often means levels are running high. (2) Drink plenty of water to stay hydrated. (3) Avoid sugary drinks, juices, and sodas — they will make things worse. (4) If you are not yet diagnosed with diabetes and experiencing constant thirst along with frequent urination, get a blood sugar test done. (5) If you already have diabetes, unusual thirst may mean your sugar control needs adjustment — talk to your doctor about your current treatment plan.`;
    }

    // === NUMBNESS / TINGLING ===
    if (/numb|numbness|tingling|pins and needles|burning.*feet|burning.*hands|neuropathy/.test(normalizedQ) && /diabetes|diabetic|cause|hands|feet|sign|symptom/.test(normalizedQ)) {
        return `Yes, diabetes is one of the most common causes of numbness and tingling in hands and feet. This condition is called diabetic neuropathy, and it affects up to 50% of people with diabetes over time. How it happens: persistently high blood sugar damages the small blood vessels that supply nutrients and oxygen to your nerves. The longest nerves are affected first, which is why it typically starts in the feet and gradually moves upward. Symptoms include: tingling, burning, numbness, pins-and-needles sensation, sharp pains, and increased sensitivity to touch. What to do: (1) Improve blood sugar control — this is the single most important step to slow or stop nerve damage. (2) Check your feet daily for injuries you might not feel. (3) Wear well-fitting shoes. (4) Your doctor may prescribe medications for nerve pain relief. (5) B12 vitamin deficiency can also cause similar symptoms, so get that checked. (6) Report any worsening numbness to your doctor promptly. Early management prevents serious complications like foot ulcers.`;
    }

    // === DIABETIC SNACKS ===
    if (/snack|munchies|between meals|evening snack|tea time|nashta/.test(normalizedQ) && /diabetes|diabetic|can|what|which|suggest|recommend|eat|healthy/.test(normalizedQ)) {
        return `Great snacking choices for diabetics that are tasty and blood sugar friendly: (1) Roasted chana or makhana (fox nuts) — crispy, satisfying, and low glycemic. (2) A handful of mixed nuts (almonds, walnuts, peanuts) — healthy fats and protein keep you full. (3) Vegetable sticks (cucumber, carrot, bell pepper) with hummus or curd dip. (4) Sprouts chaat with lemon and spices. (5) Boiled eggs — excellent protein snack. (6) Greek yogurt or plain curd with a few seeds. (7) A small apple or guava with a few nuts. (8) Roasted sunflower or pumpkin seeds. (9) Multigrain khakhra. (10) Paneer cubes with black pepper. Key rules: keep portions small, combine protein or fat with any carb, avoid packaged "sugar-free" snacks that often have hidden carbs, and time your snacks between meals to avoid long gaps that could cause sugar drops or overeating at meals.`;
    }

    // === SMOKING AND DIABETES ===
    if (/smok|cigarette|tobacco|bidi|beedi/.test(normalizedQ) && /diabetes|blood sugar|affect|risk|worse|harm|cause/.test(normalizedQ)) {
        return `Smoking is extremely harmful for people with diabetes — it multiplies virtually every diabetes risk. Here is how: (1) Smoking increases insulin resistance, making blood sugar harder to control. (2) It damages blood vessels that are already vulnerable from high sugar, dramatically increasing risk of heart attack and stroke. (3) It worsens circulation, especially to the feet — a major factor in diabetic foot problems and amputations. (4) It accelerates kidney damage. (5) It raises blood pressure and cholesterol. (6) Smokers with diabetes are 3 times more likely to die from cardiovascular disease than non-smoking diabetics. The good news: quitting at any stage helps. Within weeks, circulation improves. Within months, insulin sensitivity starts improving. Within years, cardiovascular risk drops significantly. Talk to your doctor about smoking cessation support — nicotine patches, medication, or counseling can help. This is one of the most impactful changes a diabetic smoker can make.`;
    }

    // === FOOT PROBLEMS ===
    if (/foot|feet/.test(normalizedQ) && /diabetes|diabetic|problem|issue|care|complication|damage|affect|critical|inspection|routine/.test(normalizedQ)) {
        return `Yes, diabetes can cause serious foot problems, and foot care is one of the most important aspects of diabetes management. How diabetes affects feet: (1) Nerve damage (neuropathy) — you may not feel cuts, blisters, or sores on your feet. (2) Poor circulation — blood flow to feet decreases, making infections harder to fight and wounds slower to heal. (3) These two together mean a small injury can become a serious infection without you noticing. Foot care essentials: (1) Inspect your feet daily — look for cuts, redness, swelling, blisters, or color changes. (2) Wash feet daily with warm (not hot) water and dry thoroughly, especially between toes. (3) Moisturize to prevent cracking but not between toes. (4) Never walk barefoot. (5) Wear comfortable, well-fitting shoes. (6) Trim toenails straight across. (7) Do not try to treat corns or calluses yourself. (8) See your doctor immediately if you notice any wound that does not heal within a few days, redness spreading, or foul smell. Annual foot exams by your doctor are essential.`;
    }

    // === PANCREAS FUNCTION IN DIABETES ===
    if (/pancreas/.test(normalizedQ) && /diabetes|function|work|differ|damage|produce|secrete/.test(normalizedQ)) {
        return `The pancreas is a vital organ that produces insulin in specialized cells called beta cells located in the islets of Langerhans. In a healthy person, the pancreas senses rising blood sugar after a meal and releases just the right amount of insulin to move glucose into cells. In diabetes, this process breaks down: In Type 1 diabetes, the immune system mistakenly destroys the beta cells, so the pancreas produces little to no insulin. This is why Type 1 always requires external insulin. In Type 2 diabetes, the pancreas initially overproduces insulin to compensate for insulin resistance in the body's cells. Over time, this overwork exhausts the beta cells, and insulin production declines — which is why some people with long-standing Type 2 eventually also need insulin. The pancreas also produces glucagon (from alpha cells), which raises blood sugar when it drops too low. In diabetes, this glucagon response can become dysregulated, contributing to blood sugar swings.`;
    }

    // === GESTATIONAL DIABETES ===
    if (/gestational/.test(normalizedQ) && /diabetes|what|pregnancy|long.term|implication|risk/.test(normalizedQ)) {
        return `Gestational diabetes develops during pregnancy, usually in the second or third trimester, when pregnancy hormones from the placenta create insulin resistance. It affects about 2-10% of pregnancies. The placental hormones block insulin's action, requiring the mother's pancreas to produce up to 3 times more insulin — when it cannot keep up, blood sugar rises. Immediate risks: larger baby (macrosomia) making delivery difficult, preeclampsia, premature birth, and newborn low blood sugar. Long-term implications are significant: (1) For the mother — 50% chance of developing Type 2 diabetes within 5-10 years after pregnancy. Annual screening is essential. (2) Higher risk of gestational diabetes in future pregnancies. (3) Increased cardiovascular risk later in life. (4) For the child — higher risk of obesity and Type 2 diabetes in adolescence/adulthood. Management involves blood sugar monitoring, diet modification, exercise, and sometimes insulin. Most cases resolve after delivery, but follow-up screening is critical.`;
    }

    // === INSULIN RESISTANCE MECHANISMS ===
    if (/insulin resistance|insulin resistant/.test(normalizedQ) && /mechanism|biological|cellular|how|why|what|cause/.test(normalizedQ)) {
        return `Insulin resistance is a complex biological process where cells become less responsive to insulin's signal. Here are the key mechanisms: (1) Receptor dysfunction — insulin binds to receptors on cell surfaces to trigger glucose uptake. In resistance, these receptors become less sensitive, like a lock that has become stiff. (2) Intracellular signaling defects — even when insulin binds, the chain of chemical signals inside the cell (the IRS/PI3K/Akt pathway) becomes impaired. (3) Fat accumulation — excess fat, especially visceral (belly) fat, releases inflammatory molecules (cytokines like TNF-alpha and IL-6) that directly interfere with insulin signaling. (4) Lipotoxicity — excess free fatty acids accumulate inside muscle and liver cells, blocking insulin's ability to promote glucose uptake. (5) Chronic inflammation — low-grade systemic inflammation damages insulin signaling pathways. (6) Mitochondrial dysfunction — impaired energy production in cells worsens glucose utilization. Contributing factors include genetics, obesity, physical inactivity, poor diet, chronic stress, and insufficient sleep. Improving insulin sensitivity requires addressing multiple factors: regular exercise, weight loss, anti-inflammatory diet, stress management, and adequate sleep.`;
    }

    // === GLUCAGON AND INSULIN HOMEOSTASIS ===
    if (/glucagon/.test(normalizedQ) && /insulin|blood sugar|homeostasis|interact|balance|regulate/.test(normalizedQ)) {
        return `Glucagon and insulin are partner hormones that work in opposition to keep blood sugar in a safe range — a system called homeostasis. Think of them as a thermostat: (1) When blood sugar rises (after eating): the pancreas's beta cells release insulin, which signals cells to absorb glucose, lowers blood sugar, and tells the liver to store glucose as glycogen. (2) When blood sugar drops (between meals or overnight): the pancreas's alpha cells release glucagon, which signals the liver to break down stored glycogen into glucose (glycogenolysis) and produce new glucose from amino acids (gluconeogenesis), raising blood sugar. In a healthy person, this insulin-glucagon balance keeps blood sugar between approximately 70-140 mg/dL. In diabetes, this balance is disrupted: (1) In Type 1, insulin is absent, so glucagon goes unopposed, causing blood sugar to soar. (2) In Type 2, insulin resistance means insulin's effect is weakened, while glucagon secretion may be inappropriately elevated. (3) Some diabetes medications (like GLP-1 agonists) work partly by suppressing excess glucagon. Understanding this balance explains why both high and low blood sugar occur in diabetes.`;
    }

    // === MONOGENIC DIABETES / MODY ===
    if (/mody|monogenic/.test(normalizedQ) && /diabetes|what|differ|type|gene|common/.test(normalizedQ)) {
        return `Monogenic diabetes (including MODY — Maturity Onset Diabetes of the Young) is a rare form of diabetes caused by a mutation in a single gene. It accounts for about 1-5% of all diabetes cases but is frequently misdiagnosed as Type 1 or Type 2. Key differences: (1) Cause — MODY is caused by one specific gene mutation (at least 14 different genes identified), while Type 1 is autoimmune and Type 2 is polygenic plus lifestyle. (2) Inheritance — MODY follows autosomal dominant inheritance, meaning a 50% chance of passing it on. (3) Onset — typically before age 25, often in adolescence. (4) Treatment — varies by subtype. MODY 2 (GCK) often needs no treatment. MODY 1 and 3 (HNF4A, HNF1A) respond well to sulfonylurea tablets rather than insulin. (5) Characteristics — patients are often not overweight, may have no autoimmune markers, and have a strong multi-generational family history. Why it matters: correct diagnosis changes treatment dramatically. Many MODY patients are unnecessarily on insulin when tablets would work better. Genetic testing confirms the diagnosis.`;
    }

    // === TYPE 1 AND TYPE 2 SIMULTANEOUSLY ===
    if (/both type 1 and type 2|type 1.*type 2.*simultaneous|have both|double diabetes/.test(normalizedQ)) {
        return `Yes, it is medically possible — this condition is sometimes called "double diabetes" or "Type 1.5." It occurs in two main scenarios: (1) A person with Type 1 diabetes develops insulin resistance — the hallmark of Type 2. This can happen due to weight gain, sedentary lifestyle, or genetic predisposition. They still need insulin (because their beta cells are destroyed) but also develop the metabolic features of Type 2. (2) LADA (Latent Autoimmune Diabetes in Adults) — sometimes called Type 1.5 — where adults develop slow-onset autoimmune destruction of beta cells while also having insulin resistance. Initially it looks like Type 2, but over months to years, insulin becomes necessary. The overlap is increasingly recognized as obesity rises even among people with Type 1. Management combines approaches from both conditions: insulin therapy is always needed (for the Type 1 component), plus lifestyle modifications and potentially insulin-sensitizing medications like metformin (for the Type 2 component). Proper antibody testing and C-peptide measurement help distinguish the components.`;
    }

    // === FASTING PLASMA GLUCOSE TEST ===
    if (/fasting.*glucose test|fasting.*plasma|fasting blood.*test|fbs test|how.*fasting.*test.*conduct|fasting.*test.*interpret/.test(normalizedQ)) {
        return `The Fasting Plasma Glucose (FPG) test is one of the simplest and most common tests for diagnosing diabetes. How it is conducted: (1) You must fast (no food or caloric drinks) for at least 8 hours, usually overnight. (2) A blood sample is drawn from a vein, typically in the morning. (3) The lab measures the glucose concentration in your plasma. How to interpret results: (1) Normal: below 100 mg/dL (5.6 mmol/L). (2) Prediabetes (Impaired Fasting Glucose): 100-125 mg/dL (5.6-6.9 mmol/L). (3) Diabetes: 126 mg/dL (7.0 mmol/L) or higher. A diagnosis of diabetes requires confirmation — usually two separate abnormal readings on different days. Important notes: stress, illness, certain medications, and poor sleep can temporarily elevate fasting glucose. Water is allowed during fasting. This test is often done alongside HbA1c for a comprehensive picture. If your fasting glucose is in the prediabetes range, it is the ideal time to intervene with lifestyle changes.`;
    }

    // === ORAL GLUCOSE TOLERANCE TEST (OGTT) ===
    if (/ogtt|oral glucose tolerance|glucose tolerance test/.test(normalizedQ)) {
        return `The Oral Glucose Tolerance Test (OGTT) is a diagnostic test that measures how well your body processes glucose. The procedure: (1) Fast for 8-12 hours overnight. (2) A fasting blood sample is taken. (3) You drink a standardized glucose solution containing 75 grams of glucose (it tastes very sweet). (4) Blood samples are taken at intervals — typically at 1 hour and 2 hours after drinking. (5) The 2-hour reading is the key diagnostic value. Interpretation of the 2-hour reading: Normal: below 140 mg/dL. Prediabetes (Impaired Glucose Tolerance): 140-199 mg/dL. Diabetes: 200 mg/dL or higher. When the OGTT is used: (1) Diagnosing gestational diabetes — this is the gold standard test during pregnancy (usually weeks 24-28). (2) When fasting glucose is borderline and a definitive answer is needed. (3) When HbA1c results are inconclusive. (4) To identify impaired glucose tolerance that fasting tests might miss. The OGTT is more sensitive than fasting glucose alone because it reveals how your body handles a glucose load in real time.`;
    }

    // === CGM DETAILS ===
    if (/cgm|continuous glucose monitor/.test(normalizedQ) && /how|measure|interstitial|work|track|sensor|fluid/.test(normalizedQ)) {
        return `Continuous Glucose Monitors (CGMs) work by measuring glucose in the interstitial fluid — the fluid between your cells — rather than directly in blood. Here is how: (1) A tiny, flexible sensor filament is inserted just under the skin (usually on the arm or abdomen), reaching into the interstitial space. (2) The sensor has a glucose oxidase enzyme coating that reacts with glucose, generating a small electrical signal proportional to the glucose level. (3) A transmitter attached to the sensor sends readings wirelessly to a receiver or smartphone app, typically every 1-5 minutes. (4) This produces a continuous stream of data — up to 288 readings per day — showing trends, patterns, and rate of change. Important nuances: (1) Interstitial glucose lags behind blood glucose by about 5-15 minutes, so readings during rapid changes may differ from a finger prick. (2) CGMs still need occasional calibration against blood glucose (some newer models are factory-calibrated). (3) The data reveals patterns invisible to intermittent testing: post-meal spikes, overnight trends, and the effect of exercise. (4) Alerts can warn of impending highs or lows before they become dangerous.`;
    }

    // === INSULIN PUMP vs INJECTIONS ===
    if (/insulin pump/.test(normalizedQ) && /injection|difference|compare|versus|vs|operational|multiple daily/.test(normalizedQ)) {
        return `Insulin pumps and multiple daily injections (MDI) are the two main insulin delivery methods, each with distinct characteristics: Insulin Pump: (1) Delivers rapid-acting insulin continuously through a small catheter under the skin. (2) Provides a programmable basal rate (background insulin) 24/7 with different rates for different times of day. (3) Allows precise bolus doses at mealtimes with calculators built in. (4) Can be adjusted in very small increments (0.025-0.05 units). (5) Worn on the body continuously, with infusion set changes every 2-3 days. Multiple Daily Injections (MDI): (1) Uses a combination of long-acting insulin (once or twice daily for basal coverage) and rapid-acting insulin (before each meal). (2) Typically 4-6 injections per day. (3) Dose adjustments are in whole or half-unit increments. (4) No device attached to the body between injections. (5) Simpler, lower cost, and less technology dependent. Key differences: Pumps offer more precise dosing, easier adjustments, and better for variable schedules. MDI is simpler, more affordable, and has no device malfunction risk. Both can achieve excellent control with proper training. The choice depends on lifestyle, preference, and medical recommendation.`;
    }

    // === DIABETES TRACKING METRICS ===
    if (/metric|variable|data log|track.*diabetes|comprehensive.*log|what.*track/.test(normalizedQ) && /diabetes|blood sugar|glucose|comprehensive|log/.test(normalizedQ)) {
        return `A comprehensive diabetes data log should track these key variables: (1) Blood Glucose Readings — fasting, pre-meal, 2-hour post-meal, and bedtime values. Note the time and context of each. (2) HbA1c — every 3-6 months for the long-term picture. (3) Food Intake — carbohydrate counts or portions, meal timing, and food types. (4) Medication — doses, timing, and any missed doses. For insulin users: units and injection sites. (5) Physical Activity — type, duration, intensity, and timing relative to meals. (6) Weight — weekly or bi-weekly trends. (7) Blood Pressure — especially if on BP medication. (8) Symptoms — any episodes of highs, lows, dizziness, or unusual symptoms. (9) Sleep — duration and quality. (10) Stress Levels — subjective rating, as stress directly affects glucose. (11) Illness or Infection — sick days affect sugar significantly. (12) Time in Range (TIR) — if using a CGM, the percentage of time glucose stays within 70-180 mg/dL. This data helps you and your doctor identify patterns, adjust treatment, and predict issues before they become serious.`;
    }

    // === INSULIN PHARMACOKINETICS ===
    if (/pharmacokinetic|types of insulin|rapid.acting|short.acting|intermediate|long.acting|different insulin|insulin.*onset|insulin.*peak|insulin.*duration/.test(normalizedQ) && /insulin|vary|differ|how/.test(normalizedQ)) {
        return `Different insulins are designed with specific onset, peak, and duration profiles to mimic or replace natural insulin patterns: (1) Rapid-acting (lispro/Humalog, aspart/NovoRapid, glulisine/Apidra): Onset 10-15 min, Peak 1-2 hours, Duration 3-5 hours. Taken just before meals to cover food glucose. (2) Short-acting (Regular/Actrapid): Onset 30 min, Peak 2-4 hours, Duration 6-8 hours. Taken 30 min before meals. (3) Intermediate-acting (NPH/Humulin N): Onset 1-2 hours, Peak 4-8 hours, Duration 12-16 hours. Provides background coverage for part of the day. (4) Long-acting (glargine/Lantus/Toujeo, detemir/Levemir): Onset 1-2 hours, minimal peak, Duration 20-24 hours. Provides steady basal coverage. (5) Ultra-long-acting (degludec/Tresiba): Onset 1-2 hours, essentially peakless, Duration 42+ hours. Very stable background. (6) Pre-mixed insulins combine rapid/short with intermediate in fixed ratios (like 30/70 mix). The choice depends on your diabetes type, meal patterns, lifestyle, and blood sugar patterns. Timing of injection relative to meals is critical for rapid and short-acting insulins.`;
    }

    // === METFORMIN MECHANISM ===
    if (/metformin/.test(normalizedQ) && /how|work|mechanism|cellular|what|action|treat/.test(normalizedQ)) {
        return `Metformin is the most widely prescribed diabetes medication worldwide, and it works through several cellular mechanisms: (1) Primary action — reduces hepatic (liver) glucose production. The liver normally releases stored glucose between meals; metformin suppresses excessive glucose output by activating the AMPK (AMP-activated protein kinase) enzyme pathway. (2) Improves insulin sensitivity — it enhances insulin's ability to move glucose into muscle and fat cells by improving insulin receptor signaling and GLUT4 transporter activity. (3) Reduces intestinal glucose absorption — it slows glucose uptake from food in the gut. (4) Does NOT cause hypoglycemia on its own — because it does not stimulate insulin production, it simply makes existing insulin work better. (5) Modest weight loss benefit — unlike many diabetes drugs that cause weight gain. (6) May have cardiovascular protective effects. Common side effects are gastrointestinal (nausea, diarrhea) — starting with a low dose and taking it with food helps. Extended-release formulations reduce GI issues. It should be avoided in severe kidney disease. Metformin has been used safely for over 60 years, making it one of the best-studied medications.`;
    }

    // === HYPOGLYCEMIA TREATMENT PROTOCOL ===
    if (/hypoglycemic episode|treat.*hypoglycemia|treat.*low blood sugar|protocol.*low sugar|low sugar.*treat|what to do.*low blood sugar|sudden.*low.*sugar/.test(normalizedQ)) {
        return `The standard protocol for treating hypoglycemia (blood sugar below 70 mg/dL) is the 15-15 Rule: (1) Consume 15 grams of fast-acting carbohydrate: 3-4 glucose tablets, or half a cup (120ml) of fruit juice or regular soda, or 1 tablespoon of honey or sugar, or 5-6 hard candies. (2) Wait 15 minutes. (3) Recheck blood sugar. If still below 70, repeat step 1. (4) Once above 70, eat a small snack with protein and complex carbs (like peanut butter on crackers) to prevent recurrence. For severe hypoglycemia (confusion, seizure, unconsciousness): (1) Do NOT give food or liquid by mouth — choking risk. (2) Administer glucagon injection or nasal glucagon if available. (3) Call emergency services immediately. (4) Place the person on their side (recovery position). Prevention is key: do not skip meals, be careful with insulin doses, carry glucose tablets always, monitor sugar more frequently during exercise or illness, and use a medical ID bracelet. Educate family members on how to use glucagon. If hypoglycemia happens frequently, talk to your doctor about medication adjustments.`;
    }

    // === PREDICTIVE ALGORITHMS / ML IN DIABETES ===
    if (/predictive|algorithm|machine learning|artificial intelligence|forecast|predict/.test(normalizedQ) && /blood sugar|glucose|spike|drop|diabetes/.test(normalizedQ)) {
        return `Predictive algorithms and machine learning (ML) are increasingly being used to forecast blood sugar changes before they happen. Here is how they work: (1) Data inputs — these systems analyze CGM glucose data, meal logs, insulin doses, physical activity, sleep patterns, stress indicators, and even weather and time-of-day factors. (2) Pattern recognition — ML models (like neural networks, decision trees, or time-series algorithms) learn individual glucose response patterns from historical data. (3) Prediction horizons — current systems can predict glucose levels 30-60 minutes ahead with reasonable accuracy, some research extends to 2-4 hours. (4) Applications: (a) CGM alerts that warn of impending highs or lows before they happen. (b) Closed-loop insulin pump systems (artificial pancreas) that adjust insulin delivery proactively. (c) Smart bolus calculators that recommend insulin doses based on predicted meal impact. (d) Population-level analysis identifying risk patterns across thousands of patients. (5) Limitations — individual variability is high, unexpected events (stress, illness) are hard to predict, and model accuracy decreases further into the future. The field is evolving rapidly, with GlucoCare itself using pattern analysis to provide personalized insights.`;
    }

    // === COMPLEX vs SIMPLE CARBS ===
    if (/complex carb|simple carb|simple sugar|complex.*sugar|carbohydrate.*differ|carb.*blood sugar.*differ/.test(normalizedQ)) {
        return `Complex and simple carbohydrates affect blood sugar very differently due to their molecular structure: Simple carbohydrates (simple sugars): (1) Made of one or two sugar molecules (monosaccharides or disaccharides). (2) Digested and absorbed very quickly. (3) Cause a rapid, sharp spike in blood sugar followed by a crash. (4) Examples: table sugar, honey, candy, white bread, fruit juice, soda. (5) Measured as high glycemic index foods. Complex carbohydrates: (1) Made of long chains of sugar molecules (polysaccharides). (2) Take longer to break down and digest because the body must cut each bond. (3) Cause a slower, more gradual rise in blood sugar. (4) Often come packaged with fiber, which further slows absorption. (5) Examples: whole grains, oats, brown rice, millets, legumes, vegetables. (6) Generally lower glycemic index. For diabetes management: prioritize complex carbs that are high in fiber, pair carbs with protein and healthy fats to slow absorption further, and limit simple sugars to treating low blood sugar episodes. However, even complex carbs need portion control — quantity still matters. Reading food labels for total carbohydrates and fiber content helps make informed choices.`;
    }

    // === GLYCEMIC INDEX ===
    if (/glycemic index|glycemic load|gi value|gi score|what is gi/.test(normalizedQ)) {
        return `The Glycemic Index (GI) is a scale from 0 to 100 that ranks carbohydrate-containing foods by how quickly they raise blood sugar compared to pure glucose (GI = 100). Categories: Low GI (55 or below) — these foods cause a slow, gradual rise: most vegetables, legumes, nuts, whole grains, oats, sweet potato, milk, most fruits. Medium GI (56-69) — moderate rise: brown rice, whole wheat bread, basmati rice, poha. High GI (70+) — rapid spike: white rice, white bread, potatoes, watermelon, cornflakes, sugar. How to use GI for dietary choices: (1) Choose low GI foods as the foundation of most meals. (2) Combine high GI foods with low GI foods — for example, rice with dal and vegetables. (3) Fiber, fat, and protein lower the GI of a meal, so always include them. (4) Cooking method matters — al dente pasta has lower GI than overcooked. (5) Glycemic Load (GL) considers portion size and is often more practical: GL = (GI x carbs in serving) / 100. A food can have high GI but low GL if the normal portion is small. Use GI as a guide, not a strict rule — individual responses vary, so testing your post-meal sugar is the best personalization tool.`;
    }

    // === EXERCISE AND INSULIN SENSITIVITY ===
    if (/exercise.*insulin sensitiv|resistance.*exercise.*insulin|cardiovascular.*insulin|how.*exercise.*influence|exercise.*cellular/.test(normalizedQ)) {
        return `Exercise profoundly improves insulin sensitivity through multiple cellular mechanisms: Cardiovascular (aerobic) exercise: (1) Increases GLUT4 transporter activity — these are the proteins that move glucose into muscle cells. Exercise causes GLUT4 to translocate to the cell surface even without insulin. (2) Improves blood flow to muscles, delivering more glucose and insulin to tissue. (3) Burns glucose directly as fuel during activity. (4) Single session improves sensitivity for 24-48 hours; regular exercise creates lasting adaptations. (5) Reduces visceral fat, which reduces inflammation-driven insulin resistance. Resistance (strength) training: (1) Builds muscle mass — muscle is the largest glucose sink in the body, so more muscle means more glucose absorption capacity. (2) Improves GLUT4 density in muscle fibers permanently. (3) Enhances glycogen storage capacity. (4) Reduces intramuscular fat that impairs insulin signaling. Combined approach: research shows that combining 150 minutes of aerobic exercise with 2-3 resistance sessions per week produces the greatest improvement in insulin sensitivity — better than either alone. The effect is independent of weight loss, though weight loss amplifies benefits. Start gradually and check blood sugar before and after exercise if you take insulin or sulfonylureas.`;
    }

    // === INTERMITTENT FASTING ===
    if (/intermittent fasting|time.restricted eating|fasting.*benefit.*type 2|fasting.*proven/.test(normalizedQ) && /diabetes|benefit|proven|type 2/.test(normalizedQ)) {
        return `Intermittent fasting (IF) and time-restricted eating have shown promising but mixed results for Type 2 diabetes. What research shows: (1) Weight loss — IF can help reduce body weight and visceral fat, which improves insulin sensitivity. (2) Insulin sensitivity — some studies show improved fasting insulin and glucose levels. (3) HbA1c — modest reductions reported in some trials (0.5-1% improvement). (4) Common protocols: 16:8 (eating within 8-hour window), 5:2 (normal eating 5 days, very low calories 2 days), alternate-day fasting. Important cautions for diabetes: (1) Hypoglycemia risk — fasting significantly increases the risk of low blood sugar, especially if taking insulin or sulfonylureas. Medication doses MUST be adjusted by your doctor. (2) Not suitable for Type 1 diabetes or insulin-dependent Type 2 without very close monitoring. (3) Refeeding spikes — eating too much after fasting can cause dramatic glucose spikes. (4) Not superior to consistent calorie reduction for most people. (5) Sustainability matters — IF is only effective if maintained long term. Bottom line: IF can be a tool for some people with Type 2 diabetes, but it must be done under medical supervision with medication adjustments. It is not a magic bullet and is not safe for everyone.`;
    }

    // === HYDRATION AND BLOOD SUGAR ===
    if (/hydration|dehydrat/.test(normalizedQ) && /blood sugar|glucose|affect|concentration|level|impact/.test(normalizedQ)) {
        return `Hydration directly affects blood sugar concentration in important ways: (1) Dehydration concentrates the blood — when your body loses fluid, the same amount of glucose is dissolved in less fluid volume, making blood sugar readings appear higher than they would be with proper hydration. (2) The kidney connection — your kidneys use water to flush excess glucose through urine. When dehydrated, kidneys cannot filter as effectively, allowing glucose to build up. (3) High blood sugar causes dehydration — elevated glucose triggers the kidneys to produce more urine to expel sugar, creating a vicious cycle of high sugar → fluid loss → more concentrated blood → even higher readings. (4) Hormonal effects — dehydration triggers the release of vasopressin, which signals the liver to produce more glucose. (5) Practical implications: drinking adequate water (8-10 glasses daily) can help reduce blood sugar by 1-2%. During high sugar episodes, increasing water intake helps your kidneys clear excess glucose. (6) Best choices: plain water, unsweetened herbal tea, plain buttermilk. Avoid juice, soda, or energy drinks. If you are experiencing persistent thirst with high sugar and frequent urination, see your doctor as this indicates poor glucose control.`;
    }

    // === CORTISOL AND BLOOD SUGAR ===
    if (/cortisol/.test(normalizedQ) && /stress|blood sugar|glucose|elevate|raise|mechanism|how|physically/.test(normalizedQ)) {
        return `Cortisol, the body's primary stress hormone, directly elevates blood glucose through several well-documented mechanisms: (1) Gluconeogenesis stimulation — cortisol signals the liver to produce new glucose from amino acids and glycerol, flooding the bloodstream with sugar even when you have not eaten. (2) Glycogenolysis — cortisol promotes the breakdown of stored glycogen in the liver into glucose. (3) Insulin antagonism — cortisol directly opposes insulin's action by reducing GLUT4 transporter activity in muscle and fat cells, meaning cells absorb less glucose. (4) Fat metabolism changes — cortisol promotes the breakdown of fat into free fatty acids, which further worsen insulin resistance. (5) The evolutionary purpose was to provide quick energy for "fight or flight" situations. But in chronic stress, cortisol remains elevated for days or weeks, creating persistently high blood sugar. In people with diabetes, this effect is amplified because their insulin response is already impaired. Management strategies: regular exercise (reduces cortisol), adequate sleep (7-8 hours), relaxation techniques (deep breathing, meditation, yoga), social support, and addressing the root causes of stress where possible.`;
    }

    // === COPING STRATEGIES FOR CHRONIC ILLNESS ===
    if (/coping|cognitive load|mental load|manage.*chronic|daily.*burden/.test(normalizedQ) && /diabetes|chronic illness|strategy|effective|daily/.test(normalizedQ)) {
        return `Managing the daily cognitive load of diabetes — constant decisions about food, medicine, monitoring, and planning — can be overwhelming. Evidence-based coping strategies include: (1) Routine building — automate as many decisions as possible. Set fixed meal times, prep meals in batches, set medication alarms, and create a consistent testing schedule. Habits reduce decision fatigue. (2) Task batching — group diabetes tasks (logging, medication, monitoring) into specific times rather than spreading them across the day. (3) Self-compassion — perfectionism leads to burnout. Aim for "good enough" blood sugar management, not perfection. One bad reading is data, not failure. (4) Meaningful support — sharing responsibilities with a partner, family member, or diabetes educator reduces the feeling of doing it alone. (5) Technology leverage — use CGMs, apps, and reminders to offload the mental tracking burden. (6) Boundaries — it is okay to not think about diabetes for a few hours. Build in mental breaks. (7) Professional support — a diabetes psychologist or counselor trained in chronic illness can provide invaluable tools. (8) Focus on controllable actions, not outcomes — you cannot control every blood sugar reading, but you can control your next meal and medication. (9) Celebrate small wins consistently rather than only noticing setbacks.`;
    }

    // === PSYCHOLOGICAL BARRIERS TO ADHERENCE ===
    if (/psychological barrier|barrier.*adherence|barrier.*medication|barrier.*insulin|why.*not take.*medicine/.test(normalizedQ) && /diabetes|medication|insulin|adherence|daily/.test(normalizedQ)) {
        return `Multiple psychological barriers can interfere with medication and insulin adherence in diabetes: (1) Injection anxiety — fear of needles affects 20-30% of insulin users. Modern pen needles are very thin, and gradual desensitization helps. (2) Denial and minimization — diabetes often has no visible symptoms, making it easy to rationalize skipping treatment ("I feel fine"). (3) Diabetes stigma — feeling embarrassed about taking medications or injecting in public. (4) Weight gain fear — some medications and insulin cause weight gain, which conflicts with body image and health goals. (5) Hypoglycemia fear — experience of low blood sugar episodes can create anxiety about taking full medication doses. (6) Regimen complexity — multiple medications at different times with different food rules creates cognitive overwhelm. (7) Cost concerns — medication expense is a real barrier that causes dose-skipping. (8) Perceived loss of autonomy — feeling controlled by a disease and its treatment. (9) Depression and fatigue — depression reduces motivation and energy for self-care. Solutions: simplify regimens where possible, address fears openly with your doctor, use pillboxes and alarms, join support groups, and consider therapy — cognitive behavioral therapy (CBT) has shown strong results for improving adherence.`;
    }

    // === JOURNALING FOR DIABETES ===
    if (/journal|diary|mood.*track|habit.*track|emotional trigger/.test(normalizedQ) && /diabetes|blood sugar|glucose|affect|help|identify/.test(normalizedQ)) {
        return `Daily journaling is a powerful but underused tool in diabetes management. It helps identify emotional and behavioral triggers that affect blood sugar in ways that pure glucose logging cannot: (1) What to journal: blood sugar readings alongside mood (stressed, happy, anxious, sad), sleep quality, food choices and WHY you made them (hungry? emotional eating? social pressure?), activity level, and any notable events. (2) Pattern discovery — after 2-3 weeks, you will start seeing connections: "my sugar runs 30 points higher during work deadline weeks" or "I snack more when I am anxious." (3) Emotional eating triggers — journaling reveals the emotions driving food choices, which is the first step to changing them. (4) Stress impact measurement — you can quantify how YOUR stress level correlates with YOUR glucose. (5) Medication effects — tracking mood alongside medication changes reveals psychological side effects. (6) Accountability — the act of writing creates awareness and naturally improves choices. Tips: keep it simple (start with just mood + sugar + one note), use a phone notes app for convenience, do not judge yourself for what you write, and review weekly to spot patterns. Even 2 minutes per day provides valuable data over time.`;
    }

    // === DIABETES AND ANXIETY ===
    if (/anxiety/.test(normalizedQ) && /diabetes|link|risk|increase|statistical|psychological|connection/.test(normalizedQ)) {
        return `There is a strong, bidirectional link between diabetes and anxiety disorders. Statistics: people with diabetes are approximately 20-40% more likely to develop an anxiety disorder compared to the general population. The connection works both ways: (1) Diabetes causing anxiety: constant monitoring, fear of complications, fear of hypoglycemia (which can feel like a panic attack), social stigma, and the relentless demands of self-management all contribute. (2) Anxiety worsening diabetes: anxiety triggers cortisol and adrenaline release, directly raising blood sugar. It also disrupts sleep, promotes stress eating, and reduces motivation for exercise and medication adherence. Specific diabetes-related anxiety patterns: (a) Hypoglycemia fear — can lead to intentionally keeping sugar high (dangerous long-term). (b) Needle phobia. (c) Health anxiety about complications. (d) Social anxiety about managing diabetes in public. Treatment: (1) Cognitive behavioral therapy (CBT) is highly effective for diabetes-related anxiety. (2) Mindfulness and relaxation techniques. (3) Regular exercise (proven anxiolytic effect). (4) Medication if needed — most anti-anxiety medications are safe with diabetes. (5) Diabetes support groups reduce isolation. If anxiety is interfering with your diabetes management, please talk to your doctor — it is a very common and very treatable issue.`;
    }

    // === DIABETES BURNOUT ===
    if (/burnout/.test(normalizedQ) && /diabetes|manifest|intervention|mitigate|what|how/.test(normalizedQ)) {
        return `Diabetes burnout is a real and common condition where the constant demands of managing diabetes lead to exhaustion, frustration, and withdrawal from self-care. It is NOT laziness — it is a predictable response to a relentless chronic condition. How it manifests: (1) Skipping blood sugar checks or not logging results. (2) "Forgetting" or deliberately skipping medication or insulin. (3) Eating without regard for diabetes, sometimes with a "whatever happens, happens" attitude. (4) Avoiding doctor appointments. (5) Feeling overwhelmed, hopeless, or detached when thinking about diabetes. (6) Declining HbA1c despite previously good control. It differs from depression in that it is specifically related to diabetes management demands rather than a pervasive mood disorder (though they often coexist). Interventions: (1) Acknowledge it openly — tell your doctor "I am burned out." (2) Simplify your regimen — ask your doctor what is the minimum viable management plan. (3) Set one small goal at a time instead of trying to fix everything. (4) Take a mental break from perfection — aim for "good enough." (5) Use technology (CGMs, reminders) to reduce mental load. (6) Connect with peer support groups — hearing "me too" is powerful. (7) Consider therapy with a diabetes-specialized psychologist. (8) Reassess your goals — they should be yours, not imposed by others.`;
    }

    // === PEER SUPPORT AND COMMUNITY ===
    if (/peer support|community|support group/.test(normalizedQ) && /diabetes|health outcome|long.term|role|play/.test(normalizedQ)) {
        return `Peer support and community play a remarkably powerful role in diabetes outcomes. Research consistently shows: (1) Improved HbA1c — people in diabetes support groups show 0.5-1% better HbA1c on average compared to those managing alone. (2) Better medication adherence — accountability and shared strategies help. (3) Reduced diabetes distress and depression symptoms. (4) Increased self-management behaviors — seeing others succeed is motivating. Why it works: (1) Lived experience — peers understand the daily reality in ways even the best healthcare provider cannot. (2) Practical tips — community members share real-world strategies ("I found that eating dal before rice reduces my spike"). (3) Emotional validation — "me too" reduces shame and isolation. (4) Role modeling — seeing others thrive with diabetes builds confidence. (5) Accountability — not wanting to let your group down motivates action. Forms of peer support: in-person support groups, online communities and forums, diabetes education classes, buddy systems with another person with diabetes, and family support training. How to get involved: ask your doctor or hospital about local groups, check online platforms for diabetes communities, and consider diabetes education programs that include group sessions.`;
    }

    // === CAREGIVER SUPPORT WITHOUT POLICING ===
    if (/caregiver|family|spouse|partner|parent/.test(normalizedQ) && /support|diabetes policing|polic|counterproductive|help.*without|nagging|controlling/.test(normalizedQ)) {
        return `The line between supportive caregiving and counterproductive "diabetes policing" is one of the most common relationship challenges in diabetes management. Diabetes policing includes: watching everything the person eats, commenting on blood sugar readings with judgment, nagging about medication, or taking over management decisions. This tends to backfire — it breeds resentment, secrecy, and reduced self-management. Effective support instead: (1) Ask, do not assume — "How can I help?" respects autonomy. (2) Collaborate, do not control — offer to cook healthy meals together rather than monitoring what they eat. (3) Learn about diabetes — understanding the disease reduces fear-driven reactions. (4) Focus on the positive — celebrate good choices rather than criticizing bad ones. (5) Share the burden — help with appointment scheduling, prescription refills, or meal prep. (6) Respect ownership — it is THEIR diabetes. The person with diabetes must be the primary manager. (7) Manage your own anxiety — your fear of complications can unconsciously drive policing behavior. Consider talking to a counselor about your own stress. (8) Have an honest conversation — discuss together what kind of support feels helpful versus intrusive. (9) Join a caregiver support group — connecting with others in the same role helps. (10) Remember: imperfect management is normal. No one manages diabetes perfectly every day.`;
    }

    // === DIABETES DISTRESS vs DEPRESSION ===
    if (/diabetes distress|distress.*diabetes/.test(normalizedQ) && /what|differ|depression|clinical/.test(normalizedQ)) {
        return `Diabetes distress and clinical depression are related but distinct conditions that require different approaches. Diabetes distress is the emotional burden specifically tied to living with and managing diabetes. It includes frustration with self-management, worry about complications, feeling overwhelmed by the constant demands, and feeling unsupported by healthcare providers or family. It affects 18-45% of people with diabetes. Clinical depression is a broader mood disorder characterized by persistent sadness, loss of interest in all activities, changes in sleep and appetite, difficulty concentrating, and feelings of worthlessness — not limited to diabetes. Key differences: (1) Diabetes distress improves when diabetes management improves or simplifies; depression may persist regardless. (2) Distress is directly tied to the disease burden; depression has broader causes. (3) Distress often responds to diabetes education, support groups, and regimen simplification; depression typically requires therapy and/or medication. (4) They frequently coexist — about 15-20% of people with diabetes have clinical depression. Screening: your doctor should screen for both regularly. If you are struggling emotionally, bring it up — there are specific interventions for each that genuinely help.`;
    }

    // === EATING DISORDERS AND DIABETES ===
    if (/eating disorder|relationship with food|diabulimia|food.*disorder|diagnosis.*food/.test(normalizedQ) && /diabetes|impact|risk|increase/.test(normalizedQ)) {
        return `A diabetes diagnosis fundamentally changes a person's relationship with food, and this can increase the risk of disordered eating. Here is why: (1) Food becomes medicalized — every meal involves calculations, restrictions, and consequences. Food loses its purely social and pleasurable role. (2) Constant monitoring — counting carbs, reading labels, and tracking meals can become obsessive. (3) Guilt cycle — eating "forbidden" foods leads to guilt, which leads to restriction, which leads to binging — a classic disordered eating pattern. (4) Diabulimia — specific to Type 1 diabetes, this involves deliberately reducing insulin doses to lose weight (high sugar causes calorie loss through urine). It is extremely dangerous and can cause DKA and accelerate complications. (5) Orthorexia — obsessive focus on eating only "healthy" or "diabetes-safe" foods. Warning signs: secretive eating, anxiety about mealtimes, unexplained HbA1c changes, avoiding social eating, and extreme food rules. What helps: (1) Work with a diabetes dietitian who understands the psychological aspects. (2) Avoid labeling foods as "good" or "bad." (3) Seek therapy if eating behaviors feel out of control. (4) Tell your diabetes team if you are struggling — they should screen for this.`;
    }

    // === KETOGENIC DIET AND DIABETES ===
    if (/keto|ketogenic/.test(normalizedQ) && /diabetes|manage|reverse|type 2|benefit|help/.test(normalizedQ)) {
        return `The ketogenic diet (very low carb, high fat, moderate protein) has shown some promising results for Type 2 diabetes, but it comes with important nuances: Potential benefits: (1) Significant reduction in blood sugar levels — fewer carbs means less glucose entering the blood. (2) Improved insulin sensitivity in some studies. (3) Weight loss — often substantial in the short term. (4) Some people achieve medication reduction or discontinuation under medical supervision. (5) Reduced HbA1c by 0.5-1.5% in some trials. Important concerns: (1) Sustainability — very few people maintain strict keto long-term. (2) Nutritional deficiencies if not carefully planned. (3) Kidney stress — high protein variants can strain kidneys already at risk in diabetes. (4) LDL cholesterol increase in some people. (5) Risk of diabetic ketoacidosis — especially in Type 1 or insulin-dependent Type 2. (6) Medication adjustments are absolutely necessary — continuing the same diabetes medication on keto can cause dangerous hypoglycemia. Bottom line: keto can be a tool for Type 2 management, but it requires medical supervision, careful monitoring, medication adjustments, and a realistic assessment of long-term sustainability. It is NOT recommended for Type 1 diabetes. A moderate low-carb approach is often more sustainable and achieves much of the benefit.`;
    }

    // === HOW BLOOD SUGAR IS MEASURED / CALCULATED ===
    if (/how.*(sugar|glucose).*(calculat|measur|test|check|determin|work)|how.*(measur|calculat|test|check|determin).*(sugar|glucose|blood sugar)|how.*(glucometer|meter|strip).*work|blood sugar.*(calculat|measur)|(measur|check|test).*(blood sugar|blood glucose)/.test(normalizedQ)) {
        return `Blood sugar is measured using an enzyme-based chemical reaction. Here is how it works step by step: (1) Your glucometer test strip contains a special enzyme — usually glucose oxidase or glucose dehydrogenase — that reacts only with glucose. (2) When you prick your finger and place a tiny drop of blood on the strip, the glucose in your blood reacts with this enzyme. (3) This reaction produces a small electrical current. The more glucose present, the stronger the current. (4) The glucometer measures this current and converts it into a number — displayed as mg/dL (milligrams per deciliter) in India and the US, or mmol/L in many other countries. To convert: divide mg/dL by 18 to get mmol/L. (5) Lab blood tests use more precise versions of the same enzymatic method, run on automated machines for higher accuracy. (6) HbA1c is calculated differently — it measures what percentage of your hemoglobin (a protein in red blood cells) has glucose permanently attached to it, reflecting your average blood sugar over the past 2-3 months. (7) Continuous Glucose Monitors (CGMs) use a tiny sensor inserted under the skin that measures glucose in the fluid between your cells every 1-5 minutes, using a similar enzyme reaction. So the number on your meter is the concentration of glucose dissolved in your blood at that exact moment — like measuring how much salt is dissolved in a glass of water.`;
    }

    // === SUGAR PERCENTAGE / CONCENTRATION IN BLOOD ===
    if (/percentage|percent|concentrat/.test(normalizedQ) && /sugar|glucose|blood/.test(normalizedQ)) {
        return `The actual amount of glucose (sugar) in your blood is surprisingly tiny. Here are the exact numbers: (1) In a healthy person with normal fasting blood sugar (70-100 mg/dL), glucose makes up only about 0.07 to 0.1 percent of your blood by weight. (2) Your entire bloodstream (about 5 liters) contains only 4 to 5 grams of glucose at any given moment — that is less than one teaspoon of sugar dissolved in all your blood. (3) For someone with diabetes with a fasting sugar of 126 mg/dL or above, the concentration is about 0.126 percent or higher — still a very small amount. (4) Even at a dangerously high reading of 400 mg/dL, glucose is only about 0.4 percent of your blood. (5) Your body works hard to keep this concentration in a very narrow range because your cells, especially brain cells, are extremely sensitive to even small changes. (6) HbA1c measures a different kind of percentage — it tells you what percentage of your hemoglobin molecules have glucose stuck to them. Normal is below 5.7%, prediabetes is 5.7-6.4%, and diabetes is 6.5% or above. So even though the percentage sounds small, the difference between 0.07% and 0.15% is the difference between healthy and diabetic — your body is that finely tuned.`;
    }

    // === CLOSED-LOOP SYSTEMS / ARTIFICIAL PANCREAS ===
    if (/closed.loop|artificial pancreas/.test(normalizedQ) && /how|automate|work|diabetes|manage|what/.test(normalizedQ)) {
        return `Closed-loop systems, often called artificial pancreas systems, automate insulin delivery by combining three components: (1) A Continuous Glucose Monitor (CGM) that measures glucose levels every few minutes. (2) An insulin pump that delivers insulin through a cannula under the skin. (3) A control algorithm (software) that continuously analyzes CGM data and calculates exactly how much insulin to deliver. How it works: the algorithm receives glucose readings, predicts where levels are heading, and adjusts insulin delivery in real time — increasing it when sugar is rising and reducing or suspending it when sugar is falling. This happens automatically, typically every 5 minutes. Types of systems: (1) Hybrid closed-loop — handles basal insulin automatically but still requires the user to announce meals and enter carb counts for bolus insulin. Most current commercial systems are this type. (2) Fully closed-loop — aims to handle both basal and meal insulin without user input. Still largely in research. Benefits: significantly improved time in range (70-180 mg/dL), reduced hypoglycemia especially overnight, better sleep for patients and parents of children with diabetes, and improved HbA1c. Limitations: still requires set changes, calibrations, and some user input. Cost and insurance coverage remain barriers.`;
    }

    // === GLUCAGON EMERGENCY ===
    if (/glucagon/.test(normalizedQ) && /emergenc|inject|how|when|use|kit|nasal/.test(normalizedQ)) {
        return `Glucagon is a life-saving emergency hormone used when a person with diabetes has severe hypoglycemia (very low blood sugar) and cannot eat or drink safely. Here is what you need to know: (1) When to use: blood sugar below 54 mg/dL with confusion, seizures, unconsciousness, or inability to swallow. (2) Available forms: traditional injection kit (powder + diluent you mix), pre-mixed auto-injector (like Gvoke HypoPen), and nasal powder (like Baqsimi — no injection needed, just spray into one nostril). (3) How it works: glucagon signals the liver to release stored glucose into the bloodstream, raising blood sugar within 10-15 minutes. (4) Steps: place the person on their side (to prevent choking if they vomit), administer glucagon, call emergency services, and once they wake up, give them a fast-acting carbohydrate followed by a snack. (5) Side effects: nausea and vomiting are common after glucagon. (6) Storage: kits are typically stored at room temperature. Check expiration dates regularly. (7) Everyone close to a person on insulin should know where the glucagon kit is and how to use it. Practice with expired kits so you are prepared.`;
    }

    // === DRIVING AND DIABETES ===
    if (/driv/.test(normalizedQ) && /diabet|sugar|glucose|insulin|hypo/.test(normalizedQ)) {
        return `Driving with diabetes requires extra precautions to stay safe: (1) Always check blood sugar before driving — your level should be at least 100 mg/dL (5.5 mmol/L). If below 100, eat a snack before starting. (2) Keep fast-acting glucose in the car at all times: glucose tablets, juice boxes, or candy. (3) On long drives, stop every 2 hours to check your blood sugar. (4) Never drive if you feel symptoms of low sugar: shakiness, sweating, confusion, blurred vision. Pull over safely and treat immediately. (5) Hypoglycemia unawareness (not feeling lows) is a special risk — talk to your doctor about CGM and driving fitness. (6) Wear a medical ID bracelet. (7) In India, there is no specific law banning diabetics from driving, but commercial license applicants may need a medical fitness certificate. (8) After a severe hypo episode, wait at least 45 minutes and confirm stable sugar before driving again. (9) Keep your doctor informed about your driving habits so they can adjust medication timing if needed.`;
    }

    // === SEXUAL HEALTH AND DIABETES ===
    if (/sex|erect|libido|intimacy|impotence|vaginal dry/.test(normalizedQ) && /diabet|sugar|glucose/.test(normalizedQ)) {
        return `Diabetes can affect sexual health in both men and women due to nerve damage, blood vessel issues, and hormonal changes: For men: (1) Erectile dysfunction (ED) affects 35-75% of men with diabetes. High blood sugar damages blood vessels and nerves needed for erections. (2) Retrograde ejaculation can occur due to nerve damage. (3) Low testosterone is more common in men with type 2 diabetes. (4) Treatment: good blood sugar control is the first step. Medications like sildenafil (after doctor consultation), vacuum devices, and counseling can help. For women: (1) Vaginal dryness and reduced lubrication due to nerve damage and reduced blood flow. (2) Higher risk of vaginal yeast infections and UTIs when sugars are elevated. (3) Reduced libido may be linked to fatigue, hormonal changes, or depression. (4) Treatment: lubricants, treating infections promptly, and blood sugar management help significantly. For everyone: (1) Good HbA1c control (below 7%) reduces risk of sexual complications. (2) Mental health support is important — anxiety, depression, and body image issues are common. (3) Open communication with your partner and doctor is crucial. Do not feel embarrassed discussing these issues.`;
    }

    // === DIABETES AND UTIs ===
    if (/uti|urinary tract|urine infection|bladder infect/.test(normalizedQ) && /diabet|sugar|glucose|why|prevent|recurr/.test(normalizedQ)) {
        return `People with diabetes are significantly more likely to get urinary tract infections (UTIs): (1) High blood sugar creates a sugar-rich environment in urine, which feeds bacteria. (2) Diabetes can damage nerves controlling the bladder (neurogenic bladder), causing incomplete emptying, which lets bacteria grow. (3) Reduced immune function makes it harder to fight off infections. (4) SGLT2 inhibitor medications (like dapagliflozin, empagliflozin) increase glucose in urine, which can raise UTI risk. (5) Women with diabetes are especially vulnerable. Prevention tips: (a) Keep blood sugar well controlled — this is the single most effective step. (b) Stay well hydrated — drink 8-10 glasses of water daily. (c) Do not hold urine; empty your bladder regularly. (d) Practice front-to-back wiping. (e) Urinate after intercourse. (f) Wear cotton underwear. (g) Cranberry supplements may offer mild protection. (7) Warning signs: burning during urination, frequent urge, cloudy or foul-smelling urine, pelvic pain, fever. (8) See a doctor promptly — UTIs in diabetics can escalate quickly to kidney infections. Do not delay treatment.`;
    }

    // === SEASONAL / WEATHER EFFECTS ===
    if (/season|weather|summer|winter|cold weather|hot weather|monsoon|humid|rain/.test(normalizedQ) && /diabet|sugar|glucose|affect|insulin|manage/.test(normalizedQ)) {
        return `Weather and seasons significantly affect diabetes management: Summer / Hot weather: (1) Heat can cause blood sugar to drop faster because blood vessels dilate and insulin absorbs more quickly. (2) Risk of dehydration is higher, which can concentrate blood sugar and lead to hyperglycemia. (3) Insulin and test strips degrade in heat — never leave them in a hot car. Use insulated bags. (4) Stay hydrated with water and buttermilk (chaas). Avoid sugary drinks. (5) Check blood sugar more frequently. Winter / Cold weather: (1) Cold can make insulin absorb slower, potentially causing higher readings. (2) People tend to be less active and eat heavier foods in winter, raising blood sugar. (3) Cold numbness may mask symptoms of foot injuries — inspect feet daily. (4) Flu season increases infection risk — get vaccinated. Monsoon / Humid: (1) Humidity can affect glucose meter accuracy. Store strips in dry places. (2) Higher risk of fungal infections on feet — keep feet dry and clean. (3) Waterlogged roads may limit exercise and clinic visits. General: check supplies before season changes, adjust diet and activity, test more often, and talk to your doctor about seasonal medication adjustments.`;
    }

    // === DENTAL HEALTH AND DIABETES ===
    if (/dental|teeth|tooth|gum|periodontal|oral health|mouth|dentist/.test(normalizedQ) && /diabet|sugar|glucose/.test(normalizedQ)) {
        return `Diabetes and oral health are closely linked in both directions: (1) High blood sugar increases glucose in saliva, feeding bacteria that cause plaque, cavities, and gum disease. (2) Gum disease (periodontitis) is the 6th complication of diabetes — about 1 in 3 people with diabetes have severe gum disease. (3) Gum disease can make blood sugar harder to control, creating a vicious cycle. (4) Symptoms to watch: red, swollen, or bleeding gums, persistent bad breath, loose teeth, receding gumline, mouth sores that heal slowly. Prevention and care: (a) Brush twice daily with fluoride toothpaste. (b) Floss daily. (c) Visit your dentist every 6 months — inform them you have diabetes. (d) Keep blood sugar controlled — HbA1c below 7% significantly reduces gum disease risk. (e) Do not smoke — smoking combined with diabetes dramatically worsens gum disease. (f) Watch for dry mouth (xerostomia), common in diabetes, which increases cavity risk. Use sugar-free gum or artificial saliva. (g) If you need dental procedures, inform your dentist about all diabetes medications. Schedule appointments after breakfast when blood sugar is most stable.`;
    }

    // === DIABETES AT WORK ===
    if (/work|office|job|career|employ|workplace/.test(normalizedQ) && /diabet|sugar|glucose|manage|handle/.test(normalizedQ)) {
        return `Managing diabetes at work requires some planning but is very achievable: (1) Keep diabetes supplies at your desk: glucose meter, test strips, lancets, glucose tablets, healthy snacks. (2) Set alarms for medication times and meal times — do not skip meals due to work pressure. (3) If you take insulin, have a private space for injections or use a pen for discretion. (4) Stay hydrated — keep a water bottle at your desk. (5) If your job involves physical labor or shift work, discuss medication timing adjustments with your doctor. Shift work especially disrupts meal timing and sleep, affecting blood sugar. (6) Know your rights: in India, diabetes alone cannot be grounds for job termination. Many countries have workplace disability protections. (7) Consider telling your manager or a trusted colleague about your diabetes so they can help in an emergency. (8) For desk jobs: take short walking breaks every hour, avoid sitting for long stretches. (9) Manage workplace stress with breathing exercises or short walks — stress hormones raise blood sugar. (10) Pack lunch and snacks from home to avoid relying on canteen food that may be high in carbs and oil.`;
    }

    // === CHILDREN AND DIABETES ===
    if (/child|kid|pediatric|school|teen|adolescent|baby|infant|toddler/.test(normalizedQ) && /diabet|sugar|glucose|type.1|insulin/.test(normalizedQ)) {
        return `Managing diabetes in children requires special attention: (1) Type 1 diabetes is the most common form in children, caused by autoimmune destruction of insulin-producing cells. (2) Warning signs in children: excessive thirst, frequent urination (or bedwetting in a previously dry child), unexplained weight loss, extreme hunger, fatigue, irritability, fruity breath. (3) Insulin therapy is essential for type 1 — children cannot manage with diet alone. Insulin pumps and CGMs are increasingly used in pediatric care. (4) School management: create a diabetes management plan with the school, train teachers to recognize low blood sugar, ensure the child can access snacks and testing supplies. (5) Carb counting is important — use visual aids and apps to help children learn. (6) Emotional support: children with diabetes may feel different from peers. Encourage diabetes camps and support groups. (7) Type 2 diabetes is rising in Indian children due to obesity and sedentary lifestyles. Prevention: limit screen time, encourage outdoor play, serve balanced meals. (8) Growth and puberty: hormonal changes in adolescence can make blood sugar volatile. HbA1c targets may need to be adjusted during puberty. (9) Hypoglycemia in young children: they may not recognize symptoms. Watch for behavioral changes, pallor, or clumsiness.`;
    }

    // === DIABETES APPS AND TECHNOLOGY ===
    if (/app|technology|gadget|device|wearable|smart.?watch|cgm|continuous glucose/.test(normalizedQ) && /diabet|sugar|glucose|track|monitor|manage|recommend/.test(normalizedQ)) {
        return `Technology can greatly enhance diabetes management: (1) Continuous Glucose Monitors (CGMs): devices like Freestyle Libre, Dexcom G7, and Guardian that track glucose every few minutes. They show trends with arrows, alert for highs and lows, and generate reports. Freestyle Libre is widely available in India. (2) Blood Glucose Meters: Accu-Chek, OneTouch, and Contour are reliable brands. Look for Bluetooth-enabled meters that sync with phone apps. (3) Insulin Pumps: deliver precise insulin doses throughout the day. Medtronic, Omnipod, and Tandem are major brands. (4) Smartphone Apps: MySugr, BeatO, Diabetes:M, and GlucoCare can log readings, meals, medications, and generate patterns. (5) Smart Insulin Pens: remember your last dose and time, preventing accidental double-dosing. NovoPen 6 and InPen track injections. (6) Telehealth: many diabetes clinics now offer video consultations — especially helpful in rural India. (7) AI-based tools can analyze patterns and suggest adjustments. (8) Tips for using technology: always carry backup manual supplies, do not rely solely on technology. Calibrate devices as recommended. Share data with your doctor before appointments for better consultations. (9) Cost: CGMs like Libre cost roughly 2500-3500 INR per sensor (14 days). Discuss with your doctor whether the investment matches your needs.`;
    }

    // === POSTPARTUM DIABETES / GESTATIONAL FOLLOW-UP ===
    if (/postpartum|after pregnanc|after deliver|gestational.*after|gdm.*after|baby born/.test(normalizedQ) && /diabet|sugar|glucose|test|risk|follow/.test(normalizedQ)) {
        return `After gestational diabetes (GDM), careful follow-up is essential: (1) Blood sugar usually returns to normal within hours to days after delivery, but you should be retested. (2) Get an oral glucose tolerance test (OGTT) at 6-12 weeks postpartum to confirm GDM has resolved. (3) If the test is normal, repeat screening every 1-3 years because your risk of developing type 2 diabetes is 50-60% higher over the next 10-20 years. (4) Breastfeeding is strongly encouraged — it helps reduce insulin resistance, aids weight loss, and may lower your risk of developing type 2 diabetes. Aim for 6+ months. (5) Postpartum diet: continue eating balanced meals with controlled carbs. Do not crash diet while breastfeeding. (6) Gradual exercise — start with walking and build up as recovery allows. Aim for 150 minutes/week. (7) Weight management: losing pregnancy weight within the first year significantly reduces future diabetes risk. (8) Mental health: postpartum depression is more common in women who had GDM. Seek support if needed. (9) Future pregnancies: GDM is likely to recur (~50% chance). Plan pregnancies with pre-conception blood sugar testing. (10) If you had GDM, your child has a higher risk of obesity and diabetes — model healthy eating and exercise habits early.`;
    }

    // === LIVER HEALTH AND DIABETES ===
    if (/liver|fatty liver|nafld|nash|hepat/.test(normalizedQ) && /diabet|sugar|glucose|connect|affect|cause|risk/.test(normalizedQ)) {
        return `The liver plays a central role in blood sugar regulation and is closely linked to diabetes: (1) Non-Alcoholic Fatty Liver Disease (NAFLD) affects up to 70% of people with type 2 diabetes. Insulin resistance drives fat accumulation in liver cells. (2) NAFLD can progress to NASH (Non-Alcoholic Steatohepatitis), which involves inflammation and can lead to cirrhosis. (3) The liver stores and releases glucose — when it becomes fatty, it overproduces glucose, worsening blood sugar. (4) Metformin, a first-line diabetes medication, is generally safe for fatty liver and may even help reduce liver fat. (5) Pioglitazone has shown liver benefits in studies. (6) Signs of liver problems: fatigue, right upper abdominal discomfort, elevated liver enzymes (ALT, AST) on blood tests. Many people have no symptoms until advanced stages. (7) Management: weight loss of just 5-10% can dramatically reduce liver fat. (8) Diet: avoid fructose-heavy foods and drinks (sodas, fruit juices), limit alcohol completely. Eat more fiber, vegetables, and healthy fats. (9) Exercise: 150+ minutes of moderate exercise per week helps reduce liver fat even without weight loss. (10) Get liver function tests (LFT) annually if you have type 2 diabetes. An ultrasound can detect fatty liver.`;
    }

    // === VITAMINS AND DIABETES ===
    if (/vitamin|b12|vitamin.?d|supplement|deficien/.test(normalizedQ) && /diabet|sugar|glucose|metformin|take|need|help/.test(normalizedQ)) {
        return `Several vitamins are especially important for people with diabetes: (1) Vitamin B12: Metformin, the most common diabetes medication, can reduce B12 absorption over time. B12 deficiency causes fatigue, numbness, tingling (which can be confused with diabetic neuropathy), and memory problems. Get B12 levels checked annually if on metformin. Supplement if below 300 pg/mL. (2) Vitamin D: Low vitamin D is very common in India (up to 70-80% of the population) and is linked to insulin resistance. Adequate vitamin D may improve insulin sensitivity. Get tested; supplement if below 30 ng/mL, typically 60,000 IU weekly for 8 weeks then monthly maintenance. (3) Magnesium: Low magnesium is common in diabetes and can worsen insulin resistance. Found in nuts, seeds, green leafy vegetables. (4) Chromium: may improve insulin sensitivity in small amounts. Found in broccoli, whole grains. (5) Zinc: important for insulin storage and wound healing. (6) Omega-3: helps with inflammation and heart health, important for diabetics at cardiovascular risk. (7) Alpha-lipoic acid: an antioxidant that may help with neuropathy symptoms. (8) Do not self-supplement high doses without medical advice — some vitamins interact with diabetes medications. Always get blood tests to check actual levels before starting supplements.`;
    }

    // === FIBER AND DIABETES ===
    if (/fiber|fibre|roughage|soluble fiber|psyllium|isabgol/.test(normalizedQ) && /diabet|sugar|glucose|help|benefit|how much|eat/.test(normalizedQ)) {
        return `Fiber is one of the most powerful dietary tools for managing diabetes: (1) Soluble fiber (oats, barley, beans, apples, isabgol/psyllium) forms a gel in the gut that slows sugar absorption, reducing post-meal blood sugar spikes. (2) Insoluble fiber (whole wheat, vegetables, nuts) adds bulk, improves digestion, and helps with weight management. (3) Recommended intake: 25-30 grams per day. Most Indians get only 15-20g. (4) Indian high-fiber foods: rajma, chana, moong dal, oats dosa, ragi, jowar roti, guava, amla, flaxseeds, methi seeds. (5) Isabgol (psyllium husk): 1-2 teaspoons in water before meals can reduce post-meal sugar spikes by 15-20%. Start slowly to avoid bloating. (6) Tips to increase fiber: swap maida products for whole grain, eat whole fruits instead of juice, add vegetables to every meal, snack on roasted chana or makhana. (7) Fiber also helps lower cholesterol, reduce heart disease risk, improve gut bacteria, and promote satiety (feeling full), aiding weight loss. (8) Caution: increase fiber gradually and drink plenty of water to avoid gas and bloating. Very high fiber intake can reduce absorption of some medications — take medicines 1-2 hours before high-fiber meals.`;
    }

    // === DAWN PHENOMENON ===
    if (/dawn|morning.*(high|sugar|spike|rise)|fasting.*(high|elevat)|wake.*high|sugar.*high.*morning/.test(normalizedQ)) {
        return `The dawn phenomenon is a natural rise in blood sugar in the early morning hours (typically 3-8 AM): (1) Cause: your body releases counter-regulatory hormones (cortisol, growth hormone, adrenaline) in the early morning to prepare you for waking up. These hormones make the liver produce more glucose. In people without diabetes, insulin compensates. In diabetes, this compensation is insufficient. (2) How to identify: check blood sugar at bedtime, at 3 AM, and upon waking. If 3 AM sugar is normal or high and morning sugar is high, it is likely the dawn phenomenon. (3) If 3 AM sugar is LOW and morning is high, it might be the Somogyi effect (rebound hyperglycemia after nocturnal hypoglycemia) — this needs different management. (4) Management: eat a low-carb, high-protein evening snack (a handful of nuts works well). (5) Exercise in the evening can help. (6) If on medications, your doctor may adjust timing — for example, taking metformin XR at bedtime or adjusting basal insulin timing/dose. (7) A CGM can reveal overnight patterns that fingerstick testing misses. (8) The dawn phenomenon is very common and not a sign of treatment failure. It may account for fasting readings of 120-160 mg/dL even when your overall control is good.`;
    }

    // === FEVER AND DIABETES ===
    if (/fever|flu|cold|sick|ill/.test(normalizedQ) && /diabet|sugar|glucose|manage|what.*do|take|sick day/.test(normalizedQ)) {
        return `Sick days with fever, flu, or cold need special diabetes management: (1) Illness raises stress hormones (cortisol, adrenaline) which increase blood sugar — even if you are eating less. (2) NEVER stop diabetes medications when sick, especially insulin. You may actually need MORE insulin during illness. (3) Check blood sugar every 2-4 hours. (4) Stay hydrated: sip water, clear broths, electrolyte drinks (like ORS). Aim for a glass every hour. (5) If you cannot eat regular food, consume small frequent amounts of easy-to-digest carbs: khichdi, toast, crackers, banana, curd rice. (6) Check for ketones if blood sugar stays above 240 mg/dL (especially type 1) — use urine ketone strips. If ketones are moderate to high, contact your doctor immediately. (7) Seek urgent help if: vomiting for more than 6 hours, blood sugar above 300 mg/dL repeatedly, signs of dehydration, confusion, rapid breathing. (8) Some cough syrups and cold medications contain sugar — choose sugar-free versions. (9) After recovery: illness can affect blood sugar for days. Monitor closely and return to normal routine gradually. (10) Prevention: get annual flu and pneumonia vaccines as recommended for diabetics.`;
    }

    // === FOOT NUMBNESS / NEUROPATHY PREVENTION ===
    if (/numb|tingl|burning.*feet|nerve.*damage|neuropath|pins.*needles/.test(normalizedQ) && /foot|feet|leg|hand|toe|finger|diabet|prevent|treat/.test(normalizedQ)) {
        return `Diabetic neuropathy (nerve damage) is one of the most common complications, affecting up to 50% of people with diabetes over time: (1) Cause: chronic high blood sugar damages the tiny blood vessels that supply nerves, especially in the feet and legs. (2) Symptoms: numbness, tingling, burning, pins-and-needles sensation, sharp shooting pains, or loss of sensation. Usually starts in toes and progresses upward. (3) Prevention is key: keeping HbA1c below 7% reduces neuropathy risk by 60%. (4) Daily foot inspection: check for cuts, blisters, redness, swelling, temperature changes. Use a mirror for soles. (5) Footwear: wear well-fitting shoes with soft insoles. Never walk barefoot, even at home. (6) Blood sugar control is the single most effective treatment — medications can manage symptoms but cannot reverse nerve damage. (7) Medications for pain: pregabalin (Lyrica), gabapentin, duloxetine, or amitriptyline — prescribed by doctors based on severity. (8) Supplements: alpha-lipoic acid and methylcobalamin (active B12) may help. (9) Regular exercise improves blood flow to nerves. (10) Avoid alcohol and smoking — both worsen nerve damage. (11) Get a monofilament test at your doctor annually to assess sensation. Early detection and aggressive sugar control can slow progression significantly.`;
    }

    // === HAIR LOSS AND DIABETES ===
    if (/hair.*loss|hair.*fall|bald|thin.*hair|hair.*diabet/.test(normalizedQ)) {
        return `Hair loss is a common but often overlooked concern for people with diabetes: (1) High blood sugar impairs blood circulation to hair follicles, slowing growth and causing thinning. (2) Hormonal imbalances linked to insulin resistance (especially in women with PCOS and type 2 diabetes) can worsen hair loss. (3) Nutritional deficiencies common in diabetes: low iron, vitamin D, B12 (especially on metformin), zinc, and biotin all contribute to hair loss. (4) Thyroid disorders are more common in people with diabetes (especially type 1) and are a major cause of hair loss. Get thyroid tested if losing hair. (5) Stress from managing a chronic condition and mental health impact can trigger telogen effluvium (temporary diffuse hair loss). (6) Certain medications: while metformin can cause B12-related hair loss indirectly, other conditions and medications may also contribute. (7) Management: control blood sugar to improve circulation, correct nutritional deficiencies, manage thyroid if needed, reduce stress, use gentle hair care, and eat protein-rich diet. (8) When to see a dermatologist: patchy hair loss, rapid hair loss, scalp inflammation, or if basic interventions do not help within 3-6 months.`;
    }

    // === BRAIN AND MEMORY ===
    if (/brain|memory|cognitive|dementia|alzheimer|forget|concentrat|fog/.test(normalizedQ) && /diabet|sugar|glucose/.test(normalizedQ)) {
        return `Diabetes significantly impacts brain health: (1) The brain uses about 20% of the body's glucose, so blood sugar fluctuations directly affect cognitive function. (2) Chronic hyperglycemia damages blood vessels in the brain, similar to how it damages eyes and kidneys, increasing risk of vascular dementia. (3) Type 2 diabetes increases the risk of Alzheimer's disease by 50-65%. Some researchers call Alzheimer's 'type 3 diabetes' due to the insulin resistance connection. (4) Frequent hypoglycemia (especially severe episodes) can cause cumulative brain damage, particularly in older adults. (5) Symptoms of diabetes-related cognitive decline: difficulty concentrating, brain fog, memory lapses, slower processing, trouble multitasking. (6) Prevention: maintain stable blood sugar (avoid extreme highs and lows). Target HbA1c below 7%. (7) Exercise is protective — it increases blood flow to the brain and promotes growth of new brain connections. 150 minutes/week of moderate exercise. (8) Heart-healthy diet (Mediterranean pattern or Indian equivalent with vegetables, nuts, fish, whole grains) protects the brain. (9) Quality sleep is critical — diabetes-related sleep apnea worsens cognitive decline. (10) Stay mentally active: reading, puzzles, social interaction. (11) Manage blood pressure and cholesterol — both affect brain blood flow.`;
    }

    // === MENSTRUAL CYCLE AND DIABETES ===
    if (/period|menstr|cycle|pms|menopause|pcos/.test(normalizedQ) && /diabet|sugar|glucose|affect|insulin|blood/.test(normalizedQ)) {
        return `Hormonal changes throughout the menstrual cycle significantly affect blood sugar: (1) In the days before your period (luteal phase), progesterone rises, which increases insulin resistance. Many women see blood sugar run 20-50 mg/dL higher than usual. (2) Once your period starts, hormone levels drop and blood sugar may drop too — increasing the risk of hypoglycemia. (3) PCOS (Polycystic Ovary Syndrome) and type 2 diabetes are closely linked — both involve insulin resistance. Up to 70% of women with PCOS develop insulin resistance. (4) Metformin is sometimes used to treat PCOS even without diabetes diagnosis. (5) Menopause: declining estrogen increases insulin resistance, so blood sugar may rise. Hot flashes and sleep disruption also affect levels. HbA1c targets may need reassessment. (6) Tracking tips: log your cycle alongside blood sugar readings for 3-4 months to identify your personal pattern. This helps your doctor adjust medication timing. (7) Premenstrual cravings are real and driven by hormone shifts — plan healthy snacks rather than fighting cravings. (8) Contraception: hormonal methods can affect blood sugar. Discuss options with your endocrinologist. (9) If periods are irregular, get tested for thyroid problems and PCOS — both are more common with diabetes.`;
    }

    // === SURGERY AND DIABETES ===
    if (/surgery|operat|anesthesia|procedure|pre.?op|post.?op/.test(normalizedQ) && /diabet|sugar|glucose|prepar|manag|risk|safe/.test(normalizedQ)) {
        return `Surgery requires careful planning for people with diabetes: Pre-operative: (1) Inform your surgeon and anesthesiologist about your diabetes, all medications, and recent HbA1c. Target HbA1c below 8% for elective surgery. (2) Metformin is usually stopped 24-48 hours before surgery. (3) SGLT2 inhibitors (dapagliflozin, empagliflozin) should be stopped 3 days before surgery to prevent diabetic ketoacidosis. (4) Insulin users: your doctor may adjust doses the night before. Long-acting insulin is usually continued. (5) Fasting instructions: you cannot eat before surgery, but blood sugar still needs monitoring. During surgery: (6) Blood sugar is monitored and managed with IV insulin if needed. The target is typically 140-180 mg/dL during the procedure. Post-operative: (7) Blood sugar often runs high after surgery due to stress, pain, and inflammation. Sliding scale insulin may be used. (8) Healing takes longer with diabetes — wound infection risk is 2-5 times higher. Keep blood sugar tightly controlled for better healing. (9) Resume diabetes medications as directed once eating normally. (10) Watch for signs of infection at the surgical site: redness, warmth, swelling, pus, delayed healing. Report immediately.`;
    }

    // === EYE FLOATERS AND DIABETIC EYE ===
    if (/floater|flash|spot.*eye|vision.*spot|blurr.*vision|eye.*diabet|retinopath/.test(normalizedQ) && /diabet|sugar|glucose|danger|normal|serious|why/.test(normalizedQ)) {
        return `Eye floaters and vision changes in diabetes need attention: (1) Floaters (small dark spots, threads, or cobwebs in your vision) can be harmless or can signal diabetic retinopathy. (2) Diabetic retinopathy occurs when high blood sugar damages tiny blood vessels in the retina. It affects about 1 in 3 people with diabetes over time. (3) Warning signs needing URGENT evaluation: sudden increase in floaters, flashes of light, a curtain or shadow across your vision, sudden blurring, or loss of vision in one area. These could indicate vitreous hemorrhage or retinal detachment. (4) Blurry vision that comes and goes may simply reflect blood sugar fluctuations — high sugar makes the lens swell. This resolves when sugar stabilizes. Do not get new glasses during a period of unstable sugar. (5) Prevention: annual dilated eye exams are essential. Retinopathy can be present with no symptoms. (6) Good HbA1c control, blood pressure control, and cholesterol management reduce retinopathy risk by 50-70%. (7) Treatments: laser photocoagulation, anti-VEGF injections, and vitrectomy surgery can prevent vision loss if detected early. (8) If starting insulin or improving sugar control rapidly, temporary worsening of retinopathy can occur — your doctor should increase monitoring frequency.`;
    }

    // === CONSTIPATION AND GASTROPARESIS ===
    if (/constipat|gastroparesis|stomach.*slow|digest.*slow|bloat.*diabet|bowel/.test(normalizedQ) && /diabet|sugar|glucose/.test(normalizedQ)) {
        return `Digestive issues are common in diabetes due to nerve damage affecting the gut: (1) Diabetic gastroparesis: the vagus nerve controlling stomach emptying is damaged, causing food to sit in the stomach much longer than normal. Symptoms: early fullness, nausea, vomiting undigested food, bloating, erratic blood sugar (delayed spikes). Affects up to 20-50% of long-standing diabetes. (2) Constipation: affects up to 60% of people with diabetes. Causes include autonomic neuropathy, dehydration from high blood sugar, medications, and low-fiber diets. (3) Management of constipation: increase fiber gradually (25-30g/day), drink plenty of water, regular physical activity, isabgol (psyllium) 1-2 tsp at bedtime, and consider stool softeners. (4) Gastroparesis management: eat small frequent meals (6 small instead of 3 large), chew food thoroughly, choose lower-fiber and lower-fat foods (fiber can worsen gastroparesis), stay upright after eating, walk gently after meals. (5) Blood sugar control is essential — high sugar further slows stomach emptying, creating a vicious cycle. (6) Medications: domperidone or metoclopramide may help. Some newer GLP-1 medications can worsen gastroparesis. (7) Insulin timing may need adjustment — taking insulin after eating rather than before if stomach emptying is unpredictable.`;
    }

    // === HONEYMOON PHASE ===
    if (/honeymoon|remission|sugar.*normal.*type.1|need.*less.*insulin|insulin.*reduce/.test(normalizedQ) && /diabet|type.1|newly diagnos/.test(normalizedQ)) {
        return `The honeymoon phase is a temporary period after type 1 diabetes diagnosis when the pancreas still produces some insulin: (1) It typically begins weeks to months after starting insulin therapy and can last from a few months to 1-2 years (rarely longer). (2) During this phase, blood sugars are easier to control and insulin requirements drop significantly — sometimes to very low doses. (3) This does NOT mean diabetes is going away. The autoimmune destruction of beta cells is ongoing. Eventually, the remaining cells will be destroyed and insulin needs will rise. (4) It can be emotionally confusing — patients or parents may wonder if the diagnosis was wrong. It was not. (5) Continuing insulin during the honeymoon phase (even if doses are tiny) may actually help preserve remaining beta cells longer. Do not stop insulin. (6) The honeymoon phase is more common in: older children/adults at diagnosis, those who started insulin quickly, and those with higher C-peptide levels at diagnosis. (7) Type 2 diabetes remission is different — some type 2 patients achieve remission through weight loss, diet, and exercise, especially early in the disease. This is a more sustained effect related to reducing insulin resistance. (8) Always work with your endocrinologist to adjust insulin doses during this period rather than stopping on your own.`;
    }

    // === REACTIVE HYPOGLYCEMIA ===
    if (/reactive|postprandial.*low|sugar.*(drop|crash|low).*after.*eat|after.*meal.*(low|hypo|dizz)|sugar.*crash/.test(normalizedQ)) {
        return `Reactive hypoglycemia is a drop in blood sugar 2-5 hours after eating, especially after high-carb meals: (1) Symptoms: shakiness, sweating, dizziness, anxiety, hunger, brain fog, rapid heartbeat — occurring 2-4 hours after a meal rather than from skipping meals. (2) Common in prediabetes and early type 2 diabetes: the pancreas overproduces insulin in delayed response to a carb-heavy meal, causing sugar to crash. (3) It can also occur after gastric surgery or in people without diabetes. (4) Diagnosis: monitor blood sugar during symptoms. If below 70 mg/dL at 2-4 hours post-meal with symptoms that resolve after eating, it strongly suggests reactive hypoglycemia. A mixed-meal tolerance test can confirm. (5) Management: eat smaller, more frequent meals (5-6 per day). (6) Pair carbs with protein and healthy fat — never eat carbs alone. Example: do not eat plain rice; add dal, vegetables, and curd. (7) Choose low-glycemic-index carbs: brown rice, oats, whole wheat over white rice, maida, and sugar. (8) Avoid sugary drinks, sweets, and refined carbs — they cause the biggest insulin spike and crash. (9) A small snack between meals (handful of nuts, cheese, yogurt) prevents troughs. (10) Exercise moderately after meals. (11) If episodes are frequent or severe, consult a doctor to rule out insulinoma or other causes.`;
    }

    // === LEG CRAMPS AND DIABETES ===
    if (/cramp|leg.*pain|calf.*pain|muscle.*cramp|charlie horse|night.*cramp/.test(normalizedQ) && /diabet|sugar|glucose/.test(normalizedQ)) {
        return `Leg cramps are very common in people with diabetes, especially at night: (1) Causes: high blood sugar causes dehydration and electrolyte loss (magnesium, potassium, calcium) through excessive urination. (2) Diabetic neuropathy (nerve damage) can cause cramping and muscle spasms. (3) Peripheral artery disease (PAD) — narrowed blood vessels reducing blood flow to legs — is more common in diabetes and causes cramping during walking (claudication). (4) Some diabetes medications (especially diuretics given for blood pressure) can worsen electrolyte imbalances. (5) Immediate relief: gently stretch the cramped muscle, massage it, apply warm compress, walk around. (6) Prevention: stay well hydrated, ensure adequate magnesium (nuts, seeds, green vegetables), potassium (bananas, coconut water, dal), and calcium intake. (7) Stretch calf muscles before bed: stand at arm's length from a wall, lean forward with heels on ground. (8) Regular exercise improves circulation than prevents cramps. (9) Keep blood sugar well controlled — fluctuations worsen cramping. (10) When to see a doctor: cramps that are very frequent, extremely painful, cause muscle swelling, do not improve with basic measures, or if you notice cold/pale/blue legs (signs of PAD). (11) Your doctor may check ABI (ankle-brachial index) to assess circulation.`;
    }

    // === NIGHT SWEATS AND DIABETES ===
    if (/night.*sweat|sweat.*night|wake.*sweat|nocturnal.*sweat|diaphoresis/.test(normalizedQ) && /diabet|sugar|glucose|caus|why|normal/.test(normalizedQ)) {
        return `Night sweats in people with diabetes can have several causes: (1) Nocturnal hypoglycemia is the most important cause to rule out. Low blood sugar at night triggers adrenaline release, causing sweating, rapid heartbeat, nightmares, and morning headaches. This is common with long-acting insulin or sulfonylureas. (2) To check: test blood sugar at 2-3 AM for a few nights. If below 70 mg/dL, discuss medication adjustment with your doctor. (3) Autonomic neuropathy: damage to nerves that control sweating can cause excessive sweating (especially in the upper body) even without temperature changes. This is called gustatory sweating when triggered by certain foods. (4) High blood sugar: persistent hyperglycemia can also cause night sweats as the body tries to cope. (5) Medications: some diabetes and blood pressure medications list night sweats as a side effect. (6) Other causes to consider: thyroid disorders, infections, sleep apnea (very common in type 2 diabetes and obesity), and in women, perimenopause. (7) Management: treat the underlying cause. For nocturnal hypos: bedtime snack with protein and fat, medication adjustment. For neuropathy: topical treatments and good sugar control. (8) Keep bedroom cool, use breathable cotton bedding, and keep water by the bed. See your doctor if night sweats are recurrent.`;
    }

    // === C-PEPTIDE TEST ===
    if (/c.?peptide|c peptide/.test(normalizedQ) && /what|test|level|mean|low|high|check|diabet/.test(normalizedQ)) {
        return `C-peptide is a valuable blood test that measures how much insulin your pancreas is making: (1) When the pancreas makes insulin, it also produces C-peptide in equal amounts. C-peptide stays in the blood longer, making it a reliable marker of insulin production. (2) Normal fasting C-peptide: 0.5-2.0 ng/mL. (3) Low C-peptide (below 0.5): means the pancreas is making little or no insulin, typical of type 1 diabetes, LADA (latent autoimmune diabetes in adults), or very advanced type 2 diabetes. (4) Normal or high C-peptide: means the pancreas makes enough or excess insulin but the body is resistant to it, typical of early-to-mid type 2 diabetes. (5) Uses: (a) distinguishing type 1 from type 2 diabetes, (b) determining if a type 2 patient has progressed to needing insulin, (c) monitoring beta cell function over time, (d) evaluating honeymoon phase in type 1. (6) Can be tested fasting or stimulated (after a meal or glucagon injection). (7) Unlike insulin, C-peptide is not affected by injected insulin — so it shows true pancreatic output even in patients taking insulin. (8) LADA diagnosis: an adult diagnosed as type 2 but with low C-peptide and positive autoantibodies (GAD, IA-2) likely has LADA and will need insulin sooner. (9) Discuss with your endocrinologist if you are unsure about your diabetes type.`;
    }

    // === ACANTHOSIS NIGRICANS ===
    if (/acanthosis|dark.*patch|dark.*skin.*neck|dark.*armpit|skin.*dark.*fold|black.*neck/.test(normalizedQ) && /diabet|sugar|glucose|insulin|what|cause|mean/.test(normalizedQ)) {
        return `Acanthosis nigricans is a skin condition commonly linked to insulin resistance and diabetes: (1) Appearance: dark, thick, velvety patches typically on the neck, armpits, groin, elbows, knees, and knuckles. (2) Cause: excess insulin in the blood stimulates skin cells and melanin production in the skin folds. It is primarily a sign of insulin resistance. (3) It is one of the earliest visible warning signs of prediabetes and type 2 diabetes, often appearing years before blood sugar becomes abnormal. (4) Very common in India — seen frequently in overweight children and adults. (5) PCOS-related insulin resistance also causes acanthosis in women. (6) It is NOT a hygiene problem — scrubbing will not remove it and can irritate the skin. (7) Treatment: the most effective treatment is addressing the underlying insulin resistance through weight loss, diet changes, exercise, and blood sugar control. As insulin resistance improves, the dark patches gradually lighten. (8) Topical treatments (retinoids, vitamin C serums) can help cosmetically but will not resolve the underlying cause. (9) If a child or teenager has dark patches on the neck, screening for prediabetes with fasting blood sugar and HbA1c is strongly recommended. (10) Rarely, sudden severe acanthosis can indicate an underlying malignancy — this is uncommon and usually appears differently.`;
    }

    // === PAIN MANAGEMENT AND DIABETES ===
    if (/pain.?killer|painkiller|analgesic|ibuprofen|aspirin|nsaid|pain.*medic|diclofenac|paracetamol/.test(normalizedQ) && /diabet|sugar|glucose|safe|kidney|take|can i/.test(normalizedQ)) {
        return `Pain medication choices need care in diabetes due to kidney and cardiovascular risks: (1) Paracetamol (acetaminophen) is generally the safest first-choice painkiller. It does not affect blood sugar, kidneys, or blood pressure at normal doses. Avoid exceeding 3g/day and limit alcohol. (2) NSAIDs (ibuprofen, diclofenac, naproxen): use with caution. They can worsen kidney function (a concern since diabetes already stresses kidneys), raise blood pressure, and increase cardiovascular risk. Short-term use is usually acceptable if kidneys are healthy. Avoid if eGFR is below 60. (3) Aspirin: low-dose aspirin (75-150mg) is often prescribed for diabetics with cardiovascular risk. Regular-dose aspirin for pain carries similar NSAID risks. (4) Opioids: do not directly affect blood sugar but cause constipation (already a diabetes problem), and gabapentin/pregabalin are preferred for neuropathic pain anyway. (5) Topical pain relief (diclofenac gel, capsaicin cream): much safer than oral NSAIDs since minimal systemic absorption. Good for localized pain. (6) For chronic pain: non-medication approaches like physiotherapy, heat/cold therapy, gentle exercise, and stress management should be first line. (7) Always inform your doctor about your diabetes and kidney function (eGFR, creatinine) before starting any regular pain medication.`;
    }

    // === PROBIOTICS AND DIABETES ===
    if (/probiotic|gut.*bacteria|microbiome|curd.*benefit|yogurt.*diabet|ferment/.test(normalizedQ) && /diabet|sugar|glucose|help|benefit|gut/.test(normalizedQ)) {
        return `Emerging research shows gut health significantly impacts diabetes management: (1) The gut microbiome influences insulin sensitivity, inflammation, and blood sugar regulation. People with type 2 diabetes often have less diverse gut bacteria. (2) Probiotics (beneficial bacteria) may improve insulin sensitivity and reduce fasting blood sugar modestly. Lactobacillus and Bifidobacterium strains have the most evidence. (3) Indian probiotic foods: fresh homemade curd/dahi (rich in Lactobacillus), buttermilk/chaas, idli/dosa batter (naturally fermented), pickles (naturally fermented, not commercial), kanji. (4) Commercial probiotic supplements: look for multi-strain products with at least 10 billion CFU. Take consistently for 8-12 weeks to see effects. (5) Prebiotics (fiber that feeds good bacteria) are equally important: garlic, onion, banana, oats, flaxseeds, chicory. (6) Fermented foods help but choose wisely — sweetened yogurt, commercial kombucha with added sugar, and sugary probiotic drinks may do more harm than good. (7) Metformin affects the gut microbiome — some of its benefits (and GI side effects) are mediated through gut bacteria changes. (8) Antibiotics can disrupt gut flora and temporarily worsen blood sugar control. Replenish with probiotics after antibiotic courses. (9) This is an active research area — while promising, probiotics are not a replacement for medications but may provide complementary benefits.`;
    }

    // === FRUCTOSE AND DIABETES ===
    if (/fructose|fruit sugar|high fructose|hfcs|corn syrup/.test(normalizedQ) && /diabet|sugar|glucose|safe|bad|avoid|harm|eat/.test(normalizedQ)) {
        return `Fructose and diabetes — what you need to know: (1) Fructose is fruit sugar, naturally found in fruits, honey, and some vegetables. It is also used commercially as high-fructose corn syrup (HFCS) in sodas and processed foods. (2) Natural fructose from whole fruits is generally SAFE for diabetics because whole fruits contain fiber, vitamins, and antioxidants that slow absorption. Eating 2-3 servings of whole fruit per day is recommended even for diabetics. (3) Added/processed fructose (HFCS, table sugar) is harmful: it is processed entirely by the liver, promoting fatty liver, insulin resistance, high triglycerides, and visceral fat. (4) Fructose does not raise blood sugar directly (low glycemic index) which misleads some people into thinking it is safe. But it worsens insulin resistance through liver pathways — so it harms diabetes management even without spiking glucose. (5) Fruit juices — even 100% juice — deliver concentrated fructose without fiber. Avoid or limit to 100 ml. (6) Honey: though natural, it is 40-50% fructose. Use sparingly (1-2 tsp occasionally) if at all. (7) Indian context: avoid packaged fruit drinks (Frooti, Real juice, etc.), mithai made with sugar, and anything containing HFCS or added fructose. (8) Best fruits for diabetics (low-medium fructose, high fiber): guava, apple, papaya, pear, berries. Limit: mango, chiku, grapes, banana (high fructose content).`;
    }

    // === ALTITUDE AND DIABETES ===
    if (/altitude|mountain|trek|hiking|high altitude|hill station|leh|ladakh|manali/.test(normalizedQ) && /diabet|sugar|glucose|insulin|safe|prepar|manage|affect/.test(normalizedQ)) {
        return `Traveling to high altitude with diabetes needs preparation: (1) Altitude affects blood sugar unpredictably — some people see higher readings due to stress and altitude sickness, others see lows due to increased physical exertion. (2) Cold temperatures at altitude make insulin absorb differently and can cause glucose meters to give inaccurate readings. Keep devices and insulin close to your body for warmth. (3) Insulin does not freeze at typical hill station temperatures but should be protected below 2°C and above 30°C. (4) Altitude sickness symptoms (headache, nausea, fatigue) overlap with both hypo- and hyperglycemia — always test rather than assume. (5) Physical exertion during trekking can cause dramatic blood sugar drops. Test before, during, and after activity. Carry glucose tablets and snacks accessible in your pack. (6) Acetazolamide (Diamox), used for altitude sickness prevention, can rarely affect blood sugar. Monitor closely. (7) Dehydration risk is higher at altitude — drink extra water. (8) If on an insulin pump: check that the pump functions correctly at altitude. Air pressure changes can cause small air bubbles in the reservoir. (9) Carry double your usual supply of medications, testing supplies, and snacks. Keep supplies in two separate bags in case one is lost. (10) Medical facilities may be limited — know the nearest hospital. In India, places like Leh have basic medical facilities but not endocrinologists.`;
    }

    // === INSURANCE AND DIABETES ===
    if (/insurance|health cover|mediclaim|policy|premium|claim|cashless/.test(normalizedQ) && /diabet|sugar|glucose|pre.?exist|cover/.test(normalizedQ)) {
        return `Health insurance with diabetes in India — key points: (1) Diabetes is classified as a pre-existing condition. Most policies cover it after a waiting period of 2-4 years from the policy start date. (2) Policies purchased before diabetes diagnosis typically cover all diabetes-related expenses after the waiting period. (3) If diagnosed before purchasing: some insurers accept diabetics (with higher premiums or co-pay clauses), while others may exclude diabetes complications. Disclose your condition honestly — hiding it can lead to claim rejection. (4) What is typically covered after the waiting period: hospitalization for diabetes emergencies (DKA, severe hypoglycemia, infections), diabetes-related surgeries (amputation, cardiac procedures), and sometimes medications during hospitalization. (5) What is typically NOT covered: outpatient consultations, routine blood tests, insulin and daily medications (OPD), glucose monitors and strips. (6) CGHS and ESI (government schemes) cover diabetes treatment comprehensively for eligible employees. (7) Ayushman Bharat (PM-JAY) covers hospitalization for diabetes complications for eligible families. (8) Tips: (a) Buy insurance early before diagnosis if you have risk factors. (b) Look for policies with diabetic-friendly riders or OPD coverage. (c) Companies like Star Health offer specific diabetes plans (like Star Diabetes Safe). (d) Top-up plans can supplement existing coverage affordably.`;
    }

    // === TATTOOS AND PIERCINGS ===
    if (/tattoo|pierc|body art|ink/.test(normalizedQ) && /diabet|sugar|glucose|safe|risk|can i|infection/.test(normalizedQ)) {
        return `Getting tattoos or piercings with diabetes requires extra precautions: (1) Diabetes is not an absolute contraindication — but timing and blood sugar control matter. (2) Only proceed if your HbA1c is well controlled (ideally below 8%). Poor sugar control significantly increases healing time and infection risk. (3) Avoid areas prone to diabetic complications: feet/ankles (poor circulation), insulin injection sites, and areas with neuropathy (you may not feel infection developing). (4) Choose a reputable, licensed studio that follows strict hygiene — autoclaved equipment, single-use needles, sterile technique. (5) Inform the artist about your diabetes. (6) Healing concerns: diabetes slows wound healing and impairs immune response. Tattoos take longer to heal (potentially 4-6 weeks instead of 2-3). Piercings carry similar risks. (7) Post-care: keep the area clean and moisturized, watch closely for signs of infection (redness, warmth, swelling, pus, fever), and monitor blood sugar more frequently during healing as infection or stress can raise levels. (8) Avoid non-sterile traditional tattoo methods. (9) Avoid getting tattooed during illness or when sugar is not controlled. (10) MRI concern: metallic-ink tattoos may react during MRI scans — this is rare but worth noting for patients who may need regular imaging.`;
    }

    return null;
}

function normalizeQuestionText(text) {
    let value = String(text || '').toLowerCase();

    // Normalize casual shorthand and common misspellings.
    const phraseRules = [
        [/\bpls\b|\bplz\b/g, 'please'],
        [/\bu\b/g, 'you'],
        [/\bur\b/g, 'your'],
        [/\bthx\b/g, 'thanks'],
        [/\bdiabetis\b|\bdiabtes\b|\bdiabets\b|\bdaibetes\b|\bdiabitis\b|\bdiabatis\b/g, 'diabetes'],
        [/\bsuger\b|\bsugr\b|\bglocose\b|\bglucoze\b|\bshugar\b|\bsugar level\b/g, 'sugar'],
        [/\bhypo\b/g, 'hypoglycemia'],
        [/\bhyper\b/g, 'hyperglycemia'],
        [/\bmeds\b/g, 'medicines'],
        [/\bdoc\b|\bdr\b/g, 'doctor'],
        [/\bproblem\b/g, 'issue'],
        [/\bbreakfst\b|\bbrekfast\b/g, 'breakfast'],
        [/\bexrcise\b|\bexersice\b|\bexersize\b/g, 'exercise'],
        [/\bkidny\b|\bkidney\b/g, 'kidney'],
        [/\bweight loss\b|\bweightloss\b/g, 'weight loss'],
        [/\bbp\b/g, 'blood pressure'],
        [/\bbs\b/g, 'blood sugar'],
        // New topic misspellings and shorthand
        [/\bnueropath\b|\bnuropath\b|\bneropathy\b/g, 'neuropathy'],
        [/\bgastroparisis\b|\bgastroparasis\b/g, 'gastroparesis'],
        [/\bacanthosys\b|\bacanthoses\b/g, 'acanthosis'],
        [/\bretinopthy\b|\bretinopath\b/g, 'retinopathy'],
        [/\bglucogon\b|\bglucagen\b/g, 'glucagon'],
        [/\bperiodontle\b|\bperiodontal disease\b/g, 'periodontal'],
        [/\bgestationl\b|\bgestasional\b/g, 'gestational'],
        [/\bpostpartm\b|\bpost partum\b/g, 'postpartum'],
        [/\bmenstraul\b|\bmenstrul\b|\bmenstral\b/g, 'menstrual'],
        [/\bconstipaton\b|\bconstipashun\b/g, 'constipation'],
        [/\bvitamn\b|\bvitamins?\b/g, 'vitamin'],
        [/\bfibr\b/g, 'fiber'],
        [/\bprobiotik\b|\bprobiotc\b/g, 'probiotic'],
        [/\bfructos\b/g, 'fructose'],
        [/\binsurnce\b|\binsurance\b/g, 'insurance'],
        // Number words → digits
        [/\btwo forty\b/g, '240'],
        [/\btwo hundred\b/g, '200'],
        [/\bthree hundred\b/g, '300'],
        [/\btwo fifty\b/g, '250'],
        [/\bone fifty\b/g, '150'],
        [/\bone eighty\b/g, '180'],
        [/\bfour hundred\b/g, '400'],
        [/\bthree fifty\b/g, '350'],
        [/\bfive hundred\b/g, '500'],
        [/\bone hundred\b/g, '100'],
        [/\bninety\b/g, '90'],
        [/\beighty\b/g, '80'],
        [/\bseventy\b/g, '70'],
        [/\bsixty\b/g, '60'],
        [/\bfifty\b/g, '50'],
        [/\bforty\b/g, '40'],
    ];

    for (const [pattern, replacement] of phraseRules) {
        value = value.replace(pattern, replacement);
    }

    // Collapse long repeated letters in expressive typing: "helloooo" -> "helloo".
    value = value.replace(/([a-z])\1{2,}/g, '$1$1');
    return value;
}

function safeJsonRead(filePath, fallback) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return fallback;
    }
}

function getKnowledgeBase() {
    const base = safeJsonRead(KB_PATH, []);
    const geo = buildIndiaGeoKnowledge();
    const expanded = buildExpandedKnowledge();
    const merged = [
        ...(Array.isArray(base) ? base : []),
        ...(Array.isArray(geo) ? geo : []),
        ...(Array.isArray(expanded) ? expanded : []),
    ];

    // Keep first occurrence for stable IDs in case of accidental duplicates.
    const seen = new Set();
    return merged.filter((item) => {
        const id = String(item && item.id ? item.id : '').trim();
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

function appendDoctorLine(text) {
    const line = 'You can consult a doctor.';
    const value = String(text || '').trim();
    if (!value) return line;
    if (value.toLowerCase().includes(line.toLowerCase())) return value;
    return `${value} ${line}`;
}

function matchSmallTalkIntent(question) {
    const text = normalizeQuestionText(question).trim();
    if (!text) return null;

    if (/^(h+i+|he+l+o+|hey+|yo+|hola+|gay|namaste|good\s*(morning|afternoon|evening)|howdy)\b/.test(text)) {
        return 'greeting';
    }

    if (/\bhow are you\b|\bhow r u\b|\bhowre you\b|\bhow do you do\b/.test(text)) {
        return 'wellbeing';
    }

    if (/^(thanks|thank you|thx|ty|thanku|thank u)\b/.test(text)) {
        return 'thanks';
    }

    if (/\bwho are you\b|\bwhat can you do\b|\bhelp me\b|\bwhat do you do\b|\btell me about yourself\b/.test(text)) {
        return 'capabilities';
    }

    if (/^(bye|goodbye|see you|take care|good night|gn)\b/.test(text)) {
        return 'goodbye';
    }

    return null;
}

function buildSmallTalkResponse(intent) {
    if (intent === 'wellbeing') {
        return {
            answer: pickRandom([
                'I am doing great, thank you for asking! I am here and ready to help whenever you need. What would you like to know — something about glucose levels, food choices, medicines, or anything else related to diabetes?',
                'I am well, thanks! More importantly, how are YOU doing? If you have any questions about your blood sugar, diet, medicines, or anything diabetes-related, I am here to help.',
                'Doing well, thank you! I am always ready to help with diabetes questions. What is on your mind today — sugar levels, food choices, medicines, or something else?',
            ]),
            confidence: 0.98,
            source: {
                id: 'smalltalk-wellbeing',
                title: 'Small Talk: Wellbeing',
                tags: ['smalltalk', 'greeting'],
            },
            disclaimer: 'Educational support only. Do not start, stop, or replace medicines without clinician guidance.',
        };
    }

    if (intent === 'thanks') {
        return {
            answer: pickRandom([
                'You are welcome! I am here whenever you need help with diabetes questions. Take care!',
                'Happy to help! If you have more questions later, do not hesitate to ask.',
                'Glad I could help! Remember, small daily steps make a big difference in diabetes management. I am here anytime you need me.',
            ]),
            confidence: 0.99,
            source: {
                id: 'smalltalk-thanks',
                title: 'Small Talk: Thanks',
                tags: ['smalltalk'],
            },
            disclaimer: 'Educational support only. Do not start, stop, or replace medicines without clinician guidance.',
        };
    }

    if (intent === 'capabilities') {
        return {
            answer: 'I am your diabetes support assistant, and here is what I can help with: understanding blood sugar readings and what they mean, food and diet guidance (what to eat, what to avoid, portion sizes), explaining medicines and what to do about side effects, recognizing symptoms and when to see a doctor, exercise tips for better sugar control, and general diabetes education. Just ask me anything in simple language, and I will guide you step by step!',
            confidence: 0.97,
            source: {
                id: 'smalltalk-capabilities',
                title: 'Small Talk: Capabilities',
                tags: ['smalltalk', 'help'],
            },
            disclaimer: 'Educational support only. Do not start, stop, or replace medicines without clinician guidance.',
        };
    }

    if (intent === 'goodbye') {
        return {
            answer: pickRandom([
                'Take care! Remember to stay hydrated, take your medicines on time, and keep moving. I am here whenever you need me!',
                'Goodbye! Wishing you good health. If you have questions later, I am always here to help.',
                'See you later! Keep up the great work managing your health. Do not hesitate to come back anytime.',
            ]),
            confidence: 0.98,
            source: {
                id: 'smalltalk-goodbye',
                title: 'Small Talk: Goodbye',
                tags: ['smalltalk'],
            },
            disclaimer: 'Educational support only. Do not start, stop, or replace medicines without clinician guidance.',
        };
    }

    // greeting (default)
    return {
        answer: pickRandom([
            'Hi there! I am your diabetes support assistant. Feel free to ask me anything — whether it is about Type 1 vs Type 2, what to do for low or high sugar, food choices, medicine concerns, or when to see your doctor. I am here to help you understand things step by step.',
            'Hello! Welcome to GlucoCare. I can help with blood sugar questions, food guidance, medicine information, and much more. What would you like to know today?',
            'Hey! Good to see you. I am here to help with all your diabetes questions — just ask in plain language and I will do my best to guide you. What is on your mind?',
        ]),
        confidence: 0.98,
        source: {
            id: 'smalltalk-greeting',
            title: 'Small Talk: Greeting',
            tags: ['smalltalk', 'greeting'],
        },
        disclaimer: 'Educational support only. Do not start, stop, or replace medicines without clinician guidance.',
    };
}

function buildRephraseSuggestions(question) {
    const q = normalizeQuestionText(question);
    if (/\b(type\s*1|type\s*2|difference)\b/.test(q)) {
        return [
            'What is the difference between Type 1 and Type 2 diabetes?',
            'Can Type 2 diabetes become insulin-dependent over time?',
            'What are early warning signs of Type 1 diabetes?',
        ];
    }

    if (/\b(low|hypo|hypoglycemia|shaky|sweat|dizzy)\b/.test(q)) {
        return [
            'What should I do immediately for low blood sugar at home?',
            'How many grams of sugar should I take during hypoglycemia?',
            'When should I go to emergency care for low sugar?',
        ];
    }

    if (/\b(food|diet|meal|eat|avoid|carb|rice|sweet)\b/.test(q)) {
        return [
            'What is a simple diabetes meal plate for lunch and dinner?',
            'Which foods should I avoid if my sugar stays high after meals?',
            'How many carbs per meal are usually safe for Type 2 diabetes?',
        ];
    }

    if (/\b(allergy|allergic|medicine|drug|tablet|metformin|insulin|alternative)\b/.test(q)) {
        return [
            'If I cannot tolerate metformin, what alternatives are commonly considered?',
            'What information should I share with my doctor about medicine side effects?',
            'How do doctors choose diabetes medicine when a patient has allergies?',
        ];
    }

    return [
        'What is the difference between Type 1 and Type 2 diabetes?',
        'What are the first steps for low blood sugar at home?',
        'If I have medicine intolerance, what alternatives can my doctor review?',
    ];
}

function buildContextualSuggestions(normalizedQ, topic) {
    const numMatch = normalizedQ.match(/\b(\d{2,3})\b/);
    const num = numMatch ? parseInt(numMatch[1], 10) : null;

    // Sugar-number-specific suggestions
    if (num && num >= 200) {
        return [
            'What foods should I eat when blood sugar is high?',
            'Why does my blood sugar keep going high?',
            'When should I go to the hospital for high sugar?',
        ];
    }
    if (num && num <= 70) {
        return [
            'How to prevent low blood sugar from happening again?',
            'What snacks should I carry to prevent hypoglycemia?',
            'Can my medicine dose be causing low sugar?',
        ];
    }
    if (num && num >= 100 && num <= 140) {
        return [
            'What is a normal fasting blood sugar level?',
            'How can I prevent prediabetes from becoming diabetes?',
            'What lifestyle changes help the most for borderline sugar?',
        ];
    }

    // Food-specific follow-ups
    if (topic === 'food') {
        if (/rice|roti|bread|grain|carb/.test(normalizedQ)) {
            return [
                'How much rice can I eat per meal with diabetes?',
                'Are millets better than rice for blood sugar?',
                'What should a diabetes-friendly dinner plate look like?',
            ];
        }
        if (/fruit|mango|banana|apple/.test(normalizedQ)) {
            return [
                'Which fruits are best for people with diabetes?',
                'How much fruit can I eat in a day?',
                'Is it better to eat fruit with meals or as a snack?',
            ];
        }
        if (/sweet|gulab|jalebi|cake|chocolate/.test(normalizedQ)) {
            return [
                'What are sugar-free dessert options for diabetes?',
                'How to manage sugar during festivals and celebrations?',
                'Can I use artificial sweeteners safely?',
            ];
        }
        if (/tea|coffee|drink|juice|soda/.test(normalizedQ)) {
            return [
                'What drinks are safe for people with diabetes?',
                'How many cups of tea or coffee can I have per day?',
                'Is coconut water good for diabetes?',
            ];
        }
        return [
            'What is a good diabetes-friendly breakfast?',
            'Which snacks are safe between meals?',
            'How do I read food labels to check for hidden sugar?',
        ];
    }

    // Medicine-specific follow-ups
    if (topic === 'medicine') {
        return [
            'What should I do if I miss a dose of my diabetes medicine?',
            'Can I take my medicine after food instead of before?',
            'How long does it take for diabetes medicine to start working?',
        ];
    }

    // Exercise-specific follow-ups
    if (topic === 'exercise') {
        return [
            'What is the best time to exercise for blood sugar control?',
            'Should I eat before or after exercising with diabetes?',
            'What should I do if my sugar drops during exercise?',
        ];
    }

    // Glucose/general follow-ups
    if (topic === 'glucose') {
        if (/dawn|morning.*high|fasting.*high/.test(normalizedQ)) {
            return [
                'What is the difference between the dawn phenomenon and Somogyi effect?',
                'What kind of bedtime snack helps prevent morning sugar spikes?',
                'Should I adjust my medication timing for morning highs?',
            ];
        }
        if (/numb|tingl|neuropath|nerve/.test(normalizedQ)) {
            return [
                'Can diabetic neuropathy be reversed?',
                'What medications help with diabetic nerve pain?',
                'How often should I get foot sensation checked?',
            ];
        }
        if (/hair.*loss|hair.*fall/.test(normalizedQ)) {
            return [
                'Should I get my thyroid checked for hair loss?',
                'Does metformin cause hair loss through B12 deficiency?',
                'What vitamins help with diabetes-related hair loss?',
            ];
        }
        if (/cramp|leg.*pain/.test(normalizedQ)) {
            return [
                'What electrolytes help with diabetes leg cramps?',
                'How do I know if leg pain is from neuropathy or poor circulation?',
                'When should I see a doctor for leg cramps?',
            ];
        }
        if (/constipat|gastroparesis|bloat/.test(normalizedQ)) {
            return [
                'What foods help with diabetic constipation?',
                'How is gastroparesis diagnosed?',
                'Can gastroparesis affect my medication absorption?',
            ];
        }
        if (/night.*sweat|wake.*sweat/.test(normalizedQ)) {
            return [
                'How do I check if night sweats are from low blood sugar?',
                'What is nocturnal hypoglycemia and how do I prevent it?',
                'Should I test my blood sugar in the middle of the night?',
            ];
        }
        if (/acanthosis|dark.*patch|dark.*skin/.test(normalizedQ)) {
            return [
                'Can acanthosis nigricans go away with diabetes control?',
                'Should dark neck patches be a reason to screen for diabetes?',
                'What treatments help lighten acanthosis patches?',
            ];
        }
        return [
            'What are normal blood sugar levels before and after meals?',
            'How often should I check my blood sugar?',
            'What is HbA1c and what should my target be?',
        ];
    }

    // New topic-specific follow-ups for general category
    if (topic === 'general') {
        if (/dental|teeth|gum|oral/.test(normalizedQ)) {
            return [
                'How often should a diabetic visit the dentist?',
                'Can gum disease make blood sugar harder to control?',
                'What are signs of diabetic gum disease?',
            ];
        }
        if (/liver|fatty liver|nafld/.test(normalizedQ)) {
            return [
                'How does fatty liver affect blood sugar?',
                'What diet changes help reverse fatty liver?',
                'Should I get liver function tests regularly?',
            ];
        }
        if (/sex|erect|libido|impotence/.test(normalizedQ)) {
            return [
                'Can blood sugar control improve erectile dysfunction?',
                'What treatments are available for diabetes-related sexual problems?',
                'Is it safe to take ED medication with diabetes medicines?',
            ];
        }
        if (/driv/.test(normalizedQ)) {
            return [
                'What blood sugar level is safe for driving?',
                'What should I keep in my car as a diabetic?',
                'What do I do if I feel a hypo while driving?',
            ];
        }
        if (/child|kid|teen|school|pediatric/.test(normalizedQ)) {
            return [
                'How do I manage my child\'s diabetes at school?',
                'What are the first signs of diabetes in children?',
                'Are insulin pumps suitable for children?',
            ];
        }
        if (/vitamin|b12|supplement|deficien/.test(normalizedQ)) {
            return [
                'How often should I check B12 while on metformin?',
                'Do I need vitamin D supplements with diabetes?',
                'What blood tests check for vitamin deficiencies?',
            ];
        }
        if (/fiber|fibre|isabgol/.test(normalizedQ)) {
            return [
                'How much fiber should a diabetic eat per day?',
                'What are the best high-fiber Indian foods?',
                'Can isabgol really reduce post-meal sugar spikes?',
            ];
        }
        if (/surgery|operat/.test(normalizedQ)) {
            return [
                'Which diabetes medicines should I stop before surgery?',
                'How does diabetes affect wound healing after surgery?',
                'What HbA1c is needed for safe elective surgery?',
            ];
        }
        if (/insurance|mediclaim/.test(normalizedQ)) {
            return [
                'Which insurance companies cover diabetes in India?',
                'What is the waiting period for pre-existing diabetes coverage?',
                'Does health insurance cover insulin pump costs?',
            ];
        }
        if (/period|menstr|pcos|menopause/.test(normalizedQ)) {
            return [
                'Why does blood sugar go up before my period?',
                'How does PCOS relate to diabetes?',
                'Does menopause affect blood sugar control?',
            ];
        }
        if (/c.peptide/.test(normalizedQ)) {
            return [
                'What does a low C-peptide mean for my diabetes type?',
                'How is C-peptide different from an insulin test?',
                'When should I ask my doctor for a C-peptide test?',
            ];
        }
        if (/altitude|trek|mountain|hiking/.test(normalizedQ)) {
            return [
                'How does altitude affect blood sugar levels?',
                'What extra supplies should I carry when trekking?',
                'Is it safe to use an insulin pump at high altitude?',
            ];
        }
        if (/probiotic|gut|microbiome|ferment/.test(normalizedQ)) {
            return [
                'Which probiotics are best for diabetes management?',
                'Is homemade curd a good probiotic for diabetics?',
                'Can improving gut health reduce insulin resistance?',
            ];
        }
    }

    return [
        'What is the difference between Type 1 and Type 2 diabetes?',
        'What are the first steps for low blood sugar at home?',
        'What foods should I avoid with diabetes?',
    ];
}

function buildProfileContextLine(profile, allergies, normalizedQuestion) {
    const conditions = Array.isArray(profile && profile.chronicConditions)
        ? profile.chronicConditions.map((c) => String(c || '').trim()).filter(Boolean)
        : [];
    const knownAllergies = Array.isArray(allergies)
        ? allergies.map((a) => String(a || '').trim()).filter(Boolean)
        : [];

    if (knownAllergies.length > 0 && /allergy|medicine|medication|alternative|side effect/.test(normalizedQuestion)) {
        return `I considered your listed allergy history (${knownAllergies.slice(0, 2).join(', ')}) while generating this guidance.`;
    }

    if (conditions.length > 0 && /diet|food|meal|exercise|activity|sugar|glucose|hba1c/.test(normalizedQuestion)) {
        return `I also considered your chronic condition context (${conditions.slice(0, 2).join(', ')}) to keep this advice practical.`;
    }

    return '';
}

const RESPONSE_OPENERS = [
    'Let me think through this with you.',
    'Good question — here is what I can share.',
    'That is an important thing to understand.',
    'Let me break this down for you.',
    'Here is how I would think about this.',
    'I am glad you asked about this.',
    'This comes up often, so let me explain clearly.',
    'Let me walk you through this step by step.',
    'Great that you are asking — knowledge is power in diabetes management.',
    'Here is what the evidence tells us about this.',
];

const TRANSITION_PHRASES = [
    'To put it simply,',
    'Here is the key takeaway:',
    'What this really comes down to is:',
    'In practical terms,',
    'The important part to remember is:',
    'What matters most here is:',
    'The bottom line is:',
    'Here is why this matters for you:',
    'To make this actionable,',
    'Looking at the bigger picture,',
];

const NEXT_STEP_INTROS = [
    'As a practical next step,',
    'Here is what I would suggest doing:',
    'Going forward,',
    'To act on this,',
    'What you can do now:',
    'My suggestion would be:',
    'A good next move:',
    'To put this into practice,',
    'The best thing you can do right now:',
    'Here is a simple action plan:',
];

function formatHumanResponse(parts) {
    const lines = [];
    const opener = pickRandom(RESPONSE_OPENERS);
    const transition = pickRandom(TRANSITION_PHRASES);
    const nextIntro = pickRandom(NEXT_STEP_INTROS);

    lines.push(opener);
    if (parts.quick) lines.push(parts.quick);
    if (parts.meaning) lines.push(`${transition} ${parts.meaning}`);
    if (parts.nextSteps) lines.push(`${nextIntro} ${parts.nextSteps}`);
    if (parts.contextLine) lines.push(parts.contextLine);
    if (parts.includeDoctorLine !== false) lines.push('If in doubt, your doctor is the best person to guide you.');
    return lines.join(' ');
}

function isVagueQuestion(normalizedQuestion) {
    const tokens = tokenize(normalizedQuestion);
    const hasSpecificIntent = /low|high|hypoglycemia|hyperglycemia|hba1c|type\s*1|type\s*2|metformin|insulin|allergy|diet|food|meal|exercise|kidney|eye|foot|pregnancy|stress|sleep|weight|smoking|alcohol|fasting|cgm|neuropathy|thyroid|infection|cure|reverse|prevent|symptom|normal|range|level|walk|yoga|obesity|obese|hereditary|genetic|age|complication|prediabetes|controlled|uncontrolled|heart|vision|affect|body|risk|cause|diagnos|early sign|warning sign|snack|numbness|tingling|pancreas|glucagon|resistance|mody|monogenic|gestational|ogtt|glucose tolerance|pump|injection|pharmacokinetic|dawn phenomenon|hypoglycemic|glycemic index|carbohydrate|complex carb|simple sugar|intermittent|ketogenic|keto|hydration|cortisol|burnout|distress|anxiety|coping|journal|adherence|caregiver|peer support|cgm|closed.loop|artificial pancreas|predictive|algorithm|machine learning|metric|tracking|barrier|dangerous|sugar.free|screen|vegetable|potato|carb.*per day|dental|teeth|gum|periodontal|liver|fatty liver|nafld|sexual|erect|libido|impotence|uti|urinary|bladder|season|weather|summer|winter|monsoon|driving|driv|workplace|office|job|child|kid|teen|school|pediatric|app|technology|wearable|smartwatch|postpartum|after pregnanc|menstrual|period|pcos|menopause|surgery|operat|anesthesia|floater|retinopath|constipat|gastroparesis|honeymoon|remission|reactive hypoglycemia|leg.*cramp|night.*sweat|c.peptide|acanthosis|dark.*patch|hair.*loss|brain|memory|dementia|fiber|fibre|isabgol|vitamin|b12|supplement|fructose|probiotic|microbiome|pain.*killer|painkiller|nsaid|altitude|trek|mountain|insurance|mediclaim|tattoo|pierc/.test(normalizedQuestion);
    const hasFoodItem = /juice|tea|coffee|rice|roti|bread|fruit|sweet|gulab|jalebi|samosa|egg|milk|curd|dal|paneer|chicken|fish|oats|idli|dosa|chapati|biryani|poha|upma|breakfast|lunch|dinner|snack|mango|banana|apple|watermelon|grapes|dates|chocolate|cake|ghee|butter|yogurt|coconut|millet|bajra|ragi|water|drink|beverage|coke|cola|soda|pepsi|sprite|beer|wine|alcohol|lassi|smoothie|ice cream|jaggery|lemon|vegetable|potato|fructose|fiber|fibre|isabgol|probiotic|ferment/.test(normalizedQuestion);
    const hasNumber = /\b\d{2,3}\b/.test(normalizedQuestion);
    const hasSymptom = /tired|fatigue|thirst|urination|blur|vision|numb|tingling|wound|heal|itch|skin|shak|sweat|dizzy|pain|headache|nausea|vomit|hungry|hunger|weight loss|hair loss|cramp|floater|constipat|dark patch|night sweat|brain fog/.test(normalizedQuestion);
    const hasMedicineName = /metformin|glimepiride|gliclazide|sitagliptin|dapagliflozin|empagliflozin|insulin|lantus|novorapid|statin|aspirin|glucagon|paracetamol|ibuprofen|diclofenac|pregabalin|gabapentin|pioglitazone/.test(normalizedQuestion);
    const hasGeneralAwareness = /what is diabetes|how does diabetes|how is diabetes|hereditary|genetic|at what age|what happens if|can.*cause|does.*affect|does.*increase|is.*helpful|is.*good for|when should.*visit|when should.*doctor|can.*controlled|complications|early signs|first signs|warning signs|signs of diabetes|symptoms of diabetes|how does the pancreas|role.*insulin|what is gestational|what is prediabetes|insulin resistance|what is monogenic|what is mody|glucagon|oral glucose|fasting plasma|how do.*cgm|insulin pump|closed.loop|what.*metric|pharmacokinetic|dawn phenomenon|how does metformin|hypoglycemic episode|predictive algorithm|complex carb|glycemic index|intermittent fasting|ketogenic|hydration.*blood sugar|cortisol.*stress|coping strateg|psychological barrier|journaling|diabetes burnout|diabetes distress|peer support|caregiver|c.peptide|honeymoon phase|reactive hypoglycemia|acanthosis nigricans|somogyi effect|fatty liver|nafld|gastroparesis|diabetic retinopathy|diabetic neuropathy/.test(normalizedQuestion);
    const hasBloodSugarScience = /calculat|measur|percentage|concentrat|how much sugar|how.*sugar.*work|sugar.*blood.*percent|blood.*sugar.*percent|how.*check.*sugar|how.*test.*sugar|how.*measure.*sugar|check.*blood sugar|test.*blood sugar|measure.*blood sugar/.test(normalizedQuestion);
    if (hasNumber) return false;
    if (hasFoodItem) return false;
    if (hasSymptom) return false;
    if (hasMedicineName) return false;
    if (hasGeneralAwareness) return false;
    if (hasBloodSugarScience) return false;
    if (tokens.length <= 1 && !hasSpecificIntent) return true;
    if (hasSpecificIntent && tokens.length >= 2) return false;
    if (tokens.length <= 3 && /diabetes|sugar|medicine|diet|help|problem|issue/.test(normalizedQuestion)) return true;
    if (/^(tell me|explain|help|advice)\b/.test(normalizedQuestion) && tokens.length <= 5) return true;
    if (/^what should i do\b/.test(normalizedQuestion) && !hasSpecificIntent && tokens.length <= 6) return true;
    return false;
}

function buildClarifyingResponse(question) {
    const normalized = normalizeQuestionText(question);

    let followUp = 'Could you tell me whether your question is about low sugar, high sugar, food plan, medicines, or lab reports?';
    let suggestions = buildRephraseSuggestions(question);

    if (/diet|food|meal|eat|carb/.test(normalized)) {
        followUp = 'To guide you better, are you looking for meal planning ideas, foods to avoid, or portion guidance for a specific food?';
        suggestions = [
            'What is a good diabetes-friendly breakfast?',
            'Which foods should I avoid if my sugar stays high?',
            'How much rice or roti can I eat per meal?',
        ];
    } else if (/medicine|medication|drug|tablet|insulin|allergy/.test(normalized)) {
        followUp = 'To answer safely, are you asking about side effects, when to take your medicine, allergy alternatives, or whether to continue a medication?';
        suggestions = [
            'What should I do if I miss a dose of my diabetes medicine?',
            'What are alternatives if I am allergic to metformin?',
            'Should I take my medicine before or after food?',
        ];
    } else if (/sugar|glucose|hypoglycemia|hyperglycemia|low|high/.test(normalized)) {
        followUp = 'Are you dealing with a sugar reading right now, or asking about long-term management and targets?';
        suggestions = [
            'My blood sugar is [your number] — what should I do?',
            'What are normal blood sugar levels before and after meals?',
            'Why does my fasting sugar keep going high?',
        ];
    } else if (/exercise|walk|activity|gym|yoga/.test(normalized)) {
        followUp = 'Are you asking about the best type of exercise, when to exercise, or how exercise affects your sugar?';
        suggestions = [
            'When is the best time to exercise for blood sugar?',
            'What should I do if my sugar drops during exercise?',
            'How much exercise should I do per week?',
        ];
    }

    return {
        answer: formatHumanResponse({
            quick: 'I want to give you the most accurate answer, but your question is still broad.',
            meaning: followUp,
            nextSteps: 'Reply with one specific concern and, if possible, your latest glucose value and symptoms.',
        }),
        confidence: 0.56,
        suggestions,
        source: {
            id: 'clarify-question-first',
            title: 'Clarifying Question Guidance',
            tags: ['clarification', 'conversation'],
        },
        disclaimer: 'Educational support only. Do not start, stop, or replace medicines without clinician guidance.',
    };
}

function tokenize(text) {
    function normalizeToken(raw) {
        let token = String(raw || '').toLowerCase().trim();
        if (!token) return '';

        // Collapse repeated letters in casual typing: "helloooo" -> "helloo".
        token = token.replace(/([a-z])\1{2,}/g, '$1$1');

        if (TERM_CANONICAL[token]) return TERM_CANONICAL[token];
        return token;
    }

    return normalizeQuestionText(text)
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .map((w) => normalizeToken(w))
        .filter((w) => w && !STOPWORDS.has(w));
}

function termFrequency(tokens) {
    const tf = Object.create(null);
    if (!tokens.length) return tf;
    for (const token of tokens) {
        tf[token] = (tf[token] || 0) + 1;
    }
    const count = tokens.length;
    for (const token of Object.keys(tf)) {
        tf[token] = tf[token] / count;
    }
    return tf;
}

function buildModel(knowledgeBase) {
    const docs = knowledgeBase.map((item) => {
        const source = [item.title, item.question, item.answer, ...(Array.isArray(item.tags) ? item.tags : [])].join(' ');
        const tokens = tokenize(source);
        return {
            id: item.id,
            title: item.title,
            answer: item.answer,
            tags: item.tags || [],
            tf: termFrequency(tokens),
        };
    });

    const df = Object.create(null);
    for (const doc of docs) {
        const uniqueTerms = new Set(Object.keys(doc.tf));
        for (const term of uniqueTerms) {
            df[term] = (df[term] || 0) + 1;
        }
    }

    const totalDocs = Math.max(1, docs.length);
    const idf = Object.create(null);
    for (const term of Object.keys(df)) {
        idf[term] = Math.log((1 + totalDocs) / (1 + df[term])) + 1;
    }

    return {
        version: 1,
        trainedAt: new Date().toISOString(),
        totalDocs,
        idf,
        docs,
    };
}

function scoreQuery(model, query) {
    const qTokens = tokenize(query);
    const qTf = termFrequency(qTokens);
    const queryTerms = Object.keys(qTf);
    const normalizedQ = normalizeQuestionText(query);

    // Check if query mentions a specific location (state/city)
    const mentionsLocation = /\b(mumbai|delhi|pune|chennai|kolkata|bengaluru|bangalore|hyderabad|jaipur|lucknow|patna|ahmedabad|goa|kerala|tamil|karnataka|maharashtra|rajasthan|punjab|bihar|gujarat|bengal|assam|odisha|mizoram|manipur|nagaland|sikkim|tripura|meghalaya|andhra|telangana|kashmir|uttarakhand|himachal|chhattisgarh|jharkhand|haryana|north india|south india|east india|west india)\b/.test(normalizedQ);

    // Detect primary intent for scoring boost
    const intentBoostTags = [];
    if (/food|eat|diet|meal|sweet|fruit|rice|snack|drink|gulab|jalebi/.test(normalizedQ)) intentBoostTags.push('diet', 'food', 'sugar', 'foods to avoid', 'food swap');
    if (/sweet|gulab|jalebi|rasgulla|laddoo|mithai/.test(normalizedQ)) intentBoostTags.push('sweets');
    if (/high.*(sugar|glucose)|sugar.*(high|240|300|400|450|500|200|spike)|240|300|400|450|500/.test(normalizedQ)) intentBoostTags.push('high sugar', 'hyperglycemia');
    if (/low.*(sugar|glucose)|sugar.*(low|drop)|hypo/.test(normalizedQ)) intentBoostTags.push('hypoglycemia', 'low glucose');
    if (/exercise|walk|gym|yoga|activity/.test(normalizedQ)) intentBoostTags.push('exercise', 'walking');
    if (/allergy|allergic|intoleran|alternative|cannot use/.test(normalizedQ)) intentBoostTags.push('allergy', 'alternative');

    let best = null;
    let second = null;

    for (const doc of model.docs || []) {
        let score = 0;
        let matchedTerms = 0;
        for (const term of queryTerms) {
            const queryWeight = qTf[term] * (model.idf[term] || 0);
            const docWeight = (doc.tf[term] || 0) * (model.idf[term] || 0);
            if (docWeight > 0) matchedTerms += 1;
            score += queryWeight * docWeight;
        }

        const coverage = queryTerms.length ? matchedTerms / queryTerms.length : 0;

        // Penalize documents that match few of the query terms, even if one term scores very high.
        // This prevents single-term dominance from outscoring multi-term relevance.
        score = score * (0.35 + 0.65 * coverage);

        // Reward direct lexical overlap to improve confidence for specific, on-topic asks.
        score += coverage * 0.02;

        // Intent-based boost: if the document tags overlap with detected intent, boost score
        if (intentBoostTags.length > 0 && Array.isArray(doc.tags)) {
            const tagStr = doc.tags.join(' ').toLowerCase();
            let intentHits = 0;
            for (const tag of intentBoostTags) {
                if (tagStr.includes(tag)) intentHits += 1;
            }
            if (intentHits > 0) {
                score += intentHits * 0.015;
            }
        }

        // Penalize geo-specific entries when the question doesn't mention a location
        const isGeoDoc = doc.id && (doc.id.startsWith('india-state-') || doc.id.startsWith('india-city-'));
        if (isGeoDoc && !mentionsLocation) {
            score *= 0.55;
        }

        if (!best || score > best.score) {
            second = best;
            best = { doc, score, matchedTerms, totalTerms: queryTerms.length, coverage };
        } else if (!second || score > second.score) {
            second = { doc, score, matchedTerms, totalTerms: queryTerms.length, coverage };
        }
    }

    return { best, second };
}

function calculateConfidence(best, second) {
    if (!best || best.score <= 0) return 0;

    const relative = best.score / ((best.score + (second ? second.score : 0)) || 1);
    const coverage = Number(best.coverage || 0);
    const absolute = Math.min(1, best.score / 0.12);

    let confidence = (relative * 0.38) + (coverage * 0.34) + (absolute * 0.28);

    if (best.totalTerms >= 2 && best.matchedTerms >= 2 && coverage >= 0.8) {
        confidence += 0.08;
    }
    if (best.totalTerms > 0 && best.matchedTerms === best.totalTerms && best.totalTerms <= 2) {
        confidence += 0.05;
    }

    return Number(Math.max(0, Math.min(0.99, confidence)).toFixed(3));
}

function extractAllergyAlternatives(query, allergies) {
    const normalized = normalizeQuestionText(query);
    const known = Array.isArray(allergies) ? allergies.map((a) => String(a || '').toLowerCase()) : [];
    const map = [
        {
            triggers: ['metformin', 'glycomet', 'cetapin'],
            alternatives: 'Potential alternatives include SGLT2 inhibitors, DPP-4 inhibitors, GLP-1 receptor agonists, sulfonylureas, or insulin, based on patient profile.',
        },
        {
            triggers: ['insulin', 'actrapid', 'mixtard', 'huminsulin', 'novorapid'],
            alternatives: 'Possible approach includes specialist review for insulin formulation switch or supervised desensitization protocols.',
        },
        {
            triggers: ['sulfa', 'sulfonamide', 'sulfonylurea'],
            alternatives: 'Consider non-sulfonylurea options such as DPP-4 inhibitors, GLP-1 receptor agonists, SGLT2 inhibitors, or insulin after clinician review.',
        },
        {
            triggers: ['sitagliptin', 'teneligliptin', 'zita', 'teneza', 'jalra'],
            alternatives: 'If DPP-4 intolerance occurs, clinicians may consider SGLT2 inhibitors, GLP-1 receptor agonists, or other classes depending on kidney function and symptom profile.',
        },
        {
            triggers: ['dapagliflozin', 'empagliflozin', 'forxiga', 'jardiance'],
            alternatives: 'If SGLT2 inhibitors are not tolerated, clinicians may consider DPP-4 inhibitors, GLP-1 receptor agonists, or insulin-based strategies based on comorbid risks.',
        },
        {
            triggers: ['liraglutide', 'semaglutide', 'victoza', 'rybelsus', 'ozempic'],
            alternatives: 'If GLP-1 therapies are not tolerated, alternatives may include SGLT2 inhibitors, DPP-4 inhibitors, or insulin depending on patient goals and clinician assessment.',
        },
        {
            triggers: ['aspirin'],
            alternatives: 'Depending on indication, alternatives may include acetaminophen or other physician-selected agents.',
        },
        {
            triggers: ['ace inhibitor', 'lisinopril', 'enalapril'],
            alternatives: 'ARB medicines are often considered when ACE inhibitors are not tolerated due to cough or related side effects.',
        },
    ];

    for (const item of map) {
        const matchedInQuery = item.triggers.some((term) => normalized.includes(term));
        const matchedInAllergy = known.some((a) => item.triggers.some((term) => a.includes(term) || term.includes(a)));
        if (matchedInQuery || matchedInAllergy) {
            return item.alternatives;
        }
    }

    return null;
}

function loadModel() {
    const model = safeJsonRead(MODEL_PATH, null);
    if (model && model.docs && model.idf) return model;

    const knowledgeBase = getKnowledgeBase();
    return buildModel(knowledgeBase);
}

function answerQuestion(question, options = {}) {
    const model = loadModel();
    const allergies = Array.isArray(options.allergies) ? options.allergies : [];
    const profile = options.profile && typeof options.profile === 'object' ? options.profile : {};
    const normalizedQuestion = normalizeQuestionText(question);

    const smallTalkIntent = matchSmallTalkIntent(question);
    if (smallTalkIntent) {
        return buildSmallTalkResponse(smallTalkIntent);
    }

    if (isVagueQuestion(normalizedQuestion)) {
        return buildClarifyingResponse(question);
    }

    const { best, second } = scoreQuery(model, question);
    const confidence = calculateConfidence(best, second);

    const allergyAdvice = extractAllergyAlternatives(question, allergies);
    const medicineContext = /allergy|allergic|alternative|intoler|reaction|cannot use|can.t use|side effect/.test(normalizedQuestion);
    const shouldAttachAllergyLine = Boolean(allergyAdvice)
        && (medicineContext || /allergy|allergic|intoler|reaction|medicine|medication|drug|tablet|insulin|metformin/.test(normalizedQuestion));
    const allergyLine = shouldAttachAllergyLine
        ? `\n\nAllergy-aware note: ${allergyAdvice}`
        : '';

    if (medicineContext && allergyAdvice) {
        const contextLine = buildProfileContextLine(profile, allergies, normalizedQuestion);
        const medPool = DYNAMIC_CONTEXT.medicine;
        return {
            answer: formatHumanResponse({
                quick: `For medicine allergy or intolerance questions, treatment alternatives should be selected by your doctor after reviewing kidney function, glucose profile, and prior reactions. ${allergyAdvice}`,
                meaning: pickRandom(medPool.meanings),
                nextSteps: 'Share your reaction details, current medicines, and latest lab reports with your doctor before any change.',
                contextLine,
            }),
            confidence: Number(Math.max(confidence, 0.8).toFixed(3)),
            source: {
                id: 'allergy-alternative-guidance',
                title: 'Medication Allergy Alternative Guidance',
                tags: ['allergy', 'alternative', 'safety'],
            },
            disclaimer: 'Educational support only. Do not start, stop, or replace medicines without clinician guidance.',
        };
    }

    const locationFoodIntent = /\b(in|for)\s+[a-z\s]+\b/.test(normalizedQuestion)
        && /\b(city|state|india|food|eat|avoid|diet|dish|dishes|meal)\b/.test(normalizedQuestion);

    if (!best || best.score <= 0) {
        if (locationFoodIntent) {
            const contextLine = buildProfileContextLine(profile, allergies, normalizedQuestion);
            const foodPool = DYNAMIC_CONTEXT.food;
            return {
                answer: formatHumanResponse({
                    quick: 'For city or state-specific diabetes food guidance, avoid local dishes that are deep-fried, sugar syrup-based, maida-heavy, or served in very large refined-carb portions.',
                    meaning: pickRandom(foodPool.meanings),
                    nextSteps: 'Share your city and one-day meal pattern so I can suggest better local swaps.',
                    contextLine,
                }),
                confidence: 0.62,
                suggestions: buildRephraseSuggestions(question),
                source: {
                    id: 'india-city-query-fallback',
                    title: 'City-Specific Query Fallback Guidance',
                    tags: ['india', 'city', 'diet'],
                },
                disclaimer: 'Educational support only. Do not start, stop, or replace medicines without clinician guidance.',
            };
        }

        return {
            answer: formatHumanResponse({
                quick: 'I could not find a strong match yet, but I still want to help.',
                meaning: 'Please ask in a more specific way, for example: Type 1 vs Type 2, low sugar first steps, food guidance, or medicine allergy alternatives.',
                nextSteps: 'Pick one of the suggestions below and I will answer in detail.',
            }),
            confidence,
            suggestions: buildRephraseSuggestions(question),
            source: null,
            disclaimer: 'Educational support only. Do not start, stop, or replace medicines without clinician guidance.',
        };
    }

    const contextLine = buildProfileContextLine(profile, allergies, normalizedQuestion);

    // --- Dynamic, question-specific response generation ---
    const topic = detectTopic(normalizedQuestion);
    const topicPool = DYNAMIC_CONTEXT[topic] || DYNAMIC_CONTEXT.general;

    // Try to synthesize a direct answer that addresses the specific question
    const directAnswer = synthesizeDirectAnswer(normalizedQuestion, best.doc.answer);

    const quickAnswer = directAnswer || best.doc.answer;
    const meaning = pickRandom(topicPool.meanings);
    const nextStep = pickRandom(topicPool.nextSteps);

    // Boost confidence when we synthesized a direct answer (these are high-quality targeted responses)
    let finalConfidence = confidence;
    if (directAnswer) {
        // Direct answers are curated and specific — they deserve higher confidence
        // Emergency answers (sugar >= 250) get the highest boost
        const numMatch = normalizedQuestion.match(/\b(\d{2,3})\b/);
        if (numMatch && parseInt(numMatch[1], 10) >= 250) {
            finalConfidence = Math.max(finalConfidence, 0.92);
        } else if (numMatch && parseInt(numMatch[1], 10) >= 180) {
            finalConfidence = Math.max(finalConfidence, 0.88);
        } else {
            finalConfidence = Math.max(finalConfidence, 0.85);
        }
    }

    // Only add KB reference if it brings substantially different AND relevant info
    let supportingNote = '';
    if (directAnswer) {
        const docTags = Array.isArray(best.doc.tags) ? best.doc.tags.join(' ').toLowerCase() : '';
        const topicRelevant = (topic === 'glucose' && /glucose|sugar|hyper|hypo|high|low|reading|hba1c/.test(docTags))
            || (topic === 'food' && /diet|food|meal|nutrition|carb/.test(docTags))
            || (topic === 'medicine' && /medicine|medication|drug|allergy|insulin|metformin/.test(docTags))
            || (topic === 'exercise' && /exercise|activity|walk|fitness/.test(docTags));

        if (topicRelevant) {
            const overlapWords = best.doc.answer.split(/\s+/).filter(w => directAnswer.toLowerCase().includes(w.toLowerCase()));
            const overlapRatio = overlapWords.length / best.doc.answer.split(/\s+/).length;
            if (overlapRatio < 0.4) {
                supportingNote = `\n\nFor reference: ${best.doc.answer}`;
            }
        }
    }

    // Build context-aware follow-up suggestions
    const suggestions = buildContextualSuggestions(normalizedQuestion, topic);

    return {
        answer: formatHumanResponse({
            quick: `${quickAnswer}${supportingNote}${allergyLine}`,
            meaning,
            nextSteps: nextStep,
            contextLine,
        }),
        confidence: Number(Math.min(0.99, finalConfidence).toFixed(3)),
        suggestions,
        source: {
            id: best.doc.id,
            title: best.doc.title,
            tags: best.doc.tags,
        },
        disclaimer: 'Educational support only. Do not start, stop, or replace medicines without clinician guidance.',
    };
}

module.exports = {
    KB_PATH,
    MODEL_PATH,
    buildModel,
    getKnowledgeBase,
    answerQuestion,
};
