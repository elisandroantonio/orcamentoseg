import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import type { ClientUserRecord } from "../db";
import { sdk } from "./sdk";
import { authenticateClientRequest } from "./clientAuth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  clientUser: ClientUserRecord | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let clientUser: ClientUserRecord | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  // Sessão da equipe interna e do portal do cliente usam cookies diferentes
  // (ver clientAuth.ts) — resolver os dois não é redundante, cada requisição
  // tem no máximo uma delas preenchida.
  try {
    clientUser = await authenticateClientRequest(opts.req);
  } catch (error) {
    clientUser = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    clientUser,
  };
}
