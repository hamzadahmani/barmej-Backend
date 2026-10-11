import type {NextFunction, Request, Response} from 'express';

/**
 * Contrôle des insultes dans les textes publiés par les utilisateurs
 * (avis, réponses, signalements, messages, noms…), en français, anglais,
 * arabe et derja tunisienne (écriture arabe et arabizi : 9a7ba, nayek…).
 *
 * Principe : chaque mot est normalisé de plusieurs façons (accents, leet
 * « f0ck », chiffres arabizi « 9/7/3/5 », lettres répétées « fuuuck »,
 * variantes de l'alphabet arabe) puis comparé à la liste. On compare des
 * mots entiers (pas des morceaux) pour éviter les faux positifs comme
 * « salopette », « en retard » ou « tahini ».
 */

/** Mots interdits (forme exacte, pluriels simples acceptés). */
const WORDS = [
  // Français
  'connard', 'connasse', 'conasse', 'salope', 'salaud', 'salopard', 'pute', 'putain', 'pétasse',
  'encule', 'enculé', 'enculer', 'batard', 'bâtard', 'fdp', 'ntm', 'tg', 'nique', 'niquer', 'pd', 'pédé', 'tapette',
  'enfoiré', 'enfoire', 'merde', 'abruti', 'crétin', 'imbécile', 'débile', 'trouduc', 'bougnoule', 'négro', 'nègre',
  'youpin', 'bicot', 'catin', 'pouffiasse', 'grognasse', 'branleur', 'couille', 'couillon', 'zob',
  // Anglais
  'fuck', 'fck', 'fuk', 'fuq', 'phuck', 'fucker', 'fucking', 'shit', 'bullshit', 'bitch', 'asshole', 'arsehole',
  'bastard', 'cunt', 'dick', 'dickhead', 'motherfucker', 'whore', 'slut', 'faggot', 'fag', 'nigger', 'nigga', 'wtf',
  'stfu', 'kys', 'moron', 'wanker', 'twat', 'prick', 'douchebag', 'retarded', 'jackass', 'dumbass',
  // Derja / arabizi
  'zebi', 'zeby', 'zbi', 'zabour', 'kahba', 'qahba', '9a7ba', 'ka7ba', 'q7ba', 'kahbet', 'nayek', 'nayk', 'mnayek',
  'mnayk', 'mnik', 'nik', 'nikomk', 'nikmok', 'niklek', 'nikoumek', 'zokomk', 'zok', 'tahan', 'ta7an', 't7an',
  'tahane', 'ta7ane', 'zamel', 'zemel', 'miboun', 'mibon', 'khra', '5ra', 'terma', '3asba', 'asba', 'sharmouta',
  'charmouta', 'charmota', 'sharmota', 'n3al', 'nal', 'nalbouk', 'n3albouk', 'yel3an', 'yal3an', 'yakalb', 'ya7mar', 'yabhim',
  // Arabe (écriture arabe, sans voyelles)
  'قحبه', 'قحاب', 'شرموطه', 'شراميط', 'عاهره', 'منيوك', 'منيك', 'نيك', 'نيكمك', 'نايك', 'زبي', 'زب', 'زك', 'زكمك',
  'كسمك', 'كس', 'طحان', 'زامل', 'ميبون', 'خرا', 'نعلبوك', 'يلعن', 'لعنه', 'ياكلب', 'ياحمار', 'يابهيم', 'يازامل',
  'وسخ', 'حقير', 'عرص', 'معرص', 'خول', 'ديوث', 'قواد',
];

/** Mots qui ne sont des insultes qu'avec ce qui précède (« ya kalb », « ta mère »). */
const PHRASES = [
  'pauvre con', 'pauvre conne', 'grosse conne', 'sale conne', 'quelle conne', 'gros con', 'sale con', 'espece de con', 'quel con', 'bande de cons', 'nique ta mere', 'ta mere la pute', 'fils de pute', 'va te faire', 'ferme ta gueule', 'ta gueule', 'sale arabe',
  'sale noir', 'sale juif', 'son of a bitch', 'go to hell', 'piece of shit', 'kill yourself',
  'nik omek', 'nik ommek', 'nik mok', 'zok omk', 'zok ommek', 'nal bouk', 'n3al bouk', 'n3al rabbek', 'nal rabbek',
  'yel3an bouk', 'yal3an bouk', 'ya kalb', 'ya 7mar', 'ya hmar', 'ya bhim', 'ya zamel', 'ould kahba', 'weld kahba',
  'wled kahba', 'ibn kalb', 'كس امك', 'نيك امك', 'نعل بوك', 'يلعن بوك', 'ولد القحبه', 'ابن الكلب',
  'ابن الحرام', 'يا كلب', 'يا حمار', 'يا بهيم', 'يا زامل', 'زك امك',
];

/** Racines sûres : tout mot qui commence ainsi est refusé (« fucking », « enculés », « شرموطات »). */
const STEMS = [
  'fuck', 'motherfuck', 'encul', 'connard', 'connass', 'asshole', 'bitch', 'faggot', 'bullshit', 'dickhead',
  'kahb', 'qahb', '9a7b', 'ka7b', 'sharmout', 'charmout', 'nikom', 'nikm', 'zokom', 'mnayk', 'mnayek',
  'شرموط', 'قحب', 'منيوك', 'نيكم', 'زكم', 'كسم', 'معرص',
];

