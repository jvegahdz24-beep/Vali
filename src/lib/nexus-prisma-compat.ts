/**
 * Temporary compile-time boundary for the un-migrated Nexus subsystem.
 *
 * The Nexus code was committed against Prisma models that are absent from
 * prisma/schema.prisma. These delegates intentionally remain untyped until
 * the schema and migration are reconstructed and reviewed. Runtime access is
 * blocked by middleware unless NEXUS_ENABLED=true, so this boundary must not
 * be treated as a substitute for a Prisma migration.
 */
export type UnmigratedNexusDelegate = Record<string, (...args: any[]) => any>

export type NexusModelDelegates = {
  approvalFlow: UnmigratedNexusDelegate
  attentionalFocus: UnmigratedNexusDelegate
  behavioralPattern: UnmigratedNexusDelegate
  cognitiveLoadEntry: UnmigratedNexusDelegate
  cognitiveState: UnmigratedNexusDelegate
  coherenceSnapshot: UnmigratedNexusDelegate
  emotionalMomentum: UnmigratedNexusDelegate
  emotionalRecord: UnmigratedNexusDelegate
  episodicMemory: UnmigratedNexusDelegate
  executionLedger: UnmigratedNexusDelegate
  intentRecord: UnmigratedNexusDelegate
  ephemeralAgent: UnmigratedNexusDelegate
  analyticsAlert: UnmigratedNexusDelegate
  nexusAgent: UnmigratedNexusDelegate
  nexusBehavioralPattern: UnmigratedNexusDelegate
  nexusContact: UnmigratedNexusDelegate
  nexusConversation: UnmigratedNexusDelegate
  nexusEnergyLog: UnmigratedNexusDelegate
  nexusFollowUp: UnmigratedNexusDelegate
  nexusInsight: UnmigratedNexusDelegate
  nexusMemory: UnmigratedNexusDelegate
  nexusMessage: UnmigratedNexusDelegate
  nexusProfile: UnmigratedNexusDelegate
  nexusSilenceAlert: UnmigratedNexusDelegate
  nexusTask: UnmigratedNexusDelegate
  nexusTemperatureLog: UnmigratedNexusDelegate
  nexusWhatsAppLog: UnmigratedNexusDelegate
  personaKernel: UnmigratedNexusDelegate
  toolContract: UnmigratedNexusDelegate
  toolExecution: UnmigratedNexusDelegate
  toolPermission: UnmigratedNexusDelegate
  toolReplay: UnmigratedNexusDelegate
  toolSimulation: UnmigratedNexusDelegate
  trustRecord: UnmigratedNexusDelegate
  unresolvedPromise: UnmigratedNexusDelegate
}

declare module '@prisma/client' {
  interface PrismaClient extends NexusModelDelegates {}
}

export {}
