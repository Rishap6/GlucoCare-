const STATE_UT_DATA = [
    { name: 'Andhra Pradesh', capital: 'Amaravati', avoid: ['pootharekulu', 'ariselu', 'double ka meetha'], caution: ['white rice excess', 'deep-fried snacks'], better: ['millet upma', 'dal with vegetables', 'grilled fish'] },
    { name: 'Arunachal Pradesh', capital: 'Itanagar', avoid: ['sweet tea excess', 'fried snacks'], caution: ['refined flour foods'], better: ['boiled vegetables', 'lean proteins', 'portion-controlled rice'] },
    { name: 'Assam', capital: 'Dispur', avoid: ['pitha with added sugar', 'sweet tea frequent use'], caution: ['fried snacks'], better: ['fish curry', 'dal', 'non-starchy vegetables'] },
    { name: 'Bihar', capital: 'Patna', avoid: ['khaja', 'thekua', 'balushahi'], caution: ['refined flour sweets'], better: ['sattu-based meals', 'dal', 'mixed vegetables'] },
    { name: 'Chhattisgarh', capital: 'Raipur', avoid: ['jalebi', 'sweetened snacks'], caution: ['high-oil farsan'], better: ['chana', 'green vegetables', 'controlled grain portions'] },
    { name: 'Goa', capital: 'Panaji', avoid: ['bebinca', 'dodhol', 'sweet desserts'], caution: ['fried seafood preparations'], better: ['grilled fish', 'vegetable curries', 'salad'] },
    { name: 'Gujarat', capital: 'Gandhinagar', avoid: ['mohanthal', 'basundi', 'shrikhand'], caution: ['farsan in excess', 'sweet dal styles'], better: ['undhiyu with less oil', 'sprouts', 'portion-controlled roti'] },
    { name: 'Haryana', capital: 'Chandigarh', avoid: ['ghee-heavy sweets', 'sweet lassi'], caution: ['paratha excess'], better: ['curd unsweetened', 'dal', 'vegetable-rich meals'] },
    { name: 'Himachal Pradesh', capital: 'Shimla', avoid: ['meetha bhat', 'sweet halwa'], caution: ['deep-fried festive foods'], better: ['rajma', 'vegetables', 'controlled rice portions'] },
    { name: 'Jharkhand', capital: 'Ranchi', avoid: ['sweet pitha', 'fried snacks'], caution: ['high refined carbs'], better: ['dal', 'leafy vegetables', 'lean proteins'] },
    { name: 'Karnataka', capital: 'Bengaluru', avoid: ['mysore pak', 'obbattu', 'kesari bath'], caution: ['large rice portions'], better: ['ragi mudde', 'sambar', 'vegetable sides'] },
    { name: 'Kerala', capital: 'Thiruvananthapuram', avoid: ['payasam', 'unniyappam', 'banana chips excess'], caution: ['coconut-rich fried items in excess'], better: ['fish curry', 'vegetable thoran', 'controlled appam portions'] },
    { name: 'Madhya Pradesh', capital: 'Bhopal', avoid: ['mawa bati', 'jalebi', 'shahi desserts'], caution: ['fried namkeen'], better: ['dal bafla with less ghee', 'salad', 'lentils'] },
    { name: 'Maharashtra', capital: 'Mumbai', avoid: ['modak sweets', 'puran poli', 'shrikhand'], caution: ['vada pav frequent use'], better: ['bhakri with vegetables', 'sprouts usal', 'protein sides'] },
    { name: 'Manipur', capital: 'Imphal', avoid: ['sweetened tea and desserts'], caution: ['fried snacks'], better: ['boiled greens', 'fish', 'portion-controlled grains'] },
    { name: 'Meghalaya', capital: 'Shillong', avoid: ['sweet baked desserts'], caution: ['fried meats'], better: ['steamed dishes', 'vegetables', 'lean proteins'] },
    { name: 'Mizoram', capital: 'Aizawl', avoid: ['sweetened packaged foods'], caution: ['fried snacks'], better: ['boiled/steamed foods', 'leafy vegetables', 'lean meat'] },
    { name: 'Nagaland', capital: 'Kohima', avoid: ['sweet desserts', 'sugary beverages'], caution: ['high-fat smoked meats in excess'], better: ['boiled vegetables', 'lean proteins', 'portion-controlled carbs'] },
    { name: 'Odisha', capital: 'Bhubaneswar', avoid: ['chhena poda', 'rasagola', 'chhena gaja'], caution: ['sweet-heavy festival foods'], better: ['dalma', 'vegetable curries', 'balanced meals'] },
    { name: 'Punjab', capital: 'Chandigarh', avoid: ['jalebi', 'pinni', 'rabri'], caution: ['butter/ghee-heavy parathas'], better: ['tandoori proteins', 'salad', 'dal with controlled roti'] },
    { name: 'Rajasthan', capital: 'Jaipur', avoid: ['ghevar', 'imarti', 'mawa kachori'], caution: ['fried kachori and snacks'], better: ['bajra roti', 'ker sangri', 'protein-rich dals'] },
    { name: 'Sikkim', capital: 'Gangtok', avoid: ['sweet bakery items'], caution: ['fried momos and snacks'], better: ['steamed momos with vegetable filling', 'soups', 'lean proteins'] },
    { name: 'Tamil Nadu', capital: 'Chennai', avoid: ['sakkarai pongal', 'jangiri', 'sweet kesari'], caution: ['large polished rice servings'], better: ['ragi dishes', 'idli with sambar and protein', 'vegetable poriyal'] },
    { name: 'Telangana', capital: 'Hyderabad', avoid: ['double ka meetha', 'qubani ka meetha', 'sweet desserts'], caution: ['biryani over-portioning'], better: ['grilled kebabs', 'dal', 'salad plus controlled carbs'] },
    { name: 'Tripura', capital: 'Agartala', avoid: ['sweet snacks and desserts'], caution: ['fried snacks'], better: ['fish and vegetable preparations', 'portion-controlled grains'] },
    { name: 'Uttar Pradesh', capital: 'Lucknow', avoid: ['petha', 'rabri', 'gulab jamun'], caution: ['fried kachori and samosa'], better: ['dal', 'grilled proteins', 'whole wheat roti in portions'] },
    { name: 'Uttarakhand', capital: 'Dehradun', avoid: ['bal mithai', 'sweet halwa'], caution: ['fried festive foods'], better: ['mandua (ragi) options', 'dal', 'vegetable dishes'] },
    { name: 'West Bengal', capital: 'Kolkata', avoid: ['rosogolla', 'mishti doi', 'sandesh'], caution: ['deep-fried snacks with tea'], better: ['fish curry with vegetables', 'controlled rice portions', 'salad'] },
    { name: 'Andaman and Nicobar Islands', capital: 'Port Blair', avoid: ['sweet desserts', 'sugary drinks'], caution: ['deep-fried seafood'], better: ['grilled fish', 'vegetable curries', 'salad'] },
    { name: 'Chandigarh', capital: 'Chandigarh', avoid: ['sweet lassi', 'dessert excess'], caution: ['fried fast foods'], better: ['balanced home-cooked meals', 'protein plus vegetables'] },
    { name: 'Dadra and Nagar Haveli and Daman and Diu', capital: 'Daman', avoid: ['sweet pastries', 'fried snacks'], caution: ['refined flour foods'], better: ['local vegetables', 'dal', 'lean proteins'] },
    { name: 'Delhi', capital: 'New Delhi', avoid: ['jalebi', 'rabri', 'sweet beverages'], caution: ['street fried snacks'], better: ['grilled proteins', 'chana salad', 'portion-controlled roti'] },
    { name: 'Jammu and Kashmir', capital: 'Srinagar', avoid: ['phirni', 'halwa', 'sweet kahwa excess'], caution: ['refined breads in excess'], better: ['haak saag', 'lean proteins', 'balanced portions'] },
    { name: 'Ladakh', capital: 'Leh', avoid: ['sweet tea excess', 'sugary snacks'], caution: ['high refined carb foods'], better: ['vegetable soups', 'lean proteins', 'controlled grains'] },
    { name: 'Lakshadweep', capital: 'Kavaratti', avoid: ['sweet coconut desserts'], caution: ['fried snacks'], better: ['grilled fish', 'vegetable sides', 'portion-aware meals'] },
    { name: 'Puducherry', capital: 'Puducherry', avoid: ['sweet pastries and desserts'], caution: ['fried street snacks'], better: ['sambar-based meals', 'lean proteins', 'vegetable-rich plates'] },
];

