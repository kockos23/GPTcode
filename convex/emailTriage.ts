import { v } from "convex/values"
import { api, internal } from "./_generated/api"
import { action } from "./_generated/server"
import { buildEmailTriageContext } from "./emailTriageLogic"

export const requestState=action({
  args:{emailId:v.string(),state:v.union(v.literal("INBOX"),v.literal("ARCHIVED"),v.literal("MOVED")),folder:v.optional(v.string()),previousFolder:v.optional(v.string()),sourceAccount:v.optional(v.string())},
  returns:v.object({id:v.string(),status:v.string()}),
  handler:async(ctx,args)=>{const access=await ctx.runQuery(api.authz.currentAccess,{});if(!access.allowed)throw new Error("FORBIDDEN");const emailId=args.emailId.trim().slice(0,600),folder=(args.folder??"").trim().slice(0,100),previousFolder=(args.previousFolder??"").trim().slice(0,100),source=(args.sourceAccount??"").trim().toLowerCase().slice(0,200);if(!emailId)throw new Error("INVALID_EMAIL_ID");if(args.state==="MOVED"&&!folder)throw new Error("FOLDER_REQUIRED");const contextType=buildEmailTriageContext({state:args.state,folder,previousFolder,sourceAccount:source});return await ctx.runMutation(internal.chiefOfStaff.createCommand,{command:`E-mail: ${args.state}${folder?` → ${folder}`:""}`,contextType,contextId:emailId,channel:"Inbox Radar",intent:"TRIAGE_EMAIL",targetApp:source.includes("wofevents.com")?"WOF Events IMAP":"Gmail",approval:"Nie",agent:"NORA",createdBy:access.email??"Tomáš"})
  },
})
