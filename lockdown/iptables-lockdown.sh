#!/usr/bin/env bash
# =============================================================================
# ParikshaSuraksha -- iptables Network Lockdown for Exam Kiosk Machines
# =============================================================================
# This script configures the firewall on each kiosk machine to ONLY allow
# traffic to the exam server. All other traffic (internet, other LAN devices)
# is blocked and logged.
#
# Usage:
#   sudo ./iptables-lockdown.sh <EXAM_SERVER_IP>
#   sudo ./iptables-lockdown.sh 192.168.1.1
#
# This script MUST be run as root.
#
# Defense-in-depth: Even if a candidate bypasses Chromium's URL restrictions,
# the iptables rules prevent any network communication to anything other than
# the exam server. This is a kernel-level enforcement that cannot be bypassed
# from userspace without root privileges.
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Color output helpers
# -----------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# -----------------------------------------------------------------------------
# Preflight checks
# -----------------------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
    log_error "This script must be run as root."
    exit 1
fi

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <EXAM_SERVER_IP>"
    echo "Example: $0 192.168.1.1"
    exit 1
fi

EXAM_SERVER_IP="$1"

# Validate IP address format
if ! echo "${EXAM_SERVER_IP}" | grep -qE '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$'; then
    log_error "Invalid IP address format: ${EXAM_SERVER_IP}"
    exit 1
fi

log_info "Exam server IP: ${EXAM_SERVER_IP}"
log_info "Applying iptables lockdown rules..."

# -----------------------------------------------------------------------------
# Flush existing rules -- start from a clean slate
# -----------------------------------------------------------------------------
log_info "Flushing existing iptables rules..."

iptables -F
iptables -X
iptables -Z
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X
iptables -t raw -F
iptables -t raw -X

# Also flush ip6tables (block all IPv6)
ip6tables -F
ip6tables -X
ip6tables -Z

# -----------------------------------------------------------------------------
# Set default policies -- DROP everything by default
# -----------------------------------------------------------------------------
log_info "Setting default policies to DROP..."

iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

# Block ALL IPv6 traffic (exam network is IPv4 only)
ip6tables -P INPUT DROP
ip6tables -P FORWARD DROP
ip6tables -P OUTPUT DROP

# -----------------------------------------------------------------------------
# Allow loopback traffic (required for local services)
# -----------------------------------------------------------------------------
log_info "Allowing loopback traffic..."

iptables -A INPUT  -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# -----------------------------------------------------------------------------
# Allow established and related connections (stateful firewall)
# -----------------------------------------------------------------------------
log_info "Allowing established/related connections..."

iptables -A INPUT  -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# -----------------------------------------------------------------------------
# Allow DHCP (required for IP address assignment)
# -----------------------------------------------------------------------------
# DHCP uses UDP ports 67 (server) and 68 (client)
# DHCP discovery is broadcast-based, so we must allow it before the machine
# has an IP address.
# -----------------------------------------------------------------------------
log_info "Allowing DHCP traffic..."

# Outbound DHCP request (client -> server)
iptables -A OUTPUT -p udp --dport 67 --sport 68 -j ACCEPT

# Inbound DHCP response (server -> client)
iptables -A INPUT -p udp --dport 68 --sport 67 -j ACCEPT

# -----------------------------------------------------------------------------
# Allow DNS ONLY to the exam server
# -----------------------------------------------------------------------------
# The exam server runs dnsmasq as the local DNS resolver.
# Block DNS to any other server (prevents DNS tunneling).
# -----------------------------------------------------------------------------
log_info "Allowing DNS to exam server only..."

# Outbound DNS to exam server
iptables -A OUTPUT -p udp -d "${EXAM_SERVER_IP}" --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp -d "${EXAM_SERVER_IP}" --dport 53 -j ACCEPT

# Block and log DNS to any other destination
iptables -A OUTPUT -p udp --dport 53 -j LOG --log-prefix "PARIKSHA_BLOCKED_DNS: " --log-level 4
iptables -A OUTPUT -p udp --dport 53 -j DROP
iptables -A OUTPUT -p tcp --dport 53 -j LOG --log-prefix "PARIKSHA_BLOCKED_DNS: " --log-level 4
iptables -A OUTPUT -p tcp --dport 53 -j DROP

# -----------------------------------------------------------------------------
# Allow NTP ONLY to the exam server
# -----------------------------------------------------------------------------
# The exam server runs chrony as the local NTP server.
# Synchronized time is critical for exam fairness.
# -----------------------------------------------------------------------------
log_info "Allowing NTP to exam server only..."

# Outbound NTP to exam server
iptables -A OUTPUT -p udp -d "${EXAM_SERVER_IP}" --dport 123 -j ACCEPT

# Block and log NTP to any other destination
iptables -A OUTPUT -p udp --dport 123 -j LOG --log-prefix "PARIKSHA_BLOCKED_NTP: " --log-level 4
iptables -A OUTPUT -p udp --dport 123 -j DROP

# -----------------------------------------------------------------------------
# Allow HTTP/HTTPS ONLY to the exam server
# -----------------------------------------------------------------------------
# The exam application runs on the exam server (port 80 via nginx, possibly 443).
# Block web traffic to any other destination.
# -----------------------------------------------------------------------------
log_info "Allowing HTTP/HTTPS to exam server only..."

