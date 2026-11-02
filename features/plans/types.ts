export type Plan = {
  id: string;
  name: string;
  type: 'duration' | 'sessions';
  durationDays: number;
  sessionCount: number | null;
  /** Integer paise. */
  price: number;
  description: string;
  isActive: boolean;
};
