import {describe, expect, it} from 'vitest';
import {canMoveStay, nightsBetween, parseDay, roomsLeft, stayEstimate, validateStay} from '../src/staysLogic';

const today = new Date(2026, 9, 5);
const range = (checkIn: string, checkOut: string, rooms = 1) => ({checkIn: parseDay(checkIn)!, checkOut: parseDay(checkOut)!, rooms});

describe('stay bookings', () => {
  it('counts nights and rejects invalid periods', () => {
    expect(nightsBetween(parseDay('2026-10-10')!, parseDay('2026-10-13')!)).toBe(3);
    expect(validateStay({checkIn: '2026-10-10', checkOut: '2026-10-10', guests: 2, rooms: 1}, today)).toHaveProperty('error');
    expect(validateStay({checkIn: '2026-10-01', checkOut: '2026-10-03', guests: 2, rooms: 1}, today)).toHaveProperty('error');
    expect(validateStay({checkIn: '2026-02-30', checkOut: '2026-03-02', guests: 2, rooms: 1}, today)).toHaveProperty('error');
    expect(validateStay({checkIn: '2026-10-10', checkOut: '2026-10-12', guests: 0, rooms: 1}, today)).toHaveProperty('error');
    expect(validateStay({checkIn: '2026-10-10', checkOut: '2026-10-12', guests: 2, rooms: 1}, today)).toMatchObject({nights: 2});
  });
  it('computes rooms left on the busiest night only', () => {
    const period = range('2026-10-10', '2026-10-13');
    const booked = [range('2026-10-08', '2026-10-11', 2), range('2026-10-12', '2026-10-15', 1), range('2026-10-13', '2026-10-14', 3)];
    expect(roomsLeft(4, booked, period)).toBe(2);
    expect(roomsLeft(2, booked, period)).toBe(0);
    expect(roomsLeft(null, booked, period)).toBeNull();
  });
  it('estimates the stay price from the nightly rate', () => {
    expect(stayEstimate(250, 3, 2)).toBe(1500);
    expect(stayEstimate(null, 3, 1)).toBeNull();
  });
  it('only lets hosts move a stay forward', () => {
    expect(canMoveStay('PENDING', 'CONFIRMED')).toBe(true);
    expect(canMoveStay('PENDING', 'COMPLETED')).toBe(false);
    expect(canMoveStay('CONFIRMED', 'COMPLETED')).toBe(true);
    expect(canMoveStay('CANCELLED', 'CONFIRMED')).toBe(false);
  });
});
