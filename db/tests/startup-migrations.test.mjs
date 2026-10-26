import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const psql = process.env.TEST_PSQL ?? 'psql';
const env = { ...process.env,
  PGHOST: process.env.TEST_POSTGRES_HOST ?? 'localhost',
  PGPORT: process.env.TEST_POSTGRES_PORT ?? '5432',
  PGUSER: process.env.TEST_POSTGRES_USER ?? 'postgres',
  PGPASSWORD: process.env.TEST_POSTGRES_PASSWORD,
};
const run = (database, args) => exec(psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-d', database, ...args], { env });
const sql = async (database, query) => (await run(database, ['-tA', '-c', query])).stdout.trim();
const upgrade = database => run(database, ['-f', fileURLToPath(new URL('../startup-migrations.sql', import.meta.url))]);

test('startup upgrades preserve old and fresh databases, serialize repeat runs and fail on errors', {
  skip: !process.env.TEST_POSTGRES_PASSWORD,
  timeout: 60000,
}, async () => {
  const database = `migration_test_${randomUUID().replaceAll('-', '')}`;
  await sql('postgres', `CREATE DATABASE "${database}"`);
  try {
    // A broken baseline must stop startup, never report a successful upgrade.
    await assert.rejects(upgrade(database));
    await run(database, ['-f', fileURLToPath(new URL('../finalized-schema.sql', import.meta.url))]);
    await upgrade(database); // Fresh schema already contains the upgrades.
    await sql(database, `INSERT INTO users (email, password_hash, user_role, user_status)
      VALUES ('preserved@example.com', 'unchanged-test-hash', 'TRADER', 'DISABLED')`);
    await upgrade(database);
    assert.equal(await sql(database, "SELECT user_status || ':' || password_hash FROM users WHERE email='preserved@example.com'"),
      'DISABLED:unchanged-test-hash');

    // Simulate the previous release's persistent volume: populated users but no status column.
    await sql(database, 'ALTER TABLE users DROP COLUMN user_status');
    await sql(database, `DROP TABLE account_order_presets;
      ALTER TABLE orders DROP COLUMN price_waits, DROP COLUMN limit_price,
        DROP COLUMN take_profit_price, DROP COLUMN stop_loss_price, DROP COLUMN exit_parent_id`);
    await Promise.all([upgrade(database), upgrade(database)]);
    assert.equal(await sql(database, "SELECT user_status || ':' || password_hash FROM users WHERE email='preserved@example.com'"),
      'ACTIVE:unchanged-test-hash');
    assert.equal(await sql(database, "SELECT count(*) FROM v_trade_clients WHERE email='preserved@example.com'"), '1');
    await assert.rejects(sql(database, "UPDATE users SET user_status='INVALID'"));
    assert.equal(await sql(database, "SELECT count(*) FROM information_schema.columns WHERE table_name='orders' AND column_name IN ('limit_price','take_profit_price','stop_loss_price','exit_parent_id','price_waits')"), '5');
    await sql(database, `INSERT INTO accounts(user_id,account_number,account_name)
      SELECT user_id,'UPGRADE-TEST','Trading' FROM users WHERE email='preserved@example.com';
      INSERT INTO account_order_presets(account_id,name,order_type,quantity,tolerance)
      SELECT account_id,'Swing','LIMIT',3,2 FROM accounts WHERE account_number='UPGRADE-TEST'`);
    await upgrade(database);
    assert.equal(await sql(database, "SELECT name || ':' || quantity FROM account_order_presets"), 'Swing:3');
  } finally {
    await sql('postgres', `DROP DATABASE "${database}" WITH (FORCE)`);
  }
});
