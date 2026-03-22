# ParikshaSuraksha -- LAN-Based Exam Lockdown Deployment Guide

> Preparation for TCS iON-style deployment where exam centers have dedicated machines.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Hardware Requirements](#hardware-requirements)
3. [Network Configuration](#network-configuration)
4. [Exam Server Setup](#exam-server-setup)
5. [Kiosk Machine Setup](#kiosk-machine-setup)
6. [Machine Hardening Checklist](#machine-hardening-checklist)
7. [Custom Kiosk Mode](#custom-kiosk-mode)
8. [Day-of-Exam Procedures](#day-of-exam-procedures)
9. [Troubleshooting](#troubleshooting)
10. [Security Model](#security-model)

---

## Architecture Overview

```
                    +-----------------------+
                    |   Exam Center LAN     |
                    |   (No Internet)       |
                    +-----------+-----------+
                                |
                    +-----------+-----------+
                    |   Exam Server         |
                    |   192.168.1.1         |
                    |   - nginx             |
                    |   - mvp-server.js     |
                    |   - dnsmasq           |
                    |   - NTP server        |
                    |   - Monitor dashboard |
                    +-----------+-----------+
                                |
            +-------------------+-------------------+
            |                   |                   |
    +-------+-------+  +-------+-------+  +-------+-------+
    |  Kiosk #1     |  |  Kiosk #2     |  |  Kiosk #N     |
    |  192.168.1.11 |  |  192.168.1.12 |  |  192.168.1.xx |
    |  Chromium     |  |  Chromium     |  |  Chromium     |
    |  Kiosk Mode   |  |  Kiosk Mode   |  |  Kiosk Mode   |
    +---------------+  +---------------+  +---------------+
```

Each exam center operates as a fully isolated LAN. The exam server holds all
questions, assets, and timing data. Kiosk machines are hardened Ubuntu boxes
running Chromium in locked-down kiosk mode. No machine has internet access
during the exam window.

---

## Hardware Requirements

### Exam Server
- CPU: 4+ cores (Intel i5/i7 or equivalent)
- RAM: 8 GB minimum (16 GB recommended for 100+ candidates)
- Storage: 256 GB SSD
- Network: Gigabit Ethernet (two NICs recommended: one for LAN, one for
  pre-exam data sync)
- UPS: mandatory -- server must not lose power during exam

### Kiosk Machines (per candidate station)
- CPU: 2+ cores (Intel i3 or equivalent)
- RAM: 4 GB minimum
- Storage: 64 GB SSD (or diskless boot via PXE if available)
- Display: 15" minimum, 1366x768 or higher
- Network: Gigabit Ethernet (wired only -- WiFi card physically removed or
  disabled in BIOS)
- Peripherals: USB keyboard, USB mouse (no other USB devices)
- UPS: recommended

### Network
- Managed Gigabit switch (24/48 port depending on center size)
- Cat6 Ethernet cables
- No wireless access points connected to exam LAN

---

## Network Configuration

### LAN Topology

The exam center uses a flat private network: `192.168.1.0/24`.

| Device          | IP Address      | Role                          |
|-----------------|-----------------|-------------------------------|
| Exam Server     | 192.168.1.1     | Server, DNS, NTP, DHCP, proxy |
| Kiosk machines  | 192.168.1.11-250| Candidate workstations        |
| Admin terminal  | 192.168.1.2     | Proctor/admin (optional)      |

### DHCP Configuration (on exam server via dnsmasq)

```
# /etc/dnsmasq.d/exam-dhcp.conf
interface=eth0
dhcp-range=192.168.1.11,192.168.1.250,255.255.255.0,12h
dhcp-option=option:router,192.168.1.1
dhcp-option=option:dns-server,192.168.1.1
dhcp-option=option:ntp-server,192.168.1.1
```

### DNS Configuration

The local DNS resolves `pariksha.local` to the exam server and blocks all
other domains:

```
# /etc/dnsmasq.d/exam-dns.conf
address=/pariksha.local/192.168.1.1
address=/#/0.0.0.0
```

This means:
- `pariksha.local` -> 192.168.1.1 (exam server)
- Everything else -> 0.0.0.0 (blocked)

### Isolating the LAN from the Internet

**Before the exam:**
1. Physically disconnect the uplink cable from the switch/router to the ISP.
2. Verify no WiFi access points are active on the exam LAN.
3. On the exam server, confirm no default gateway:
   ```bash
   ip route show | grep default
   # Should return nothing during exam
   ```

**After the exam:**
1. Reconnect uplink for result upload.
2. Upload results from exam server to central ParikshaSuraksha cloud.
3. Disconnect again.

### Firewall (iptables on each kiosk)

Run `iptables-lockdown.sh` on each kiosk machine. This ensures that even if a
candidate somehow bypasses Chromium, raw network access is limited to the exam
server only.

---

## Exam Server Setup

Run `exam-server-setup.sh` on the server machine. The script will:

1. Install Node.js (v20 LTS), nginx, dnsmasq, chrony (NTP)
2. Clone or copy the ParikshaSuraksha repository
3. Configure nginx as a reverse proxy for the Node.js application
4. Set up local DNS via dnsmasq
5. Configure NTP server for synchronized exam timing
6. Pre-cache all exam data (questions, media, assignments)

### Pre-Exam Data Sync

Before the exam day (or early morning of exam day):

```bash
# Connect exam server to internet temporarily
# Pull latest exam data
cd /opt/pariksha-suraksha
node scripts/sync-exam-data.js --exam-id EXAM_2026_001

# Verify data integrity
node scripts/verify-exam-cache.js

# Disconnect internet
sudo ip link set eth1 down  # assuming eth1 is WAN interface
```

### Offline Mode

The entire system works without internet once exam data is cached. The
`mvp-server.js` serves all assets locally. All candidate responses are stored
in the local SQLite database and synced to the cloud after the exam.

---

## Kiosk Machine Setup

### Fresh Install

1. Install Ubuntu 22.04 LTS Server (minimal) on each kiosk machine.
2. Connect to the exam LAN.
3. Copy `kiosk-setup.sh` to the machine (via USB stick or SCP from exam server).
4. Run as root:

```bash
chmod +x kiosk-setup.sh
sudo ./kiosk-setup.sh --exam-url "http://pariksha.local" --server-ip "192.168.1.1"
```

5. Reboot. The machine should auto-login as `exam` user and launch Chromium in
   kiosk mode pointing to the exam URL.

### What the Script Does

- Creates a restricted `exam` user (no sudo, no shell escape)
- Installs Chromium and Xorg (minimal display server)
- Applies Chromium enterprise policies (from `chromium-policy.json`)
- Disables keyboard shortcuts (Alt+Tab, Alt+F4, Ctrl+Alt+Del, etc.)
- Blocks USB mass storage at the kernel module level
- Disables Bluetooth
- Removes screenshot tools
- Hides Network Manager GUI
- Configures auto-login and auto-start
- Sets up a read-only home directory with tmpfs overlay
- Blocks virtual console switching
- Applies iptables lockdown rules

---

## Machine Hardening Checklist

Use this checklist for every kiosk machine before the exam:

### BIOS/Firmware
- [ ] Set BIOS/UEFI admin password
- [ ] Disable boot from USB, CD/DVD, PXE (boot only from internal SSD)
- [ ] Disable Secure Boot bypass options
- [ ] Lock boot order to internal drive only
- [ ] Disable onboard WiFi and Bluetooth in BIOS if available
- [ ] Enable chassis intrusion detection if available

### Operating System
- [ ] `kiosk-setup.sh` executed successfully
- [ ] `exam` user exists with no sudo privileges
- [ ] Root password is set and known only to admin
- [ ] SSH is disabled or restricted to exam server IP only
- [ ] No other user accounts exist besides `root` and `exam`
- [ ] AppArmor or SELinux is enabled and enforcing
- [ ] Automatic updates are disabled (prevent mid-exam disruption)

### Network
- [ ] Ethernet cable connected to exam LAN switch
- [ ] WiFi adapter physically removed or disabled in BIOS
- [ ] `iptables-lockdown.sh` applied
- [ ] Machine receives IP via DHCP from exam server
- [ ] `pariksha.local` resolves to exam server IP
- [ ] No other domains resolve

### Display and Input
- [ ] Chromium launches in fullscreen kiosk mode on boot
- [ ] No window decorations, address bar, or tab bar visible
- [ ] Alt+Tab does nothing
- [ ] Alt+F4 does nothing
- [ ] Ctrl+Alt+Del does nothing
- [ ] Ctrl+Alt+F1-F12 does nothing (no VT switching)
- [ ] Right-click context menu is disabled in exam app
- [ ] Print Screen does nothing

### Peripherals
- [ ] USB mass storage is blocked (test with a USB stick)
- [ ] Bluetooth is disabled
- [ ] No printers configured
- [ ] Only keyboard and mouse are connected

### Software
- [ ] No terminal emulator accessible
- [ ] No file manager accessible
- [ ] No screenshot tools installed
- [ ] No package manager GUI
- [ ] Chromium developer tools are disabled
- [ ] Chromium extensions are blocked

---

## Custom Kiosk Mode

### How It Works

The kiosk mode uses a minimal X11 session (no desktop environment). On boot:

1. `lightdm` auto-logs in as `exam` user.
2. `~exam/.xsession` starts:
   - `xbindkeys` (to swallow dangerous key combinations)
   - `unclutter` (to hide cursor when idle)
   - Chromium in `--kiosk` mode pointing to `http://pariksha.local`
3. Chromium is the ONLY window. There is no window manager, no taskbar, no
   desktop.
4. If Chromium crashes, the `.xsession` script restarts it automatically.
5. If the X session dies, `lightdm` restarts it automatically.

### Chromium Launch Flags

```bash
chromium-browser \
    --kiosk \
    --no-first-run \
    --disable-translate \
    --disable-infobars \
    --disable-suggestions-service \
    --disable-save-password-bubble \
    --disable-session-crashed-bubble \
    --disable-component-update \
    --disable-background-networking \
    --disable-sync \
    --disable-features=TranslateUI \
    --noerrdialogs \
    --no-default-browser-check \
    --autoplay-policy=no-user-gesture-required \
    --disable-dev-tools \
    --disable-extensions \
    --incognito \
    --start-fullscreen \
    --start-maximized \
    "http://pariksha.local"
```

### Chromium Enterprise Policies

The file `chromium-policy.json` is installed to:
- `/etc/chromium/policies/managed/pariksha-policy.json`

These policies enforce restrictions at the browser engine level, which cannot
be overridden by the user even if they somehow access Chromium settings.

---

## Day-of-Exam Procedures

### T-60 Minutes (1 hour before exam)

1. Power on the exam server.
2. Verify exam server services:
   ```bash
   sudo systemctl status nginx
   sudo systemctl status pariksha-server
   sudo systemctl status dnsmasq
   sudo systemctl status chrony
   ```
3. Verify exam data is cached:
   ```bash
   curl http://localhost:3000/api/health
   curl http://localhost:3000/api/exam/status
   ```
4. Start the monitor dashboard:
   ```bash
   ./monitor-dashboard.sh
   ```

### T-30 Minutes

5. Power on all kiosk machines.
6. Watch the monitor dashboard -- all machines should appear within 2 minutes.
7. Verify each machine shows the ParikshaSuraksha login screen.
8. Walk through the room and visually inspect each screen.

### T-10 Minutes

9. Allow candidates into the room.
10. Candidates log in with their exam credentials.
11. Exam does NOT start until the proctor triggers it from the admin panel.

### T-0 (Exam Start)

12. Proctor clicks "Start Exam" on admin panel (`http://pariksha.local/admin`).
13. All candidate screens simultaneously show the first question.
14. Timer is synchronized via NTP -- all machines show the same remaining time.

### During Exam

15. Monitor the dashboard for:
    - Offline machines (network issue or hardware failure)
    - High violation counts (candidate tampering attempts)
    - Unusual patterns (many candidates finishing too fast)
16. If a machine crashes, it will auto-reboot into kiosk mode. The candidate's
    progress is saved server-side; they log in again and resume.

### Post-Exam

17. Exam auto-submits when time expires.
18. Proctor verifies all submissions on admin panel.
19. Connect exam server to internet.
20. Upload results:
    ```bash
    cd /opt/pariksha-suraksha
    node scripts/upload-results.js --exam-id EXAM_2026_001
    ```
21. Power down all kiosk machines.
22. Disconnect internet.

---

## Troubleshooting

### Kiosk machine does not get an IP address
- Check Ethernet cable connection.
- Verify dnsmasq is running on the exam server: `systemctl status dnsmasq`
- Check the switch port LEDs.

### Chromium shows "This site can't be reached"
- Verify nginx and pariksha-server are running on the exam server.
- From the kiosk, test: `ping 192.168.1.1` (if you have SSH access).
- Check DNS: `nslookup pariksha.local 192.168.1.1`

### Machine boots to a blank screen
- The X session may have failed. SSH in from the exam server:
  ```bash
  ssh root@192.168.1.XX
  systemctl restart lightdm
  ```

### Candidate's exam progress is lost
- Progress is saved server-side after each answer. The candidate simply logs
  in again.

### A machine has high violation count
- This means the machine detected tampering attempts (blocked key combos,
  blocked URLs, etc.).
- Physically inspect the candidate's station.
- The proctor may choose to flag or disqualify the candidate.

### Exam timer is out of sync
- Verify chrony is running on the exam server.
- On the kiosk: `chronyc tracking` (via SSH).
- The exam timer is driven by the server, not the client clock. Minor client
  clock drift is acceptable.

---

## Security Model

ParikshaSuraksha uses **defense-in-depth**. Every layer assumes the previous
layer might fail:

| Layer | Control | What it prevents |
|-------|---------|------------------|
| 1 | Physical LAN isolation | Internet access, external communication |
| 2 | iptables on each kiosk | Network escape even if DNS/proxy bypassed |
| 3 | Chromium enterprise policy | Browser-level URL/feature restrictions |
| 4 | Chromium kiosk mode | No address bar, tabs, or window controls |
| 5 | Key binding interception | Alt+Tab, Alt+F4, Ctrl+Alt+Del blocked |
| 6 | No desktop environment | No taskbar, file manager, or app launcher |
| 7 | USB storage blocked | No data exfiltration via USB |
| 8 | Bluetooth disabled | No data exfiltration via BT |
| 9 | VT switch disabled | No access to virtual consoles |
| 10 | Read-only home directory | No persistent local storage by candidate |
| 11 | No dev tools/extensions | No browser-level code injection |
| 12 | Server-side exam logic | Timing, scoring, and submission on server |
| 13 | Monitoring dashboard | Real-time visibility into all machines |
| 14 | BIOS lock | No boot from external media |

Even if a technically sophisticated candidate defeats one or two layers, the
remaining layers still prevent meaningful cheating. The monitoring dashboard
also alerts proctors to any anomalous behavior.

---

## File Reference

| File | Purpose |
|------|---------|
| `kiosk-setup.sh` | Transforms a fresh Ubuntu machine into an exam kiosk |
| `iptables-lockdown.sh` | Network firewall rules for each kiosk |
| `exam-server-setup.sh` | Sets up the exam center local server |
| `chromium-policy.json` | Chromium enterprise policy for lockdown |
| `monitor-dashboard.sh` | Terminal dashboard for real-time monitoring |
| `README.md` | This documentation |
