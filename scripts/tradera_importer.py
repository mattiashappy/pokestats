"""
Tradera importer (RAW SOAP) -> PostgreSQL

Network-robust: timeouts + retries with backoff.
Pagination-robust: retries + skip empty pages (prevents early stop).
Card linking: creates/updates cards table and stores card_id on tradera_sales.

ENV (Heroku config vars):
Required:
- DATABASE_URL
- TRADERA_APP_ID
- TRADERA_APP_KEY

Optional:
- TRADERA_CATEGORY_ID (default 1001337)
- ITEMS_PER_PAGE (default 500)
- START_PAGE (default 1)
- MAX_PAGES (default 10000)
- SLEEP_MS (default 150)

- ITEM_STATUS (default Ended)
- ITEM_TYPE (default Auction)
- BIDS_MINIMUM (default 1)
- ORDER_BY (default EndDateDescending)

- MODE (default FULL)          # FULL or YESTERDAY
- TZ   (default Europe/Stockholm)

Network tuning:
- TRADERA_CONNECT_TIMEOUT (default 10)
- TRADERA_READ_TIMEOUT (default 60)
- TRADERA_RETRIES (default 6)
- TRADERA_BACKOFF (default 0.8)

Empty page handling:
- EMPTY_PAGE_RETRIES (default 3)
- EMPTY_PAGE_SKIP_LIMIT (default 10)

DB assumptions:
- tradera_sales has column card_id (nullable int, FK optional)
- cards has unique constraint on (name, set_name) for ON CONFLICT
"""

from __future__ import annotations

import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import psycopg2
import pytz
import requests
import xml.etree.ElementTree as ET
from psycopg2.extras import Json, execute_batch
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


API_URL = "https://api.tradera.com/v3/SearchService.asmx"
SOAP_ACTION = "http://api.tradera.com/SearchAdvanced"

CATEGORY_ID = int(os.getenv("TRADERA_CATEGORY_ID", "1001337"))
ITEMS_PER_PAGE = int(os.getenv("ITEMS_PER_PAGE", "500"))
START_PAGE = int(os.getenv("START_PAGE", "1"))
MAX_PAGES = int(os.getenv("MAX_PAGES", "10000"))
SLEEP_MS = int(os.getenv("SLEEP_MS", "150"))

ITEM_STATUS = os.getenv("ITEM_STATUS", "Ended")
ITEM_TYPE = os.getenv("ITEM_TYPE", "Auction")
BIDS_MINIMUM = os.getenv("BIDS_MINIMUM", "1")
ORDER_BY = os.getenv("ORDER_BY", "EndDateDescending")

MODE = (os.getenv("MODE", "FULL") or "FULL").upper()
TZ_NAME = os.getenv("TZ") or os.getenv("LOCAL_TIMEZONE") or "Europe/Stockholm"

# Network tuning (Heroku-friendly)
CONNECT_TIMEOUT = float(os.getenv("TRADERA_CONNECT_TIMEOUT", "10"))
READ_TIMEOUT = float(os.getenv("TRADERA_READ_TIMEOUT", "60"))
TOTAL_RETRIES = int(os.getenv("TRADERA_RETRIES", "6"))
BACKOFF = float(os.getenv("TRADERA_BACKOFF", "0.8"))

# Empty page handling
EMPTY_PAGE_RETRIES = int(os.getenv("EMPTY_PAGE_RETRIES", "3"))
EMPTY_PAGE_SKIP_LIMIT = int(os.getenv("EMPTY_PAGE_SKIP_LIMIT", "10"))

NS = {
    "soap": "http://schemas.xmlsoap.org/soap/envelope/",
    "t": "http://api.tradera.com",
}


def log(msg: str) -> None:
    sys.stdout.write(msg + "\n")
    sys.stdout.flush()


def require_env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise RuntimeError(f"Missing required env var {name}")
    return v.strip()


def calc_yesterday_window(tz_name: str) -> Tuple[datetime, datetime]:
    tz = pytz.timezone(tz_name)
    now_local = datetime.now(tz)
    today_start = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)
    return yesterday_start, today_start


def build_envelope(app_id: str, app_key: str, page_number: int) -> str:
    item_status_xml = f"<ItemStatus>{ITEM_STATUS}</ItemStatus>" if ITEM_STATUS else ""
    item_type_xml = f"<ItemType>{ITEM_TYPE}</ItemType>" if ITEM_TYPE else ""
    bids_min_xml = f"<BidsMinimum>{BIDS_MINIMUM}</BidsMinimum>"

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
        {item_type_xml}
        {item_status_xml}
        {bids_min_xml}
        <OrderBy>{ORDER_BY}</OrderBy>
        <ItemsPerPage>{ITEMS_PER_PAGE}</ItemsPerPage>
        <PageNumber>{page_number}</PageNumber>
      </request>
    </SearchAdvanced>
  </soap:Body>
