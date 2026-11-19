import { getAuthUserId } from "@convex-dev/auth/server"
import { v } from "convex/values"
import { mutation, type MutationCtx } from "./_generated/server"

async function requireOwner(ctx:MutationCtx){const id=await getAuthUserId(ctx);if(!id)throw new Error("UNAUTHENTICATED");const user=await ctx.db.get(id);if(user?.email?.trim().toLowerCase()!==process.env.OWNER_EMAIL?.trim().toLowerCase())throw new Error("FORBIDDEN")}

export const setState=mutation({
  args:{emailId:v.string(),state:v.union(v.literal("INBOX"),v.literal("ARCHIVED"),v.literal("MOVED")),folder:v.optional(v.string()),sourceAccount:v.optional(v.string())},
  handler:async(ctx,args)=>{await requireOwner(ctx);const emailId=args.emailId.trim().slice(0,600);if(!emailId)throw new Error("INVALID_EMAIL_ID");const folder=(args.folder??"").trim().slice(0,100);if(args.state==="MOVED"&&!folder)throw new Error("FOLDER_REQUIRED");const existing=await ctx.db.query("chiefOfStaffEmailTriage").withIndex("by_email_id",q=>q.eq("emailId",emailId)).unique();const record={emailId,state:args.state,folder,sourceAccount:(args.sourceAccount??"").trim().toLowerCase().slice(0,200),updatedAt:Date.now()};if(existing)await ctx.db.patch(existing._id,record);else await ctx.db.insert("chiefOfStaffEmailTriage",record);return{ok:true,state:args.state,folder}
  },
})
