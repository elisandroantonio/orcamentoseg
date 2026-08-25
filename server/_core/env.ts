export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  // Senha(s) que protegem /api/dev-login quando a plataforma está hospedada
  // permanentemente (NODE_ENV=production) e não tem OAuth da Manus
  // configurado. Duas chaves independentes (ex.: uma pra cada pessoa) — as
  // duas dão acesso à mesma conta. Ver server/_core/devAuth.ts.
  accessKey: process.env.ACCESS_KEY ?? "",
  accessKey2: process.env.ACCESS_KEY_2 ?? "",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
