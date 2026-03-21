"use client";

import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { auditApi, type MerkleProof } from "@/lib/api";
import { truncateHash, formatDateTime } from "@/lib/utils";
import { Shield, ShieldCheck, ShieldX, ChevronRight, Hash, Loader2 } from "lucide-react";

interface BlockchainVerifierProps {
  eventId?: string;
  className?: string;
}

export function BlockchainVerifier({ eventId: initialEventId, className }: BlockchainVerifierProps) {
  const [eventId, setEventId] = useState(initialEventId || "");
  const [submittedId, setSubmittedId] = useState(initialEventId || "");

  const proofQuery = useQuery({
    queryKey: ["merkle-proof", submittedId],
    queryFn: () => auditApi.getMerkleProof(submittedId),
    enabled: !!submittedId,
  });

  const verifyMutation = useMutation({
    mutationFn: (id: string) => auditApi.verifyEvent(id),
  });

  const handleVerify = () => {
    setSubmittedId(eventId);
    if (eventId) {
      verifyMutation.mutate(eventId);
    }
  };

  const proof = proofQuery.data;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Blockchain Verification
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Enter Event ID..."
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="font-mono text-sm"
          />
          <Button
            onClick={handleVerify}
            disabled={!eventId || proofQuery.isLoading}
          >
            {proofQuery.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Verify"
            )}
          </Button>
        </div>

        {verifyMutation.data && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
            {verifyMutation.data.verified ? (
              <>
                <ShieldCheck className="h-5 w-5 text-green-600" />
                <span className="font-semibold text-green-600">Event Verified</span>
                <Badge variant="success">Integrity Confirmed</Badge>
              </>
            ) : (
              <>
                <ShieldX className="h-5 w-5 text-red-600" />
                <span className="font-semibold text-red-600">Verification Failed</span>
                <Badge variant="destructive">Integrity Compromised</Badge>
              </>
            )}
          </div>
        )}

        {proof && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Transaction ID</span>
                <div className="font-mono font-semibold">{truncateHash(proof.txId, 12)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Block Number</span>
                <div className="font-semibold">{proof.blockNumber}</div>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Block Hash</span>
                <div className="font-mono text-xs break-all">{proof.blockHash}</div>
              </div>
            </div>

            {proof.merkleProof.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Merkle Proof Path</h4>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <Hash className="h-4 w-4 text-primary" />
                    <span className="font-mono text-xs bg-primary/10 px-2 py-1 rounded">
                      {truncateHash(proof.txId, 16)}
                    </span>
                    <span className="text-muted-foreground text-xs">(Transaction)</span>
                  </div>
                  {proof.merkleProof.map((hash, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm pl-4">
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      <Hash className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
                        {truncateHash(hash, 16)}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        (Level {index + 1} sibling)
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 text-sm pl-4">
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    <Hash className="h-4 w-4 text-green-600" />
                    <span className="font-mono text-xs bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded">
                      {truncateHash(proof.blockHash, 16)}
                    </span>
                    <span className="text-muted-foreground text-xs">(Block Root)</span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              {proof.verified ? (
                <Badge variant="success" className="gap-1">
                  <ShieldCheck className="h-3 w-3" /> Proof Valid
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1">
                  <ShieldX className="h-3 w-3" /> Proof Invalid
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
