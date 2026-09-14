#!/bin/bash
# ====================================================================
#  Neural Translate - Local AI GPU Server Runner (Linux)
#  Runs llama-server on port 28491 with Vulkan/CUDA acceleration
#  Dedicated for Neural Translate Extension
# ====================================================================

PORT=28491
HOST="127.0.0.1"

# Find llama-server binary
SERVER_BIN=""
if [ -f "$HOME/.local/share/neural-translate/bin/llama-server" ]; then
  SERVER_BIN="$HOME/.local/share/neural-translate/bin/llama-server"
elif command -v llama-server &> /dev/null; then
  SERVER_BIN="$(which llama-server)"
elif [ -f "./bin/llama-server" ]; then
  SERVER_BIN="./bin/llama-server"
fi

# Find Model file (.gguf)
MODEL_FILE=""
if [ -f "$HOME/.local/share/neural-translate/models/gemma-4-E2B-it-Q4_K_M.gguf" ]; then
  MODEL_FILE="$HOME/.local/share/neural-translate/models/gemma-4-E2B-it-Q4_K_M.gguf"
elif [ -f "./models/gemma-4-E2B-it-Q4_K_M.gguf" ]; then
  MODEL_FILE="./models/gemma-4-E2B-it-Q4_K_M.gguf"
fi

if [ -z "$SERVER_BIN" ]; then
  echo "❌ Error: llama-server binary not found."
  echo "Please place llama-server inside ./bin/ or install it."
  exit 1
fi

if [ -z "$MODEL_FILE" ]; then
  echo "❌ Error: Model file (.gguf) not found."
  echo "Please place your model inside ./models/gemma-4-E2B-it-Q4_K_M.gguf"
  exit 1
fi

echo "========================================================="
echo " Starting Neural Translate Local AI Engine on port $PORT"
echo " Binary: $SERVER_BIN"
echo " Model:  $MODEL_FILE"
echo " URL:    http://$HOST:$PORT/v1/chat/completions"
echo "========================================================="

exec "$SERVER_BIN"   --model "$MODEL_FILE"   --port "$PORT"   --host "$HOST"   -ngl 99   -fa on   -c 32768 -ctk q8_0 -ctv q8_0   -t 6   -np 2   --reasoning off   --reasoning-budget 0   --log-disable
