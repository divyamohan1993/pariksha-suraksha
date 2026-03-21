import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { FabricService } from '../fabric/fabric.service';

/**
 * A single node in a Merkle proof path.
 * position indicates whether this sibling hash is on the "left" or "right"
 * when reconstructing the path from leaf to root.
 */
export interface MerkleProofNode {
  hash: string;
  position: 'left' | 'right';
}

/**
 * Complete Merkle proof for a transaction within a Fabric block.
 * Fabric blocks store transactions in an ordered array and compute
 * a Merkle tree over transaction hashes for the block header's DataHash.
 * This proof contains the sibling hashes needed to recompute the root
 * from the transaction's leaf hash, providing O(log T) verification
 * where T is bounded by MaxMessageCount (typically 100).
 */
export interface MerkleProof {
  eventId: string;
  txId: string;
  blockNumber: number;
  blockHash: string;
  txHash: string;
  merkleRoot: string;
  proof: MerkleProofNode[];
  verified: boolean;
}

@Injectable()
export class MerkleService {
  private readonly logger = new Logger(MerkleService.name);

  constructor(private readonly fabricService: FabricService) {}

  /**
   * Get a Merkle proof for a specific audit event.
   *
   * Steps:
   * 1. Retrieve the event from chaincode to get the txId
   * 2. Use the Fabric Network to get the block containing that transaction
   * 3. Parse the block structure to find the transaction's position
   * 4. Compute the Merkle proof: array of sibling hashes from leaf to root
   * 5. Verify the proof against the block header's data hash
   *
   * Complexity: O(log T) where T <= MaxMessageCount (100), so effectively O(1).
   */
  async getMerkleProof(eventId: string): Promise<MerkleProof> {
    this.logger.debug(`Generating Merkle proof for event: ${eventId}`);

    // Step 1: Get the event from chaincode to extract txId
    const event = await this.fabricService.queryEvent(eventId);
    if (!event) {
      throw new Error(`Event not found: ${eventId}`);
    }

    // The txId is stored in event metadata or we need to look it up
    // In practice, the recordEvent result includes the txId which should be
    // stored alongside the event. For chaincode-level queries, we use verifyEvent.
    const contract = this.fabricService.getContract();
    const verifyBytes = await contract.evaluateTransaction('verifyEvent', eventId);
    const verifyResult = JSON.parse(Buffer.from(verifyBytes).toString());

    if (!verifyResult.verified) {
      throw new Error(`Event verification failed: ${verifyResult.reason}`);
    }

    const txId = verifyResult.txId;
    if (!txId) {
      throw new Error(`No transaction ID found for event: ${eventId}`);
    }

    // Step 2: Get the block containing this transaction
    const network = this.fabricService.getNetwork();
    const blockBytes = await this.getBlockByTxId(network, txId);
    const block = this.parseBlock(blockBytes);

    // Step 3: Extract all transaction hashes from the block and find our tx position
    const txHashes = this.extractTransactionHashes(block);
    const txHash = this.computeTxHash(block, txId);
    const txIndex = txHashes.findIndex((h) => h === txHash);

    if (txIndex === -1) {
      throw new Error(
        `Transaction ${txId} not found in block ${block.header.number}`,
      );
    }

    // Step 4: Compute Merkle proof from leaf to root
    const proofNodes = this.computeMerkleProof(txHashes, txIndex);

    // Step 5: Extract block hash and Merkle root from block header
    const blockHash = this.computeBlockHash(block.header);
    const merkleRoot = block.header.dataHash;

    // Verify the computed proof
    const verified = this.verifyProofInternal(txHash, proofNodes, merkleRoot);

    const proof: MerkleProof = {
      eventId,
      txId,
      blockNumber: block.header.number,
      blockHash,
      txHash,
      merkleRoot,
      proof: proofNodes,
      verified,
    };

    this.logger.log(
      `Merkle proof generated: event=${eventId}, block=${block.header.number}, ` +
        `proofDepth=${proofNodes.length}, verified=${verified}`,
    );

    return proof;
  }

