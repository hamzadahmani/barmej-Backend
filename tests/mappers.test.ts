import {describe, expect, it} from 'vitest';
import {placeDto, placeInfoDto} from '../src/mappers';

describe('mobile compatibility mappers', () => {
  it('maps database place names to the existing mobile contract', () => {
    const place = {id: 7, categoryId: 2, name: 'Test', subtitle: null, image: null, latitude: 36, longitude: 10, phone: null, address: null, email: null, description: null, outfit: null, musicStyle: null, happyHour: null, schedule: '09:00 - 18:00', favorableDay: null, favorableHour: null, createdAt: new Date(), updatedAt: new Date()};
    expect(placeDto(place)).toMatchObject({idPlace: 7, idCategory: 2, placeName: 'Test'});
    expect(placeInfoDto(place)).toMatchObject({horaire: '09:00 - 18:00'});
  });
});
