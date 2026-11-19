export const COMMAND_STATUSES = ["NEW", "PLANNED", "RUNNING", "WAITING_APPROVAL", "DONE", "FAILED", "CANCELLED"] as const
export type CommandStatus = typeof COMMAND_STATUSES[number]

export function canonicalCommandStatus(value:string):CommandStatus {
  const status=value.trim().toUpperCase()
  if(status==="NOVÉ"||status==="NOVE")return "NEW"
  if(status==="PLÁNOVANÉ"||status==="PLANOVANE")return "PLANNED"
  if(status==="SPRACÚVA SA"||status==="SPRACUVA SA")return "RUNNING"
  if(status==="ČAKÁ NA SCHVÁLENIE"||status==="CAKA NA SCHVALENIE")return "WAITING_APPROVAL"
  if(status==="HOTOVO")return "DONE"
  if(status==="ZLYHALO")return "FAILED"
  if(status==="ZRUŠENÉ"||status==="ZRUSENE")return "CANCELLED"
  return COMMAND_STATUSES.includes(status as CommandStatus)?status as CommandStatus:"NEW"
}

export function isTerminalCommandStatus(status:string){return ["DONE","CANCELLED"].includes(canonicalCommandStatus(status))}
export function canRetryCommand(status:string,attempt:number){return canonicalCommandStatus(status)==="FAILED"&&attempt<3}
export function requiresExecutionApproval(approval:string,intent:string){
  if(intent==="DRAFT_EMAIL_REPLY"||intent==="CREATE_TASK")return false
  return approval!=="Nie"
}
