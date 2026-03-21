/**
 * Chaincode entry point for the exam-audit contract.
 * Exports the ExamAuditContract for Fabric peer to discover and instantiate.
 *
 * Deployment: this chaincode is installed on all peers and approved
 * with the following endorsement policies:
 *   Writes: AND('ParikshaSurakshaMSP.peer', 'NTAMSP.peer')
 *   Reads:  OR('ParikshaSurakshaMSP.peer', 'NTAMSP.peer', 'AuditorMSP.peer')
 */

import { ExamAuditContract } from './exam-audit-contract';

export { ExamAuditContract } from './exam-audit-contract';

export const contracts: any[] = [ExamAuditContract];
