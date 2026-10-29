import { Badge } from '@/components/ui/badge';
import type { Role } from '@/lib/auth/roles';
import { copy } from '@/lib/copy';

export function RolePill({ role }: { role: Role }) {
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {copy.roles[role]}
    </Badge>
  );
}
