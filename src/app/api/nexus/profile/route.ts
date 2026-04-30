import { NextRequest } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api-auth'
import { db } from '@/lib/db'

// GET /api/nexus/profile — Get user's life coach profile
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request)

    let profile = await db.nexusProfile.findUnique({
      where: { userId: session.userId },
    })

    // Create default profile if doesn't exist
    if (!profile) {
      profile = await db.nexusProfile.create({
        data: { userId: session.userId },
      })
    }

    return Response.json({ profile })
  } catch (error) {
    return errorResponse(error)
  }
}

// POST /api/nexus/profile — Create or update profile
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request)
    const body = await request.json()

    const profile = await db.nexusProfile.upsert({
      where: { userId: session.userId },
      create: {
        userId: session.userId,
        age: body.age,
        gender: body.gender,
        occupation: body.occupation,
        company: body.company,
        workSchedule: typeof body.workSchedule === 'string' ? body.workSchedule : JSON.stringify(body.workSchedule || {}),
        children: body.children || 0,
        relationshipStatus: body.relationshipStatus,
        education: body.education,
        location: body.location,
        whatsappPhone: body.whatsappPhone,
        interests: typeof body.interests === 'string' ? body.interests : JSON.stringify(body.interests || []),
        goals: typeof body.goals === 'string' ? body.goals : JSON.stringify(body.goals || []),
        bio: body.bio,
        coachMode: body.coachMode ?? false,
        summaryEnabled: body.summaryEnabled ?? false,
        summaryInterval: body.summaryInterval || 15,
      },
      update: {
        ...(body.age !== undefined ? { age: body.age } : {}),
        ...(body.gender !== undefined ? { gender: body.gender } : {}),
        ...(body.occupation !== undefined ? { occupation: body.occupation } : {}),
        ...(body.company !== undefined ? { company: body.company } : {}),
        ...(body.workSchedule !== undefined ? { workSchedule: typeof body.workSchedule === 'string' ? body.workSchedule : JSON.stringify(body.workSchedule) } : {}),
        ...(body.children !== undefined ? { children: body.children } : {}),
        ...(body.relationshipStatus !== undefined ? { relationshipStatus: body.relationshipStatus } : {}),
        ...(body.education !== undefined ? { education: body.education } : {}),
        ...(body.location !== undefined ? { location: body.location } : {}),
        ...(body.whatsappPhone !== undefined ? { whatsappPhone: body.whatsappPhone } : {}),
        ...(body.interests !== undefined ? { interests: typeof body.interests === 'string' ? body.interests : JSON.stringify(body.interests) } : {}),
        ...(body.goals !== undefined ? { goals: typeof body.goals === 'string' ? body.goals : JSON.stringify(body.goals) } : {}),
        ...(body.bio !== undefined ? { bio: body.bio } : {}),
        ...(body.coachMode !== undefined ? { coachMode: body.coachMode } : {}),
        ...(body.summaryEnabled !== undefined ? { summaryEnabled: body.summaryEnabled } : {}),
        ...(body.summaryInterval !== undefined ? { summaryInterval: body.summaryInterval } : {}),
      },
    })

    return Response.json({ profile })
  } catch (error) {
    return errorResponse(error)
  }
}
