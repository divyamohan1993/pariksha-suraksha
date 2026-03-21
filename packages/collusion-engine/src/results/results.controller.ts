import {
  Controller,
  Get,
  Param,
  Logger,
} from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';

import {
  ResultsService,
  FlaggedPairsResult,
  CenterResultsResponse,
  PairEvidenceResponse,
  ClustersResponse,
} from './results.service';

@Controller('collusion')
export class ResultsController {
  private readonly logger = new Logger(ResultsController.name);

  constructor(private readonly resultsService: ResultsService) {}

  // ---------------------------------------------------------------------------
  // HTTP endpoints
  // ---------------------------------------------------------------------------

  @Get('results/:examId')
  async getResults(
    @Param('examId') examId: string,
  ): Promise<FlaggedPairsResult> {
    return this.resultsService.getResults(examId);
  }

  @Get('results/:examId/center/:centerId')
  async getResultsForCenter(
    @Param('examId') examId: string,
    @Param('centerId') centerId: string,
  ): Promise<CenterResultsResponse> {
    return this.resultsService.getResultsForCenter(examId, centerId);
  }

  @Get('results/:examId/pair/:pairId')
  async getPairEvidence(
    @Param('examId') examId: string,
    @Param('pairId') pairId: string,
  ): Promise<PairEvidenceResponse> {
    return this.resultsService.getPairEvidence(examId, pairId);
  }

  @Get('results/:examId/clusters')
  async getClusters(
    @Param('examId') examId: string,
  ): Promise<ClustersResponse> {
    return this.resultsService.getClusters(examId);
  }

  // ---------------------------------------------------------------------------
  // gRPC handlers
  // ---------------------------------------------------------------------------

  @GrpcMethod('CollusionEngineService', 'GetResults')
  async grpcGetResults(data: {
    exam_id: string;
  }): Promise<{
    exam_id: string;
    total_flagged_pairs: number;
    flagged_pairs: Array<{
      pair_id: string;
      candidate_u: string;
      candidate_v: string;
      center_id: string;
      log_lambda: number;
      threshold: number;
      flagged: boolean;
    }>;
  }> {
    const result = await this.resultsService.getResults(data.exam_id);
    return {
      exam_id: result.examId,
      total_flagged_pairs: result.totalFlaggedPairs,
      flagged_pairs: result.flaggedPairs.map((p) => ({
        pair_id: p.pairId,
        candidate_u: p.candidateU,
        candidate_v: p.candidateV,
        center_id: p.centerId,
        log_lambda: p.logLambda,
        threshold: p.threshold,
        flagged: p.flagged,
      })),
    };
  }

  @GrpcMethod('CollusionEngineService', 'GetResultsForCenter')
  async grpcGetResultsForCenter(data: {
    exam_id: string;
    center_id: string;
  }): Promise<{
    exam_id: string;
    center_id: string;
    total_pairs_analyzed: number;
    flagged_pair_count: number;
    flagged_pairs: Array<{
      pair_id: string;
      candidate_u: string;
      candidate_v: string;
      center_id: string;
      log_lambda: number;
      threshold: number;
      flagged: boolean;
    }>;
  }> {
    const result = await this.resultsService.getResultsForCenter(
      data.exam_id,
      data.center_id,
    );
    return {
      exam_id: result.examId,
      center_id: result.centerId,
      total_pairs_analyzed: result.totalPairsAnalyzed,
      flagged_pair_count: result.flaggedPairCount,
      flagged_pairs: result.flaggedPairs.map((p) => ({
        pair_id: p.pairId,
        candidate_u: p.candidateU,
        candidate_v: p.candidateV,
        center_id: p.centerId,
        log_lambda: p.logLambda,
        threshold: p.threshold,
        flagged: p.flagged,
      })),
    };
  }

  @GrpcMethod('CollusionEngineService', 'GetPairEvidence')
  async grpcGetPairEvidence(data: {
    exam_id: string;
    pair_id: string;
  }): Promise<{
    pair_id: string;
    candidate_u: string;
    candidate_v: string;
    center_id: string;
    log_lambda: number;
    threshold: number;
    flagged: boolean;
    shared_question_count: number;
    same_wrong_count: number;
    different_wrong_count: number;
    seating_proximity: string;
    question_details: Array<{
      question_position: number;
      template_id: string;
      response_u: string;
      response_v: string;
      correct_answer: string;
      match_type: string;
      log_lambda_contribution: number;
    }>;
    evidence_report_uri: string;
  }> {
    const result = await this.resultsService.getPairEvidence(
      data.exam_id,
      data.pair_id,
    );
    return {
      pair_id: result.pairId,
      candidate_u: result.candidateU,
      candidate_v: result.candidateV,
      center_id: result.centerId,
      log_lambda: result.logLambda,
      threshold: result.threshold,
      flagged: result.flagged,
      shared_question_count: result.sharedQuestionCount,
      same_wrong_count: result.sameWrongCount,
      different_wrong_count: result.differentWrongCount,
      seating_proximity: result.seatingProximity,
      question_details: result.questionDetails.map((qd) => ({
        question_position: qd.questionPosition,
        template_id: qd.templateId,
        response_u: qd.responseU,
        response_v: qd.responseV,
        correct_answer: qd.correctAnswer,
        match_type: qd.matchType,
        log_lambda_contribution: qd.logLambdaContribution,
      })),
      evidence_report_uri: result.evidenceReportUri,
    };
  }

  @GrpcMethod('CollusionEngineService', 'GetClusters')
  async grpcGetClusters(data: {
    exam_id: string;
  }): Promise<{
    exam_id: string;
    clusters: Array<{
      cluster_id: string;
      center_id: string;
      candidate_ids: string[];
      pair_ids: string[];
      max_log_lambda: number;
      average_log_lambda: number;
    }>;
  }> {
    const result = await this.resultsService.getClusters(data.exam_id);
    return {
      exam_id: result.examId,
      clusters: result.clusters.map((c) => ({
        cluster_id: c.clusterId,
        center_id: c.centerId,
        candidate_ids: c.candidateIds as string[],
        pair_ids: c.pairIds as string[],
        max_log_lambda: c.maxLogLambda,
        average_log_lambda: c.averageLogLambda,
      })),
    };
  }
}
