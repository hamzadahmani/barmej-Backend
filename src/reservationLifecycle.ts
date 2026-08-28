import {PrismaClient, ReservationStatus} from '@prisma/client';

const tunisNow = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Tunis', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {date: `${value.year}-${value.month}-${value.day}`, time: `${value.hour}:${value.minute}`};
};

export async function markLateReservationsAsNoShow(prisma: PrismaClient, placeId?: number) {
  const now = tunisNow();
  const cutoff = Date.parse(`${now.date}T${now.time}:00.000Z`) - 30 * 60 * 1000;
  const rows = await prisma.reservation.findMany({
    where: {status: ReservationStatus.CONFIRMED, reservationDate: {lte: new Date(`${now.date}T00:00:00.000Z`)}, ...(placeId ? {placeId} : {})},
    include: {place: true},
  });
  let updated = 0;
  for (const row of rows) {
    const date = row.reservationDate.toISOString().slice(0, 10);
    if (Date.parse(`${date}T${row.reservationTime.slice(0, 5)}:00.000Z`) > cutoff) continue;
    const result = await prisma.reservation.updateMany({where: {id: row.id, status: ReservationStatus.CONFIRMED, checkedInAt: null}, data: {status: ReservationStatus.NO_SHOW, noShowMarkedAt: new Date()}});
    if (!result.count) continue;
    updated += result.count;
    await prisma.notification.createMany({data: [{userId: row.userId, title: 'Réservation non honorée', message: `Votre réservation chez ${row.place.name} a été marquée comme absence après 30 minutes de retard.`, type: 'RESERVATION_NO_SHOW', referenceKey: String(row.id)}], skipDuplicates: true});
  }
  return updated;
}
