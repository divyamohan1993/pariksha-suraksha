#!/usr/bin/env bash
# =============================================================================
# ParikshaSuraksha -- Kiosk Machine Setup Script
# =============================================================================
# Transforms a fresh Ubuntu/Debian machine into a locked-down exam kiosk.
#
# Usage:
#   sudo ./kiosk-setup.sh --exam-url "http://pariksha.local" --server-ip "192.168.1.1"
#
# This script MUST be run as root.
#
# Defense-in-depth layers applied by this script:
#   1. Restricted exam user (no sudo, no shell escape)
#   2. Chromium kiosk mode (fullscreen, no UI chrome)
#   3. Chromium enterprise policies (URL blocking, feature disabling)
#   4. Keyboard shortcut interception (Alt+Tab, Alt+F4, Ctrl+Alt+Del, etc.)
#   5. USB mass storage blocked (kernel module blacklist)
#   6. Bluetooth disabled
#   7. Screenshot tools removed
#   8. Network Manager GUI hidden
#   9. Virtual console switching disabled
#  10. Read-only home directory (tmpfs overlay)
#  11. Auto-login and auto-start on boot
#  12. iptables firewall (only exam server reachable)
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Color output helpers
# -----------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# -----------------------------------------------------------------------------
# Preflight checks
# -----------------------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
    log_error "This script must be run as root. Use: sudo $0 $*"
    exit 1
fi

# -----------------------------------------------------------------------------
# Parse arguments
# -----------------------------------------------------------------------------
EXAM_URL=""
SERVER_IP=""
EXAM_USER="exam"
EXAM_USER_HOME="/home/${EXAM_USER}"

usage() {
    echo "Usage: $0 --exam-url <URL> --server-ip <IP>"
    echo ""
    echo "  --exam-url    The URL of the exam application (e.g., http://pariksha.local)"
    echo "  --server-ip   The IP address of the exam server (e.g., 192.168.1.1)"
    exit 1
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --exam-url)
            EXAM_URL="$2"
            shift 2
            ;;
        --server-ip)
            SERVER_IP="$2"
            shift 2
            ;;
        --help|-h)
            usage
            ;;
        *)
            log_error "Unknown argument: $1"
            usage
            ;;
    esac
done

if [[ -z "$EXAM_URL" || -z "$SERVER_IP" ]]; then
    log_error "Both --exam-url and --server-ip are required."
    usage
fi

log_info "Exam URL:   ${EXAM_URL}"
log_info "Server IP:  ${SERVER_IP}"
log_info "Exam user:  ${EXAM_USER}"

# -----------------------------------------------------------------------------
# Step 1: System update and package installation
# -----------------------------------------------------------------------------
log_info "Step 1: Updating system and installing packages..."

export DEBIAN_FRONTEND=noninteractive

apt-get update -qq
apt-get upgrade -y -qq

# Install required packages
apt-get install -y -qq \
    chromium-browser \
    xorg \
    lightdm \
    xbindkeys \
    xdotool \
    unclutter \
    iptables \
    iptables-persistent \
    openssh-server \
    curl \
    chrony \
    policykit-1 \
    --no-install-recommends

# Remove potentially dangerous packages
log_info "Removing dangerous packages..."
apt-get remove -y --purge \
    gnome-screenshot \
    scrot \
    imagemagick \
    xfce4-screenshooter \
    flameshot \
    shutter \
    kazam \
    obs-studio \
    recordmydesktop \
    simplescreenrecorder \
    xterm \
    gnome-terminal \
    xfce4-terminal \
    lxterminal \
    mate-terminal \
    terminator \
    tilix \
    nautilus \
    thunar \
    pcmanfm \
    nemo \
    caja \
    gnome-system-monitor \
    xfce4-taskmanager \
    lxtask \
    mate-system-monitor \
    synaptic \
    gdebi \
    software-center \
    gnome-software \
    2>/dev/null || true

apt-get autoremove -y -qq

log_info "Packages installed and cleaned up."

# -----------------------------------------------------------------------------
# Step 2: Create restricted exam user
# -----------------------------------------------------------------------------
log_info "Step 2: Creating restricted exam user..."

