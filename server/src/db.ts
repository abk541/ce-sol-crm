import pg, { type PoolClient, type QueryResult, type QueryResultRow } from 'pg'

const { Pool } = pg

export type Database = InstanceType<typeof Pool>

export function createPool(connectionString: string): Database {
  const pool = new Pool({
    connectionString,
    max: 10,
    min: 0,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    maxLifetimeSeconds: 60 * 30,
    allowExitOnIdle: false,
    application_name: 'ce-sol-crm-api',
  })
  pool.on('error', (error) => {
    // A checked-out client reports through its caller. This is for otherwise
    // unhandled errors from idle pooled clients.
    console.error('PostgreSQL idle client error', error)
  })
  return pool
}

export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<R>>
}

export async function transaction<T>(
  pool: Database,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const result = await callback(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export async function asAuthenticatedUser<T>(
  pool: Database,
  accountId: string,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return transaction(pool, async (client) => {
    await client.query("select pg_catalog.set_config('app.account_id', $1, true)", [accountId])
    await client.query('set local role authenticated')
    return callback(client)
  })
}

/** Run a service-owned transaction while preserving the authenticated actor
 * for audit/outbox triggers. This deliberately does not SET ROLE because auth
 * and administrative routes need their narrowly granted service privileges. */
export async function asServiceUser<T>(
  pool: Database,
  accountId: string,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return transaction(pool, async (client) => {
    await client.query("select pg_catalog.set_config('app.account_id', $1, true)", [accountId])
    return callback(client)
  })
}
