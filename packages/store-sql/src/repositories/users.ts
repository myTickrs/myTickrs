import type { UserRow } from '@tickrs/server/store/ports.js';

export type { UserRow };
import type {
  BorrowFeeTreatment,
  AveragePriceScope,
  OptionDataSource,
  PremiumTreatment,
  ShortBuyHandling,
} from '@tickrs/shared';
import type { Uuid } from '@tickrs/server/model.js';
import { AppError } from '@tickrs/server/errors.js';
import { nowIso } from '@tickrs/server/ids.js';
import type { Executor } from './common.js';

export interface UserSettingsPatch {
  baseCurrency?: string;
  averagePriceScope?: AveragePriceScope;
  optionPremiumTreatment?: PremiumTreatment;
  autoExpireOtm?: 0 | 1;
  shortBuyHandling?: ShortBuyHandling;
  borrowFeeTreatment?: BorrowFeeTreatment;
  optionDataSource?: OptionDataSource;
}

export async function requireUser(db: Executor, userId: Uuid): Promise<UserRow> {
  const user = await findUser(db, userId);
  if (!user) throw new AppError('NOT_FOUND', 404, 'No such user');
  return user;
}

export async function findUser(db: Executor, userId: Uuid): Promise<UserRow | undefined> {
  const user = await db.selectFrom('users').selectAll().where('id', '=', userId).executeTakeFirst();
  if (!user) return undefined;
  return {
    ...user,
    averagePriceScope: (user.averagePriceScope as AveragePriceScope | undefined) ?? 'CURRENT',
  };
}

export async function updateUserSettings(
  db: Executor,
  userId: Uuid,
  patch: UserSettingsPatch,
): Promise<void> {
  const values = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  if (Object.keys(values).length === 0) return;
  await db
    .updateTable('users')
    .set({ ...values, updatedAt: nowIso() })
    .where('id', '=', userId)
    .execute();
}
