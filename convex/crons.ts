import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

const crons = cronJobs()

// Convex cron uses UTC. The paired schedules hit 06:15 Europe/Bratislava
// in summer (04:15 UTC) and winter (05:15 UTC); the action checks local time
// and performs work in exactly one of the two windows.
crons.cron(
  "WOF_EMAIL_INTAKE_SUMMER",
  "15 4 * * 1-5",
  internal.financeIntake.scheduledEmailAttachmentSync,
  {},
)
crons.cron(
  "WOF_EMAIL_INTAKE_WINTER",
  "15 5 * * 1-5",
  internal.financeIntake.scheduledEmailAttachmentSync,
  {},
)

export default crons
