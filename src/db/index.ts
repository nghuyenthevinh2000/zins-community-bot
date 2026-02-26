// Proxy re-exports — preserves all existing consumer imports unchanged
export { getPrismaClient, disconnectPrisma } from '../core/db/client';
export { GroupRepository } from '../modules/group/db/group-repository';
export { MemberRepository } from '../modules/group/db/member-repository';
export { RoundRepository } from '../modules/scheduling/db/round-repository';
export { ResponseRepository } from '../modules/scheduling/db/response-repository';
export { NLUQueueRepository } from '../modules/nlu/db/nlu-queue-repository';
export { NudgeRepository } from '../modules/nudge/db/nudge-repository';
export { ConsensusRepository, type TimeSlot, type ConsensusCalculation } from '../modules/consensus/db/consensus-repository';
export { ReminderRepository } from '../modules/reminder/db/reminder-repository';