const LEET: Record<string, string> = {'0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i', '€': 'e'};

const stripAccents = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '');

const normalizeArabic = (value: string) =>
  value
    .replace(/[ً-ٰٟـ]/g, '') // voyelles courtes, tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');

const collapseRepeats = (value: string) => value.replace(/(.)\1+/gu, '$1');

/** Forme de base : minuscules, sans accents, arabe normalisé, lettres répétées réduites. */
const base = (value: string) => collapseRepeats(normalizeArabic(stripAccents(value.toLowerCase())));

/** Leet : « f0ck », « $alope », « p.u.t.e » une fois les symboles retirés. */
const leet = (word: string) => word.replace(/[013457@$!€]/g, char => LEET[char] ?? char).replace(/[^\p{L}]/gu, '');

/** Arabizi : 9/q → k, 7 → h, 5 → kh, 3/2 → a, ou → u. */
const arabizi = (word: string) =>
  collapseRepeats(word.replace(/[9q]/g, 'k').replace(/7/g, 'h').replace(/5/g, 'kh').replace(/[32]/g, 'a').replace(/ou/g, 'u').replace(/[^\p{L}]/gu, ''));

const variants = (word: string) => {
  const raw = word.replace(/[^\p{L}\p{N}@$!€]/gu, '');
  const forms = new Set([raw, raw.replace(/[^\p{L}\p{N}]/gu, ''), leet(raw), arabizi(raw)]);
  // Préfixes arabes collés au mot : « و », « يا », « ال », « بال ».
  for (const form of [...forms]) {
    const stripped = form.replace(/^(?:يا|وال|بال|ال|و)(?=\p{L}{2,})/u, '');
    if (stripped !== form) forms.add(stripped);
  }
  forms.delete('');
  return [...forms];
};

/** Formes d'un terme de la liste : base et arabizi (le leet ne s'applique qu'au texte saisi). */
const termForms = (term: string) => {
  const normalized = base(term);
  return [...new Set([normalized, arabizi(normalized)])].filter(Boolean);
};

const words = new Set(WORDS.flatMap(termForms));
const stems = STEMS.flatMap(termForms).filter(stem => stem.length >= 3);
const phrases = [...new Set(PHRASES.flatMap(phrase => {
  const parts = base(phrase).split(/\s+/);
  return [parts.join(' '), parts.map(part => arabizi(part)).join(' ')];
}))].filter(phrase => phrase.includes(' '));

// Pluriels : « connards », « enculés » ; arabe : « شرموطات ».
const pluralForms = (form: string) => [form, form.replace(/[sx]$/u, ''), form.replace(/(?:ات|ين|ون)$/u, '')];

const matchesWord = (form: string) =>
  pluralForms(form).some(candidate => candidate.length > 0 && words.has(candidate)) ||
  stems.some(stem => form.startsWith(stem));

/** Mots écrits lettre par lettre : « f u c k », « p.u.t.e », « n-i-k ». */
const spacedOut = (text: string) =>
  [...text.matchAll(/(?:^|\s)((?:[\p{L}\p{N}@$][\s.\-_*+]+){2,}[\p{L}\p{N}@$])(?=\s|$)/gu)].map(match => (match[1] ?? '').replace(/[\s.\-_*+]+/g, ''));

/** Retourne le terme insultant trouvé, ou null si le texte est correct. */
export function findProfanity(text?: string | null): string | null {
  if (!text || typeof text !== 'string') return null;
  const normalized = base(text);
  const tokens = normalized.split(/[\s,;:.!?¿¡()[\]{}"«»“”'’/\\|<>]+/u).filter(Boolean);
  for (const token of [...tokens, ...spacedOut(normalized)]) {
    for (const form of variants(token)) if (matchesWord(form)) return token;
  }
  const sentences = [
    ` ${tokens.join(' ')} `,
    ` ${tokens.map(token => arabizi(token)).join(' ')} `,
    ` ${tokens.map(token => leet(token)).join(' ')} `,
  ];
  for (const phrase of phrases) if (sentences.some(sentence => sentence.includes(` ${phrase} `))) return phrase;
  return null;
}

export const containsProfanity = (text?: string | null) => findProfanity(text) !== null;

export const PROFANITY_MESSAGE = 'Merci de rester courtois : votre texte contient un terme insultant. Modifiez-le pour continuer.';

/** Champs de texte publiés par les utilisateurs et les établissements. */
const CHECKED_FIELDS = [
  'comment', 'response', 'note', 'message', 'proposalMessage', 'title', 'description', 'firstName', 'lastName',
  'reason', 'occasion', 'cancellationReason', 'name',
];

/** Refuse (422) toute écriture dont un champ texte contient une insulte. */
export function profanityGuard(req: Request, res: Response, next: NextFunction) {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method) || !req.body || typeof req.body !== 'object') return next();
  for (const field of CHECKED_FIELDS) {
    const value = (req.body as Record<string, unknown>)[field];
    if (typeof value === 'string' && containsProfanity(value)) {
      return res.status(422).json({message: PROFANITY_MESSAGE, field});
    }
  }
  return next();
}
