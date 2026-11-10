export const LOOK_CATEGORIES=['Holidays','Birthdays','Sports','Celebrations','Patriotic & Military','Seasonal','Everyday','Uncategorized'];
export function lookCategory(p){
 if(LOOK_CATEGORIES.includes(p.libraryCategory))return p.libraryCategory;
 const text=[p.name,...(Array.isArray(p.tags)?p.tags:[])].join(' ').toLowerCase();
 if(/birthday|birthdays|bday/.test(text))return 'Birthdays';
 if(/veteran|memorial|independence|july|patriot|military|navy|armed forces|flag day/.test(text))return 'Patriotic & Military';
 if(/christmas|holiday|halloween|thanksgiving|hanukkah|easter|valentine|patrick|new year|candy cane|santa|noel|advent|yuletide|mother.s day|father.s day/.test(text))return 'Holidays';
 if(/sports?|football|baseball|basketball|hockey|soccer|seahawks|eagles|cowboys|phillies|steelers|game day|super bowl/.test(text))return 'Sports';
 if(/celebrat|party|wedding|anniversary|graduat|congrat|confetti/.test(text))return 'Celebrations';
 if(/season|autumn|fall|winter|spring|summer|harvest|pumpkin|maple|snow|frost/.test(text))return 'Seasonal';
 if(/everyday|ambient|porch|warm white|candle|bedtime|cozy|ocean|sunset/.test(text))return 'Everyday';
 return 'Uncategorized';
}
export function groupLooks(patterns,category='all'){
 return LOOK_CATEGORIES.filter(c=>category==='all'||c===category).map(name=>({name,patterns:patterns.filter(p=>lookCategory(p)===name)})).filter(g=>g.patterns.length);
}
