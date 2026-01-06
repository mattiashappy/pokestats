"""
Tradera importer (REFRESH + FULL BACKFILL)
-----------------------------------------
- Incremental mode: keep DB updated with newest ended auctions (bounded by MAX_REQUESTS)
- Full mode: go backwards in time (historical backfill)

ENV REQUIRED:
- DATABASE_URL
- TRADERA_APP_ID
- TRADERA_APP_KEY

OPTIONAL:
- MODE=INCREMENTAL | FULL   (default INCREMENTAL)
- MAX_REQUESTS=200          (used in INCREMENTAL)
- TRADERA_CATEGORY_ID=1001337
- ITEMS_PER_PAGE=50

FULL MODE OPTIONS:
- START_DATE=2025-11-01     (anchor date; script will SEEK to the first page that contains items <= this date,
                             then import from there and keep going older)
- FULL_START_PAGE=0         (if >0, skip SEEK and start importing from this page directly)
- FULL_MAX_PAGES=0          (0 = unlimited; otherwise import at most N pages in FULL mode after starting page)
- SEEK_TIMEOUT_PAGES=25     (max number of seek-requests before giving up)

OPTIONAL FILTER:
- BIDS_MINIMUM=1            (adds <BidsMinimum> to request, matches your Postman test)
"""

from __future__ import annotations

import os
import sys
import time
import json
import uuid
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import psycopg2
import pytz
import requests
import xml.etree.ElementTree as ET
from psycopg2.extras import Json, execute_batch
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# -----------------------------
# Config
# -----------------------------

API_URL = "https://api.tradera.com/v3/SearchService.asmx"
SOAP_ACTION = "http://api.tradera.com/SearchAdvanced"

CATEGORY_ID = int(os.getenv("TRADERA_CATEGORY_ID", "1001337"))
ITEMS_PER_PAGE = int(os.getenv("ITEMS_PER_PAGE", "50"))

MAX_REQUESTS = int(os.getenv("MAX_REQUESTS", "10"))
MODE = (os.getenv("MODE", "INCREMENTAL") or "INCREMENTAL").upper()

# FULL mode behavior
START_DATE = os.getenv("START_DATE")  # anchor date e.g. "2025-11-01"
FULL_START_PAGE = int(os.getenv("FULL_START_PAGE", "0"))  # if > 0 skip seek
FULL_MAX_PAGES = int(os.getenv("FULL_MAX_PAGES", "0"))  # 0 = unlimited
SEEK_TIMEOUT_PAGES = int(os.getenv("SEEK_TIMEOUT_PAGES", "25"))  # max seek requests

# Optional filter
BIDS_MINIMUM = os.getenv("BIDS_MINIMUM")  # e.g. "1"

ORDER_BY = "EndDateDescending"
ITEM_STATUS = "Ended"
ITEM_TYPE = "Auction"

CONNECT_TIMEOUT = 10
READ_TIMEOUT = 60
SLEEP_MS = 150

RUN_UUID = str(uuid.uuid4())

NS = {
    "soap": "http://schemas.xmlsoap.org/soap/envelope/",
    "t": "http://api.tradera.com",
}

# -----------------------------
# Logging
# -----------------------------

def log(event: str, **fields: Any) -> None:
    payload = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "event": event,
        "run_uuid": RUN_UUID,
    }
    payload.update(fields)
    print(json.dumps(payload, ensure_ascii=False))
    sys.stdout.flush()

# -----------------------------
# SOAP helpers
# -----------------------------

