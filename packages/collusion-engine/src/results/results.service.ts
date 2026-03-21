import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Firestore } from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';

import { FIRESTORE } from '../infrastructure/firestore.module';
import { GCS_STORAGE } from '../infrastructure/storage.module';

import type {
  CollusionPair,
  CollusionEvidence,
  CollusionQuestionEvidence,
  CollusionCluster,
  CollusionResult,
} from '@pariksha/shared';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface FlaggedPairsResult {
  examId: string;
  totalFlaggedPairs: number;
  flaggedPairs: CollusionPair[];
}

export interface CenterResultsResponse {
  examId: string;
  centerId: string;
  totalPairsAnalyzed: number;
  flaggedPairCount: number;
  flaggedPairs: CollusionPair[];
}

export interface PairEvidenceResponse {
  pairId: string;
  candidateU: string;
  candidateV: string;
  centerId: string;
  logLambda: number;
  threshold: number;
  flagged: boolean;
  sharedQuestionCount: number;
  sameWrongCount: number;
  differentWrongCount: number;
  seatingProximity: string;
  questionDetails: CollusionQuestionEvidence[];
  evidenceReportUri: string;
}

export interface ClustersResponse {
  examId: string;
  clusters: CollusionCluster[];
}

@Injectable()
export class ResultsService {
  private readonly logger = new Logger(ResultsService.name);

