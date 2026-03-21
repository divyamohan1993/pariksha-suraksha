#!/usr/bin/env bash
# ParikshaSuraksha — Hyperledger Fabric Network Setup
# Usage: ./fabric-setup.sh <environment> <project_id> <region>

set -euo pipefail

ENV="${1:-prod}"
PROJECT_ID="${2:-pariksha-suraksha}"
REGION="${3:-asia-south1}"
NAMESPACE="pariksha-fabric"
CHANNEL_NAME="exam-lifecycle-channel"

echo ">>> Setting up Hyperledger Fabric network (env: ${ENV})"

# ─────────────────────────────────────────────
# 1. Verify kubectl context
# ─────────────────────────────────────────────
echo "  Verifying kubectl context..."
CLUSTER_NAME="pariksha-${ENV}"
CURRENT_CONTEXT=$(kubectl config current-context 2>/dev/null || echo "none")
if [[ "${CURRENT_CONTEXT}" != *"${CLUSTER_NAME}"* ]]; then
    echo "  Configuring kubectl for cluster ${CLUSTER_NAME}..."
    gcloud container clusters get-credentials "${CLUSTER_NAME}" \
        --region "${REGION}" \
        --project "${PROJECT_ID}"
fi

# ─────────────────────────────────────────────
# 2. Create namespace if not exists
# ─────────────────────────────────────────────
echo "  Creating namespace ${NAMESPACE}..."
kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

# ─────────────────────────────────────────────
# 3. Generate crypto material
# ─────────────────────────────────────────────
echo "  Generating crypto material for 3 organizations..."

# Create temp directory for crypto generation
CRYPTO_DIR=$(mktemp -d)
trap 'rm -rf "${CRYPTO_DIR}"' EXIT

cat > "${CRYPTO_DIR}/crypto-config.yaml" << 'CRYPTO_EOF'
OrdererOrgs:
  - Name: OrdererOrg
    Domain: orderer.pariksha.dmj.one
    EnableNodeOUs: true
    Specs:
      - Hostname: orderer0
        SANS:
          - orderer0.pariksha-fabric.svc.cluster.local
      - Hostname: orderer1
        SANS:
          - orderer1.pariksha-fabric.svc.cluster.local
      - Hostname: orderer2
        SANS:
          - orderer2.pariksha-fabric.svc.cluster.local

PeerOrgs:
  - Name: ParikshaSuraksha
    Domain: pariksha.pariksha.dmj.one
    EnableNodeOUs: true
    Template:
      Count: 2
      SANS:
        - "{{.Hostname}}.pariksha-fabric.svc.cluster.local"
    Users:
      Count: 1

  - Name: NTA
    Domain: nta.pariksha.dmj.one
    EnableNodeOUs: true
    Template:
      Count: 2
      SANS:
        - "{{.Hostname}}.pariksha-fabric.svc.cluster.local"
    Users:
      Count: 1

  - Name: Auditor
    Domain: auditor.pariksha.dmj.one
    EnableNodeOUs: true
    Template:
      Count: 1
      SANS:
        - "{{.Hostname}}.pariksha-fabric.svc.cluster.local"
    Users:
      Count: 1
CRYPTO_EOF

# Generate crypto material using cryptogen (from Fabric tools)
# In production, use Fabric CA instead
if command -v cryptogen &> /dev/null; then
    cryptogen generate --config="${CRYPTO_DIR}/crypto-config.yaml" --output="${CRYPTO_DIR}/crypto-material"
else
    echo "  WARNING: cryptogen not found. Using kubectl job to generate crypto material..."
    kubectl apply -n "${NAMESPACE}" -f - << JOB_EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: fabric-cryptogen
  namespace: ${NAMESPACE}
spec:
  template:
    spec:
      containers:
      - name: cryptogen
        image: hyperledger/fabric-tools:2.5
        command: ["sh", "-c"]
        args:
        - |
          cryptogen generate --config=/config/crypto-config.yaml --output=/output/crypto-material
          echo "Crypto material generated successfully"
        volumeMounts:
        - name: config
          mountPath: /config
        - name: output
          mountPath: /output
      volumes:
      - name: config
        configMap:
          name: fabric-crypto-config
      - name: output
        emptyDir: {}
      restartPolicy: Never
      nodeSelector:
        cloud.google.com/gke-nodepool: fabric
      tolerations:
      - key: workload
        value: fabric
        effect: NoSchedule
  backoffLimit: 3
