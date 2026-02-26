/**
 * Backward-compatibility shim for Story 8.3.
 * The real implementation has moved to src/modules/scheduling/scheduling.service.ts.
 * Old test files in src/services/ import from here — do not delete until Story 8.4.
 */
import { SchedulingService, type SchedulingRepositories } from '../modules/scheduling/scheduling.service';

export type Repositories = SchedulingRepositories;

/**
 * BotHandlers is an alias for SchedulingService.
 * Old constructor signature: (repos, nluService?, bot?)
 * SchedulingService constructor:  (repos, nluService, consensusService?, retryLoopService?, bot?)
 * This subclass re-orders args to match the old signature.
 */
export class BotHandlers extends SchedulingService {
  constructor(repos: SchedulingRepositories, nluService?: any, bot?: any) {
    super(repos, nluService, undefined, undefined, bot);
  }
}