# Outbound HTTP to exam server
iptables -A OUTPUT -p tcp -d "${EXAM_SERVER_IP}" --dport 80 -j ACCEPT

# Outbound HTTPS to exam server (in case TLS is configured)
iptables -A OUTPUT -p tcp -d "${EXAM_SERVER_IP}" --dport 443 -j ACCEPT

# Outbound to Node.js port directly (in case nginx is bypassed)
iptables -A OUTPUT -p tcp -d "${EXAM_SERVER_IP}" --dport 3000 -j ACCEPT

# -----------------------------------------------------------------------------
# Allow SSH FROM the exam server (for remote administration)
# -----------------------------------------------------------------------------
log_info "Allowing inbound SSH from exam server..."

# Inbound SSH from exam server
iptables -A INPUT -p tcp -s "${EXAM_SERVER_IP}" --dport 22 -j ACCEPT
iptables -A OUTPUT -p tcp -d "${EXAM_SERVER_IP}" --sport 22 -j ACCEPT

# Block SSH from any other source
iptables -A INPUT -p tcp --dport 22 -j LOG --log-prefix "PARIKSHA_BLOCKED_SSH: " --log-level 4
iptables -A INPUT -p tcp --dport 22 -j DROP

# -----------------------------------------------------------------------------
# Allow ICMP (ping) to/from exam server only
# -----------------------------------------------------------------------------
# Ping is useful for the monitoring dashboard to check machine connectivity.
# Block ping to/from all other addresses.
# -----------------------------------------------------------------------------
log_info "Allowing ICMP to/from exam server only..."

# Allow ping to exam server
iptables -A OUTPUT -p icmp --icmp-type echo-request -d "${EXAM_SERVER_IP}" -j ACCEPT
iptables -A INPUT  -p icmp --icmp-type echo-reply   -s "${EXAM_SERVER_IP}" -j ACCEPT

# Allow ping from exam server
iptables -A INPUT  -p icmp --icmp-type echo-request -s "${EXAM_SERVER_IP}" -j ACCEPT
iptables -A OUTPUT -p icmp --icmp-type echo-reply   -d "${EXAM_SERVER_IP}" -j ACCEPT

# Block all other ICMP
iptables -A INPUT  -p icmp -j DROP
iptables -A OUTPUT -p icmp -j DROP

# -----------------------------------------------------------------------------
# Log and drop everything else
# -----------------------------------------------------------------------------
# These are the catch-all rules. Anything not explicitly allowed above is
# logged (for audit/forensics) and dropped.
# -----------------------------------------------------------------------------
log_info "Setting up logging for blocked traffic..."

# Log blocked outbound traffic (rate-limited to prevent log flooding)
iptables -A OUTPUT -m limit --limit 5/min --limit-burst 10 \
    -j LOG --log-prefix "PARIKSHA_BLOCKED_OUT: " --log-level 4

# Log blocked inbound traffic (rate-limited)
iptables -A INPUT -m limit --limit 5/min --limit-burst 10 \
    -j LOG --log-prefix "PARIKSHA_BLOCKED_IN: " --log-level 4

# Final DROP for anything not matched (redundant with policy, but explicit)
iptables -A OUTPUT -j DROP
iptables -A INPUT  -j DROP

# -----------------------------------------------------------------------------
# Prevent rule modification by non-root
# -----------------------------------------------------------------------------
# Only root can modify iptables. The exam user has no sudo access.
# This is enforced by Linux kernel capabilities, not by iptables itself.

# -----------------------------------------------------------------------------
# Save rules so they persist across reboots
# -----------------------------------------------------------------------------
log_info "Saving iptables rules for persistence across reboots..."

# Save IPv4 rules
if command -v netfilter-persistent &>/dev/null; then
    netfilter-persistent save
elif command -v iptables-save &>/dev/null; then
    mkdir -p /etc/iptables
    iptables-save  > /etc/iptables/rules.v4
    ip6tables-save > /etc/iptables/rules.v6
fi

# Enable netfilter-persistent service if available
systemctl enable netfilter-persistent.service 2>/dev/null || true

# -----------------------------------------------------------------------------
# Display summary
# -----------------------------------------------------------------------------
echo ""
log_info "iptables lockdown applied successfully."
echo ""
echo "  Allowed traffic:"
echo "    - Loopback (localhost)           : ALLOW"
echo "    - DHCP (broadcast)               : ALLOW"
echo "    - DNS  -> ${EXAM_SERVER_IP}:53   : ALLOW"
echo "    - NTP  -> ${EXAM_SERVER_IP}:123  : ALLOW"
echo "    - HTTP -> ${EXAM_SERVER_IP}:80   : ALLOW"
echo "    - HTTPS-> ${EXAM_SERVER_IP}:443  : ALLOW"
echo "    - App  -> ${EXAM_SERVER_IP}:3000 : ALLOW"
echo "    - SSH  <- ${EXAM_SERVER_IP}:22   : ALLOW (inbound only)"
echo "    - ICMP <-> ${EXAM_SERVER_IP}     : ALLOW"
echo ""
echo "  Everything else: LOGGED and DROPPED"
echo ""
echo "  Current rules:"
echo "  -----------------------------------------------------------------------"
iptables -L -n -v --line-numbers
echo "  -----------------------------------------------------------------------"
