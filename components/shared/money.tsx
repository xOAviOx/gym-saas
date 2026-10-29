import { formatMoney, type MoneyFormat, type Paise } from '@/lib/money';
import { cn } from '@/lib/utils';

type MoneyProps = {
  paise: Paise;
  decimals?: MoneyFormat;
  className?: string;
};

/** Rupee amount with Indian grouping and tabular digits. */
export function Money({ paise, decimals = 'auto', className }: MoneyProps) {
  return <span className={cn('tabular', className)}>{formatMoney(paise, decimals)}</span>;
}
