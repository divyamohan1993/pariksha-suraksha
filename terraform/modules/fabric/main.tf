###############################################################################
# Fabric Module — GKE Namespace, ConfigMaps, PVCs for Hyperledger Fabric
# Note: Fabric StatefulSets are managed by Helm; this module creates the
# namespace, configuration, and persistent volume claims.
###############################################################################

# -----------------------------------------------------------------------------
# Namespace
# -----------------------------------------------------------------------------
resource "kubernetes_namespace" "fabric" {
  metadata {
    name = "pariksha-fabric"
    labels = merge(var.labels, {
      component = "fabric"
    })
  }
}

# -----------------------------------------------------------------------------
# ConfigMap: Fabric Crypto Config
# -----------------------------------------------------------------------------
resource "kubernetes_config_map" "crypto_config" {
  metadata {
    name      = "fabric-crypto-config"
    namespace = kubernetes_namespace.fabric.metadata[0].name
    labels    = var.labels
  }

  data = {
    "crypto-config.yaml" = yamlencode({
      OrdererOrgs = [
        {
          Name   = "OrdererOrg"
          Domain = "orderer.pariksha.dmj.one"
          Specs = [
            { Hostname = "orderer0" },
            { Hostname = "orderer1" },
            { Hostname = "orderer2" },
          ]
        }
      ]
      PeerOrgs = [
        {
          Name   = "ParikshaSurakshaOrg"
          Domain = "pariksha-suraksha.pariksha.dmj.one"
          Template = {
            Count = 2
          }
          Users = {
            Count = 1
          }
        },
        {
          Name   = "NTAOrg"
          Domain = "nta.pariksha.dmj.one"
          Template = {
            Count = 2
          }
          Users = {
            Count = 1
          }
        },
        {
          Name   = "AuditorOrg"
          Domain = "auditor.pariksha.dmj.one"
          Template = {
            Count = 1
          }
          Users = {
            Count = 1
          }
        }
      ]
    })
  }
}

# -----------------------------------------------------------------------------
# ConfigMap: Fabric Channel Configuration (configtx)
# -----------------------------------------------------------------------------
resource "kubernetes_config_map" "configtx" {
  metadata {
    name      = "fabric-configtx"
    namespace = kubernetes_namespace.fabric.metadata[0].name
    labels    = var.labels
  }

  data = {
    "configtx.yaml" = yamlencode({
      Organizations = [
        {
          Name   = "OrdererOrg"
          ID     = "OrdererMSP"
          MSPDir = "/etc/hyperledger/fabric/msp/orderer"
        },
        {
          Name   = "ParikshaSurakshaOrg"
          ID     = "ParikshaSurakshaMSP"
          MSPDir = "/etc/hyperledger/fabric/msp/pariksha-suraksha"
          AnchorPeers = [
            { Host = "peer0-pariksha-suraksha", Port = 7051 }
          ]
        },
        {
          Name   = "NTAOrg"
          ID     = "NTAMSP"
          MSPDir = "/etc/hyperledger/fabric/msp/nta"
          AnchorPeers = [
            { Host = "peer0-nta", Port = 7051 }
          ]
        },
        {
          Name   = "AuditorOrg"
          ID     = "AuditorMSP"
          MSPDir = "/etc/hyperledger/fabric/msp/auditor"
          AnchorPeers = [
            { Host = "peer0-auditor", Port = 7051 }
          ]
        }
      ]
      Orderer = {
        OrdererType  = "etcdraft"
        BatchTimeout = "2s"
        BatchSize = {
          MaxMessageCount   = 100
          AbsoluteMaxBytes  = "10 MB"
          PreferredMaxBytes = "2 MB"
        }
        EtcdRaft = {
          Consenters = [
            { Host = "orderer0", Port = 7050, ClientTLSCert = "/etc/hyperledger/fabric/tls/orderer0-client.crt", ServerTLSCert = "/etc/hyperledger/fabric/tls/orderer0-server.crt" },
            { Host = "orderer1", Port = 7050, ClientTLSCert = "/etc/hyperledger/fabric/tls/orderer1-client.crt", ServerTLSCert = "/etc/hyperledger/fabric/tls/orderer1-server.crt" },
            { Host = "orderer2", Port = 7050, ClientTLSCert = "/etc/hyperledger/fabric/tls/orderer2-client.crt", ServerTLSCert = "/etc/hyperledger/fabric/tls/orderer2-server.crt" },
          ]
        }
      }
      Channel = {
        Policies = {
          Readers = {
            Type = "ImplicitMeta"
            Rule = "ANY Readers"
          }
          Writers = {
            Type = "ImplicitMeta"
            Rule = "ANY Writers"
          }
          Admins = {
            Type = "ImplicitMeta"
            Rule = "MAJORITY Admins"
          }
        }
      }
      Profiles = {
        ExamLifecycleChannel = {
          Consortium  = "ParikshaSurakshaConsortium"
          Application = {
            Organizations = ["ParikshaSurakshaOrg", "NTAOrg", "AuditorOrg"]
          }
        }
      }
    })
  }
}

# -----------------------------------------------------------------------------
# Persistent Volume Claims for Fabric Peers
# -----------------------------------------------------------------------------
locals {
  fabric_pvcs = {
    "peer0-pariksha-suraksha" = "10Gi"
    "peer1-pariksha-suraksha" = "10Gi"
    "peer0-nta"               = "10Gi"
    "peer1-nta"               = "10Gi"
    "peer0-auditor"           = "10Gi"
    "orderer0"                = "5Gi"
    "orderer1"                = "5Gi"
    "orderer2"                = "5Gi"
    "ca-pariksha-suraksha"    = "1Gi"
    "ca-nta"                  = "1Gi"
    "ca-auditor"              = "1Gi"
  }
}

resource "kubernetes_persistent_volume_claim" "fabric" {
  for_each = local.fabric_pvcs

  metadata {
    name      = "${each.key}-data"
    namespace = kubernetes_namespace.fabric.metadata[0].name
    labels = merge(var.labels, {
      component = each.key
    })
  }

  spec {
    access_modes = ["ReadWriteOnce"]
    resources {
      requests = {
        storage = each.value
      }
    }
    storage_class_name = "premium-rwo"
  }
}
