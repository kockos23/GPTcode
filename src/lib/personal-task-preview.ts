type PersonalTaskPreview = {
  status?: unknown
  priority?: unknown
}

export function previewPersonalTasks<T extends PersonalTaskPreview>(
  livePersonal: readonly T[] | undefined,
  briefingTasks: readonly T[] | undefined,
  limit = 5,
): T[] {
  const source = livePersonal ?? briefingTasks ?? []
  return source
    .filter(task => task.status !== "HOTOVO" && task.status !== "ZRUŠENÉ")
    .slice(0, limit)
}

export function taskPriorityClass(priority: unknown): string {
  if (typeof priority !== "string") return ""
  return priority.toLocaleLowerCase("sk").replace("ô", "o").replace("é", "e")
}
