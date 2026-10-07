import type { Ctx } from '../context.js';
import { calculateFee } from '@tickrs/core';
import type { FeeQuoteInput } from '@tickrs/shared';

export async function quoteFee(ctx: Ctx, input: FeeQuoteInput) {
  const data = ctx.data;
  const account = await data.accounts.require(input.accountId);
  const schedule = data.feeSchedules.toSchedule(await data.feeSchedules.find(account.feeScheduleId));
  const contract = input.optionContractId ? await data.contracts.find(input.optionContractId) : undefined;
  const breakdown = calculateFee(schedule, {
    type: input.type,
    quantity: input.quantity,
    price: input.price,
    multiplier: contract?.multiplier,
  });
  return {
    ...breakdown,
    feeSource: 'AUTO' as const,
    scheduleName: account.feeScheduleId ? undefined : 'No fees',
  };
}