  /**
   * Verify a previously generated Merkle proof.
   * Recomputes the root from the leaf hash and proof path,
   * then compares against the expected Merkle root from the block header.
   *
   * This is the O(1) verification path: O(log T) where T <= 100.
   */
  verifyMerkleProof(proof: MerkleProof): {
    verified: boolean;
    computedRoot: string;
    expectedRoot: string;
  } {
    const computedRoot = this.recomputeRoot(proof.txHash, proof.proof);
    const verified = computedRoot === proof.merkleRoot;

    this.logger.debug(
      `Merkle proof verification: computed=${computedRoot}, expected=${proof.merkleRoot}, match=${verified}`,
    );

    return {
      verified,
      computedRoot,
      expectedRoot: proof.merkleRoot,
    };
  }

  /**
   * Retrieve a block by transaction ID using the Fabric qscc system chaincode.
   * The qscc (Query System Chaincode) provides GetBlockByTxID which returns
   * the serialized block protobuf containing the specified transaction.
   */
  private async getBlockByTxId(
    network: ReturnType<typeof this.fabricService.getNetwork>,
    txId: string,
  ): Promise<Buffer> {
    // Use the qscc system chaincode to query blocks by transaction ID.
    // qscc.GetBlockByTxID(channelName, txId) returns the full block protobuf.
    const qscc = network.getContract('qscc');
    const channelName =
      process.env.FABRIC_CHANNEL || 'pariksha-channel';

    const blockBytes = await qscc.evaluateTransaction(
      'GetBlockByTxID',
      channelName,
      txId,
    );

    return Buffer.from(blockBytes);
  }

  /**
   * Parse a serialized Fabric block protobuf into a structured object.
   *
   * Fabric block structure:
   * Block {
   *   Header {
   *     number: uint64           — block sequence number
   *     previousHash: bytes      — hash of previous block header
   *     dataHash: bytes          — Merkle root of transactions in this block
   *   }
   *   Data {
   *     data: []bytes            — array of serialized envelopes (transactions)
   *   }
   *   Metadata {
   *     metadata: []bytes        — signatures, last config, transaction filter
   *   }
   * }
   *
   * The dataHash in the header is computed as the Merkle tree root of
   * SHA-256 hashes of each transaction envelope in Data.data[].
   */
  private parseBlock(blockBytes: Buffer): ParsedBlock {
    // Fabric blocks are protocol buffer encoded. We parse the raw protobuf
    // structure to extract the header fields and transaction envelopes.
    // The block protobuf schema: common.Block from fabric-protos.
    //
    // Field numbers in common.Block:
    //   1: header (common.BlockHeader)
    //   2: data   (common.BlockData)
    //   3: metadata (common.BlockMetadata)
    //
    // common.BlockHeader:
    //   1: number (uint64)
    //   2: previous_hash (bytes)
    //   3: data_hash (bytes)
    //
    // common.BlockData:
    //   1: data (repeated bytes) — each is a serialized Envelope

    let offset = 0;
    const header: ParsedBlockHeader = {
      number: 0,
      previousHash: '',
      dataHash: '',
    };
    const transactions: Buffer[] = [];
    let metadataRaw: Buffer = Buffer.alloc(0);

    // Parse top-level Block message
    while (offset < blockBytes.length) {
      const { fieldNumber, wireType, value, newOffset } = readProtobufField(
        blockBytes,
        offset,
      );
      offset = newOffset;

      if (fieldNumber === 1 && wireType === 2) {
        // BlockHeader (length-delimited)
        const headerBuf = value as Buffer;
        let hOffset = 0;
        while (hOffset < headerBuf.length) {
          const hField = readProtobufField(headerBuf, hOffset);
          hOffset = hField.newOffset;
          if (hField.fieldNumber === 1) {
            // number (varint)
            header.number = hField.value as number;
          } else if (hField.fieldNumber === 2 && hField.wireType === 2) {
            header.previousHash = (hField.value as Buffer).toString('hex');
          } else if (hField.fieldNumber === 3 && hField.wireType === 2) {
            header.dataHash = (hField.value as Buffer).toString('hex');
          }
        }
      } else if (fieldNumber === 2 && wireType === 2) {
        // BlockData (length-delimited)
        const dataBuf = value as Buffer;
        let dOffset = 0;
        while (dOffset < dataBuf.length) {
          const dField = readProtobufField(dataBuf, dOffset);
          dOffset = dField.newOffset;
          if (dField.fieldNumber === 1 && dField.wireType === 2) {
            // Each data[] entry is a serialized Envelope
            transactions.push(dField.value as Buffer);
          }
        }
      } else if (fieldNumber === 3 && wireType === 2) {
        metadataRaw = value as Buffer;
      }
    }

    return { header, transactions, metadataRaw };
  }

