-- Recovered from the applied Supabase migration history to restore Git/remote parity.
DROP FUNCTION IF EXISTS public.is_current_driver_premium();
DROP FUNCTION IF EXISTS public.rpc_admin_verify_premium_payment(uuid,text);
DROP FUNCTION IF EXISTS public.rpc_driver_submit_premium_payment(text);
DROP FUNCTION IF EXISTS public.rpc_driver_submit_premium_payment(text,numeric,text,text,boolean,text);
DROP FUNCTION IF EXISTS public.rpc_purge_expired_premium_vouchers();
DROP FUNCTION IF EXISTS public.rpc_driver_submit_commission_voucher(text,numeric,numeric,text,boolean,text);
