import { v } from "convex/values"
import { api } from "./_generated/api"
import { action, internalAction } from "./_generated/server"

const disabledResult = {
  ok: false,
  message: "Pôvodný Composio finance intake je trvalo vyradený. Doklady spracúva SARA priamo v n8n.",
  checkedEmails: 0,
  savedFiles: 0,
  skippedFiles: 0,
  failedFiles: 0,
  reviewFiles: 0,
}

export const syncEmailAttachments = action({
  args: {},
  handler: async (ctx) => {
    const access = await ctx.runQuery(api.authz.currentAccess, {})
    if (!access.allowed) return { ...disabledResult, message: "Nemáš prístup k WOF financiám." }
    return disabledResult
  },
})

export const scheduledEmailAttachmentSync = internalAction({
  args: {},
  handler: async () => ({
    ...disabledResult,
    ok: true,
    message: "Legacy Convex finance cron je vypnutý; plánovaný intake vlastní n8n.",
  }),
})

export const resolveEmailImport = action({
  args: {
    id: v.id("wofFinanceEmailImports"),
    deliveryDate: v.string(),
    category: v.union(v.literal("Doklady"), v.literal("Stripe"), v.literal("Vypisy"), v.literal("Vystavene_FA")),
  },
  handler: async (ctx) => {
    const access = await ctx.runQuery(api.authz.currentAccess, {})
    if (!access.allowed) return { ok: false, message: "Nemáš prístup k WOF financiám." }
    return { ok: false, message: "Legacy review je vyradené; rozhodnutia spracúva n8n review outbox." }
  },
})

export const getEmailIntakeStatus = action({
  args: {},
  handler: async (ctx) => {
    const access = await ctx.runQuery(api.authz.currentAccess, {})
    if (!access.allowed) return { enabled: false, message: "Nemáš prístup k WOF financiám." }
    return {
      enabled: false,
      message: "Legacy Convex/Composio intake je vyradený. Aktuálny stav sleduj v SARA n8n workflowoch.",
    }
  },
})