const CITY_DATA = [
    { city: 'Mumbai', state: 'Maharashtra', avoid: ['vada pav frequent use', 'pav bhaji with extra butter', 'sweet falooda'] },
    { city: 'Pune', state: 'Maharashtra', avoid: ['misal with excess farsan', 'sweet bakery snacks'] },
    { city: 'Nagpur', state: 'Maharashtra', avoid: ['tarri poha with fried add-ons', 'sweet desserts'] },
    { city: 'Nashik', state: 'Maharashtra', avoid: ['fried snacks', 'sweet beverages'] },
    { city: 'Chennai', state: 'Tamil Nadu', avoid: ['sakkarai pongal', 'sweet kesari', 'large white rice portions'] },
    { city: 'Coimbatore', state: 'Tamil Nadu', avoid: ['sweet bakery items', 'fried snacks'] },
    { city: 'Madurai', state: 'Tamil Nadu', avoid: ['jigarthanda sweet versions', 'fried parotta combinations'] },
    { city: 'Bengaluru', state: 'Karnataka', avoid: ['benne dosa excess', 'mysore pak', 'fried snacks'] },
    { city: 'Mysuru', state: 'Karnataka', avoid: ['mysore pak', 'sweet desserts'] },
    { city: 'Mangaluru', state: 'Karnataka', avoid: ['deep-fried seafood items', 'sweet dishes'] },
    { city: 'Hyderabad', state: 'Telangana', avoid: ['double ka meetha', 'qubani ka meetha', 'biryani over-portioning'] },
    { city: 'Warangal', state: 'Telangana', avoid: ['fried snacks', 'sweet beverages'] },
    { city: 'Kolkata', state: 'West Bengal', avoid: ['rosogolla', 'mishti doi', 'sweet-heavy desserts'] },
    { city: 'Howrah', state: 'West Bengal', avoid: ['fried snacks with tea', 'sweets'] },
    { city: 'Durgapur', state: 'West Bengal', avoid: ['sugary desserts', 'fried snacks'] },
    { city: 'Delhi', state: 'Delhi', avoid: ['jalebi', 'chole bhature frequent use', 'deep-fried street snacks'] },
    { city: 'New Delhi', state: 'Delhi', avoid: ['sweet drinks', 'fried fast foods'] },
    { city: 'Noida', state: 'Uttar Pradesh', avoid: ['sweetened beverages', 'fried street foods'] },
    { city: 'Ghaziabad', state: 'Uttar Pradesh', avoid: ['jalebi', 'kachori', 'samosa excess'] },
    { city: 'Lucknow', state: 'Uttar Pradesh', avoid: ['sheermal sweets', 'rabri', 'fried snacks'] },
    { city: 'Kanpur', state: 'Uttar Pradesh', avoid: ['sweet desserts', 'fried snacks'] },
    { city: 'Varanasi', state: 'Uttar Pradesh', avoid: ['malaiyyo sweets', 'jalebi and kachori combinations'] },
    { city: 'Patna', state: 'Bihar', avoid: ['khaja', 'thekua', 'sugar-rich sweets'] },
    { city: 'Gaya', state: 'Bihar', avoid: ['sweet snacks', 'fried foods'] },
    { city: 'Ranchi', state: 'Jharkhand', avoid: ['fried snacks', 'sweetened drinks'] },
    { city: 'Jamshedpur', state: 'Jharkhand', avoid: ['sweet desserts', 'fried foods'] },
    { city: 'Jaipur', state: 'Rajasthan', avoid: ['ghevar', 'mawa kachori', 'fried kachori'] },
    { city: 'Jodhpur', state: 'Rajasthan', avoid: ['mawa sweets', 'mirchi bada frequent use'] },
    { city: 'Udaipur', state: 'Rajasthan', avoid: ['sweet desserts', 'fried snacks'] },
    { city: 'Ahmedabad', state: 'Gujarat', avoid: ['mohanthal', 'shrikhand', 'farsan overuse'] },
    { city: 'Surat', state: 'Gujarat', avoid: ['sweet farsan', 'fried snacks'] },
    { city: 'Vadodara', state: 'Gujarat', avoid: ['sweets and fried farsan'] },
    { city: 'Rajkot', state: 'Gujarat', avoid: ['high-sugar sweets', 'fried snacks'] },
    { city: 'Chandigarh', state: 'Chandigarh', avoid: ['sweet lassi', 'fried fast foods'] },
    { city: 'Amritsar', state: 'Punjab', avoid: ['lassi with sugar', 'jalebi', 'fried kulcha excess'] },
    { city: 'Ludhiana', state: 'Punjab', avoid: ['ghee-heavy sweets', 'fried snacks'] },
    { city: 'Jalandhar', state: 'Punjab', avoid: ['sweet desserts', 'fried foods'] },
    { city: 'Shimla', state: 'Himachal Pradesh', avoid: ['sweet desserts', 'fried snacks'] },
    { city: 'Dehradun', state: 'Uttarakhand', avoid: ['bal mithai', 'sweet bakery items'] },
    { city: 'Haridwar', state: 'Uttarakhand', avoid: ['sweet prasad excess', 'fried snacks'] },
    { city: 'Srinagar', state: 'Jammu and Kashmir', avoid: ['phirni', 'sweet kahwa excess'] },
    { city: 'Jammu', state: 'Jammu and Kashmir', avoid: ['sweet desserts', 'fried snacks'] },
    { city: 'Leh', state: 'Ladakh', avoid: ['sweet tea excess', 'packaged sugary foods'] },
    { city: 'Bhopal', state: 'Madhya Pradesh', avoid: ['jalebi', 'mawa sweets', 'fried namkeen'] },
    { city: 'Indore', state: 'Madhya Pradesh', avoid: ['poha with sev and jalebi combo', 'fried snacks'] },
    { city: 'Gwalior', state: 'Madhya Pradesh', avoid: ['sweet desserts', 'fried snacks'] },
    { city: 'Raipur', state: 'Chhattisgarh', avoid: ['sweet dishes', 'fried snacks'] },
    { city: 'Bilaspur', state: 'Chhattisgarh', avoid: ['sweetened beverages', 'fried snacks'] },
    { city: 'Bhubaneswar', state: 'Odisha', avoid: ['rasagola excess', 'chhena sweets'] },
    { city: 'Cuttack', state: 'Odisha', avoid: ['sweet desserts', 'fried snacks'] },
    { city: 'Visakhapatnam', state: 'Andhra Pradesh', avoid: ['sweet desserts', 'fried snacks', 'white rice over-portioning'] },
    { city: 'Vijayawada', state: 'Andhra Pradesh', avoid: ['sweet dishes', 'fried snacks'] },
    { city: 'Tirupati', state: 'Andhra Pradesh', avoid: ['sweet laddoo excess', 'fried snacks'] },
    { city: 'Amaravati', state: 'Andhra Pradesh', avoid: ['sweet desserts', 'refined flour snacks'] },
    { city: 'Thiruvananthapuram', state: 'Kerala', avoid: ['payasam excess', 'banana chips', 'fried snacks'] },
    { city: 'Kochi', state: 'Kerala', avoid: ['sweet desserts', 'fried seafood'] },
    { city: 'Kozhikode', state: 'Kerala', avoid: ['sweet halwa', 'fried snacks'] },
    { city: 'Panaji', state: 'Goa', avoid: ['bebinca', 'sweet desserts', 'fried foods'] },
    { city: 'Margao', state: 'Goa', avoid: ['sugary desserts', 'fried snacks'] },
    { city: 'Guwahati', state: 'Assam', avoid: ['sweet tea frequent use', 'fried snacks'] },
    { city: 'Silchar', state: 'Assam', avoid: ['sweet desserts', 'fried snacks'] },
    { city: 'Shillong', state: 'Meghalaya', avoid: ['sweet baked foods', 'fried meats'] },
    { city: 'Aizawl', state: 'Mizoram', avoid: ['sweet packaged foods', 'fried snacks'] },
    { city: 'Kohima', state: 'Nagaland', avoid: ['sugary drinks', 'high-fat smoked meats in excess'] },
    { city: 'Dimapur', state: 'Nagaland', avoid: ['sweet desserts', 'fried snacks'] },
    { city: 'Imphal', state: 'Manipur', avoid: ['sweet beverages', 'fried snacks'] },
    { city: 'Agartala', state: 'Tripura', avoid: ['sweet desserts', 'fried snacks'] },
    { city: 'Gangtok', state: 'Sikkim', avoid: ['sweet bakery foods', 'fried momos'] },
    { city: 'Itanagar', state: 'Arunachal Pradesh', avoid: ['sweet tea excess', 'fried snacks'] },
    { city: 'Port Blair', state: 'Andaman and Nicobar Islands', avoid: ['sweetened beverages', 'fried seafood'] },
    { city: 'Daman', state: 'Dadra and Nagar Haveli and Daman and Diu', avoid: ['sweet pastries', 'fried snacks'] },
    { city: 'Silvassa', state: 'Dadra and Nagar Haveli and Daman and Diu', avoid: ['sugar-rich desserts', 'fried foods'] },
    { city: 'Kavaratti', state: 'Lakshadweep', avoid: ['sweet coconut desserts', 'fried snacks'] },
    { city: 'Puducherry', state: 'Puducherry', avoid: ['sweet pastries', 'fried snacks'] },
];