  /**
   * Extract SHA-256 hashes of each transaction envelope in the block.
   * These hashes form the leaves of the Merkle tree whose root is
   * stored in the block header's dataHash.
   */
  private extractTransactionHashes(block: ParsedBlock): string[] {
    return block.transactions.map((txEnvelope) => {
      return crypto.createHash('sha256').update(txEnvelope).digest('hex');
    });
  }

  /**
   * Compute the hash of a specific transaction by its txId.
   * We search through the block's transaction envelopes to find the one
   * matching the given txId by parsing the ChannelHeader from each envelope.
   */
  private computeTxHash(block: ParsedBlock, txId: string): string {
    for (const txEnvelope of block.transactions) {
      const extractedTxId = this.extractTxIdFromEnvelope(txEnvelope);
      if (extractedTxId === txId) {
        return crypto.createHash('sha256').update(txEnvelope).digest('hex');
      }
    }

    // Fallback: if we cannot parse the envelope, hash all and hope for position match
    // This should not happen in production
    throw new Error(`Transaction ${txId} envelope not found in block`);
  }

  /**
   * Extract the transaction ID from a serialized Envelope protobuf.
   *
   * Envelope structure:
   *   payload (bytes) → Payload {
   *     header (bytes) → Header {
   *       channel_header (bytes) → ChannelHeader {
   *         tx_id (string, field 5)
   *       }
   *     }
   *   }
   */
  private extractTxIdFromEnvelope(envelopeBytes: Buffer): string {
    let offset = 0;

    // Parse Envelope: field 1 = payload (bytes)
    while (offset < envelopeBytes.length) {
      const field = readProtobufField(envelopeBytes, offset);
      offset = field.newOffset;

      if (field.fieldNumber === 1 && field.wireType === 2) {
        // Payload
        const payloadBuf = field.value as Buffer;
        let pOffset = 0;

        while (pOffset < payloadBuf.length) {
          const pField = readProtobufField(payloadBuf, pOffset);
          pOffset = pField.newOffset;

          if (pField.fieldNumber === 1 && pField.wireType === 2) {
            // Header
            const headerBuf = pField.value as Buffer;
            let hOffset = 0;

            while (hOffset < headerBuf.length) {
              const hField = readProtobufField(headerBuf, hOffset);
              hOffset = hField.newOffset;

              if (hField.fieldNumber === 1 && hField.wireType === 2) {
                // ChannelHeader
                const chBuf = hField.value as Buffer;
                let chOffset = 0;

                while (chOffset < chBuf.length) {
                  const chField = readProtobufField(chBuf, chOffset);
                  chOffset = chField.newOffset;

                  if (chField.fieldNumber === 5 && chField.wireType === 2) {
                    // tx_id (string)
                    return (chField.value as Buffer).toString('utf8');
                  }
                }
              }
            }
          }
        }
      }
    }

    return '';
  }

