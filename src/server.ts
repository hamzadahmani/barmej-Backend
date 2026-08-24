import {app} from './app';
import {config} from './config';
import {prisma} from './db';

const server = app.listen(config.PORT, '0.0.0.0', () => {
  console.log(`Barmej API listening on port ${config.PORT}`);
});

const shutdown = async () => {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
