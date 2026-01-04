"""
Tradera importer (REFRESH + FULL BACKFILL)
-----------------------------------------
- Incremental mode: keep DB updated with newest ended auctions
- Full mode: go backwards in time (historical backfill)

ENV REQUIRED:
- DATABASE_URL
- TRADERA_APP_ID
- TRADERA_APP_KEY

OPTIONAL:
- MODE=INCREMENTAL | FULL   (default INCREMENTAL)
- MAX_REQUESTS=200
- TRADERA_CATEGORY_ID=1001337
"""

from __future__ import annotations

import os
import sys
import time
import json
import uuid
import traceback
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

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
ITEMS_PER_PAGE = 50
MAX_REQUESTS = int(os.getenv("MAX_REQUESTS", "10"))
MODE = (os.getenv("MODE", "INCREMENTAL") or "INCREMENTAL").upper()

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
    if not v:
        return None
    return datetime.fromisoformat(v.replace("Z", "+00:00")).astimezone(pytz.UTC)

def parse_images(el: ET.Element) -> List[str]:
    out = []
    for e in el.iter():
        if strip_ns(e.tag) == "Url" and e.text:
            out.append(e.text.strip())
    return out

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
    INSERT INTO tradera_sales (
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
# Main
# -----------------------------

def main():
    db_url = os.environ["DATABASE_URL"]
    app_id = os.environ["TRADERA_APP_ID"]
    app_key = os.environ["TRADERA_APP_KEY"]

    session = make_session()
    page = 1
    requests_used = 0
    imported = 0

    with psycopg2.connect(db_url) as conn:
        while requests_used < MAX_REQUESTS:
            log("fetch_page", page=page)

            xml = build_envelope(app_id, app_key, page)
            body = post_soap(session, xml)
            root = ET.fromstring(body)

            items = root.findall(".//t:Items", NS) or root.findall(".//Items")
            if not items:
                log("no_more_items")
                break

            rows: List[Row] = []
            for el in items:
                item_id = parse_int(find_text(el, "Id"))
                end_date = parse_dt(find_text(el, "EndDate"))
                if not item_id or not end_date:
                    continue

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

            log("page_done", page=page, imported=len(rows), total_imported=imported)

            page += 1
            time.sleep(SLEEP_MS / 1000)

    log("done", requests_used=requests_used, total_imported=imported)

if __name__ == "__main__":
    main()