def build_envelope(app_id: str, app_key: str, page: int) -> str:
    bids_min_xml = f"<BidsMinimum>{BIDS_MINIMUM}</BidsMinimum>" if BIDS_MINIMUM else ""
    return f"""<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <AuthenticationHeader xmlns="http://api.tradera.com">
      <AppId>{app_id}</AppId>
      <AppKey>{app_key}</AppKey>
    </AuthenticationHeader>
  </soap:Header>
  <soap:Body>
    <SearchAdvanced xmlns="http://api.tradera.com">
      <request>
        <CategoryId>{CATEGORY_ID}</CategoryId>
        <ItemStatus>{ITEM_STATUS}</ItemStatus>
        <ItemType>{ITEM_TYPE}</ItemType>
        {bids_min_xml}
        <OrderBy>{ORDER_BY}</OrderBy>
        <ItemsPerPage>{ITEMS_PER_PAGE}</ItemsPerPage>
        <PageNumber>{page}</PageNumber>
      </request>
    </SearchAdvanced>
  </soap:Body>
</soap:Envelope>
"""

def make_session() -> requests.Session:
    s = requests.Session()
    retry = Retry(
        total=6,
        backoff_factor=0.8,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=("POST",),
    )
    s.mount("https://", HTTPAdapter(max_retries=retry))
    return s

def post_soap(session: requests.Session, xml: str) -> str:
    r = session.post(
        API_URL,
        data=xml.encode("utf-8"),
        headers={
            "Content-Type": "text/xml; charset=utf-8",
            "SOAPAction": f"\"{SOAP_ACTION}\"",
        },
        timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
    )
    r.raise_for_status()
    return r.text

# -----------------------------
# Parsing helpers
# -----------------------------

def strip_ns(tag: str) -> str:
    return tag.split("}", 1)[1] if "}" in tag else tag

def find_text(el: ET.Element, name: str) -> Optional[str]:
    for e in el.iter():
        if strip_ns(e.tag) == name and e.text:
            return e.text.strip()
    return None

def parse_int(v: Optional[str]) -> Optional[int]:
    try:
        return int(v) if v else None
    except Exception:
        return None

def parse_dt(v: Optional[str]) -> Optional[datetime]:
    """
    Tradera EndDate example:
      2026-01-05T22:27:02.4435496+01:00   (7 fractional digits)
    Python's datetime.fromisoformat supports up to 6 digits, so we trim.
    """
    if not v:
        return None

    s = v.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"

    # Trim fractional seconds to max 6 digits if longer
    s = re.sub(r"(\.\d{6})\d+([+-]\d{2}:\d{2})$", r"\1\2", s)

    try:
        return datetime.fromisoformat(s).astimezone(pytz.UTC)
    except Exception:
        return None

def parse_images(el: ET.Element) -> List[str]:
    out: List[str] = []
    for e in el.iter():
        if strip_ns(e.tag) == "Url" and e.text:
            out.append(e.text.strip())
    return out

def parse_start_date(s: Optional[str]) -> Optional[datetime]:
    """
    Accepts YYYY-MM-DD (recommended). Interprets as midnight UTC.
    """
    if not s:
        return None
    dt = datetime.fromisoformat(s.strip())
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

def extract_total_pages(root: ET.Element) -> Optional[int]:
    # Works regardless of namespaces because we iterate + strip.
    for e in root.iter():
        if strip_ns(e.tag) == "TotalNumberOfPages" and e.text:
            return parse_int(e.text.strip())
    return None

def extract_items(root: ET.Element) -> List[ET.Element]:
    return root.findall(".//t:Items", NS) or root.findall(".//Items")

def extract_page_date_range(items: List[ET.Element]) -> Optional[Tuple[datetime, datetime]]:
    """
    Returns (newest, oldest) EndDate found on page, in UTC.
    """
    dates: List[datetime] = []
    for el in items:
        dt = parse_dt(find_text(el, "EndDate"))
        if dt:
            dates.append(dt.astimezone(timezone.utc))
    if not dates:
        return None
    return (max(dates), min(dates))

# -----------------------------
# Row model
# -----------------------------