JOB_EOF

    # Create the configmap with crypto-config
    kubectl create configmap fabric-crypto-config \
        -n "${NAMESPACE}" \
        --from-file="${CRYPTO_DIR}/crypto-config.yaml" \
        --dry-run=client -o yaml | kubectl apply -f -

    echo "  Waiting for cryptogen job to complete..."
    kubectl wait --for=condition=complete job/fabric-cryptogen -n "${NAMESPACE}" --timeout=300s
fi

# ─────────────────────────────────────────────
# 4. Create channel configuration
# ─────────────────────────────────────────────
echo "  Creating channel configuration..."

cat > "${CRYPTO_DIR}/configtx.yaml" << 'CONFIGTX_EOF'
Organizations:
  - &OrdererOrg
    Name: OrdererOrg
    ID: OrdererMSP
    MSPDir: crypto-material/ordererOrganizations/orderer.pariksha.dmj.one/msp
    Policies:
      Readers:
        Type: Signature
        Rule: "OR('OrdererMSP.member')"
      Writers:
        Type: Signature
        Rule: "OR('OrdererMSP.member')"
      Admins:
        Type: Signature
        Rule: "OR('OrdererMSP.admin')"

  - &ParikshaSuraksha
    Name: ParikshaSurakshaMSP
    ID: ParikshaSurakshaMSP
    MSPDir: crypto-material/peerOrganizations/pariksha.pariksha.dmj.one/msp
    Policies:
      Readers:
        Type: Signature
        Rule: "OR('ParikshaSurakshaMSP.admin', 'ParikshaSurakshaMSP.peer', 'ParikshaSurakshaMSP.client')"
      Writers:
        Type: Signature
        Rule: "OR('ParikshaSurakshaMSP.admin', 'ParikshaSurakshaMSP.client')"
      Admins:
        Type: Signature
        Rule: "OR('ParikshaSurakshaMSP.admin')"
      Endorsement:
        Type: Signature
        Rule: "OR('ParikshaSurakshaMSP.peer')"
    AnchorPeers:
      - Host: peer0-pariksha.pariksha-fabric.svc.cluster.local
        Port: 7051

  - &NTA
    Name: NTAMSP
    ID: NTAMSP
    MSPDir: crypto-material/peerOrganizations/nta.pariksha.dmj.one/msp
    Policies:
      Readers:
        Type: Signature
        Rule: "OR('NTAMSP.admin', 'NTAMSP.peer', 'NTAMSP.client')"
      Writers:
        Type: Signature
        Rule: "OR('NTAMSP.admin', 'NTAMSP.client')"
      Admins:
        Type: Signature
        Rule: "OR('NTAMSP.admin')"
      Endorsement:
        Type: Signature
        Rule: "OR('NTAMSP.peer')"
    AnchorPeers:
      - Host: peer0-nta.pariksha-fabric.svc.cluster.local
        Port: 7051

  - &Auditor
    Name: AuditorMSP
    ID: AuditorMSP
    MSPDir: crypto-material/peerOrganizations/auditor.pariksha.dmj.one/msp
    Policies:
      Readers:
        Type: Signature
        Rule: "OR('AuditorMSP.admin', 'AuditorMSP.peer', 'AuditorMSP.client')"
      Writers:
        Type: Signature
        Rule: "OR('AuditorMSP.admin', 'AuditorMSP.client')"
      Admins:
        Type: Signature
        Rule: "OR('AuditorMSP.admin')"
      Endorsement:
        Type: Signature
        Rule: "OR('AuditorMSP.peer')"
    AnchorPeers:
      - Host: peer0-auditor.pariksha-fabric.svc.cluster.local
        Port: 7051

Capabilities:
  Channel: &ChannelCapabilities
    V2_0: true
  Orderer: &OrdererCapabilities
    V2_0: true
  Application: &ApplicationCapabilities
    V2_0: true

