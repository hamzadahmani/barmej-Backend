import {z} from 'zod';

export const menuItemSchema = z.object({
  name: z.string().trim().min(2).max(120),
  priceMillimes: z.number().int().min(0).max(3_000_000),
  kind: z.enum(['MAIN', 'DRINK', 'DESSERT', 'OTHER']),
  available: z.boolean().default(true),
});
export type MenuItem = z.infer<typeof menuItemSchema>;
export const menuItemsSchema = z.array(menuItemSchema).min(1).max(200);
export type MenuSelection = {items: Array<MenuItem & {quantity: number}>; totalMillimes: number; validatedAt: string; menuId: number};
export function menuSelectionKey(value: unknown): string | undefined {
  const parsed = z.object({menuId: z.number().int(), totalMillimes: z.number().int(), items: z.array(menuItemSchema.extend({quantity: z.number().int().positive()}))}).safeParse(value);
  if (!parsed.success) return;
  return JSON.stringify([parsed.data.menuId, parsed.data.totalMillimes, parsed.data.items.map(item => [item.name, item.priceMillimes, item.quantity, item.kind, item.available])]);
}

export function priceToMillimes(value: string): number | undefined {
  const text = value.trim().replace(',', '.');
  if (!/^\d{1,4}(?:\.\d{1,3})?$/.test(text)) return;
  const [whole, decimals = ''] = text.split('.');
  const price = Number(whole) * 1000 + Number(decimals.padEnd(3, '0'));
  return price <= 3_000_000 ? price : undefined;
}

// Only unambiguous lines become suggestions. Human confirmation is mandatory.
export function parseMenuText(text: string): MenuItem[] {
  const items: MenuItem[] = [];
  for (const raw of text.slice(0, 50_000).split(/\r?\n/)) {
    const line = raw.replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).trim();
    const match = line.match(/^(.{2,120}?)\s*[.·…:–-]*\s+(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:DT|TND|dinars?|دينار|دنانير)?\s*$/i);
    if (!match || /\d\s*[/|]\s*\d/.test(line)) continue;
    const priceMillimes = priceToMillimes(match[2]!);
    const name = match[1]!.replace(/[.·…:–-]+$/g, '').trim();
    if (priceMillimes == null || name.length < 2 || /\d/.test(name) || /total|telephone|tel\b|service|taxe/i.test(name)) continue;
    const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const kind = /cafe|espresso|the\b|jus|eau|soda|cappuccino|boisson|قهوة|شاي|عصير/.test(normalized) ? 'DRINK'
      : /dessert|gateau|crepe|glace|tiramisu|patisserie/.test(normalized) ? 'DESSERT' : 'OTHER';
    if (!items.some(item => item.name.toLowerCase() === name.toLowerCase())) items.push({name, priceMillimes, kind, available: true});
    if (items.length === 200) break;
  }
  return items;
}

export function menuOptions(category: string, menus: Array<{id: number; items: unknown; validatedAt: Date | null; active: boolean}>, at = new Date(), participants = 1): MenuSelection[] {
  const result: MenuSelection[] = [];
  for (const menu of menus) {
    if (!menu.active || !menu.validatedAt || at.getTime() - menu.validatedAt.getTime() > 90 * 86400_000 || menu.validatedAt > at) continue;
    const parsed = menuItemsSchema.safeParse(menu.items);
    if (!parsed.success) continue;
    const available = parsed.data.filter(item => item.available);
    const primary = available.filter(item => item.kind === (category === 'restaurant' ? 'MAIN' : 'DRINK')).sort((a, b) => a.priceMillimes - b.priceMillimes).slice(0, 8);
    const extras = available.filter(item => item.kind === (category === 'restaurant' ? 'DRINK' : 'DESSERT')).sort((a, b) => a.priceMillimes - b.priceMillimes).slice(0, 4);
    for (const main of primary) {
      for (const items of [[main], ...extras.map(extra => [main, extra])]) {
        result.push({items: items.map(item => ({...item, quantity: participants})), totalMillimes: items.reduce((sum, item) => sum + item.priceMillimes * participants, 0), validatedAt: menu.validatedAt.toISOString(), menuId: menu.id});
      }
    }
  }
  return result.slice(0, 80);
}
