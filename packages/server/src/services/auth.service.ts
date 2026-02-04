import bcrypt from 'bcrypt'
import { prisma } from '../lib/prisma.js'

export async function validateUser(username: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { username },
    include: { role: true },
  })

  if (!user || !user.isActive) {
    return null
  }

  const isValid = await bcrypt.compare(password, user.passwordHash)
  if (!isValid) {
    return null
  }

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  })

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    role: {
      id: user.role.id,
      name: user.role.name,
      permissions: user.role.permissions,
    },
  }
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10)
}