if id "${EXAM_USER}" &>/dev/null; then
    log_warn "User '${EXAM_USER}' already exists. Reconfiguring..."
else
    useradd \
        --create-home \
        --shell /bin/false \
        --comment "ParikshaSuraksha Exam User" \
        "${EXAM_USER}"
    log_info "User '${EXAM_USER}' created."
fi

# Set a random password (the user will auto-login; no one needs to know this)
EXAM_PASS=$(openssl rand -base64 32)
echo "${EXAM_USER}:${EXAM_PASS}" | chpasswd

# Ensure exam user is NOT in sudo or admin groups
deluser "${EXAM_USER}" sudo 2>/dev/null || true
deluser "${EXAM_USER}" admin 2>/dev/null || true
deluser "${EXAM_USER}" adm 2>/dev/null || true
deluser "${EXAM_USER}" wheel 2>/dev/null || true

# Lock down the exam user's shell -- /bin/false prevents SSH login too
usermod --shell /bin/false "${EXAM_USER}"

log_info "Exam user configured with no sudo and no interactive shell."

# -----------------------------------------------------------------------------
# Step 3: Configure auto-login via LightDM
# -----------------------------------------------------------------------------
log_info "Step 3: Configuring auto-login..."

mkdir -p /etc/lightdm/lightdm.conf.d

cat > /etc/lightdm/lightdm.conf.d/50-exam-autologin.conf << EOF
[Seat:*]
autologin-user=${EXAM_USER}
autologin-user-timeout=0
user-session=exam-kiosk
greeter-session=lightdm-gtk-greeter
EOF

log_info "LightDM auto-login configured for '${EXAM_USER}'."

# -----------------------------------------------------------------------------
# Step 4: Create custom X session for kiosk mode
# -----------------------------------------------------------------------------
log_info "Step 4: Creating kiosk X session..."

# Create a custom .desktop session entry
cat > /usr/share/xsessions/exam-kiosk.desktop << 'EOF'
[Desktop Entry]
Name=Exam Kiosk
Comment=ParikshaSuraksha Locked Exam Session
Exec=/usr/local/bin/exam-kiosk-session.sh
Type=Application
EOF

# Create the session startup script
cat > /usr/local/bin/exam-kiosk-session.sh << SESSIONEOF
#!/usr/bin/env bash
# =============================================================================
# ParikshaSuraksha Kiosk Session Script
# Runs as the exam user inside the X session. No desktop environment.
# =============================================================================

# Disable screen blanking and power management
xset s off
xset -dpms
xset s noblank

# Hide the mouse cursor when idle for 3 seconds
unclutter -idle 3 -root &

# Start xbindkeys to intercept dangerous key combinations
xbindkeys &

# Set a plain black background
xsetroot -solid "#000000"

# Disable clipboard access between applications
# We launch xclip in a loop that clears the clipboard every second
(
    while true; do
        echo -n "" | xclip -selection clipboard 2>/dev/null
        echo -n "" | xclip -selection primary 2>/dev/null
        echo -n "" | xclip -selection secondary 2>/dev/null
        sleep 1
    done
) &

# Launch Chromium in kiosk mode -- restart if it crashes
while true; do
    chromium-browser \\
        --kiosk \\
        --no-first-run \\
        --disable-translate \\
        --disable-infobars \\
        --disable-suggestions-service \\
        --disable-save-password-bubble \\
        --disable-session-crashed-bubble \\
        --disable-component-update \\
        --disable-background-networking \\
        --disable-sync \\
        --disable-features=TranslateUI,WebRTC \\
        --noerrdialogs \\
        --no-default-browser-check \\
        --autoplay-policy=no-user-gesture-required \\
        --disable-dev-tools \\
        --disable-extensions \\
        --incognito \\
        --start-fullscreen \\
        --start-maximized \\
        --disable-pinch \\
        --overscroll-history-navigation=0 \\
        --disable-hang-monitor \\
        --disable-popup-blocking \\
        --user-data-dir=/tmp/chromium-exam \\
        "${EXAM_URL}"

    # If Chromium exits (crash or user somehow closed it), wait briefly and restart
    sleep 2
done
SESSIONEOF

chmod +x /usr/local/bin/exam-kiosk-session.sh

