import {app} from './app';
import {config} from './config';
import {prisma} from './db';
import {markLateReservationsAsNoShow} from './reservationLifecycle';

const server = app.listen(config.PORT, '0.0.0.0', () => {
  console.log(`Barmej API listening on port ${config.PORT}`);
});

const noShowTimer = setInterval(() => {
  markLateReservationsAsNoShow(prisma).catch(error =>
    console.error('Automatic no-show update failed', error),
  );
}, 5 * 60 * 1000);
noShowTimer.unref();
markLateReservationsAsNoShow(prisma).catch(error =>
  console.error('Initial no-show update failed', error),
);

const shutdown = async () => {
  clearInterval(noShowTimer);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
