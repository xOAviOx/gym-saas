import type { MemberDetailsValues } from './schema';

/** Whitelisted database attributes. The caller never chooses the gym or derived status. */
export function memberDatabaseData(v: MemberDetailsValues) {
  return {
    full_name: v.fullName,
    phone: v.phone,
    alt_phone: v.altPhone,
    email: v.email,
    gender: v.gender,
    dob: v.dob,
    address: v.address,
    joined_on: v.joinedOn,
    source: v.source,
    emergency_contact_name: v.emergencyContactName,
    emergency_contact_phone: v.emergencyContactPhone,
    notes: v.notes,
    tags: v.tags,
    consent_messaging: v.consentMessaging,
  };
}