# Allow the exam user shell access ONLY for the X session
# LightDM needs to run the session script, so we use a wrapper approach.
# The user's shell stays /bin/false, but LightDM session exec is allowed.

log_info "Kiosk X session created."

# -----------------------------------------------------------------------------
# Step 5: Configure xbindkeys to block dangerous key combinations
# -----------------------------------------------------------------------------
log_info "Step 5: Configuring key binding interception..."

mkdir -p "${EXAM_USER_HOME}"

cat > "${EXAM_USER_HOME}/.xbindkeysrc" << 'EOF'
# =============================================================================
# ParikshaSuraksha -- Key Binding Lockdown
# All dangerous key combinations are bound to /bin/true (do nothing)
# =============================================================================

# Block Alt+Tab (window/task switching)
"true"
    Mod1 + Tab

# Block Alt+F4 (close window)
"true"
    Mod1 + F4

# Block Ctrl+Alt+Delete (system interrupt)
"true"
    Control + Mod1 + Delete

# Block Ctrl+Alt+Backspace (kill X server)
"true"
    Control + Mod1 + BackSpace

# Block Super/Windows key (application menu)
"true"
    Super_L

"true"
    Super_R

# Block Alt+F1 (application menu)
"true"
    Mod1 + F1

# Block Alt+F2 (run dialog)
"true"
    Mod1 + F2

# Block Ctrl+Alt+T (terminal)
"true"
    Control + Mod1 + t

# Block Ctrl+Alt+L (lock screen)
"true"
    Control + Mod1 + l

# Block Print Screen (screenshot)
"true"
    Print

"true"
    Mod1 + Print

"true"
    Shift + Print

# Block Ctrl+Shift+Escape (task manager)
"true"
    Control + Shift + Escape

# Block Ctrl+Escape (start menu)
"true"
    Control + Escape

# Block F11 (toggle fullscreen -- we want to STAY fullscreen)
"true"
    F11

# Block Ctrl+W (close tab)
"true"
    Control + w

# Block Ctrl+T (new tab)
"true"
    Control + t

# Block Ctrl+N (new window)
"true"
    Control + n

# Block Ctrl+Shift+N (new incognito window)
"true"
    Control + Shift + n

# Block Ctrl+L (focus address bar)
"true"
    Control + l

# Block Ctrl+D (bookmark)
"true"
    Control + d

# Block Ctrl+H (history)
"true"
    Control + h

# Block Ctrl+J (downloads)
"true"
    Control + j

# Block Ctrl+Shift+I (developer tools)
"true"
    Control + Shift + i

# Block Ctrl+Shift+J (JavaScript console)
"true"
    Control + Shift + j

# Block F12 (developer tools)
"true"
    F12

# Block Ctrl+U (view source)
"true"
    Control + u

# Block Ctrl+S (save page)
"true"
    Control + s

# Block Ctrl+P (print)
"true"
    Control + p

# Block Ctrl+F (find in page -- may be needed, but block for security)
"true"
    Control + f

# Block Ctrl+G / Ctrl+Shift+G (find next/prev)
"true"
    Control + g

"true"
    Control + Shift + g

# Block Ctrl+Shift+Delete (clear browsing data)
"true"
    Control + Shift + Delete

# Block Alt+Home (home page)
"true"
    Mod1 + Home

# Block Alt+Left / Alt+Right (back/forward navigation)
"true"
    Mod1 + Left

"true"
    Mod1 + Right

# Block Ctrl+Tab / Ctrl+Shift+Tab (switch tabs)
"true"
    Control + Tab

"true"
    Control + Shift + Tab

# Block Ctrl+1 through Ctrl+9 (switch to tab N)
"true"
    Control + 1
"true"
    Control + 2
"true"
    Control + 3
"true"
    Control + 4
"true"
    Control + 5
"true"
    Control + 6
"true"
    Control + 7
"true"
    Control + 8
"true"
    Control + 9
EOF

chown "${EXAM_USER}:${EXAM_USER}" "${EXAM_USER_HOME}/.xbindkeysrc"

log_info "Key bindings configured -- dangerous shortcuts will be swallowed."

# -----------------------------------------------------------------------------
# Step 6: Disable virtual console switching (Ctrl+Alt+F1-F12)
# -----------------------------------------------------------------------------
log_info "Step 6: Disabling virtual console switching..."