  constructor(
    @Inject(FIRESTORE) private readonly firestore: Firestore,
    @Inject(GCS_STORAGE) private readonly storage: Storage,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // getResults — list all flagged pairs across all centers
  // ---------------------------------------------------------------------------

  async getResults(examId: string): Promise<FlaggedPairsResult> {
    await this.ensureExamExists(examId);

    // Query all center results for this exam
    const centersSnapshot = await this.firestore
      .collection('collusionResults')
      .doc(examId)
      .collection('centers')
      .get();

    const allFlaggedPairs: CollusionPair[] = [];

    for (const centerDoc of centersSnapshot.docs) {
      const pairsSnapshot = await this.firestore
        .collection('collusionResults')
        .doc(examId)
        .collection('centers')
        .doc(centerDoc.id)
        .collection('pairs')
        .where('flagged', '==', true)
        .get();

      for (const pairDoc of pairsSnapshot.docs) {
        allFlaggedPairs.push(
          this.firestoreDocToCollusionPair(pairDoc.id, pairDoc.data()),
        );
      }
    }

    // Sort by log-likelihood ratio descending (most suspicious first)
    allFlaggedPairs.sort((a, b) => b.logLambda - a.logLambda);

    return {
      examId,
      totalFlaggedPairs: allFlaggedPairs.length,
      flaggedPairs: allFlaggedPairs,
    };
  }

  // ---------------------------------------------------------------------------
  // getResultsForCenter — flagged pairs for one center
  // ---------------------------------------------------------------------------

  async getResultsForCenter(
    examId: string,
    centerId: string,
  ): Promise<CenterResultsResponse> {
    await this.ensureExamExists(examId);

    const centerDoc = await this.firestore
      .collection('collusionResults')
      .doc(examId)
      .collection('centers')
      .doc(centerId)
      .get();

    if (!centerDoc.exists) {
      throw new NotFoundException(
        `No collusion results for exam=${examId}, center=${centerId}`,
      );
    }

    const centerData = centerDoc.data()!;
    const totalPairsAnalyzed = (centerData.totalPairsAnalyzed as number) || 0;

    // Load all pairs for this center (both flagged and unflagged are stored, filter flagged)
    const pairsSnapshot = await this.firestore
      .collection('collusionResults')
      .doc(examId)
      .collection('centers')
      .doc(centerId)
      .collection('pairs')
      .where('flagged', '==', true)
      .get();

    const flaggedPairs: CollusionPair[] = pairsSnapshot.docs.map((doc) =>
      this.firestoreDocToCollusionPair(doc.id, doc.data()),
    );

    flaggedPairs.sort((a, b) => b.logLambda - a.logLambda);

    return {
      examId,
      centerId,
      totalPairsAnalyzed,
      flaggedPairCount: flaggedPairs.length,
      flaggedPairs,
    };
  }

  // ---------------------------------------------------------------------------
  // getPairEvidence — detailed evidence for one pair
  // ---------------------------------------------------------------------------

  async getPairEvidence(
    examId: string,
    pairId: string,
  ): Promise<PairEvidenceResponse> {
    await this.ensureExamExists(examId);

    // Search across all centers for this pair — the pairId is globally unique
    const pairData = await this.findPairAcrossCenters(examId, pairId);

    if (!pairData) {
      throw new NotFoundException(
        `Pair ${pairId} not found in exam ${examId}`,
      );
    }

    const evidence = pairData.evidence as CollusionEvidence | undefined;
    const questionDetails = evidence?.questionDetails || [];

    // Build the evidence report URI from GCS
    const reportsBucket = this.config.get<string>('storage.reportsBucket')!;
    const evidenceReportUri = await this.getEvidenceReportUri(
      reportsBucket,
      examId,
      pairId,
    );

    return {
      pairId: pairData.pairId as string,
      candidateU: pairData.candidateU as string,
      candidateV: pairData.candidateV as string,
      centerId: pairData.centerId as string,
      logLambda: pairData.logLambda as number,
      threshold: pairData.threshold as number,
      flagged: pairData.flagged as boolean,
      sharedQuestionCount: evidence?.sharedQuestionCount ?? 0,
      sameWrongCount: evidence?.sameWrongCount ?? 0,
      differentWrongCount: evidence?.differentWrongCount ?? 0,
      seatingProximity: evidence?.seatingProximity ?? 'unknown',
      questionDetails: questionDetails as CollusionQuestionEvidence[],
      evidenceReportUri,
    };
  }

  // ---------------------------------------------------------------------------
  // getClusters — connected components of flagged pairs (cheating rings)
  // ---------------------------------------------------------------------------

  async getClusters(examId: string): Promise<ClustersResponse> {
    await this.ensureExamExists(examId);

    // Load all flagged pairs across all centers
    const { flaggedPairs } = await this.getResults(examId);

    if (flaggedPairs.length === 0) {
      return { examId, clusters: [] };
    }

    // Build an adjacency list from flagged pairs
    const adjacency = new Map<string, Set<string>>();
    const pairsByEdge = new Map<string, string>(); // "u|v" -> pairId
    const candidateToCenter = new Map<string, string>();

    for (const pair of flaggedPairs) {
      if (!adjacency.has(pair.candidateU)) {
        adjacency.set(pair.candidateU, new Set());
      }
      if (!adjacency.has(pair.candidateV)) {
        adjacency.set(pair.candidateV, new Set());
      }
      adjacency.get(pair.candidateU)!.add(pair.candidateV);
      adjacency.get(pair.candidateV)!.add(pair.candidateU);

      const edgeKey = [pair.candidateU, pair.candidateV].sort().join('|');
      pairsByEdge.set(edgeKey, pair.pairId);

      candidateToCenter.set(pair.candidateU, pair.centerId);
      candidateToCenter.set(pair.candidateV, pair.centerId);
    }

    // Find connected components via BFS
    const visited = new Set<string>();
    const clusters: CollusionCluster[] = [];
    let clusterIndex = 0;

    for (const node of adjacency.keys()) {
      if (visited.has(node)) continue;

      const component = new Set<string>();
      const queue: string[] = [node];

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        component.add(current);

        const neighbors = adjacency.get(current);
        if (neighbors) {
          for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
              queue.push(neighbor);
            }
          }
        }
      }

      if (component.size < 2) continue;

      // Collect pairIds in this cluster
      const clusterCandidateIds = Array.from(component);
      const clusterPairIds: string[] = [];
      const clusterLogLambdas: number[] = [];

