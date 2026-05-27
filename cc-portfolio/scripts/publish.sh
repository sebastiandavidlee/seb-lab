#!/usr/bin/env bash
# publish.sh — agent 8 of the cc-portfolio dashboard build.
# Idempotent: safe to re-run as extraction produces more cache files.
set -e
HERE=$(dirname "$(realpath "$0")")
SITE_DIR=$(dirname "$HERE")
PIPELINE=/home/seb/projects/youtube/cc-portfolio

echo "[publish] reconcile..."
( cd "$PIPELINE" && source .venv/bin/activate && python 3-reconcile/reconcile.py ) \
  || echo "[publish] reconcile failed (likely empty cache); continuing"

mkdir -p "$SITE_DIR/data"
cp -f "$PIPELINE/4-report/out/portfolio_holdings_long.csv" "$SITE_DIR/data/" 2>/dev/null || true
cp -f "$PIPELINE/4-report/out/portfolio_actions_long.csv"  "$SITE_DIR/data/" 2>/dev/null || true
cp -f "$PIPELINE/4-report/out/portfolio_snapshot_wide.csv" "$SITE_DIR/data/" 2>/dev/null || true
cp -f "$PIPELINE/data/skool_portfolio_snapshots.json"      "$SITE_DIR/data/" 2>/dev/null || true

echo "[publish] refresh BTC price..."
python3 "$PIPELINE/orchestrate/refresh_btc_price.py" || echo "[publish] btc-price refresh failed; continuing"

echo "[publish] build meta..."
python3 "$HERE/build_meta.py"

echo "[publish] done. CSVs + meta in $SITE_DIR/data/"