  /**
   * Compute the Merkle proof for a leaf at the given index.
   *
   * Fabric uses a standard binary Merkle tree over transaction hashes:
   * - Leaves are SHA-256(envelope_bytes) for each transaction
   * - Internal nodes are SHA-256(left_child || right_child)
   * - If a level has an odd number of nodes, the last node is promoted as-is
   *
   * The proof consists of sibling hashes at each level, with position
   * indicators ("left" or "right") denoting where each sibling sits
   * relative to the path being verified.
   *
   * Complexity: O(log T) where T = number of transactions in the block.
   * With MaxMessageCount = 100, this is at most 7 levels deep.
   */
  private computeMerkleProof(
    leafHashes: string[],
    targetIndex: number,
  ): MerkleProofNode[] {
    if (leafHashes.length === 0) {
      return [];
    }

    if (leafHashes.length === 1) {
      // Single transaction block — no siblings needed, root = leaf
      return [];
    }

    const proof: MerkleProofNode[] = [];
    let currentLevel = [...leafHashes];
    let currentIndex = targetIndex;

    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];

      for (let i = 0; i < currentLevel.length; i += 2) {
        if (i + 1 < currentLevel.length) {
          // Pair exists: hash(left || right)
          const combined = crypto
            .createHash('sha256')
            .update(Buffer.from(currentLevel[i], 'hex'))
            .update(Buffer.from(currentLevel[i + 1], 'hex'))
            .digest('hex');
          nextLevel.push(combined);
        } else {
          // Odd node out: promoted to next level as-is
          nextLevel.push(currentLevel[i]);
        }
      }

      // Determine sibling for proof
      if (currentIndex % 2 === 0) {
        // Current node is on the left; sibling is on the right
        if (currentIndex + 1 < currentLevel.length) {
          proof.push({
            hash: currentLevel[currentIndex + 1],
            position: 'right',
          });
        }
        // If no sibling (odd node), no proof node needed at this level
      } else {
        // Current node is on the right; sibling is on the left
        proof.push({
          hash: currentLevel[currentIndex - 1],
          position: 'left',
        });
      }

      // Move to parent index
      currentIndex = Math.floor(currentIndex / 2);
      currentLevel = nextLevel;
    }

    return proof;
  }

  /**
   * Recompute the Merkle root from a leaf hash and proof path.
   * Walks up the tree applying each sibling hash in order.
   */
  private recomputeRoot(
    leafHash: string,
    proof: MerkleProofNode[],
  ): string {
    let currentHash = leafHash;

    for (const node of proof) {
      const leftBuf =
        node.position === 'left'
          ? Buffer.from(node.hash, 'hex')
          : Buffer.from(currentHash, 'hex');
      const rightBuf =
        node.position === 'left'
          ? Buffer.from(currentHash, 'hex')
          : Buffer.from(node.hash, 'hex');

      currentHash = crypto
        .createHash('sha256')
        .update(leftBuf)
        .update(rightBuf)
        .digest('hex');
    }

    return currentHash;
  }

  /**
   * Verify a proof internally (used during proof generation).
   */
  private verifyProofInternal(
    txHash: string,
    proof: MerkleProofNode[],
    expectedRoot: string,
  ): boolean {
    const computedRoot = this.recomputeRoot(txHash, proof);
    return computedRoot === expectedRoot;
  }

  /**
   * Compute the block hash from the block header.
   * Fabric computes block hash as SHA-256 of the ASN.1 DER encoding of
   * (number || previousHash || dataHash). For simplicity, we concatenate
   * the header fields and hash.
   */
  private computeBlockHash(header: ParsedBlockHeader): string {
    // Fabric computes the block hash by serializing the BlockHeader protobuf
    // and taking SHA-256. We reconstruct the protobuf bytes.
    const headerBytes = this.serializeBlockHeader(header);
    return crypto.createHash('sha256').update(headerBytes).digest('hex');
  }

  /**
   * Serialize a BlockHeader back to protobuf bytes for hash computation.
   * BlockHeader protobuf:
   *   field 1 (varint): number
   *   field 2 (bytes):  previous_hash
   *   field 3 (bytes):  data_hash
   */
  private serializeBlockHeader(header: ParsedBlockHeader): Buffer {
    const parts: Buffer[] = [];

    // Field 1: number (varint, field number 1, wire type 0)
    parts.push(encodeVarintField(1, header.number));

    // Field 2: previous_hash (bytes, field number 2, wire type 2)
    if (header.previousHash) {
      const prevHashBuf = Buffer.from(header.previousHash, 'hex');
      parts.push(encodeBytesField(2, prevHashBuf));
    }

    // Field 3: data_hash (bytes, field number 3, wire type 2)
    if (header.dataHash) {
      const dataHashBuf = Buffer.from(header.dataHash, 'hex');
      parts.push(encodeBytesField(3, dataHashBuf));
    }

    return Buffer.concat(parts);
  }
}

