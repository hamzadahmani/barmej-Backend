/**
 * Traduction légère de la derja tunisienne (arabizi et écriture arabe) vers
 * les mots-clés français que comprend Barmejli. Exemple :
 * « nheb resto hedi fil marsa ghodwa fil lil m3a s7abi, 80 dinar »
 *   → « nheb restaurant calme à la marsa demain soir avec des amis, 80 dinar ».
 *
 * On ne traduit que des mots isolés (jamais un morceau de mot) pour ne pas
 * abîmer le reste de la phrase.
 */

// Limites de mot compatibles avec l'arabe (\b ne fonctionne qu'avec l'alphabet latin).
const L = '(?<![\\p{L}\\p{N}])';
const R = '(?![\\p{L}\\p{N}])';
const A = '[اأإآ]'; // alef et ses variantes
const word = (pattern: string) => new RegExp(`${L}(?:${pattern})${R}`, 'giu');

/** Ordre important : expressions longues d'abord (« fil lil » avant « fil »). */
const RULES: Array<[RegExp, string]> = [
  // Moments de la journée
  [word(`(?:fil|fel|bel|bil|في|ف|بال)\\s*(?:lil|el\\s*lil|ellil|ليل|الليل)|ellil|el\\s+lil|الليل|بالليل|f\\s*lil`), 'soir'],
  [word(`(?:fil|fel)?\\s*(?:el\\s*|l)?(?:3chiya|3achiya|3ach?iy?a|l3chiya|العشية|عشية)`), 'soir'],
  [word(`(?:fil|fel)?\\s*(?:el\\s*)?(?:sbe7|sba7|sbah|sbeh|essbe7|الصباح|صباح|الصبح|صبح)`), 'matin'],
  [word(`(?:fil|fel)?\\s*(?:el\\s*|l)?(?:9ayla|qayla|9a2la|kayla|القايلة|القايله)`), 'apres-midi'],
  [word(`ghodwa|ghodoua|ghodwe|ghodwa|ghoudwa|غدوة|غدوه|غدوا`), 'demain'],
  [word(`lyoum|el\\s*yom|elyoum|lyouma|alyoum|${A}ليوم|اليوم`), "aujourd'hui"],
  // Jours (« nhar el sebt », « السبت »)
  [word(`(?:nhar\\s*(?:el|l)?\\s*)?(?:sebt|essebt|esebt|ssebt|سبت|السبت)`), 'samedi'],
  [word(`(?:nhar\\s*(?:el|l)?\\s*)?(?:a7ad|ahad|la7ad|el7ad|ل${A}حد|${A}لاحد|${A}ل${A}حد|الاحد|الأحد)`), 'dimanche'],
  [word(`(?:nhar\\s*(?:el|l)?\\s*)?(?:thnin|tnin|ithnin|ltnin|لاثنين|الاثنين|الإثنين|الثنين)`), 'lundi'],
  [word(`(?:nhar\\s*(?:el|l)?\\s*)?(?:tleth|thleth|tlatha|thlatha|ثلاثاء|الثلاثاء|الثلاث)`), 'mardi'],
  [word(`(?:nhar\\s*(?:el|l)?\\s*)?(?:erb3a|arb3a|lerb3a|larb3a|الاربعاء|الأربعاء|الاربعا)`), 'mercredi'],
  [word(`(?:nhar\\s*(?:el|l)?\\s*)?(?:khmis|lekhmis|lkhmis|5mis|الخميس|خميس)`), 'jeudi'],
  [word(`(?:nhar\\s*(?:el|l)?\\s*)?(?:jom3a|jem3a|ljem3a|jom3a|الجمعة|الجمعه|جمعة)`), 'vendredi'],
  // Avec qui
  [word(`(?:m3a|ma3a|m3ak|مع)\\s*(?:s7abi|sahbi|s7abna|so7bti|s7ab|s7abet|ashabi|صحابي|${A}صحابي|صحابنا|اصحابي)|s7abi|s7abna|صحابي|صحابنا`), 'avec des amis'],
  [word(`(?:m3a|ma3a|مع)\\s*(?:mrti|mrati|mratt?i|rajli|rejli|khatibti|5atibti|khatibi|5atibi|l7bib|el7bib|habibti|7abibti|مرتي|راجلي|خطيبتي|خطيبي|حبيبتي|حبيبي)|mrti|mrati|rajli|khatibti|5atibti|7abibti|مرتي|راجلي|خطيبتي`), 'en couple'],
  [word(`(?:m3a|ma3a|مع)\\s*(?:l3ayla|el3ayla|3ayla|l3ayel|wledi|sghari|sghar|العائلة|العايلة|عايلتي|${A}ولادي|صغاري)|l3ayla|el3ayla|3ayla|العائلة|العايلة|عايلتي`), 'en famille'],
  [word(`wa7di|wahdi|wa7dy|وحدي`), 'solo'],
  // Ambiance
  [word(`romansi|romanci|romantik|romantique|رومنسي|رومانسي|رومنسية|رومانسية`), 'romantique'],
  [word(`(?:hedi|hedia|hedya|hed2a|hadi|هادي|هادية|هادئ|هادئة)(?!\\s*(?:nouira|chaker|nwira))`), 'calme'],
  [word(`fer7a|fe7a|zahw|zahou|nzahiw|nfar7ou|nfar7o|فرحة|زهو|نزهاو|نزهو`), 'festif'],
  // Budget
  [word(`rkhis|rkhisa|rkhes|rkhaysa|mch\\s*ghali|moch\\s*ghali|mouch\\s*ghali|mich\\s*ghali|رخيص|رخيصة|رخيصه|مش\\s*غالي|موش\\s*غالي`), 'pas cher'],
  [word(`bleche|blech|bla\\s*flous|b?bleh?ch|بلاش|بلا\\s*فلوس`), 'gratuit'],
  [new RegExp(`(\\d{1,5})\\s*(?:alf|elf|${A}لف|millimes?)${R}`, 'giu'), '$1 dt'],
  [new RegExp(`(\\d{1,5})\\s*(?:d\\.?t|د\\.?ت|د)${R}`, 'giu'), '$1 dt'],
  // Envies
  [word(`(?:n|ne|na)?3ach(?:ew|aw|ou|i)|net3acha|nt3achaw|3cha|3cha2|عشاء|عشا|نتعشى|نتعشاو`), 'diner'],
  [word(`ntghad(?:ew|aw|a)|ghda|ghda2|غداء|نتغدى|نتغداو`), 'dejeuner'],
  [word(`nekel|nakel|nekoul|makla|mekla|ماكلة|ماكله|ناكل|ناكلو|مطعم|ristoura|restau|resto`), 'restaurant'],
  [word(`9ahwa|qahwa|kahwa|9hwa|9ahwe|gahwa|9ahoua|kafe|قهوة|قهوه|مقهى`), 'cafe'],
  [word(`(?:lel|lil|l)\\s*(?:bhar|b7ar)|للبحر|(?:نمشي|نمشيو)\\s*(?:ل|لل)?البحر`), 'balade mer'],
  [word(`(?:el\\s*)?(?:bhar|b7ar)|البحر|بحر`), 'vue mer'],
  [word(`ftour|fter|fdhour|فطور`), 'brunch'],
  [word(`chatt|شط|الشط`), 'plage'],
  [word(`n7awes|n7awso|n7awsou|n7awsu|nt7awes|tahwisa|ta7wisa|7wes|n7aws|تحويسة|نحوس|نحوسو|نتحوس`), 'balade'],
  [word(`sinima|sinema|سينما|السينما`), 'cinema'],
  // Nombre d'étapes (« zouz blayes », « blasa barka »)
  [word(`zouz|zouuz|zoz|زوز`), 'deux'],
  [word(`thletha|tletha|tlatha|ثلاثة|ثلاثه`), 'trois'],
  [word(`(?:blasa|blassa|blaasa|بلاصة|بلاصه)\\s*(?:barka|brka|wa7da|wahda|برك|وحدة)`), '1 adresse'],
  [word(`blayes|blayess|blays|blayess?|بلايص|بلايس`), 'adresses'],
  [word(`blasa|blassa|بلاصة|بلاصه`), 'adresse'],
  [word(`wa7da|wahda|we7da|واحدة|وحدة`), 'une'],
  // Villes et quartiers
  [word(`7ammamet|hammamet|7amamet|الحمامات|حمامات`), 'Hammamet'],
  [word(`nabel|nebel|نابل`), 'Nabeul'],
  [word(`soussa|sousa|سوسة|سوسه`), 'Sousse'],
  [word(`صفاقس|sfaks`), 'Sfax'],
  [word(`المنستير|mnastir`), 'Monastir'],
  [word(`المهدية|المهديه|mehdia`), 'Mahdia'],
  [word(`bnzart|binzart|bnzert|بنزرت`), 'Bizerte'],
  [word(`jerba|jarba|جربة|جربه`), 'Djerba'],
  [word(`طبرقة|طبرقه`), 'Tabarka'],
  [word(`9amart|qamart|gamart|gamarth|قمرت`), 'Gammarth'],
  [word(`7al9\\s*el\\s*wed|halk\\s*el\\s*oued|halq\\s*el\\s*wed|حلق\\s*الوادي`), 'La Goulette'],
  [word(`(?:el\\s*)?ba7ira|lb7ira|lbhira|البحيرة|البحيره`), 'Lac'],
  [word(`المنزه|منزه`), 'Menzah'],
  [word(`المنار|منار`), 'Manar'],
  [word(`النصر`), 'Ennasr'],
  [word(`السكرة|السكره`), 'Soukra'],
  [word(`aryana|${A}ريانة|${A}ريانه`), 'Ariana'],
  [word(`sidi\\s*bou\\s*s3id|sidi\\s*bousaid|sidi\\s*bou\\s*saied|سيدي\\s*بو\\s*سعيد|سيدي\\s*بوسعيد`), 'Sidi Bou Said'],
  [word(`9artaj|qartaj|kartaj|قرطاج`), 'Carthage'],
  [word(`باردو`), 'Bardo'],
  [word(`المرسى|المرسي|lmarsa|el\\s*marsa`), 'La Marsa'],
  [word(`القيروان|9irwan|qairawan`), 'Kairouan'],
  [word(`tounes|twenes|el\\s*3asma|l3asma|العاصمة|العاصمه|تونس`), 'Tunis'],
  // Liaisons : « fil marsa » → « à marsa », « m3a » → « avec »
  [word(`fil|fel|في|فى`), 'à'],
  [word(`m3a|ma3a|مع`), 'avec'],
];

export function derjaToFrench(text: string) {
  let result = text;
  for (const [pattern, replacement] of RULES) result = result.replace(pattern, replacement);
  return result.replace(/\s{2,}/g, ' ').trim();
}
