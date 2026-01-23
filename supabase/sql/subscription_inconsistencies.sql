/*
-- 1. Clientes con más de una suscripción ACTIVE dentro del mismo app
*/
SELECT customerid, appid, COUNT(*) AS active_count
FROM subscriptions
WHERE status = 'ACTIVE'
GROUP BY customerid, appid
HAVING COUNT(*) > 1;

/*
-- 2. Pendientes de pago sin providercheckoutid
*/
SELECT *
FROM subscriptions
WHERE status = 'PENDING_PAYMENT'
  AND (providercheckoutid IS NULL OR providercheckoutid = '');

/*
-- 3. PENDING_PAYMENT más antiguos de 24 horas
*/
SELECT *
FROM subscriptions
WHERE status = 'PENDING_PAYMENT'
  AND created_at < NOW() - INTERVAL '24 hours';

/*
-- 4. ACTIVE con provider stripe pero stripe subscription null
*/
SELECT *
FROM subscriptions
WHERE status = 'ACTIVE'
  AND provider = 'stripe'
  AND stripesubscriptionid IS NULL;

/*
-- 5. CANCELLED sin enddate
*/
SELECT *
FROM subscriptions
WHERE status = 'CANCELLED'
  AND (enddate IS NULL OR enddate = '');
