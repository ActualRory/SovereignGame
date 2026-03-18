import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://kingdoms:kingdoms_dev@localhost:5432/kingdoms',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
};
