#!/usr/bin/env python3
"""build_meta.py — agent 8 of the cc-portfolio dashboard build.

Reads the extraction pipeline state at ~/projects/youtube/cc-portfolio/ and
writes two artifacts into ~/projects/sites/cc-portfolio/data/:

  - meta.json       (counts, palette, provenance)
  - by_video.json   ({video_id: full extraction dict including evidence_quote})

Stdlib only. Never crashes — missing inputs degrade gracefully to empty state.
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from pathlib import Path

# ---- Paths ---------------------------------------------------------------

PIPELINE = Path("/home/seb/projects/youtube/cc-portfolio")
VALIDATE_CACHE = PIPELINE / "2-validate" / "cache"
DATES_CACHE = PIPELINE / "data" / "cc_dates_cache.json"
TRANSCRIPTS_DIR = Path("/home/seb/projects/youtube/transcripts-top/crypto-currently")
WORKSPACE_ROOT = Path("/home/seb/projects")

SITE_DATA = Path("/home/seb/projects/sites/cc-portfolio/data")
META_OUT = SITE_DATA / "meta.json"
BY_VIDEO_OUT = SITE_DATA / "by_video.json"

# Hardcoded from CONTRACT.md — do not change without coordinating with all agents.
ASSET_PALETTE = {
    "BTC": "#F7931A",
    "ETH": "#627EEA",
    "SOL": "#14F195",
    "ADA": "#0033AD",
    "AVAX": "#E84142",
    "LINK": "#2A5ADA",
    "DOGE": "#C2A633",
    "XRP": "#23292F",
    "MSTR": "#1D1D1F",
    "USD": "#7FAE6C",
    "OTHER": "#888888",
}

EXTRACTOR_MODEL = "qwen2.5:7b-instruct (local, Ollama)"

# ---- Tiny YAML frontmatter parser ---------------------------------------

_FN_DATE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})[-.]")
_FRONT_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
# Match simple `key: value` (value can be quoted or a YYYY-MM-DD date).
_KV_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*?)\s*$")


def _unquote(v: str) -> str:
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in ('"', "'"):
        return v[1:-1]
    return v


def parse_frontmatter(md_text: str) -> dict:
    """Extract top-level scalar keys from YAML frontmatter. Lists/objects are skipped."""
    m = _FRONT_RE.match(md_text)
    if not m:
        return {}
    block = m.group(1)
    out: dict = {}
    for line in block.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        # skip list continuation / nested
        if line.startswith(" ") or line.startswith("\t"):
            continue
        km = _KV_RE.match(line)
        if not km:
            continue
        key, raw = km.group(1), km.group(2)
        # Skip arrays / objects for our purposes
        if raw.startswith("[") or raw.startswith("{"):
            continue
        out[key] = _unquote(raw)
    return out


def filename_date(name: str) -> str | None:
    m = _FN_DATE_RE.match(name)
    if not m:
        return None
    s = m.group(1)
    try:
        datetime.strptime(s, "%Y-%m-%d")
    except ValueError:
        return None
    return s


# ---- Pipeline scan -------------------------------------------------------


def list_transcripts(channel_dir: Path) -> list[Path]:
    if not channel_dir.is_dir():
        return []
    out = []
    for p in sorted(channel_dir.glob("*.md")):
        if p.name.startswith("_") or p.name.startswith("."):
            continue
        out.append(p)
    return out


def index_transcripts_by_video_id(paths: list[Path]) -> dict[str, dict]:
    """video_id -> {path, title, video_url, date_in_yaml (str or None)}"""
    idx: dict[str, dict] = {}
    for p in paths:
        try:
            txt = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        fm = parse_frontmatter(txt)
        vid = fm.get("video_id")
        if not vid:
            continue
        date_yaml = fm.get("date")
        if date_yaml:
            date_yaml = date_yaml.strip()[:10]
            try:
                datetime.strptime(date_yaml, "%Y-%m-%d")
            except ValueError:
                date_yaml = None
        idx[vid] = {
            "path": p,
            "title": fm.get("title") or "",
            "video_url": fm.get("video_url") or "",
            "date_yaml": date_yaml,
        }
    return idx


def load_dates_lookup(cache_path: Path) -> dict[str, str]:
    if not cache_path.exists():
        return {}
    try:
        raw = json.loads(cache_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(raw, dict):
        return {}
    out: dict[str, str] = {}
    for k, v in raw.items():
        if k.startswith("_"):
            continue
        if isinstance(v, str) and len(v) >= 10:
            out[k] = v[:10]
    return out


def workspace_relative(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(WORKSPACE_ROOT.resolve()))
    except ValueError:
        return str(path.resolve())


def resolve_date(
    vp_date,
    transcript_meta: dict | None,
    video_id: str,
    dates_lookup: dict[str, str],
) -> tuple[str | None, str | None]:
    """Mirror reconcile.py priority: portfolio > filename > backfill.

    Returns (iso_date_or_None, source_or_None).
    """
    # 1. portfolio (date from validated JSON, originally from transcript YAML)
    if vp_date:
        if isinstance(vp_date, str) and vp_date.strip():
            return vp_date.strip()[:10], "portfolio"

    # 2. filename
    if transcript_meta is not None:
        fn_d = filename_date(transcript_meta["path"].name)
        if fn_d:
            return fn_d, "filename"

    # 3. backfill
    bf = dates_lookup.get(video_id)
    if bf:
        return bf[:10], "backfill"

    return None, None


# ---- Main ----------------------------------------------------------------


def build() -> int:
    transcripts = list_transcripts(TRANSCRIPTS_DIR)
    n_videos_total = len(transcripts)
    transcript_idx = index_transcripts_by_video_id(transcripts)
    dates_lookup = load_dates_lookup(DATES_CACHE)

    by_video: dict[str, dict] = {}
    date_source_counts = {"portfolio": 0, "filename": 0, "backfill": 0}
    n_videos_dated = 0
    n_holdings = 0
    n_actions = 0

    cache_files: list[Path] = []
    if VALIDATE_CACHE.is_dir():
        cache_files = sorted(VALIDATE_CACHE.glob("*.json"))

    for jp in cache_files:
        try:
            vp = json.loads(jp.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as e:
            print(f"[build_meta] skip malformed {jp.name}: {e}", file=sys.stderr)
            continue
        if not isinstance(vp, dict):
            print(f"[build_meta] skip non-dict {jp.name}", file=sys.stderr)
            continue

        vid = vp.get("video_id") or jp.stem
        tmeta = transcript_idx.get(vid)
        cal_date, src = resolve_date(vp.get("date"), tmeta, vid, dates_lookup)
        if src:
            date_source_counts[src] = date_source_counts.get(src, 0) + 1
        if cal_date:
            n_videos_dated += 1

        holdings = vp.get("holdings") or []
        actions = vp.get("actions") or []
        cash = vp.get("cash_position")
        if not isinstance(holdings, list):
            holdings = []
        if not isinstance(actions, list):
            actions = []
        # count cash as a holding row for parity with reconcile.py CSV emission
        n_holdings += len(holdings) + (1 if cash else 0)
        n_actions += len(actions)

        title = tmeta["title"] if tmeta else ""
        video_url = tmeta["video_url"] if tmeta else ""
        tr_rel = workspace_relative(tmeta["path"]) if tmeta else ""

        by_video[vid] = {
            "video_id": vid,
            "title": title,
            "calendar_date": cal_date,
            "video_url": video_url,
            "transcript_path": tr_rel,
            "extractor_confidence": vp.get("extractor_confidence"),
            "holdings": holdings,
            "actions": actions,
            "cash_position": cash,
        }

    n_videos_extracted = len(by_video)
    extraction_in_progress = n_videos_extracted < n_videos_total

    meta = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "n_videos_total": n_videos_total,
        "n_videos_extracted": n_videos_extracted,
        "n_videos_dated": n_videos_dated,
        "n_holdings": n_holdings,
        "n_actions": n_actions,
        "date_source_counts": date_source_counts,
        "extractor_model": EXTRACTOR_MODEL,
        "extraction_in_progress": extraction_in_progress,
        "asset_palette": ASSET_PALETTE,
    }

    SITE_DATA.mkdir(parents=True, exist_ok=True)
    META_OUT.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    BY_VIDEO_OUT.write_text(json.dumps(by_video, indent=2) + "\n", encoding="utf-8")

    print(
        f"[build_meta] wrote {META_OUT.name}: "
        f"{n_videos_extracted}/{n_videos_total} extracted, "
        f"{n_videos_dated} dated, {n_holdings} holdings, {n_actions} actions"
    )
    print(f"[build_meta] wrote {BY_VIDEO_OUT.name}: {len(by_video)} videos")
    return 0


if __name__ == "__main__":
    raise SystemExit(build())