</soap:Envelope>"""


def make_session() -> requests.Session:
    s = requests.Session()

    retry = Retry(
        total=TOTAL_RETRIES,
        connect=TOTAL_RETRIES,
        read=TOTAL_RETRIES,
        status=TOTAL_RETRIES,
        backoff_factor=BACKOFF,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("POST",),
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=10, pool_maxsize=10)
    s.mount("https://", adapter)
    s.mount("http://", adapter)

    s.headers.update({"User-Agent": "pokestats-importer-raw/1.0"})
    return s


def post_soap(session: requests.Session, xml_body: str) -> str:
    headers = {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": SOAP_ACTION,
    }
    r = session.post(
        API_URL,
        data=xml_body.encode("utf-8"),
        headers=headers,
        timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
    )

    if r.status_code >= 400:
        snippet = (r.text or "")[:500].replace("\n", " ")
        raise RuntimeError(f"HTTP {r.status_code} from Tradera. Body: {snippet}")

    return r.text


def parse_response(xml_text: str) -> Tuple[int, int, List[ET.Element]]:
    root = ET.fromstring(xml_text)

    total_items_el = root.find(".//t:TotalNumberOfItems", NS)
    total_pages_el = root.find(".//t:TotalNumberOfPages", NS)

    total_items = int(total_items_el.text) if total_items_el is not None and total_items_el.text else 0
    total_pages = int(total_pages_el.text) if total_pages_el is not None and total_pages_el.text else 0

    items = root.findall(".//t:Items", NS)
    return total_items, total_pages, items


def get_text(el: Optional[ET.Element]) -> Optional[str]:
    return el.text.strip() if el is not None and el.text else None


def parse_int(el: Optional[ET.Element]) -> Optional[int]:
    t = get_text(el)
    if not t:
        return None
    try:
        return int(float(t))
    except Exception:
        return None


def parse_float(el: Optional[ET.Element]) -> Optional[float]:
    t = get_text(el)
    if not t:
        return None
    try:
        return float(t)
    except Exception:
        return None


def parse_bool(el: Optional[ET.Element]) -> Optional[bool]:
    t = get_text(el)
    if t is None:
        return None
    return t.strip().lower() in {"1", "true", "yes"}


def parse_dt(el: Optional[ET.Element]) -> Optional[datetime]:
    t = get_text(el)
    if not t:
        return None
    dt = datetime.fromisoformat(t.replace("Z", "+00:00"))
    return dt.astimezone(pytz.UTC)


def parse_image_links(item_el: ET.Element) -> List[str]:
    urls: List[str] = []
    for link in item_el.findall(".//t:ImageLinks/t:ImageLink", NS):
        url_el = link.find("t:Url", NS)
        if url_el is not None and url_el.text:
            urls.append(url_el.text.strip())
    return urls


def parse_attributes(item_el: ET.Element) -> Dict[str, List[str]]:
    out: Dict[str, List[str]] = {}
    for tav in item_el.findall(".//t:AttributeValues/t:TermAttributeValues/t:TermAttributeValue", NS):
        name = get_text(tav.find("t:Name", NS))
        if not name:
            continue
        values: List[str] = []
        for s in tav.findall(".//t:Values/t:string", NS):
            if s.text:
                values.append(s.text.strip())
        out[name] = values
    return out


@dataclass
class Row:
    item_id: int
    category_id: int
    end_date: datetime
    price: Optional[int]
    bid_count: Optional[int]
    seller_id: Optional[int]
    seller_alias: Optional[str]
    seller_dsr: Optional[float]
    title: Optional[str]
    description: Optional[str]
    item_url: Optional[str]
    thumbnail_url: Optional[str]
    image_urls: List[str]
    attributes: Dict[str, Any]  # allow "_meta" with bool/int/float
    card_id: Optional[int] = None

    def as_params(self) -> Dict[str, object]:
        return {
            "item_id": self.item_id,
            "category_id": self.category_id,
            "end_date": self.end_date,
            "price": self.price,
            "bid_count": self.bid_count,
            "seller_id": self.seller_id,
            "seller_alias": self.seller_alias,
            "seller_dsr": self.seller_dsr,
            "title": self.title,
            "description": self.description,
            "item_url": self.item_url,
            "thumbnail_url": self.thumbnail_url,
            "image_urls": Json(self.image_urls),
            "attributes": Json(self.attributes),
            "card_id": self.card_id,
        }


def parse_item(item_el: ET.Element) -> Optional[Row]:
    item_id = parse_int(item_el.find("t:Id", NS))
    if item_id is None:
        return None

    end_date = parse_dt(item_el.find("t:EndDate", NS))
    if end_date is None:
        return None

    category_id = parse_int(item_el.find("t:CategoryId", NS)) or CATEGORY_ID

    attributes: Dict[str, Any] = parse_attributes(item_el)

    meta = {
        "has_bids": parse_bool(item_el.find("t:HasBids", NS)),
        "is_ended": parse_bool(item_el.find("t:IsEnded", NS)),
        "item_type": get_text(item_el.find("t:ItemType", NS)),
        "next_bid": parse_int(item_el.find("t:NextBid", NS)),
        "buy_it_now_price": parse_float(item_el.find("t:BuyItNowPrice", NS)),
    }
    meta = {k: v for k, v in meta.items() if v is not None}
    if meta:
        attributes["_meta"] = meta

    return Row(
        item_id=item_id,
        category_id=category_id,
        end_date=end_date,
        price=parse_int(item_el.find("t:MaxBid", NS)),
        bid_count=parse_int(item_el.find("t:BidCount", NS)),
        seller_id=parse_int(item_el.find("t:SellerId", NS)),
        seller_alias=get_text(item_el.find("t:SellerAlias", NS)),
        seller_dsr=parse_float(item_el.find("t:SellerDsrAverage", NS)),
        title=get_text(item_el.find("t:ShortDescription", NS)),
        description=get_text(item_el.find("t:LongDescription", NS)),
        item_url=get_text(item_el.find("t:ItemUrl", NS)),
        thumbnail_url=get_text(item_el.find("t:ThumbnailLink", NS)),
        image_urls=parse_image_links(item_el),
        attributes=attributes,
    )


def normalize_card_value(value: Optional[str]) -> str:
    if not value:
        return "unknown"
    return " ".join(value.strip().lower().split()) or "unknown"


def extract_card_payload(row: Row) -> Dict[str, Optional[str]]:
    def attr_value(*keys: str) -> Optional[str]:
        if not row.attributes:
            return None

        # row.attributes values are usually List[str], except "_meta"
        lower_map = {str(k).lower(): v for k, v in row.attributes.items()}
        for key in keys:
            values = lower_map.get(key.lower())
            if isinstance(values, list) and values:
                return str(values[0])
        return None

    raw_name = attr_value("card_name", "card name", "Card name") or row.title or "unknown card"
    raw_set = attr_value("series", "set", "pokemon_set", "Series", "Set")

    return {
        "name": normalize_card_value(raw_name),
        "era": attr_value("pokemon_era", "era", "generation", "Era", "Generation"),
        "set_name": normalize_card_value(raw_set) if raw_set else "unknown",
        "card_number": attr_value("card_number", "card number", "Card number"),
    }


def ensure_card(conn, payload: Dict[str, Optional[str]]) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO cards (name, era, set_name, card_number)
            VALUES (%(name)s, %(era)s, %(set_name)s, %(card_number)s)
            ON CONFLICT (name, set_name) DO UPDATE SET
                era = COALESCE(cards.era, EXCLUDED.era),
                card_number = COALESCE(cards.card_number, EXCLUDED.card_number)
            RETURNING id;
            """,
            payload,
        )
        row = cur.fetchone()
    return int(row[0])