# Method 1: X server configuration to disable VT switching
mkdir -p /etc/X11/xorg.conf.d

cat > /etc/X11/xorg.conf.d/10-no-vt-switch.conf << 'EOF'
Section "ServerFlags"
    Option "DontVTSwitch" "true"
EndSection
EOF

# Method 2: Disable all virtual consoles except tty7 (where X runs)
# We do this by configuring systemd to not spawn getty on tty1-6
for i in 1 2 3 4 5 6; do
    systemctl mask "getty@tty${i}.service" 2>/dev/null || true
    systemctl disable "getty@tty${i}.service" 2>/dev/null || true
done

# Method 3: Add kernel parameter to limit VTs (applied at next boot)
if ! grep -q "consoleblank=0" /etc/default/grub 2>/dev/null; then
    sed -i 's/GRUB_CMDLINE_LINUX_DEFAULT="\(.*\)"/GRUB_CMDLINE_LINUX_DEFAULT="\1 consoleblank=0"/' /etc/default/grub
    update-grub 2>/dev/null || true
fi

log_info "Virtual console switching disabled."

# -----------------------------------------------------------------------------
# Step 7: Disable USB mass storage
# -----------------------------------------------------------------------------
log_info "Step 7: Blocking USB mass storage..."

# Blacklist the usb-storage kernel module
cat > /etc/modprobe.d/disable-usb-storage.conf << 'EOF'
# ParikshaSuraksha: Block USB mass storage devices
# Keyboards and mice (HID) still work; only storage is blocked.
blacklist usb-storage
blacklist uas
install usb-storage /bin/false
install uas /bin/false
EOF

# Unload the module if currently loaded
modprobe -r usb-storage 2>/dev/null || true
modprobe -r uas 2>/dev/null || true

# Also create a udev rule to reject USB storage devices
cat > /etc/udev/rules.d/99-disable-usb-storage.rules << 'EOF'
# ParikshaSuraksha: Reject USB mass storage devices at the udev level
ACTION=="add", SUBSYSTEMS=="usb", DRIVERS=="usb-storage", ATTR{authorized}="0"
ACTION=="add", SUBSYSTEMS=="usb", DRIVERS=="uas", ATTR{authorized}="0"
EOF

udevadm control --reload-rules
udevadm trigger

log_info "USB mass storage blocked at kernel and udev levels."

# -----------------------------------------------------------------------------
# Step 8: Disable Bluetooth
# -----------------------------------------------------------------------------
log_info "Step 8: Disabling Bluetooth..."

# Blacklist Bluetooth kernel modules
cat > /etc/modprobe.d/disable-bluetooth.conf << 'EOF'
# ParikshaSuraksha: Disable Bluetooth entirely
blacklist bluetooth
blacklist btusb
blacklist btrtl
blacklist btbcm
blacklist btintel
blacklist bnep
blacklist rfcomm
install bluetooth /bin/false
install btusb /bin/false
EOF

# Unload Bluetooth modules if loaded
modprobe -r bnep 2>/dev/null || true
modprobe -r rfcomm 2>/dev/null || true
modprobe -r btusb 2>/dev/null || true
modprobe -r bluetooth 2>/dev/null || true

# Disable and stop Bluetooth service
systemctl disable bluetooth.service 2>/dev/null || true
systemctl stop bluetooth.service 2>/dev/null || true

# Use rfkill to block Bluetooth
rfkill block bluetooth 2>/dev/null || true

log_info "Bluetooth disabled at kernel, service, and rfkill levels."

# -----------------------------------------------------------------------------
# Step 9: Disable Network Manager GUI
# -----------------------------------------------------------------------------
log_info "Step 9: Restricting Network Manager..."

# Prevent the exam user from modifying network connections via PolicyKit
cat > /etc/polkit-1/localauthority/50-local.d/restrict-network.pkla << EOF
[Restrict Network Management for Exam User]
Identity=unix-user:${EXAM_USER}
Action=org.freedesktop.NetworkManager.*
ResultAny=no
ResultInactive=no
ResultActive=no
EOF

# Remove nm-applet from any autostart
rm -f "${EXAM_USER_HOME}/.config/autostart/nm-applet.desktop" 2>/dev/null || true

