import { z } from 'zod';

import { copy } from '@/lib/copy';

export const KIOSK_PIN_REGEX = /^[0-9]{4,6}$/;

const pinSchema = z.string().regex(KIOSK_PIN_REGEX, copy.attendance.pinInvalid);
const optionalPinSchema = pinSchema.optional();

export const checkInSchema = z.strictObject({
  memberId: z.uuid(),
  override: z.boolean().optional(),
  pin: optionalPinSchema,
});
export type CheckInInput = z.input<typeof checkInSchema>;

export const scanCheckInSchema = z.strictObject({
  code: z.string().min(1).max(500),
  override: z.boolean().optional(),
  pin: optionalPinSchema,
});
export type ScanCheckInInput = z.input<typeof scanCheckInSchema>;

export const memberSearchSchema = z.strictObject({
  query: z.string().trim().min(2).max(60),
});

/** Kiosk: a member types their phone number or member code, or the camera reads a QR. */
export const kioskCheckInSchema = z
  .strictObject({
    code: z.string().min(1).max(500).optional(),
    lookup: z.string().trim().min(3).max(20).optional(),
    pin: optionalPinSchema,
  })
  .refine((v) => Boolean(v.code) !== Boolean(v.lookup), { message: copy.errors.validation });
export type KioskCheckInInput = z.input<typeof kioskCheckInSchema>;

export const kioskExitSchema = z.strictObject({ pin: pinSchema });

export const kioskPinSchema = z
  .strictObject({ pin: pinSchema, confirm: z.string() })
  .refine((v) => v.pin === v.confirm, { path: ['confirm'], message: copy.attendance.pinMismatch });
export type KioskPinInput = z.input<typeof kioskPinSchema>;

export const attendanceSettingsSchema = z.strictObject({ blockExpired: z.boolean() });
export type AttendanceSettingsInput = z.input<typeof attendanceSettingsSchema>;

export const pairKioskSchema = z.strictObject({
  label: z.string().trim().min(1, copy.validation.required).max(40, copy.validation.tooLong(40)),
});
export type PairKioskInput = z.input<typeof pairKioskSchema>;

export const kioskDeviceRefSchema = z.strictObject({ deviceId: z.uuid() });
export const memberRefSchema = z.strictObject({ memberId: z.uuid() });

/** `?date=` on the attendance screen; anything else falls back to today. */
export const attendanceDateSchema = z.iso.date();
