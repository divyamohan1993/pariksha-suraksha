#!/usr/bin/env bash
# =============================================================================
# ParikshaSuraksha -- Exam Center Monitor Dashboard
# =============================================================================
# Displays a real-time terminal dashboard on the exam server showing:
#   - All connected kiosk machines (by IP)
#   - Heartbeat status per machine (last seen)
#   - Violation count per machine
#   - Exam progress (candidates started/submitted)
#   - Alerts for offline machines or high violation counts
#
# Usage:
#   ./monitor-dashboard.sh [OPTIONS]
#
# Options:
#   --server-url URL    Exam server URL (default: http://localhost:3000)
#   --refresh SECONDS   Refresh interval (default: 5)
#   --alert-threshold N Alert when violations exceed N (default: 3)
#
# The dashboard auto-refreshes every 5 seconds by default.
# Press Ctrl+C to exit.
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
SERVER_URL="http://localhost:3000"
REFRESH_INTERVAL=5
ALERT_THRESHOLD=3
LEASE_FILE="/var/lib/dnsmasq/dnsmasq.leases"
LOG_FILE="/var/log/pariksha-monitor.log"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --server-url)   SERVER_URL="$2"; shift 2 ;;
        --refresh)      REFRESH_INTERVAL="$2"; shift 2 ;;
        --alert-threshold) ALERT_THRESHOLD="$2"; shift 2 ;;
        --help|-h)
            echo "Usage: $0 [--server-url URL] [--refresh SECONDS] [--alert-threshold N]"
            exit 0 ;;
        *)
            echo "Unknown argument: $1"; exit 1 ;;
    esac
done

# -----------------------------------------------------------------------------
# Terminal colors and formatting
# -----------------------------------------------------------------------------
BOLD='\033[1m'
DIM='\033[2m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
BG_RED='\033[41m'
BG_GREEN='\033[42m'
BG_YELLOW='\033[43m'
NC='\033[0m'

# State tracking files (tmpfs for performance)
STATE_DIR="/tmp/pariksha-monitor"
mkdir -p "${STATE_DIR}"

# -----------------------------------------------------------------------------
# Cleanup on exit
# -----------------------------------------------------------------------------
cleanup() {
    tput cnorm 2>/dev/null  # Show cursor
    tput sgr0 2>/dev/null   # Reset terminal attributes
    echo ""
    echo "Monitor dashboard stopped."
    exit 0
}
trap cleanup EXIT INT TERM

# Hide cursor for cleaner display
tput civis 2>/dev/null || true

# -----------------------------------------------------------------------------
# Helper functions
# -----------------------------------------------------------------------------

# Get terminal dimensions
get_term_size() {
    TERM_ROWS=$(tput lines 2>/dev/null || echo 24)
    TERM_COLS=$(tput cols 2>/dev/null || echo 80)
}

# Draw a horizontal line
draw_line() {
    local char="${1:--}"
    local width="${2:-${TERM_COLS}}"
    printf '%*s\n' "${width}" '' | tr ' ' "${char}"
}