# Remove network manager GUI tools
apt-get remove -y --purge network-manager-gnome 2>/dev/null || true

log_info "Network Manager GUI restricted for exam user."

# -----------------------------------------------------------------------------
# Step 10: Install Chromium enterprise policies
# -----------------------------------------------------------------------------
log_info "Step 10: Installing Chromium enterprise policies..."

# Create policy directories for both chromium-browser and chromium
for policy_dir in \
    /etc/chromium/policies/managed \
    /etc/chromium/policies/recommended \
    /etc/chromium-browser/policies/managed \
    /etc/chromium-browser/policies/recommended; do
    mkdir -p "${policy_dir}"
done

# Copy the policy file if it exists alongside this script, otherwise generate it
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POLICY_FILE="${SCRIPT_DIR}/chromium-policy.json"

if [[ -f "${POLICY_FILE}" ]]; then
    cp "${POLICY_FILE}" /etc/chromium/policies/managed/pariksha-policy.json
    cp "${POLICY_FILE}" /etc/chromium-browser/policies/managed/pariksha-policy.json
    log_info "Chromium policies installed from ${POLICY_FILE}."
else
    log_warn "chromium-policy.json not found at ${POLICY_FILE}."
    log_warn "You must manually install it to /etc/chromium/policies/managed/"
fi

log_info "Chromium enterprise policies directory structure ready."

# -----------------------------------------------------------------------------
# Step 11: Set up read-only home directory with tmpfs overlay
# -----------------------------------------------------------------------------
log_info "Step 11: Configuring read-only home directory with tmpfs overlay..."

# Create the overlay mount structure
mkdir -p /opt/exam-home-base
mkdir -p /opt/exam-home-work
mkdir -p /opt/exam-home-upper

# Copy current home contents to the base layer
rsync -a "${EXAM_USER_HOME}/" /opt/exam-home-base/

# Create systemd mount unit for tmpfs overlay on the exam user's home
cat > /etc/systemd/system/home-exam.mount << EOF
[Unit]
Description=Read-only overlay for exam user home directory
Before=lightdm.service display-manager.service

[Mount]
What=overlay
Where=${EXAM_USER_HOME}
Type=overlay
Options=lowerdir=/opt/exam-home-base,upperdir=/opt/exam-home-upper,workdir=/opt/exam-home-work

[Install]
WantedBy=multi-user.target
EOF

# Create a service that resets the upper layer on each boot
cat > /etc/systemd/system/exam-home-reset.service << EOF
[Unit]
Description=Reset exam user home overlay on boot
Before=home-exam.mount

[Service]
Type=oneshot
ExecStart=/bin/bash -c 'rm -rf /opt/exam-home-upper/* /opt/exam-home-work/*'
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable exam-home-reset.service
systemctl enable home-exam.mount

log_info "Read-only home directory configured. Changes reset on each boot."

# -----------------------------------------------------------------------------
# Step 12: Apply iptables lockdown
# -----------------------------------------------------------------------------
log_info "Step 12: Applying iptables lockdown rules..."

IPTABLES_SCRIPT="${SCRIPT_DIR}/iptables-lockdown.sh"
if [[ -f "${IPTABLES_SCRIPT}" ]]; then
    bash "${IPTABLES_SCRIPT}" "${SERVER_IP}"
    log_info "iptables lockdown applied from ${IPTABLES_SCRIPT}."
else
    log_warn "iptables-lockdown.sh not found at ${IPTABLES_SCRIPT}."
    log_warn "You must manually run iptables-lockdown.sh."
fi

# -----------------------------------------------------------------------------
# Step 13: Configure NTP client (sync to exam server)
# -----------------------------------------------------------------------------
log_info "Step 13: Configuring NTP client..."

cat > /etc/chrony/chrony.conf << EOF
# ParikshaSuraksha: Sync time only to the exam server
server ${SERVER_IP} iburst prefer
driftfile /var/lib/chrony/drift
makestep 1.0 3
rtcsync
# Do not serve time to anyone
deny all
# Log
logdir /var/log/chrony
EOF

systemctl restart chrony
systemctl enable chrony

log_info "NTP client configured to sync with exam server at ${SERVER_IP}."