@dataclass
class Row:
    item_id: int
    category_id: int
    end_date: datetime
    price: Optional[int]
    bid_count: Optional[int]
    seller_id: Optional[int]
    seller_alias: Optional[str]
    title: Optional[str]
    description: Optional[str]
    item_url: Optional[str]
    thumbnail_url: Optional[str]
    image_urls: List[str]
    attributes: Dict[str, Any]

    def as_params(self) -> Dict[str, Any]:
        return {
            "item_id": self.item_id,
            "category_id": self.category_id,
            "end_date": self.end_date,
            "price": self.price,
            "bid_count": self.bid_count,
            "seller_id": self.seller_id,
            "seller_alias": self.seller_alias,
            "title": self.title,
            "description": self.description,
            "item_url": self.item_url,
            "thumbnail_url": self.thumbnail_url,
            "image_urls": Json(self.image_urls),
            "attributes": Json(self.attributes),
        }

# -----------------------------
# DB helpers
# -----------------------------

def upsert_sales(conn, rows: List[Row]) -> None:
    if not rows:
        return

    sql = """
    INSERT INTO auctions (
        item_id, category_id, end_date, price, bid_count,
        seller_id, seller_alias, title, description,
        item_url, thumbnail_url, image_urls, attributes
    )
    VALUES (
        %(item_id)s, %(category_id)s, %(end_date)s, %(price)s, %(bid_count)s,
        %(seller_id)s, %(seller_alias)s, %(title)s, %(description)s,
        %(item_url)s, %(thumbnail_url)s, %(image_urls)s, %(attributes)s
    )
    ON CONFLICT (item_id) DO NOTHING;
    """
    with conn.cursor() as cur:
        execute_batch(cur, sql, [r.as_params() for r in rows], page_size=100)
    conn.commit()

# -----------------------------
# SEEK logic (FULL mode)
# -----------------------------

def fetch_page(session: requests.Session, app_id: str, app_key: str, page: int) -> ET.Element:
    xml = build_envelope(app_id, app_key, page)
    body = post_soap(session, xml)
    return ET.fromstring(body)

def seek_start_page(
    session: requests.Session,
    app_id: str,
    app_key: str,
    start_dt: datetime,
) -> int:
    """
    Find a page number such that:
      newest_end_date >= start_dt >= oldest_end_date
    or (if we can’t bracket perfectly) returns the earliest page where oldest_end_date <= start_dt.
    Uses TotalNumberOfPages and binary search.
    """
    # 1) Fetch page 1 to get TotalNumberOfPages and date range
    root1 = fetch_page(session, app_id, app_key, 1)
    total_pages = extract_total_pages(root1)
    items1 = extract_items(root1)
    rng1 = extract_page_date_range(items1)

    if not total_pages:
        log("seek_failed_no_total_pages")
        return 1

    if not rng1:
        log("seek_failed_no_dates_page1", total_pages=total_pages)
        return 1

    newest1, oldest1 = rng1
    log("seek_page", page=1, total_pages=total_pages, newest=newest1.isoformat(), oldest=oldest1.isoformat())

    # If even page 1 is already older than start_dt, start at page 1
    if oldest1 <= start_dt:
        log("seek_done", reason="page1_already_reaches_start", start_date=start_dt.isoformat(), start_page=1)
        return 1

    # 2) Binary search between [1, total_pages]
    lo, hi = 1, total_pages
    best = total_pages  # earliest page found so far with oldest <= start_dt
    attempts = 0

    while lo <= hi and attempts < SEEK_TIMEOUT_PAGES:
        attempts += 1
        mid = (lo + hi) // 2

        root = fetch_page(session, app_id, app_key, mid)
        items = extract_items(root)
        rng = extract_page_date_range(items)

        if not items or not rng:
            # If we got empty, move "hi" left (mid too far?)
            log("seek_empty_page", page=mid)
            hi = mid - 1
            continue

        newest, oldest = rng
        log("seek_page", page=mid, newest=newest.isoformat(), oldest=oldest.isoformat())

        if oldest <= start_dt:
            # This page is old enough (contains items at/older than start). Try earlier pages too.
            best = min(best, mid)
            hi = mid - 1
        else:
            # Not old enough; go to later pages.
            lo = mid + 1

    log("seek_done", start_date=start_dt.isoformat(), start_page=best, attempts=attempts, total_pages=total_pages)
    return best

