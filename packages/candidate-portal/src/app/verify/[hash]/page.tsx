"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Shield,
  Search,
  ChevronDown,
  ChevronUp,
  Hash,
  ArrowLeft,
} from "lucide-react";
import { cn, truncateHash, formatDateTime } from "@/lib/utils";
import {
  verifySubmission,
  getMerkleProof,
  type VerifyResponse,
  type MerkleProofResponse,
} from "@/lib/api";
import VerificationBadge from "@/components/VerificationBadge";
import AccessibilityToolbar from "@/components/AccessibilityToolbar";

export default function VerifyPage() {
  const params = useParams();
  const router = useRouter();
  const hashParam = params.hash as string;
  const isManualEntry = hashParam === "check";

  const [hashInput, setHashInput] = useState(isManualEntry ? "" : hashParam);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);
  const [merkleProof, setMerkleProof] = useState<MerkleProofResponse | null>(null);
  const [showMerkleProof, setShowMerkleProof] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingProof, setIsLoadingProof] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = useCallback(
    async (hash?: string) => {
      const targetHash = hash || hashInput.trim();
      if (!targetHash) {
        setError("Please enter a submission hash.");
        return;
      }

      setIsLoading(true);
      setError(null);
      setVerifyResult(null);
      setMerkleProof(null);
      setShowMerkleProof(false);

      try {
        const result = await verifySubmission(targetHash);
        setVerifyResult(result);
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Verification request failed. Please try again.");
        }
      } finally {
        setIsLoading(false);
      }
    },
    [hashInput]
  );

  // Auto-verify if hash is in URL
  useEffect(() => {
    if (!isManualEntry && hashParam) {
      handleVerify(hashParam);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoadMerkleProof = useCallback(async () => {
    if (!verifyResult?.blockchainEventId) return;

    if (showMerkleProof && merkleProof) {
      setShowMerkleProof(false);
      return;
    }

    setIsLoadingProof(true);
    try {
      const proof = await getMerkleProof(verifyResult.blockchainEventId);
      setMerkleProof(proof);
      setShowMerkleProof(true);
    } catch (err) {
      setError("Failed to load Merkle proof. Please try again.");
    } finally {
      setIsLoadingProof(false);
    }
  }, [verifyResult, showMerkleProof, merkleProof]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-pariksha-50 to-white">
      <AccessibilityToolbar />

      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => router.push("/")}
            className="p-2 rounded-md hover:bg-muted transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Go back to home page"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-pariksha-600" aria-hidden="true" />
            <span className="font-bold text-pariksha-900">ParikshaSuraksha</span>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground">
            Verify Your Submission
          </h1>
          <p className="mt-2 text-muted-foreground">
            Enter the submission hash you received after completing your exam to
            verify it was recorded on the blockchain.
          </p>
        </div>

        {/* Search form */}
        <div className="bg-card rounded-xl border shadow-sm p-6 mb-6">
          <label htmlFor="hash-input" className="block text-sm font-medium text-card-foreground mb-2">
            Submission Hash
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <input
                id="hash-input"
                type="text"
                value={hashInput}
                onChange={(e) => setHashInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                placeholder="Enter SHA-256 submission hash"
                className="w-full pl-10 pr-4 py-3 rounded-lg border bg-background text-foreground font-mono text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-describedby="hash-help"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <button
              onClick={() => handleVerify()}
              disabled={isLoading || !hashInput.trim()}
              className={cn(
                "flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isLoading || !hashInput.trim()
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-pariksha-600 text-white hover:bg-pariksha-700"
              )}
              aria-label={isLoading ? "Verifying..." : "Verify submission"}
            >
              {isLoading ? (
                <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" aria-hidden="true" />
              ) : (
                <Search className="h-4 w-4" aria-hidden="true" />
              )}
              Verify
            </button>
          </div>
          <p id="hash-help" className="mt-2 text-xs text-muted-foreground">
            The hash was provided to you on the submission confirmation screen after your exam.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div
            className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
            role="alert"
          >
            {error}
          </div>
        )}

        {/* Verification result */}
        {verifyResult && (
          <div className="space-y-4">
            <VerificationBadge
              verified={verifyResult.verified}
              hash={verifyResult.submissionHash}
              timestamp={verifyResult.timestamp}
              eventId={verifyResult.blockchainEventId}
              size="lg"
            />

            {/* Merkle Proof expandable section */}
            {verifyResult.verified && verifyResult.blockchainEventId && (
              <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
                <button
                  onClick={handleLoadMerkleProof}
                  className="w-full flex items-center justify-between px-6 py-4 text-sm font-medium text-card-foreground hover:bg-muted/50 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  aria-expanded={showMerkleProof}
                  aria-controls="merkle-proof-section"
                >
                  <span>View Merkle Proof</span>
                  {isLoadingProof ? (
                    <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" aria-hidden="true" />
                  ) : showMerkleProof ? (
                    <ChevronUp className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>

                {showMerkleProof && merkleProof && (
                  <div id="merkle-proof-section" className="px-6 pb-6 space-y-4 border-t">
                    <div className="pt-4 space-y-3">
                      <DetailRow label="Transaction ID" value={merkleProof.txId} mono />
                      <DetailRow label="Block Number" value={String(merkleProof.blockNumber)} />
                      <DetailRow label="Block Hash" value={merkleProof.blockHash} mono />
                      <DetailRow
                        label="Proof Verified"
                        value={merkleProof.verified ? "Yes" : "No"}
                        highlight={merkleProof.verified}
                      />

                      {/* Merkle proof path */}
                      <div>
                        <p className="text-sm font-medium text-card-foreground mb-2">
                          Merkle Proof Path ({merkleProof.merkleProof.length} nodes)
                        </p>
                        <div className="space-y-1">
                          {merkleProof.merkleProof.map((hash, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-2 text-xs font-mono text-muted-foreground bg-muted/50 px-3 py-2 rounded"
                            >
                              <span className="text-pariksha-600 font-bold flex-shrink-0">
                                [{idx}]
                              </span>
                              <span className="break-all">{hash}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
                        This Merkle proof demonstrates that your submission transaction is
                        included in the blockchain block. Each node in the proof path is a
                        sibling hash in the Merkle tree. You can independently verify this
                        proof by computing the root hash from your transaction hash and these
                        sibling nodes.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
      <span className="text-sm font-medium text-muted-foreground sm:w-32 flex-shrink-0">
        {label}
      </span>
      <span
        className={cn(
          "text-sm break-all",
          mono && "font-mono",
          highlight === true && "text-green-600 font-bold",
          highlight === false && "text-red-600 font-bold",
          highlight === undefined && "text-card-foreground"
        )}
      >
        {value}
      </span>
    </div>
  );
}
