import { Database, runMigrations } from './index.js';

const connectionString = process.env['DATABASE_URL'] ?? 'postgresql://wtrader:wtrader@localhost:5432/wtrader';
const database = new Database(connectionString);

try {
  await runMigrations(database);
} finally {
  await database.close();
}
