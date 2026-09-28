#!/bin/bash
# Neural Translate - Local AI Server Control Script

ACTION="$1"

case "$ACTION" in
  start)
    systemctl --user start neural-llama.service
    echo "Started neural-llama.service"
    ;;
  stop)
    systemctl --user stop neural-llama.service
    # Also ensure any rogue llama-server processes are terminated
    pkill -f "llama-server.*28491" 2>/dev/null
    echo "Stopped neural-llama.service"
    ;;
  status)
    systemctl --user is-active --quiet neural-llama.service && echo "active" || echo "inactive"
    ;;
  enable-autostart)
    systemctl --user enable neural-llama.service
    echo "Autostart enabled"
    ;;
  disable-autostart)
    systemctl --user disable neural-llama.service
    echo "Autostart disabled"
    ;;
  autostart-status)
    systemctl --user is-enabled --quiet neural-llama.service 2>/dev/null && echo "enabled" || echo "disabled"
    ;;
  *)
    echo "Usage: $0 {start|stop|status|enable-autostart|disable-autostart|autostart-status}"
    exit 1
    ;;
esac
