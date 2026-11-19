import { describe,expect,it } from "vitest"
import { canRetryCommand,canonicalCommandStatus,isTerminalCommandStatus,requiresExecutionApproval } from "../../convex/commandLifecycleLogic"

describe("command lifecycle policy",()=>{
  it("normalizes legacy Slovak states",()=>{
    expect(canonicalCommandStatus("NOVÉ")).toBe("NEW")
    expect(canonicalCommandStatus("ČAKÁ NA SCHVÁLENIE")).toBe("WAITING_APPROVAL")
    expect(canonicalCommandStatus("HOTOVO")).toBe("DONE")
  })
  it("limits retries and recognizes terminal states",()=>{
    expect(canRetryCommand("FAILED",2)).toBe(true)
    expect(canRetryCommand("FAILED",3)).toBe(false)
    expect(isTerminalCommandStatus("DONE")).toBe(true)
    expect(isTerminalCommandStatus("RUNNING")).toBe(false)
  })
  it("allows safe internal work and drafts without execution approval",()=>{
    expect(requiresExecutionApproval("Pred odoslaním","DRAFT_EMAIL_REPLY")).toBe(false)
    expect(requiresExecutionApproval("Nie","CREATE_TASK")).toBe(false)
    expect(requiresExecutionApproval("Pred vykonaním","CREATE_CALENDAR_EVENT")).toBe(true)
    expect(requiresExecutionApproval("Pred vykonaním","SAVE_ATTACHMENT_TO_DRIVE")).toBe(true)
  })
})
