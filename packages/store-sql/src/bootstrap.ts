import { nowIso } from '@tickrs/server/ids.js';
import type { Db } from './db.js';

import { LOCAL_DEFAULT_ACCOUNT_ID, LOCAL_USER_ID } from '@tickrs/server/local.js';

export { LOCAL_DEFAULT_ACCOUNT_ID, LOCAL_USER_ID };

export async function ensureLocalUser(db: Db): Promise<void> {
  const now = nowIso();
  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto('users')
      .values({ id: LOCAL_USER_ID, email: null, createdAt: now, updatedAt: now })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute();
    await trx
      .insertInto('accounts')
      .values({
        id: LOCAL_DEFAULT_ACCOUNT_ID,
        userId: LOCAL_USER_ID,
        name: 'My Portfolio',
        broker: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute();
  });
}
