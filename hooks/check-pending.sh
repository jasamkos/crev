#!/usr/bin/env bash

PENDING=".crev-pending"

# No marker — nothing to report
if [ ! -f "$PENDING" ]; then
  exit 0
fi

# Read and output the marker contents
REVIEW_PATH=$(grep '^review:' "$PENDING" | cut -d' ' -f2-)
BRANCH=$(grep '^branch:' "$PENDING" | cut -d' ' -f2-)
SUMMARY=$(grep '^summary:' "$PENDING" | cut -d' ' -f2-)
FINDINGS=$(sed -n '/^findings:/,$p' "$PENDING" | tail -n +2)

echo "crev review completed for branch '${BRANCH}':"
echo "${SUMMARY}"
echo ""
echo "Findings:"
echo "${FINDINGS}"
echo ""
echo "Full report: ${REVIEW_PATH}"

# Remove the marker so we don't notify again
rm -f "$PENDING"

exit 0