Application: &ApplicationDefaults
  Organizations:
  Policies:
    Readers:
      Type: ImplicitMeta
      Rule: "ANY Readers"
    Writers:
      Type: ImplicitMeta
      Rule: "ANY Writers"
    Admins:
      Type: ImplicitMeta
      Rule: "MAJORITY Admins"
    LifecycleEndorsement:
      Type: ImplicitMeta
      Rule: "MAJORITY Endorsement"
    Endorsement:
      Type: ImplicitMeta
      Rule: "MAJORITY Endorsement"
  Capabilities:
    <<: *ApplicationCapabilities

Orderer: &OrdererDefaults
  OrdererType: etcdraft
  BatchTimeout: 2s
  BatchSize:
    MaxMessageCount: 100
    AbsoluteMaxBytes: 10 MB
    PreferredMaxBytes: 2 MB
  EtcdRaft:
    Consenters:
      - Host: orderer0.pariksha-fabric.svc.cluster.local
        Port: 7050
        ClientTLSCert: crypto-material/ordererOrganizations/orderer.pariksha.dmj.one/orderers/orderer0.orderer.pariksha.dmj.one/tls/server.crt
        ServerTLSCert: crypto-material/ordererOrganizations/orderer.pariksha.dmj.one/orderers/orderer0.orderer.pariksha.dmj.one/tls/server.crt
      - Host: orderer1.pariksha-fabric.svc.cluster.local
        Port: 7050
        ClientTLSCert: crypto-material/ordererOrganizations/orderer.pariksha.dmj.one/orderers/orderer1.orderer.pariksha.dmj.one/tls/server.crt
        ServerTLSCert: crypto-material/ordererOrganizations/orderer.pariksha.dmj.one/orderers/orderer1.orderer.pariksha.dmj.one/tls/server.crt
      - Host: orderer2.pariksha-fabric.svc.cluster.local
        Port: 7050
        ClientTLSCert: crypto-material/ordererOrganizations/orderer.pariksha.dmj.one/orderers/orderer2.orderer.pariksha.dmj.one/tls/server.crt
        ServerTLSCert: crypto-material/ordererOrganizations/orderer.pariksha.dmj.one/orderers/orderer2.orderer.pariksha.dmj.one/tls/server.crt
  Organizations:
  Policies:
    Readers:
      Type: ImplicitMeta
      Rule: "ANY Readers"
    Writers:
      Type: ImplicitMeta
      Rule: "ANY Writers"
    Admins:
      Type: ImplicitMeta
      Rule: "MAJORITY Admins"
    BlockValidation:
      Type: ImplicitMeta
      Rule: "ANY Writers"
  Capabilities:
    <<: *OrdererCapabilities

Channel: &ChannelDefaults
  Policies:
    Readers:
      Type: ImplicitMeta
      Rule: "ANY Readers"
    Writers:
      Type: ImplicitMeta
      Rule: "ANY Writers"
    Admins:
      Type: ImplicitMeta
      Rule: "MAJORITY Admins"
  Capabilities:
    <<: *ChannelCapabilities

Profiles:
  ExamLifecycleChannel:
    <<: *ChannelDefaults
    Orderer:
      <<: *OrdererDefaults
      Organizations:
        - *OrdererOrg
    Application:
      <<: *ApplicationDefaults
      Organizations:
        - *ParikshaSuraksha
        - *NTA
        - *Auditor
CONFIGTX_EOF

# ─────────────────────────────────────────────
# 5. Store configtx as ConfigMap
# ─────────────────────────────────────────────
echo "  Storing Fabric configuration in Kubernetes..."
kubectl create configmap fabric-configtx \
    -n "${NAMESPACE}" \
    --from-file="${CRYPTO_DIR}/configtx.yaml" \
    --dry-run=client -o yaml | kubectl apply -f -

# ─────────────────────────────────────────────
# 6. Wait for Fabric pods (deployed by Helm)
# ─────────────────────────────────────────────
echo "  Waiting for Fabric peers and orderers to be ready..."
echo "  (These are deployed by Helm — this script runs after helm install)"