def upsert(conn, rows: List[Row]) -> None:
    if not rows:
        return

    # Create/resolve cards and set card_id
    card_cache: Dict[Tuple[str, str], int] = {}
    for r in rows:
        payload = extract_card_payload(r)
        key = (payload["name"] or "unknown", payload["set_name"] or "unknown")
        if key not in card_cache:
            card_cache[key] = ensure_card(conn, payload)
        r.card_id = card_cache[key]

    sql = """
    INSERT INTO tradera_sales (
        item_id, category_id, end_date, price, bid_count, seller_id, seller_alias,
        seller_dsr, title, description, item_url, thumbnail_url, image_urls, attributes, card_id
    ) VALUES (
        %(item_id)s, %(category_id)s, %(end_date)s, %(price)s, %(bid_count)s,
        %(seller_id)s, %(seller_alias)s, %(seller_dsr)s, %(title)s, %(description)s,
        %(item_url)s, %(thumbnail_url)s, %(image_urls)s, %(attributes)s, %(card_id)s
    )
    ON CONFLICT (item_id) DO UPDATE SET
        category_id = EXCLUDED.category_id,
        end_date = EXCLUDED.end_date,
        price = EXCLUDED.price,
        bid_count = EXCLUDED.bid_count,
        seller_id = EXCLUDED.seller_id,
        seller_alias = EXCLUDED.seller_alias,
        seller_dsr = EXCLUDED.seller_dsr,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        item_url = EXCLUDED.item_url,
        thumbnail_url = EXCLUDED.thumbnail_url,
        image_urls = EXCLUDED.image_urls,
        attributes = EXCLUDED.attributes,
        card_id = EXCLUDED.card_id;
    """

    with conn.cursor() as cur:
        execute_batch(cur, sql, [r.as_params() for r in rows], page_size=200)
    conn.commit()


