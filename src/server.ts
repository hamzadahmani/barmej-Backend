import {app} from './app';
import {config} from './config';
import {prisma} from './db';
import {markLateReservationsAsNoShow} from './reservationLifecycle';
import {closeCache} from './cache';

let server: ReturnType<typeof app.listen> | null = null;
let noShowTimer: NodeJS.Timeout | null = null;

const shutdown = async () => {
  if (noShowTimer) clearInterval(noShowTimer);
  if (!server) {
    await closeCache();
    await prisma.$disconnect();
    return;
  }
  server.close(async () => {
    await closeCache();
    await prisma.$disconnect();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const start = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    server = app.listen(config.PORT, '0.0.0.0', () => {
      console.log(`Barmej API listening on port ${config.PORT}`);
    });
    noShowTimer = setInterval(() => {
      markLateReservationsAsNoShow(prisma).catch(error =>
        console.error('Automatic no-show update failed', error),
      );
    }, 5 * 60 * 1000);
    noShowTimer.unref();
    await markLateReservationsAsNoShow(prisma);
  } catch {
    if (noShowTimer) clearInterval(noShowTimer);
    console.error('Barmej API not started: PostgreSQL is unreachable. Start the local database and retry.');
    await prisma.$disconnect();
    process.exitCode = 1;
  }
};

void start();
