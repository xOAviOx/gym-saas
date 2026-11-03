import {
  CalendarDaysIcon,
  DoorOpenIcon,
  IndianRupeeIcon,
  RotateCcwIcon,
  UserRoundIcon,
} from '@/components/icons';
import type { MemberActivityItem } from '@/features/members/activity';
import { copy } from '@/lib/copy';
import { formatDateTime } from '@/lib/dates';

const icons = {
  joined: UserRoundIcon,
  membership: CalendarDaysIcon,
  payment: IndianRupeeIcon,
  reversal: RotateCcwIcon,
  checkIn: DoorOpenIcon,
};

export function MemberActivity({ items }: { items: MemberActivityItem[] }) {
  return (
    <section
      aria-labelledby="member-activity-title"
      className="bg-card mt-6 rounded-xl border p-5 md:p-6"
    >
      <h2 id="member-activity-title" className="text-base font-semibold">
        {copy.members.recentActivity}
      </h2>
      <p className="text-muted-foreground mt-1 text-xs">{copy.members.recentActivityHelp}</p>
      <ol className="mt-5 grid gap-5">
        {items.map((item) => {
          const Icon = icons[item.kind];
          return (
            <li key={item.id} className="flex gap-3">
              <span className="bg-muted text-foreground flex size-9 shrink-0 items-center justify-center rounded-full">
                <Icon aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-medium">{copy.members.activityTypes[item.kind]}</h3>
                {item.detail ? <p className="mt-1 text-sm break-words">{item.detail}</p> : null}
                <time dateTime={item.at} className="text-muted-foreground mt-1 block text-xs">
                  {formatDateTime(item.at)}
                </time>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