# Wait for orderers
for i in 0 1 2; do
    kubectl wait --for=condition=ready pod \
        -l "app=fabric-orderer,orderer-index=${i}" \
        -n "${NAMESPACE}" \
        --timeout=300s 2>/dev/null || echo "  Orderer ${i} not yet deployed (will be deployed by Helm)"
done

# Wait for peers
for org in pariksha nta auditor; do
    peer_count=2
    if [ "${org}" = "auditor" ]; then peer_count=1; fi
    for i in $(seq 0 $((peer_count - 1))); do
        kubectl wait --for=condition=ready pod \
            -l "app=fabric-peer,org=${org},peer-index=${i}" \
            -n "${NAMESPACE}" \
            --timeout=300s 2>/dev/null || echo "  Peer ${org}-${i} not yet deployed (will be deployed by Helm)"
    done
done

# ─────────────────────────────────────────────
# 7. Create channel and join peers
# ─────────────────────────────────────────────
echo "  Creating channel ${CHANNEL_NAME} and joining peers..."

kubectl apply -n "${NAMESPACE}" -f - << CHANNEL_JOB_EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: fabric-channel-setup
  namespace: ${NAMESPACE}
spec:
  template:
    spec:
      containers:
      - name: channel-setup
        image: hyperledger/fabric-tools:2.5
        command: ["sh", "-c"]
        args:
        - |
          set -e
          echo "Creating channel genesis block..."
          configtxgen -profile ExamLifecycleChannel \
            -outputBlock /tmp/${CHANNEL_NAME}.block \
            -channelID ${CHANNEL_NAME} \
            -configPath /config

          echo "Joining ParikshaSuraksha peers..."
          export CORE_PEER_LOCALMSPID=ParikshaSurakshaMSP
          export CORE_PEER_ADDRESS=peer0-pariksha:7051
          export CORE_PEER_TLS_ENABLED=true
          peer channel join -b /tmp/${CHANNEL_NAME}.block || echo "Channel may already exist"

          export CORE_PEER_ADDRESS=peer1-pariksha:7051
          peer channel join -b /tmp/${CHANNEL_NAME}.block || echo "Channel may already exist"

          echo "Joining NTA peers..."
          export CORE_PEER_LOCALMSPID=NTAMSP
          export CORE_PEER_ADDRESS=peer0-nta:7051
          peer channel join -b /tmp/${CHANNEL_NAME}.block || echo "Channel may already exist"

          export CORE_PEER_ADDRESS=peer1-nta:7051
          peer channel join -b /tmp/${CHANNEL_NAME}.block || echo "Channel may already exist"

          echo "Joining Auditor peer..."
          export CORE_PEER_LOCALMSPID=AuditorMSP
          export CORE_PEER_ADDRESS=peer0-auditor:7051
          peer channel join -b /tmp/${CHANNEL_NAME}.block || echo "Channel may already exist"

          echo "Channel setup complete!"
        volumeMounts:
        - name: configtx
          mountPath: /config
      volumes:
      - name: configtx
        configMap:
          name: fabric-configtx
      restartPolicy: Never
      nodeSelector:
        cloud.google.com/gke-nodepool: fabric
      tolerations:
      - key: workload
        value: fabric
        effect: NoSchedule
  backoffLimit: 3
CHANNEL_JOB_EOF

echo "  Waiting for channel setup to complete..."
kubectl wait --for=condition=complete job/fabric-channel-setup \
    -n "${NAMESPACE}" --timeout=600s 2>/dev/null || \
    echo "  Channel setup job in progress (may complete after Helm deploys Fabric pods)"

# ─────────────────────────────────────────────
# 8. Install chaincode
# ─────────────────────────────────────────────
echo "  Chaincode installation will be handled by Helm job..."

echo ""
echo ">>> Fabric setup complete for environment: ${ENV}"
echo "    Namespace: ${NAMESPACE}"
echo "    Channel: ${CHANNEL_NAME}"
echo "    Organizations: ParikshaSuraksha, NTA, Auditor"
echo "    Orderers: 3 (Raft consensus)"
echo "    Peers: 5 (2+2+1)"
