# OTNT Backend

## Prereqs
- Linux with WireGuard tools installed:
  - Debian/Ubuntu: `sudo apt install wireguard wireguard-tools`
  - Fedora: `sudo dnf install wireguard-tools`
- `/etc/wireguard/` must exist.
- Run backend as root or allow sudo for `cp`, `chmod`, `rm`, `wg-quick`, `wg`:
  - Easiest: `sudo node index.js`

## Run
