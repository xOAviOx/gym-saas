import type { MemberState } from '@/lib/membership';
import type { Paise } from '@/lib/money';

export type CheckInResult = 'checked_in' | 'duplicate' | 'blocked';
export type PinError = 'pin_required' | 'invalid' | 'locked' | 'not_set';
export type CheckInFlag = 'expiring' | 'expired' | 'dues_pending';
export type CheckInMethod = 'manual' | 'qr';

export type CheckInMember = {
  id: string;
  name: string;
  code: string;
  status: MemberState;
  flag: CheckInFlag | null;
  endDate: string | null;
  /** Remaining sessions on a session plan, otherwise null. */
  sessionsLeft: number | null;
  balanceDue: Paise;
  photoPath: string | null;
};

export type CheckInOutcome = {
  result: CheckInResult;
  pinError: PinError | null;
  overridden: boolean;
  checkedInAt: string | null;
  member: Omit<CheckInMember, 'photoPath'> & { photoUrl: string | null };
};

/** What the kiosk screen may show to whoever is standing in front of it. */
export type KioskOutcome = {
  result: CheckInResult;
  pinError: PinError | null;
  checkedInAt: string | null;
  member: {
    firstName: string;
    status: MemberState;
    flag: CheckInFlag | null;
    endDate: string | null;
    sessionsLeft: number | null;
    photoUrl: string | null;
  };
};

export type AttendanceRow = {
  id: string;
  checkedInAt: string;
  method: CheckInMethod;
  flag: CheckInFlag | null;
  overridden: boolean;
  viaKiosk: boolean;
  member: { id: string; name: string; code: string; deleted: boolean };
};

export type AttendanceDay = {
  date: string;
  rows: AttendanceRow[];
  total: number;
  uniqueMembers: number;
  flagged: number;
  byQr: number;
  /** Check-ins per IST hour, index 0 = midnight. */
  hourly: number[];
};

export type KioskDeviceRow = {
  id: string;
  label: string;
  createdAt: string;
  lastSeenAt: string | null;
};
