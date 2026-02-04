import { prisma } from '../lib/prisma.js'

export async function getSettings(): Promise<Record<string, string>> {
  const settings = await prisma.setting.findMany()
  return settings.reduce(
    (acc, s) => {
      acc[s.key] = s.value
      return acc
    },
    {} as Record<string, string>
  )
}

export async function getSetting(key: string): Promise<string | null> {
  const setting = await prisma.setting.findUnique({ where: { key } })
  return setting?.value ?? null
}

export async function updateSettings(updates: Record<string, string>) {
  const operations = Object.entries(updates).map(([key, value]) =>
    prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    })
  )
  await prisma.$transaction(operations)
}