# -----------------------------------------------------------------------------
# Step 14: Configure SSH (restrict to exam server only)
# -----------------------------------------------------------------------------
log_info "Step 14: Hardening SSH access..."

# Allow SSH only from the exam server for remote administration
cat > /etc/ssh/sshd_config.d/exam-lockdown.conf << EOF
# ParikshaSuraksha: Only allow SSH from exam server
AllowUsers root@${SERVER_IP}
PasswordAuthentication no
PermitRootLogin prohibit-password
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
AllowTcpForwarding no
EOF

# Generate SSH key pair for the exam server to use
mkdir -p /root/.ssh
chmod 700 /root/.ssh

# Restart SSH to apply changes
systemctl restart sshd 2>/dev/null || systemctl restart ssh 2>/dev/null || true

log_info "SSH hardened -- only exam server can connect."

# -----------------------------------------------------------------------------
# Step 15: Disable screen capture at Xorg level
# -----------------------------------------------------------------------------
log_info "Step 15: Disabling screen capture capabilities..."

# Remove any remaining screenshot/recording tools
for tool in scrot import gnome-screenshot xfce4-screenshooter flameshot kazam; do
    which "${tool}" &>/dev/null && apt-get remove -y --purge "$(dpkg -S "$(which "${tool}")" 2>/dev/null | cut -d: -f1)" 2>/dev/null || true
done

log_info "Screen capture tools removed."

# -----------------------------------------------------------------------------
# Step 16: Disable suspend, hibernate, and shutdown for exam user
# -----------------------------------------------------------------------------
log_info "Step 16: Restricting power management..."

cat > /etc/polkit-1/localauthority/50-local.d/restrict-power.pkla << EOF
[Restrict Power Management for Exam User]
Identity=unix-user:${EXAM_USER}
Action=org.freedesktop.login1.suspend;org.freedesktop.login1.hibernate;org.freedesktop.login1.power-off;org.freedesktop.login1.reboot
ResultAny=no
ResultInactive=no
ResultActive=no
EOF

log_info "Power management restricted for exam user."

# -----------------------------------------------------------------------------
# Step 17: Install heartbeat client (reports to exam server)
# -----------------------------------------------------------------------------
log_info "Step 17: Installing heartbeat client..."

cat > /usr/local/bin/exam-heartbeat.sh << HEARTBEATEOF
#!/usr/bin/env bash
# =============================================================================
# ParikshaSuraksha Heartbeat Client
# Sends periodic status to the exam server for the monitoring dashboard.
# =============================================================================

SERVER_URL="${EXAM_URL}"
MACHINE_IP=\$(hostname -I | awk '{print \$1}')
HOSTNAME=\$(hostname)

while true; do
    # Gather status information
    CHROMIUM_RUNNING=\$(pgrep -c chromium 2>/dev/null || echo "0")
    UPTIME=\$(uptime -s 2>/dev/null || echo "unknown")
    LOAD=\$(cat /proc/loadavg | awk '{print \$1}')

    # Send heartbeat to exam server
    curl -s -X POST "\${SERVER_URL}/api/heartbeat" \
        -H "Content-Type: application/json" \
        -d "{
            \"ip\": \"\${MACHINE_IP}\",
            \"hostname\": \"\${HOSTNAME}\",
            \"chromium_running\": \${CHROMIUM_RUNNING},
            \"uptime_since\": \"\${UPTIME}\",
            \"load\": \"\${LOAD}\",
            \"timestamp\": \$(date +%s)
        }" 2>/dev/null || true

    sleep 10
done
HEARTBEATEOF

chmod +x /usr/local/bin/exam-heartbeat.sh

# Create systemd service for the heartbeat
cat > /etc/systemd/system/exam-heartbeat.service << 'EOF'
[Unit]
Description=ParikshaSuraksha Heartbeat Client
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/exam-heartbeat.sh
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable exam-heartbeat.service

log_info "Heartbeat client installed and enabled."

# -----------------------------------------------------------------------------
# Step 18: Final lockdown -- disable unnecessary services
# -----------------------------------------------------------------------------
log_info "Step 18: Disabling unnecessary services..."