# Center text in terminal
center_text() {
    local text="$1"
    local width="${2:-${TERM_COLS}}"
    local text_len=${#text}
    local padding=$(( (width - text_len) / 2 ))
    if [[ ${padding} -gt 0 ]]; then
        printf '%*s%s\n' "${padding}" '' "${text}"
    else
        echo "${text}"
    fi
}

# Format timestamp as human-readable "X seconds/minutes ago"
time_ago() {
    local timestamp="$1"
    local now
    now=$(date +%s)
    local diff=$((now - timestamp))

    if [[ ${diff} -lt 0 ]]; then
        echo "just now"
    elif [[ ${diff} -lt 60 ]]; then
        echo "${diff}s ago"
    elif [[ ${diff} -lt 3600 ]]; then
        echo "$((diff / 60))m ago"
    else
        echo "$((diff / 3600))h ago"
    fi
}

# Get status color based on last-seen time
status_color() {
    local last_seen="$1"
    local now
    now=$(date +%s)
    local diff=$((now - last_seen))

    if [[ ${diff} -lt 15 ]]; then
        echo "${GREEN}"    # Online (seen within 15s)
    elif [[ ${diff} -lt 30 ]]; then
        echo "${YELLOW}"   # Warning (seen within 30s)
    else
        echo "${RED}"      # Offline (not seen for 30s+)
    fi
}

# Get status icon based on last-seen time
status_icon() {
    local last_seen="$1"
    local now
    now=$(date +%s)
    local diff=$((now - last_seen))

    if [[ ${diff} -lt 15 ]]; then
        echo "ONLINE "
    elif [[ ${diff} -lt 30 ]]; then
        echo "SLOW   "
    else
        echo "OFFLINE"
    fi
}

# Query the exam server API (with timeout to avoid blocking)
api_get() {
    local endpoint="$1"
    curl -sf --connect-timeout 2 --max-time 3 "${SERVER_URL}${endpoint}" 2>/dev/null || echo ""
}

# Get DHCP lease data
get_dhcp_leases() {
    if [[ -f "${LEASE_FILE}" ]]; then
        cat "${LEASE_FILE}" 2>/dev/null || echo ""
    else
        echo ""
    fi
}

# Collect machine data from multiple sources
collect_machine_data() {
    # Source 1: DHCP leases (always available)
    local leases
    leases=$(get_dhcp_leases)

    # Source 2: API heartbeat data (if server is running)
    local heartbeat_data
    heartbeat_data=$(api_get "/api/monitor/machines" 2>/dev/null || echo "")

    # Source 3: ARP table (always available, shows actively connected machines)
    local arp_data
    arp_data=$(arp -n 2>/dev/null | grep -v "incomplete" | tail -n +2 || echo "")

    # Build combined machine list
    # Store in state directory as individual files per IP
    local now
    now=$(date +%s)

    # Process DHCP leases
    while IFS=' ' read -r _ts mac ip hostname _rest; do
        if [[ -n "${ip}" && "${ip}" =~ ^192\.168\.1\. ]]; then
            local state_file="${STATE_DIR}/${ip}"
            if [[ ! -f "${state_file}" ]]; then
                echo "hostname=${hostname:-unknown}" > "${state_file}"
                echo "mac=${mac:-unknown}" >> "${state_file}"
                echo "first_seen=${now}" >> "${state_file}"
                echo "last_seen=0" >> "${state_file}"
                echo "violations=0" >> "${state_file}"
                echo "status=waiting" >> "${state_file}"
            fi
            # Update hostname and MAC from DHCP
            sed -i "s/^hostname=.*/hostname=${hostname:-unknown}/" "${state_file}"
            sed -i "s/^mac=.*/mac=${mac:-unknown}/" "${state_file}"
        fi
    done <<< "${leases}"

    # Process heartbeat data from API (JSON)
    if [[ -n "${heartbeat_data}" && "${heartbeat_data}" != "null" ]]; then
        # Parse JSON array of machine objects
        local machine_count
        machine_count=$(echo "${heartbeat_data}" | jq '. | length' 2>/dev/null || echo "0")

        for ((i=0; i<machine_count; i++)); do
            local ip hostname last_seen violations chromium_running
            ip=$(echo "${heartbeat_data}" | jq -r ".[${i}].ip" 2>/dev/null || echo "")
            hostname=$(echo "${heartbeat_data}" | jq -r ".[${i}].hostname" 2>/dev/null || echo "unknown")
            last_seen=$(echo "${heartbeat_data}" | jq -r ".[${i}].timestamp" 2>/dev/null || echo "0")
            violations=$(echo "${heartbeat_data}" | jq -r ".[${i}].violations // 0" 2>/dev/null || echo "0")
            chromium_running=$(echo "${heartbeat_data}" | jq -r ".[${i}].chromium_running // 0" 2>/dev/null || echo "0")

            if [[ -n "${ip}" && "${ip}" != "null" ]]; then
                local state_file="${STATE_DIR}/${ip}"
                if [[ ! -f "${state_file}" ]]; then
                    echo "hostname=${hostname}" > "${state_file}"
                    echo "mac=unknown" >> "${state_file}"
                    echo "first_seen=${now}" >> "${state_file}"
                    echo "last_seen=${last_seen}" >> "${state_file}"
                    echo "violations=${violations}" >> "${state_file}"
                    echo "status=active" >> "${state_file}"
                else
                    sed -i "s/^last_seen=.*/last_seen=${last_seen}/" "${state_file}"
                    sed -i "s/^violations=.*/violations=${violations}/" "${state_file}"
                fi
            fi
        done
    fi

    # Process ARP table (update last_seen for any machine we can reach)
    while IFS=' ' read -r ip _type _mac _flags _iface; do
        if [[ -n "${ip}" && "${ip}" =~ ^192\.168\.1\. && "${ip}" != "192.168.1.1" ]]; then
            local state_file="${STATE_DIR}/${ip}"
            if [[ -f "${state_file}" ]]; then
                # If we see it in ARP, it was recently active
                local current_last_seen
                current_last_seen=$(grep "^last_seen=" "${state_file}" 2>/dev/null | cut -d= -f2)
                if [[ -z "${current_last_seen}" || "${current_last_seen}" == "0" ]]; then
                    sed -i "s/^last_seen=.*/last_seen=${now}/" "${state_file}"
                fi
            fi
        fi
    done <<< "${arp_data}"

    # Ping sweep for machine discovery (fast, parallel)
    # Only do this occasionally (every 6th refresh) to avoid network noise
    local cycle_file="${STATE_DIR}/.cycle"
    local cycle=0
    if [[ -f "${cycle_file}" ]]; then
        cycle=$(cat "${cycle_file}")
    fi
    cycle=$(( (cycle + 1) % 6 ))
    echo "${cycle}" > "${cycle_file}"

    if [[ ${cycle} -eq 0 ]]; then
        for i in $(seq 11 250); do
            ping -c 1 -W 1 "192.168.1.${i}" &>/dev/null &
        done
        wait 2>/dev/null || true
    fi
}

# Get exam progress data from API
get_exam_progress() {
    local progress_data
    progress_data=$(api_get "/api/monitor/progress" 2>/dev/null || echo "")

    if [[ -n "${progress_data}" && "${progress_data}" != "null" ]]; then
        TOTAL_CANDIDATES=$(echo "${progress_data}" | jq -r '.total_candidates // 0' 2>/dev/null || echo "0")
        LOGGED_IN=$(echo "${progress_data}" | jq -r '.logged_in // 0' 2>/dev/null || echo "0")
        STARTED=$(echo "${progress_data}" | jq -r '.started // 0' 2>/dev/null || echo "0")
        SUBMITTED=$(echo "${progress_data}" | jq -r '.submitted // 0' 2>/dev/null || echo "0")
        EXAM_STATUS=$(echo "${progress_data}" | jq -r '.exam_status // "unknown"' 2>/dev/null || echo "unknown")
        TIME_REMAINING=$(echo "${progress_data}" | jq -r '.time_remaining // "N/A"' 2>/dev/null || echo "N/A")
    else
        # Fallback: count from state files
        TOTAL_CANDIDATES=$(ls "${STATE_DIR}"/192.168.1.* 2>/dev/null | wc -l || echo "0")
        LOGGED_IN="?"
        STARTED="?"
        SUBMITTED="?"
        EXAM_STATUS="api_unavailable"
        TIME_REMAINING="N/A"
    fi
}

# Build alerts list
build_alerts() {
    ALERTS=()
    local now
    now=$(date +%s)

    for state_file in "${STATE_DIR}"/192.168.1.*; do
        if [[ ! -f "${state_file}" ]]; then continue; fi

        local ip
        ip=$(basename "${state_file}")
        local last_seen violations hostname
        last_seen=$(grep "^last_seen=" "${state_file}" 2>/dev/null | cut -d= -f2 || echo "0")
        violations=$(grep "^violations=" "${state_file}" 2>/dev/null | cut -d= -f2 || echo "0")
        hostname=$(grep "^hostname=" "${state_file}" 2>/dev/null | cut -d= -f2 || echo "unknown")

        # Alert: machine offline
        if [[ "${last_seen}" != "0" ]]; then
            local diff=$((now - last_seen))
            if [[ ${diff} -gt 30 ]]; then
                ALERTS+=("${RED}OFFLINE${NC}  ${ip} (${hostname}) -- last seen $(time_ago "${last_seen}")")
            fi
        fi

        # Alert: high violation count
        if [[ "${violations}" -gt "${ALERT_THRESHOLD}" ]]; then
            ALERTS+=("${YELLOW}VIOLATION${NC} ${ip} (${hostname}) -- ${violations} violations detected")
        fi
    done
}

# -----------------------------------------------------------------------------
# Main render function
# -----------------------------------------------------------------------------
render_dashboard() {
    get_term_size

    # Clear screen and move cursor to top
    tput clear 2>/dev/null || printf '\033[2J\033[H'

    local now
    now=$(date +%s)
    local now_fmt
    now_fmt=$(date '+%Y-%m-%d %H:%M:%S')

    # ---- Header ----
    echo -e "${BOLD}${CYAN}"
    draw_line "="
    center_text "PARIKSHA SURAKSHA -- EXAM CENTER MONITOR"
    draw_line "="
    echo -e "${NC}"

    echo -e "  ${DIM}Server: ${SERVER_URL}  |  Time: ${now_fmt}  |  Refresh: ${REFRESH_INTERVAL}s${NC}"
    echo ""

    # ---- Exam Progress ----
    get_exam_progress

    echo -e "  ${BOLD}${WHITE}EXAM STATUS${NC}"
    draw_line "-" 60

    # Status badge
    case "${EXAM_STATUS}" in
        "active"|"in_progress")
            echo -e "  Status:         ${BG_GREEN}${WHITE} IN PROGRESS ${NC}" ;;
        "waiting"|"scheduled")
            echo -e "  Status:         ${BG_YELLOW}${WHITE} WAITING ${NC}" ;;
        "completed"|"finished")
            echo -e "  Status:         ${BLUE} COMPLETED ${NC}" ;;
        "api_unavailable")
            echo -e "  Status:         ${DIM}(API unavailable -- using ARP/DHCP data)${NC}" ;;
        *)
            echo -e "  Status:         ${DIM}${EXAM_STATUS}${NC}" ;;
    esac

    echo -e "  Time Remaining: ${BOLD}${TIME_REMAINING}${NC}"
    echo ""

    # Progress bar
    if [[ "${TOTAL_CANDIDATES}" != "0" && "${TOTAL_CANDIDATES}" != "?" && "${SUBMITTED}" != "?" ]]; then
        local pct=0
        if [[ ${TOTAL_CANDIDATES} -gt 0 ]]; then
            pct=$(( SUBMITTED * 100 / TOTAL_CANDIDATES ))
        fi
        local bar_width=40
        local filled=$(( pct * bar_width / 100 ))
        local empty=$(( bar_width - filled ))

        printf "  Progress: ["
        printf "${GREEN}"
        printf '%*s' "${filled}" '' | tr ' ' '#'
        printf "${NC}"
        printf '%*s' "${empty}" '' | tr ' ' '-'
        printf "] %d%%\n" "${pct}"
    fi

    echo -e "  Candidates:  Total=${BOLD}${TOTAL_CANDIDATES}${NC}  LoggedIn=${BOLD}${LOGGED_IN}${NC}  Started=${BOLD}${STARTED}${NC}  Submitted=${GREEN}${BOLD}${SUBMITTED}${NC}"
    echo ""

    # ---- Connected Machines ----
    echo -e "  ${BOLD}${WHITE}CONNECTED MACHINES${NC}"
    draw_line "-" 90

    printf "  ${BOLD}%-16s %-18s %-10s %-12s %-12s %-10s${NC}\n" \
        "IP ADDRESS" "HOSTNAME" "STATUS" "LAST SEEN" "VIOLATIONS" "MAC"
    draw_line "-" 90

    local total_machines=0
    local online_machines=0
    local warning_machines=0
    local offline_machines=0

    # Sort and display machines
    for state_file in $(ls "${STATE_DIR}"/192.168.1.* 2>/dev/null | sort -t. -k4 -n); do
        if [[ ! -f "${state_file}" ]]; then continue; fi

        local ip
        ip=$(basename "${state_file}")
        local hostname last_seen violations mac
        hostname=$(grep "^hostname=" "${state_file}" 2>/dev/null | cut -d= -f2 || echo "unknown")
        last_seen=$(grep "^last_seen=" "${state_file}" 2>/dev/null | cut -d= -f2 || echo "0")
        violations=$(grep "^violations=" "${state_file}" 2>/dev/null | cut -d= -f2 || echo "0")
        mac=$(grep "^mac=" "${state_file}" 2>/dev/null | cut -d= -f2 || echo "unknown")

        total_machines=$((total_machines + 1))

        # Determine status
        local color icon last_seen_str
        if [[ "${last_seen}" == "0" ]]; then
            color="${DIM}"
            icon="WAITING"
            last_seen_str="--"
        else
            color=$(status_color "${last_seen}")
            icon=$(status_icon "${last_seen}")
            last_seen_str=$(time_ago "${last_seen}")

            local diff=$((now - last_seen))
            if [[ ${diff} -lt 15 ]]; then
                online_machines=$((online_machines + 1))
            elif [[ ${diff} -lt 30 ]]; then
                warning_machines=$((warning_machines + 1))
            else
                offline_machines=$((offline_machines + 1))
            fi
        fi

        # Violation color
        local viol_color="${NC}"
        if [[ "${violations}" -gt "${ALERT_THRESHOLD}" ]]; then
            viol_color="${RED}${BOLD}"
        elif [[ "${violations}" -gt 0 ]]; then
            viol_color="${YELLOW}"
        fi

        # Truncate hostname if too long
        if [[ ${#hostname} -gt 16 ]]; then
            hostname="${hostname:0:13}..."
        fi

        # Truncate MAC for display
        local mac_short="${mac}"
        if [[ ${#mac_short} -gt 10 ]]; then
            mac_short="${mac_short:0:8}.."
        fi

        printf "  ${color}%-16s %-18s %-10s %-12s ${viol_color}%-12s${NC} ${DIM}%-10s${NC}\n" \
            "${ip}" "${hostname}" "${icon}" "${last_seen_str}" "${violations}" "${mac_short}"
    done

    if [[ ${total_machines} -eq 0 ]]; then
        echo -e "  ${DIM}No machines detected yet. Waiting for kiosk machines to connect...${NC}"
    fi

    draw_line "-" 90

    echo -e "  Summary: ${GREEN}${online_machines} online${NC} | ${YELLOW}${warning_machines} slow${NC} | ${RED}${offline_machines} offline${NC} | ${total_machines} total"
    echo ""

    # ---- Alerts ----
    build_alerts

    echo -e "  ${BOLD}${WHITE}ALERTS${NC}"
    draw_line "-" 90

    if [[ ${#ALERTS[@]} -eq 0 ]]; then
        echo -e "  ${GREEN}No alerts. All systems normal.${NC}"
    else
        for alert in "${ALERTS[@]}"; do
            echo -e "  ${BOLD}!${NC} ${alert}"
        done

        # Log alerts to file
        for alert in "${ALERTS[@]}"; do
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] ${alert}" >> "${LOG_FILE}" 2>/dev/null || true
        done
    fi

    echo ""

    # ---- Server Status ----
    echo -e "  ${BOLD}${WHITE}SERVER HEALTH${NC}"
    draw_line "-" 60

    # Check services
    local services=("nginx" "pariksha-server" "dnsmasq" "chrony")
    for svc in "${services[@]}"; do
        if systemctl is-active "${svc}" &>/dev/null 2>&1; then
            printf "  ${GREEN}[OK]${NC}   %-20s\n" "${svc}"
        else
            printf "  ${RED}[DOWN]${NC} %-20s\n" "${svc}"
        fi
    done

    # Quick resource check
    local mem_info
    mem_info=$(free -m 2>/dev/null | grep Mem || echo "")
    if [[ -n "${mem_info}" ]]; then
        local mem_total mem_used mem_pct
        mem_total=$(echo "${mem_info}" | awk '{print $2}')
        mem_used=$(echo "${mem_info}" | awk '{print $3}')
        if [[ ${mem_total} -gt 0 ]]; then
            mem_pct=$((mem_used * 100 / mem_total))
        else
            mem_pct=0
        fi
        local mem_color="${GREEN}"
        if [[ ${mem_pct} -gt 90 ]]; then mem_color="${RED}";
        elif [[ ${mem_pct} -gt 70 ]]; then mem_color="${YELLOW}"; fi
        printf "  ${mem_color}[MEM]${NC}  %dMB / %dMB (%d%%)\n" "${mem_used}" "${mem_total}" "${mem_pct}"
    fi

    local load
    load=$(cat /proc/loadavg 2>/dev/null | awk '{print $1, $2, $3}' || echo "N/A")
    printf "  ${DIM}[LOAD]${NC} %s\n" "${load}"

    # DHCP lease count
    local lease_count=0
    if [[ -f "${LEASE_FILE}" ]]; then
        lease_count=$(wc -l < "${LEASE_FILE}" 2>/dev/null || echo "0")
    fi
    printf "  ${DIM}[DHCP]${NC} %d active leases\n" "${lease_count}"

    echo ""

    # ---- Footer ----
    draw_line "=" 60
    echo -e "  ${DIM}Press Ctrl+C to exit | Auto-refresh every ${REFRESH_INTERVAL}s | Alerts logged to ${LOG_FILE}${NC}"
}

# -----------------------------------------------------------------------------
# Main loop
# -----------------------------------------------------------------------------
echo "Starting ParikshaSuraksha Monitor Dashboard..."
echo "Server: ${SERVER_URL}"
echo "Refresh: ${REFRESH_INTERVAL}s"
echo ""

# Initial data collection
collect_machine_data

while true; do
    # Collect fresh data
    collect_machine_data

    # Render dashboard
    render_dashboard

    # Wait for next refresh
    sleep "${REFRESH_INTERVAL}"
done
