import { GroupRepository } from '../modules/group/db/group-repository';
import { MemberRepository } from '../modules/group/db/member-repository';
import { RoundRepository } from '../modules/scheduling/db/round-repository';
import { ResponseRepository } from '../modules/scheduling/db/response-repository';
import { NLUQueueRepository } from '../modules/nlu/db/nlu-queue-repository';
import { NudgeRepository } from '../modules/nudge/db/nudge-repository';
import { ConsensusRepository } from '../modules/consensus/db/consensus-repository';
import { ReminderRepository } from '../modules/reminder/db/reminder-repository';

export interface AllRepositories {
  groups: GroupRepository;
  members: MemberRepository;
  rounds: RoundRepository;
  responses: ResponseRepository;
  nluQueue: NLUQueueRepository;
  nudges: NudgeRepository;
  consensus: ConsensusRepository;
  reminders: ReminderRepository;
}