      for (let i = 0; i < clusterCandidateIds.length; i++) {
        for (let j = i + 1; j < clusterCandidateIds.length; j++) {
          const edgeKey = [clusterCandidateIds[i]!, clusterCandidateIds[j]!]
            .sort()
            .join('|');
          const pairId = pairsByEdge.get(edgeKey);
          if (pairId) {
            clusterPairIds.push(pairId);
            const pair = flaggedPairs.find((p) => p.pairId === pairId);
            if (pair) {
              clusterLogLambdas.push(pair.logLambda);
            }
          }
        }
      }

      const centerId =
        candidateToCenter.get(clusterCandidateIds[0]!) || 'unknown';

      clusters.push({
        clusterId: `cluster_${examId}_${clusterIndex++}`,
        centerId,
        candidateIds: clusterCandidateIds,
        pairIds: clusterPairIds,
        maxLogLambda:
          clusterLogLambdas.length > 0
            ? Math.max(...clusterLogLambdas)
            : 0,
        averageLogLambda:
          clusterLogLambdas.length > 0
            ? clusterLogLambdas.reduce((a, b) => a + b, 0) /
              clusterLogLambdas.length
            : 0,
      });
    }

    // Sort clusters by max log-likelihood ratio descending
    clusters.sort((a, b) => b.maxLogLambda - a.maxLogLambda);

    return { examId, clusters };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async ensureExamExists(examId: string): Promise<void> {
    const examDoc = await this.firestore
      .collection('exams')
      .doc(examId)
      .get();

    if (!examDoc.exists) {
      throw new NotFoundException(`Exam ${examId} not found`);
    }
  }

  /**
   * Search for a pair across all centers within an exam.
   * The pairId is globally unique so we scan all center sub-collections.
   */
  private async findPairAcrossCenters(
    examId: string,
    pairId: string,
  ): Promise<FirebaseFirestore.DocumentData | null> {
    const centersSnapshot = await this.firestore
      .collection('collusionResults')
      .doc(examId)
      .collection('centers')
      .get();

    for (const centerDoc of centersSnapshot.docs) {
      const pairDoc = await this.firestore
        .collection('collusionResults')
        .doc(examId)
        .collection('centers')
        .doc(centerDoc.id)
        .collection('pairs')
        .doc(pairId)
        .get();

      if (pairDoc.exists) {
        return pairDoc.data()!;
      }
    }

    return null;
  }

  /**
   * Check if a PDF evidence report exists in GCS for this pair.
   */
  private async getEvidenceReportUri(
    bucket: string,
    examId: string,
    pairId: string,
  ): Promise<string> {
    const reportPath = `${examId}/evidence/${pairId}.pdf`;

    try {
      const [exists] = await this.storage
        .bucket(bucket)
        .file(reportPath)
        .exists();

      if (exists) {
        return `gs://${bucket}/${reportPath}`;
      }
    } catch (error) {
      this.logger.warn(
        `Failed to check evidence report for pair ${pairId}: ${(error as Error).message}`,
      );
    }

    return '';
  }

  private firestoreDocToCollusionPair(
    docId: string,
    data: FirebaseFirestore.DocumentData,
  ): CollusionPair {
    return {
      pairId: (data.pairId as string) || docId,
      candidateU: data.candidateU as string,
      candidateV: data.candidateV as string,
      centerId: data.centerId as string,
      logLambda: data.logLambda as number,
      threshold: data.threshold as number,
      flagged: data.flagged as boolean,
      evidence: {
        sharedQuestionCount:
          (data.evidence?.sharedQuestionCount as number) || 0,
        sameWrongCount: (data.evidence?.sameWrongCount as number) || 0,
        differentWrongCount:
          (data.evidence?.differentWrongCount as number) || 0,
        questionDetails:
          (data.evidence
            ?.questionDetails as ReadonlyArray<CollusionQuestionEvidence>) ||
          [],
        seatingProximity:
          (data.evidence?.seatingProximity as CollusionEvidence['seatingProximity']) ||
          'different_room',
      },
    };
  }
}
