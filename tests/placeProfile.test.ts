import {describe, expect, it} from 'vitest';
import {proPlaceSchema, placeProfileUpdate} from '../src/placeProfile';
import {placeDto} from '../src/mappers';
const required = {name:'Le Patio',categoryIds:[1],latitude:36.8,longitude:10.1,capacityPerSlot:20};
describe('Pro profile / consumer contract', () => {
  it('preserves omitted optional data when older Pro clients save a profile', () => {
    const data=placeProfileUpdate(proPlaceSchema.parse(required));
    for(const field of ['happyHour','image','schedule','averagePrice','ambienceTags']) expect(data[field as keyof typeof data]).toBeUndefined();
  });
  it('publishes the offer and restaurant photo using the consumer DTO names', () => {
    const data=placeProfileUpdate(proPlaceSchema.parse({...required,happyHour:' 17:00–19:00 ',image:'https://example.com/patio.jpg'}));
    const dto=placeDto({...data,id:7,categories:[{categoryId:1}]} as any);
    expect(dto).toMatchObject({idPlace:7,placeName:'Le Patio',placeHappyHour:'17:00–19:00',image:'https://example.com/patio.jpg'});
  });
  it('allows an explicit empty offer to remove it and preserves free pricing', () => {
    const data=placeProfileUpdate(proPlaceSchema.parse({...required,happyHour:'',averagePrice:0,ambienceTags:[]}));
    expect(data.happyHour).toBeNull(); expect(data.averagePrice).toBe(0); expect(data.ambienceTags).toEqual([]);
  });
  it('rejects overlong offers and invalid cover URLs before writing', () => {
    expect(proPlaceSchema.safeParse({...required,happyHour:'a'.repeat(201)}).success).toBe(false);
    expect(proPlaceSchema.safeParse({...required,image:'not-a-url'}).success).toBe(false);
  });
});
