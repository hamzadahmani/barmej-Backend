import {ReservationStatus} from '@prisma/client';
import {describe, expect, it, vi} from 'vitest';
import {markLateReservationsAsNoShow} from '../src/reservationLifecycle';

const row = (id: number, date: string, time: string) => ({
  id,
  userId: 10 + id,
  reservationDate: new Date(`${date}T00:00:00.000Z`),
  reservationTime: time,
  status: ReservationStatus.CONFIRMED,
  checkedInAt: null,
  place: {name: 'Le Patio'},
});

const database = (rows: ReturnType<typeof row>[], updatedCounts: number[] = rows.map(() => 1)) => ({
  reservation: {
    findMany: vi.fn().mockResolvedValue(rows),
    updateMany: vi.fn().mockImplementation(() => Promise.resolve({count: updatedCounts.shift() ?? 0})),
  },
  notification: {createMany: vi.fn().mockResolvedValue({count: 1})},
});

describe('automatic reservation lifecycle', () => {
  const now = new Date('2026-08-31T19:00:00.000Z'); // 20:00 in Tunis

  it('marks a confirmed reservation absent at exactly 30 minutes late', async () => {
    const prisma = database([row(1, '2026-08-31', '19:30')]);
    await expect(markLateReservationsAsNoShow(prisma as never, undefined, now)).resolves.toBe(1);
    expect(prisma.reservation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({id: 1, checkedInAt: null}),
      data: {status: ReservationStatus.NO_SHOW, noShowMarkedAt: now},
    }));
    expect(prisma.notification.createMany).toHaveBeenCalledOnce();
  });

  it('keeps a reservation active before the 30-minute grace period ends', async () => {
    const prisma = database([row(2, '2026-08-31', '19:31')]);
    await expect(markLateReservationsAsNoShow(prisma as never, undefined, now)).resolves.toBe(0);
    expect(prisma.reservation.updateMany).not.toHaveBeenCalled();
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('limits processing to the requested establishment', async () => {
    const prisma = database([]);
    await markLateReservationsAsNoShow(prisma as never, 42, now);
    expect(prisma.reservation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({placeId: 42, status: ReservationStatus.CONFIRMED}),
    }));
  });

  it('does not notify when another worker already changed the status', async () => {
    const prisma = database([row(3, '2026-08-30', '20:00')], [0]);
    await expect(markLateReservationsAsNoShow(prisma as never, undefined, now)).resolves.toBe(0);
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });
});
