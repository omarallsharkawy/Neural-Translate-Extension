#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "========================================================="
echo "   Packaging Neural Translate Extension (Manifest V3)"
echo "========================================================="

VERSION=$(node -e "console.log(require('./manifest.json').version)")
DIST_DIR="$DIR/dist"
OUTPUT_ZIP="$DIST_DIR/neural-translate-v$VERSION.zip"

mkdir -p "$DIST_DIR"
rm -f "$OUTPUT_ZIP"

echo "Validating syntax..."
node -c background.js content/bidi-isolate.js content/content.js popup/popup.js reader/reader.js

echo "Bundling into $OUTPUT_ZIP..."
zip -r -q "$OUTPUT_ZIP" \
  manifest.json \
  background.js \
  icons/ \
  content/ \
  popup/ \
  reader/ \
  -x "*.DS_Store" "*~" "*.swp"

echo ""
echo "✅ Successfully created packed extension:"
ls -lh "$OUTPUT_ZIP"
echo ""
echo "This ZIP file is ready for:"
echo "1. Chrome Web Store upload"
echo "2. Brave / Edge / Opera Developer Dashboard"
echo "3. Direct unpacked or zipped distribution"
echo "========================================================="