# -----------------------------
# Main
# -----------------------------

def main():
    db_url = os.environ["DATABASE_URL"]
    app_id = os.environ["TRADERA_APP_ID"]
    app_key = os.environ["TRADERA_APP_KEY"]

    session = make_session()

    start_dt = parse_start_date(START_DATE)

    log(
        "start",
        mode=MODE,
        category_id=CATEGORY_ID,
        items_per_page=ITEMS_PER_PAGE,
        max_requests=MAX_REQUESTS,
        start_date=START_DATE,
        full_start_page=FULL_START_PAGE,
        full_max_pages=FULL_MAX_PAGES,
        bids_minimum=BIDS_MINIMUM,
    )

    # Decide initial page
    if MODE == "FULL":
        if FULL_START_PAGE > 0:
            page = FULL_START_PAGE
            log("full_start_from_page", page=page, reason="FULL_START_PAGE")
        elif start_dt:
            page = seek_start_page(session, app_id, app_key, start_dt)
            log("full_start_from_page", page=page, reason="SEEK_START_DATE", start_date=start_dt.isoformat())
        else:
            page = 1
            log("full_start_from_page", page=page, reason="default_page_1_no_start_date")
    else:
        page = 1

    requests_used = 0
    imported = 0
    full_pages_imported = 0

    with psycopg2.connect(db_url) as conn:
        while True:
            # INCREMENTAL: bounded
            if MODE != "FULL" and requests_used >= MAX_REQUESTS:
                break

            # FULL: optional safety bound AFTER we start importing
            if MODE == "FULL" and FULL_MAX_PAGES > 0 and full_pages_imported >= FULL_MAX_PAGES:
                log("full_max_pages_reached", full_max_pages=FULL_MAX_PAGES)
                break

            log("fetch_page", page=page)

            xml = build_envelope(app_id, app_key, page)
            body = post_soap(session, xml)
            root = ET.fromstring(body)

            items = extract_items(root)
            if not items:
                log("no_more_items")
                break

            rows: List[Row] = []
            page_dates: List[datetime] = []

            for el in items:
                item_id = parse_int(find_text(el, "Id"))
                end_date = parse_dt(find_text(el, "EndDate"))
                if not item_id or not end_date:
                    continue

                page_dates.append(end_date.astimezone(timezone.utc))

                rows.append(Row(
                    item_id=item_id,
                    category_id=CATEGORY_ID,
                    end_date=end_date,
                    price=parse_int(find_text(el, "MaxBid")),
                    bid_count=parse_int(find_text(el, "BidCount")),
                    seller_id=parse_int(find_text(el, "SellerId")),
                    seller_alias=find_text(el, "SellerAlias"),
                    title=find_text(el, "ShortDescription"),
                    description=find_text(el, "LongDescription"),
                    item_url=find_text(el, "ItemUrl"),
                    thumbnail_url=find_text(el, "ThumbnailLink"),
                    image_urls=parse_images(el),
                    attributes={},
                ))

            upsert_sales(conn, rows)

            imported += len(rows)
            requests_used += 1
            if MODE == "FULL":
                full_pages_imported += 1

            if page_dates:
                oldest = min(page_dates)
                newest = max(page_dates)
                log(
                    "page_done",
                    page=page,
                    imported=len(rows),
                    total_imported=imported,
                    oldest_end_date=oldest.isoformat(),
                    newest_end_date=newest.isoformat(),
                )
            else:
                log("page_done", page=page, imported=0, total_imported=imported)

            page += 1
            time.sleep(SLEEP_MS / 1000)

    log("done", requests_used=requests_used, total_imported=imported, last_page=page)

if __name__ == "__main__":
    main()
