import { CLIENT_UNAUTHED_ERR_MSG, FIELD_UNAUTHED_ERR_MSG, NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

// Portal do cliente (Diário de Obras, somente leitura) — sessão própria via
// client_users (clientAuth.ts), nunca aceita a sessão da equipe interna.
const requireClientUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.clientUser) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: CLIENT_UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      clientUser: ctx.clientUser,
    },
  });
});

export const clientProcedure = t.procedure.use(requireClientUser);

// Login de campo (só alimenta o Diário de Obras da própria obra) — sessão
// própria via site_diary_field_users (fieldAuth.ts).
const requireFieldUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.fieldUser) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: FIELD_UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      fieldUser: ctx.fieldUser,
    },
  });
});

export const fieldProcedure = t.procedure.use(requireFieldUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