function normalizeId(value) {
    return String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function buildStateUtEntries() {
    return STATE_UT_DATA.map((item) => {
        const idBase = normalizeId(item.name);
        return {
            id: `india-state-${idBase}`,
            title: `${item.name} Diabetes Food Guidance`,
            tags: ['india', 'state specific', item.name.toLowerCase(), 'foods to avoid'],
            question: `What should a diabetic patient avoid in ${item.name}?`,
            answer: `In ${item.name}, limit or avoid ${item.avoid.join(', ')}. Also be careful with ${item.caution.join(', ')}. Better routine choices include ${item.better.join(', ')} with portion control and regular glucose monitoring.`,
        };
    });
}

function buildCityEntries() {
    return CITY_DATA.map((item) => {
        const idBase = normalizeId(item.city);
        return {
            id: `india-city-${idBase}`,
            title: `${item.city} Diabetes Food Caution`,
            tags: ['india', 'city specific', item.city.toLowerCase(), item.state.toLowerCase(), 'foods to avoid'],
            question: `What should diabetic patients avoid in ${item.city}?`,
            answer: `In ${item.city}, try to limit ${item.avoid.join(', ')}. Build meals around vegetables, protein, and controlled carb portions to reduce glucose spikes.`,
        };
    });
}

function buildGeneralGeoEntries() {
    return [
        {
            id: 'india-all-states-union-territories-overview',
            title: 'India-Wide State and UT Food Risk Overview',
            tags: ['india', 'all states', 'all union territories', 'diet risks'],
            question: 'Across Indian states and union territories, what foods are commonly risky for diabetes?',
            answer: 'Common risk foods across India include sugar-heavy sweets, sweetened beverages, deep-fried snacks, refined flour bakery products, and large polished-rice or refined-carb portions. Local dishes differ by region, but these high glycemic and high fat patterns are recurring risk drivers.',
        },
        {
            id: 'india-city-query-fallback',
            title: 'City-Specific Query Fallback Guidance',
            tags: ['india', 'city', 'fallback', 'diet'],
            question: 'If my city is not listed, how should I decide what not to eat with diabetes?',
            answer: 'If a specific city is not mapped yet, avoid local dishes that are deep-fried, sugar syrup-based, maida-heavy, or large-portion refined carb meals. Use the same rule in any city: vegetables plus protein first, then measured carbs, and avoid sweet beverages.',
        },
    ];
}

function buildIndiaGeoKnowledge() {
    return [
        ...buildGeneralGeoEntries(),
        ...buildStateUtEntries(),
        ...buildCityEntries(),
    ];
}

module.exports = {
    buildIndiaGeoKnowledge,
    STATE_UT_DATA,
    CITY_DATA,
};
