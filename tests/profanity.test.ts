import {describe, expect, it} from 'vitest';
import {findProfanity, profanityGuard} from '../src/profanity';

describe('contrôle des insultes', () => {
  it.each([
    'Tu es un connard', 'espèce de CONNNNARD', 'f0ck you', 'F U C K', 'sh1t service', 'p.u.t.e', 'nique ta mère',
    'fils de pute', 'enculés', 'pauvre con', 'son of a bitch', 'B1TCH', 'fuuuuck',
    'zebi', 'ya 7mar', '9a7ba', 'qahba', 'nayek', 'nik omek', 'zok ommek', 'n3al bouk', 'ta7aaan', 'wled kahba',
    'قحبة', 'شرموطة', 'يا كلب', 'ياكلب', 'كس امك', 'نيكمك', 'منيوك', 'ولد القحبة', 'زامل',
  ])('refuse « %s »', text => {
    expect(findProfanity(text)).not.toBeNull();
  });

  it.each([
    'Super café con leche', 'Le serveur était en retard', 'Une salopette rouge', 'Tahini délicieux', 'Nike store à côté',
    'Le cône glacé', 'Le canal est joli', 'Couscous au poulet', 'كسكسي بنين', 'العكس صحيح', 'Nigeria Jollof rice',
    'zouk night', 'Le chien de la maison est adorable', 'Great food and nice staff', 'مطعم ممتاز والخدمة سريعة',
    'Bnina barcha, ya3tik saha', 'A 5 min du centre', 'zebda w 3sal', 'Sidi Bou Said',
  ])('accepte « %s »', text => {
    expect(findProfanity(text)).toBeNull();
  });

  it('bloque une écriture insultante avec un message clair', () => {
    const res: any = {status: (code: number) => ({json: (body: unknown) => ({code, body})})};
    let passed = false;
    const blocked: any = profanityGuard({method: 'POST', body: {comment: 'service de merde'}} as any, res, () => { passed = true; });
    expect(passed).toBe(false);
    expect(blocked.code).toBe(422);
    expect(blocked.body.field).toBe('comment');
    profanityGuard({method: 'POST', body: {comment: 'Très bon accueil'}} as any, res, () => { passed = true; });
    expect(passed).toBe(true);
  });
});