// ─── Parsed Block Types ──────────────────────────────────────────────────

interface ParsedBlockHeader {
  number: number;
  previousHash: string;
  dataHash: string;
}

interface ParsedBlock {
  header: ParsedBlockHeader;
  transactions: Buffer[];
  metadataRaw: Buffer;
}

// ─── Protobuf Wire Format Helpers ────────────────────────────────────────
// Minimal protobuf parser for Fabric block structures.
// Fabric uses proto2/proto3 encoding. We only need to handle:
//   Wire type 0: Varint (uint64, int32, etc.)
//   Wire type 2: Length-delimited (bytes, string, embedded messages)

interface ProtobufField {
  fieldNumber: number;
  wireType: number;
  value: number | Buffer;
  newOffset: number;
}

function readVarint(buf: Buffer, offset: number): { value: number; newOffset: number } {
  let result = 0;
  let shift = 0;
  let pos = offset;

  while (pos < buf.length) {
    const byte = buf[pos];
    result |= (byte & 0x7f) << shift;
    pos++;
    if ((byte & 0x80) === 0) {
      break;
    }
    shift += 7;
    if (shift > 63) {
      throw new Error('Varint too long');
    }
  }

  return { value: result >>> 0, newOffset: pos };
}

function readProtobufField(buf: Buffer, offset: number): ProtobufField {
  if (offset >= buf.length) {
    return { fieldNumber: 0, wireType: 0, value: 0, newOffset: buf.length };
  }

  const { value: tag, newOffset: tagEnd } = readVarint(buf, offset);
  const fieldNumber = tag >>> 3;
  const wireType = tag & 0x07;

  switch (wireType) {
    case 0: {
      // Varint
      const { value, newOffset } = readVarint(buf, tagEnd);
      return { fieldNumber, wireType, value, newOffset };
    }
    case 1: {
      // 64-bit fixed
      const value = buf.subarray(tagEnd, tagEnd + 8);
      return { fieldNumber, wireType, value, newOffset: tagEnd + 8 };
    }
    case 2: {
      // Length-delimited
      const { value: length, newOffset: lengthEnd } = readVarint(buf, tagEnd);
      const value = buf.subarray(lengthEnd, lengthEnd + length);
      return { fieldNumber, wireType, value, newOffset: lengthEnd + length };
    }
    case 5: {
      // 32-bit fixed
      const value = buf.subarray(tagEnd, tagEnd + 4);
      return { fieldNumber, wireType, value, newOffset: tagEnd + 4 };
    }
    default:
      throw new Error(`Unsupported wire type: ${wireType} at offset ${offset}`);
  }
}

function encodeVarint(value: number): Buffer {
  const bytes: number[] = [];
  let v = value >>> 0; // ensure unsigned
  while (v > 0x7f) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v & 0x7f);
  return Buffer.from(bytes);
}

function encodeVarintField(fieldNumber: number, value: number): Buffer {
  const tag = (fieldNumber << 3) | 0; // wire type 0 = varint
  return Buffer.concat([encodeVarint(tag), encodeVarint(value)]);
}

function encodeBytesField(fieldNumber: number, data: Buffer): Buffer {
  const tag = (fieldNumber << 3) | 2; // wire type 2 = length-delimited
  return Buffer.concat([encodeVarint(tag), encodeVarint(data.length), data]);
}
