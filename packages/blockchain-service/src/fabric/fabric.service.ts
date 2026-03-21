import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as grpc from '@grpc/grpc-js';
import * as crypto from 'crypto';
import { connect, Contract, Gateway, Identity, Signer, signers, Network } from '@hyperledger/fabric-gateway';
import * as fs from 'fs';
import * as path from 'path';

/** Result of recording an event to the ledger. */
export interface RecordEventResult {
  eventId: string;
  txId: string;
  blockNumber: number;
}

/** A single audit event stored on-chain. */
export interface AuditEvent {
  eventId: string;
  eventType: string;
  examId: string;
  entityHash: string;
  timestamp: string;
  actorId: string;
  actorOrg: string;
  metadata: string;
}

@Injectable()
export class FabricService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FabricService.name);
  private gateway!: Gateway;
  private grpcClient!: grpc.Client;
  private contract!: Contract;
  private network!: Network;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.initializeGateway();
  }

  async onModuleDestroy(): Promise<void> {
    this.gateway?.close();
    this.grpcClient?.close();
    this.logger.log('Fabric Gateway connection closed');
  }

  /**
   * Initialize the Fabric Gateway connection to ParikshaSurakshaOrg peer via mTLS.
   * Connection profile is loaded from a ConfigMap-mounted path.
   * Credentials are resolved via Workload Identity (GKE) or local certs for dev.
   */
  private async initializeGateway(): Promise<void> {
    const channelName = this.configService.get<string>('FABRIC_CHANNEL', 'pariksha-channel');
    const chaincodeName = this.configService.get<string>('FABRIC_CHAINCODE', 'exam-audit');
    const mspId = this.configService.get<string>('FABRIC_MSP_ID', 'ParikshaSurakshaMSP');
    const peerEndpoint = this.configService.get<string>('FABRIC_PEER_ENDPOINT', 'peer0.pariksha.example.com:7051');
    const peerHostAlias = this.configService.get<string>('FABRIC_PEER_HOST_ALIAS', 'peer0.pariksha.example.com');

    // Paths to crypto material (mounted from K8s secrets / ConfigMap)
    const cryptoPath = this.configService.get<string>(
      'FABRIC_CRYPTO_PATH',
      '/etc/hyperledger/fabric/crypto',
    );
    const certPath = this.configService.get<string>(
      'FABRIC_CERT_PATH',
      path.join(cryptoPath, 'signcerts/cert.pem'),
    );
    const keyPath = this.configService.get<string>(
      'FABRIC_KEY_PATH',
      path.join(cryptoPath, 'keystore/key.pem'),
    );
    const tlsCertPath = this.configService.get<string>(
      'FABRIC_TLS_CERT_PATH',
      path.join(cryptoPath, 'tls/ca.crt'),
    );

    try {
      // Load TLS certificate for mTLS connection to peer
      const tlsRootCert = fs.readFileSync(tlsCertPath);
      const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);

      // Create gRPC client connection to peer
      this.grpcClient = new grpc.Client(peerEndpoint, tlsCredentials, {
        'grpc.ssl_target_name_override': peerHostAlias,
        'grpc.keepalive_time_ms': 120000,
        'grpc.keepalive_timeout_ms': 20000,
        'grpc.keepalive_permit_without_calls': 1,
        'grpc.http2.min_time_between_pings_ms': 120000,
        'grpc.http2.max_pings_without_data': 0,
      });

      // Build identity from enrollment certificate
      const certificate = fs.readFileSync(certPath).toString();
      const identity: Identity = { mspId, credentials: Buffer.from(certificate) };

      // Build signer from private key
      const privateKeyPem = fs.readFileSync(keyPath).toString();
      const privateKey = crypto.createPrivateKey(privateKeyPem);
      const signer: Signer = signers.newPrivateKeySigner(privateKey);

      // Connect gateway
      this.gateway = connect({
        client: this.grpcClient,
        identity,
        signer,
        evaluateOptions: () => ({ deadline: Date.now() + 30000 }),
        endorseOptions: () => ({ deadline: Date.now() + 60000 }),
        submitOptions: () => ({ deadline: Date.now() + 60000 }),
        commitStatusOptions: () => ({ deadline: Date.now() + 120000 }),
      });

      // Get network and contract references
      this.network = this.gateway.getNetwork(channelName);
      this.contract = this.network.getContract(chaincodeName);

      this.logger.log(
        `Connected to Fabric network: channel=${channelName}, chaincode=${chaincodeName}, msp=${mspId}`,
      );
    } catch (error) {
      this.logger.error('Failed to initialize Fabric Gateway', error);
      throw error;
    }
  }

  /**
   * Record an audit event to the exam-audit chaincode.
   * Endorsement policy: AND(ParikshaSuraksha.peer, NTA.peer)
   */
  async recordEvent(
    eventType: string,
    examId: string,
    entityHash: string,
    metadata: string,
  ): Promise<RecordEventResult> {
    this.logger.debug(`Recording event: type=${eventType}, exam=${examId}`);

    try {
      const resultBytes = await this.contract.submitTransaction(
        'recordEvent',
        eventType,
        examId,
        entityHash,
        metadata,
      );

      const result = JSON.parse(Buffer.from(resultBytes).toString());

      // Get the committed transaction ID from the result
      const txId = result.txId || '';
      const blockNumber = result.blockNumber || 0;

      this.logger.log(
        `Event recorded: eventId=${result.eventId}, txId=${txId}, block=${blockNumber}`,
      );

      return {
        eventId: result.eventId,
        txId,
        blockNumber,
      };
    } catch (error) {
      this.logger.error(`Failed to record event: ${error}`);
      throw error;
    }
  }

  /**
   * Query a single event by ID (evaluate transaction — read-only, no endorsement required).
   */
  async queryEvent(eventId: string): Promise<AuditEvent | null> {
    this.logger.debug(`Querying event: ${eventId}`);

    try {
      const resultBytes = await this.contract.evaluateTransaction('getEvent', eventId);
      const resultStr = Buffer.from(resultBytes).toString();

      if (!resultStr || resultStr === '{}') {
        return null;
      }

      return JSON.parse(resultStr) as AuditEvent;
    } catch (error) {
      this.logger.error(`Failed to query event ${eventId}: ${error}`);
      throw error;
    }
  }

  /**
   * Query all events for a given exam via composite key range query.
   */
  async queryEventsByExam(examId: string): Promise<AuditEvent[]> {
    this.logger.debug(`Querying events for exam: ${examId}`);

    try {
      const resultBytes = await this.contract.evaluateTransaction(
        'getEventsByExam',
        examId,
      );
      const resultStr = Buffer.from(resultBytes).toString();

      if (!resultStr || resultStr === '[]') {
        return [];
      }

      return JSON.parse(resultStr) as AuditEvent[];
    } catch (error) {
      this.logger.error(`Failed to query events for exam ${examId}: ${error}`);
      throw error;
    }
  }

  /**
   * Query events within a temporal range via composite key.
   */
  async queryEventsByTimeRange(
    startTime: string,
    endTime: string,
  ): Promise<AuditEvent[]> {
    this.logger.debug(`Querying events in range: ${startTime} - ${endTime}`);

    try {
      const resultBytes = await this.contract.evaluateTransaction(
        'getEventsByTimeRange',
        startTime,
        endTime,
      );
      const resultStr = Buffer.from(resultBytes).toString();

      if (!resultStr || resultStr === '[]') {
        return [];
      }

      return JSON.parse(resultStr) as AuditEvent[];
    } catch (error) {
      this.logger.error(`Failed to query events by time range: ${error}`);
      throw error;
    }
  }

  /**
   * Get event count for an exam (monitoring).
   */
  async getEventCount(examId: string): Promise<number> {
    try {
      const resultBytes = await this.contract.evaluateTransaction(
        'getEventCount',
        examId,
      );
      return parseInt(Buffer.from(resultBytes).toString(), 10);
    } catch (error) {
      this.logger.error(`Failed to get event count for exam ${examId}: ${error}`);
      throw error;
    }
  }

  /**
   * Expose the network reference for Merkle proof extraction.
   * The MerkleService needs direct access to query blocks by transaction ID.
   */
  getNetwork(): Network {
    return this.network;
  }

  /**
   * Expose the contract reference for direct chaincode invocation.
   */
  getContract(): Contract {
    return this.contract;
  }

  /**
   * Check if the gateway is connected and responsive.
   */
  async isConnected(): Promise<boolean> {
    try {
      // Simple evaluate to check connectivity
      await this.contract.evaluateTransaction('getEventCount', '__health_check__');
      return true;
    } catch {
      return false;
    }
  }
}
