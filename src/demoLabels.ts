import type {NextFunction, Request, Response} from 'express';

// Les lieux de démonstration portent « [Démo] », « — Démo » ou « lieu de démonstration »
// dans la base. Ces marques restent en base (elles servent de clés aux scripts de seed)
// mais ne sont plus affichées dans l'application. SHOW_DEMO_LABELS=true les réaffiche.
const patterns: Array<[RegExp, string]> = [
  [/\[\s*d[ée]mo\s*\]\s*/gi, ''],
  [/\s+[—–-]\s+d[ée]mo\b/gi, ''],
  [/\s*[—–-]\s*lieu de d[ée]monstration\b/gi, ''],
  [/\s*·\s*d[ée]monstration\b/gi, ''],
];

export function stripDemoLabels<T>(value: T): T {
  if (typeof value === 'string') {
    return patterns.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value as string).trim() as T;
  }
  if (Array.isArray(value)) return value.map(item => stripDemoLabels(item)) as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, stripDemoLabels(item)])) as T;
  }
  return value;
}

export function hideDemoLabels(_req: Request, res: Response, next: NextFunction) {
  if (process.env.SHOW_DEMO_LABELS === 'true') return next();
  const json = res.json.bind(res);
  // JSON.parse(JSON.stringify()) applique d'abord toJSON (dates, Decimal…) comme Express le ferait.
  res.json = (body?: unknown) => json(body === undefined ? body : stripDemoLabels(JSON.parse(JSON.stringify(body))));
  next();
}
