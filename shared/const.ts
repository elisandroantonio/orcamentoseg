export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

// Portal do cliente (Diário de Obras) — cookie e sessão separados da equipe
// interna de propósito: um client_user nunca deve conseguir autenticar como
// `users` (equipe) nem vice-versa.
export const CLIENT_COOKIE_NAME = "client_session_id";
export const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;
export const CLIENT_UNAUTHED_ERR_MSG = 'Faça login para continuar (20001)';
