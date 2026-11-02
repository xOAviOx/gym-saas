-- M2: Cashfree replaces Razorpay as the hosted gateway. Postgres only lets a new
-- enum value be used after the transaction that adds it commits, so these
-- statements ship in their own migration ahead of the billing changes.
alter type public.collection_mode add value if not exists 'cashfree';
alter type public.collection_provider add value if not exists 'cashfree';
alter type public.payment_method add value if not exists 'cashfree';
