-- M4: a message staff decided not to send. Enum values must be committed before
-- they can be used, so this runs ahead of the messaging migration.
alter type public.message_status add value if not exists 'skipped';
