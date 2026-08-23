import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

const requireSystemAdmin = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user || ctx.user.role !== "system_admin") throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

const requireStaff = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user || (ctx.user.role !== "teacher" && ctx.user.role !== "system_admin")) throw new TRPCError({ code: "FORBIDDEN", message: "需要老師或系統管理員權限" });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

const requireStudent = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user || ctx.user.role !== "student") throw new TRPCError({ code: "FORBIDDEN", message: "只有學生可以查看個人學習統計" });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(requireUser);
export const systemAdminProcedure = t.procedure.use(requireSystemAdmin);
export const teacherProcedure = t.procedure.use(requireStaff);
export const studentProcedure = t.procedure.use(requireStudent);
/** Compatibility alias: legacy admin routes now mean system administrator only. */
export const adminProcedure = systemAdminProcedure;