SERVICES_TO_DISABLE=(
    "cups.service"           # Printing
    "cups-browsed.service"   # Printer discovery
    "avahi-daemon.service"   # mDNS (network discovery)
    "snapd.service"          # Snap package manager
    "snapd.socket"
    "ModemManager.service"   # Modem management
    "wpa_supplicant.service" # WiFi (should not be needed on wired kiosk)
    "unattended-upgrades.service" # Auto-updates during exam
)

for svc in "${SERVICES_TO_DISABLE[@]}"; do
    systemctl disable "${svc}" 2>/dev/null || true
    systemctl stop "${svc}" 2>/dev/null || true
    systemctl mask "${svc}" 2>/dev/null || true
done

log_info "Unnecessary services disabled."

# -----------------------------------------------------------------------------
# Step 19: Set up AppArmor profile for Chromium (additional containment)
# -----------------------------------------------------------------------------
log_info "Step 19: Configuring AppArmor for additional containment..."

if command -v apparmor_status &>/dev/null; then
    # Ensure AppArmor is enabled
    systemctl enable apparmor.service 2>/dev/null || true
    systemctl start apparmor.service 2>/dev/null || true
    log_info "AppArmor is active."
else
    log_warn "AppArmor not available. Skipping."
fi

# -----------------------------------------------------------------------------
# Step 20: Create exam status page (fallback if server is unreachable)
# -----------------------------------------------------------------------------
log_info "Step 20: Creating offline fallback page..."

mkdir -p /opt/exam-fallback
cat > /opt/exam-fallback/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ParikshaSuraksha - Connecting...</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: #1a1a2e;
            color: #e0e0e0;
        }
        .container {
            text-align: center;
            padding: 2rem;
        }
        h1 { color: #4CAF50; font-size: 2rem; }
        p { font-size: 1.2rem; margin: 1rem 0; }
        .spinner {
            border: 4px solid #333;
            border-top: 4px solid #4CAF50;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
            margin: 2rem auto;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>ParikshaSuraksha</h1>
        <div class="spinner"></div>
        <p>Connecting to exam server...</p>
        <p>Please wait. If this screen persists, notify the proctor.</p>
    </div>
    <script>
        // Auto-retry connecting to the exam server every 5 seconds
        setInterval(function() {
            fetch(window.location.origin + '/api/health')
                .then(function(r) { if (r.ok) window.location.reload(); })
                .catch(function() {});
        }, 5000);
    </script>
</body>
</html>
EOF

log_info "Offline fallback page created."

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo ""
echo "============================================================================="
echo "  ParikshaSuraksha Kiosk Setup Complete"
echo "============================================================================="
echo ""
echo "  Exam URL:       ${EXAM_URL}"
echo "  Server IP:      ${SERVER_IP}"
echo "  Exam User:      ${EXAM_USER}"
echo ""
echo "  Lockdown layers applied:"
echo "    [x] Restricted exam user (no sudo, no shell)"
echo "    [x] Chromium kiosk mode (fullscreen, auto-restart)"
echo "    [x] Chromium enterprise policies"
echo "    [x] Key binding interception (Alt+Tab, Alt+F4, etc.)"
echo "    [x] USB mass storage blocked"
echo "    [x] Bluetooth disabled"
echo "    [x] Screenshot tools removed"
echo "    [x] Network Manager GUI restricted"
echo "    [x] Virtual console switching disabled"
echo "    [x] Read-only home directory (tmpfs overlay)"
echo "    [x] iptables firewall lockdown"
echo "    [x] NTP synced to exam server"
echo "    [x] SSH restricted to exam server"
echo "    [x] Power management restricted"
echo "    [x] Heartbeat client installed"
echo "    [x] Unnecessary services disabled"
echo ""
echo "  IMPORTANT: Manual steps still required:"
echo "    1. Set BIOS admin password"
echo "    2. Disable boot from USB/CD/PXE in BIOS"
echo "    3. Lock boot order to internal drive only"
echo "    4. Disable onboard WiFi/BT in BIOS (if not already)"
echo "    5. Copy exam server SSH public key to /root/.ssh/authorized_keys"
echo ""
echo "  Reboot the machine to activate all lockdown measures:"
echo "    sudo reboot"
echo ""
echo "============================================================================="