def main() -> None:
    app_id = require_env("TRADERA_APP_ID")
    app_key = require_env("TRADERA_APP_KEY")
    db_url = require_env("DATABASE_URL")

    log(
        f"IMPORT mode={MODE}, category={CATEGORY_ID}, items_per_page={ITEMS_PER_PAGE}, "
        f"start_page={START_PAGE}, max_pages={MAX_PAGES}, bids_min={BIDS_MINIMUM}, "
        f"status={ITEM_STATUS!r}, type={ITEM_TYPE!r}, "
        f"timeouts=({CONNECT_TIMEOUT},{READ_TIMEOUT}), retries={TOTAL_RETRIES}, backoff={BACKOFF}"
    )

    session = make_session()

    y_start: Optional[datetime] = None
    y_end: Optional[datetime] = None
    if MODE == "YESTERDAY":
        y_start, y_end = calc_yesterday_window(TZ_NAME)
        log(f"Yesterday window: {y_start.isoformat()} -> {y_end.isoformat()} ({TZ_NAME})")

    total_pages: Optional[int] = None
    total_items: Optional[int] = None
    imported_total = 0
    pages_fetched = 0
    empty_pages_skipped = 0

    with psycopg2.connect(db_url) as conn:
        page = START_PAGE

        while page <= MAX_PAGES:
            log(f"Fetching page {page}...")
            envelope = build_envelope(app_id, app_key, page)

            # retry empty pages a few times
            item_elements: List[ET.Element] = []
            t_items = 0
            t_pages = 0

            for attempt in range(1, EMPTY_PAGE_RETRIES + 1):
                xml_resp = post_soap(session, envelope)
                t_items, t_pages, item_elements = parse_response(xml_resp)

                if item_elements:
                    break

                log(f"Page {page}: empty response (attempt {attempt}/{EMPTY_PAGE_RETRIES})")
                time.sleep(1.0 * attempt)

            if total_pages is None and t_pages:
                total_pages = t_pages
                total_items = t_items
                log(f"API totals: total_items={total_items}, total_pages={total_pages}")

            # If still empty -> skip (do not stop early)
            if not item_elements:
                empty_pages_skipped += 1
                log(f"Page {page}: still empty after retries; skipping (skipped={empty_pages_skipped}/{EMPTY_PAGE_SKIP_LIMIT})")
                if empty_pages_skipped >= EMPTY_PAGE_SKIP_LIMIT:
                    log("Too many empty pages; stopping to avoid endless run.")
                    break
                page += 1
                continue

            # reset empty page skip counter
            empty_pages_skipped = 0

            rows: List[Row] = []
            for el in item_elements:
                row = parse_item(el)
                if not row:
                    continue

                if MODE == "YESTERDAY":
                    assert y_start is not None and y_end is not None
                    tz = pytz.timezone(TZ_NAME)
                    end_local = row.end_date.astimezone(tz)
                    if not (y_start <= end_local < y_end):
                        continue

                rows.append(row)

            upsert(conn, rows)
            imported_total += len(rows)
            pages_fetched += 1

            log(
                f"Page {page}/{total_pages or '?'}: received={len(item_elements)}, imported={len(rows)}, total_imported={imported_total}"
            )

            if total_pages and page >= total_pages:
                log("Reached last page.")
                break

            page += 1
            if SLEEP_MS > 0:
                time.sleep(SLEEP_MS / 1000.0)

    log(f"DONE: pages_fetched={pages_fetched}, total_imported={imported_total}")
    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"FAILED: {e}")
        sys.exit(1)
