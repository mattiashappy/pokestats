"""
Tradera importer (REFRESH ONLY, SOAP) -> PostgreSQL
- Purpose: keep DB up-to-date with newest ended auctions (incremental).
- Locked: ItemsPerPage = 50 (small responses).
- Budget-safe: MAX_REQUESTS caps daily usage.
- Early-stop: stops when it hits already-imported data (watermark + overlap).

Required ENV:
- DATABASE_URL
- TRADERA_APP_ID
- TRADERA_APP_KEY

Optional ENV:
- TRADERA_CATEGORY_ID (default 1001337)
- MAX_REQUESTS (default 10)                 # hard cap requests per run
- SLEEP_MS (default 150)
- TZ (default Europe/Stockholm)

Filters (optional):
- ITEM_STATUS (default Ended)
- ITEM_TYPE (default Auction)
- BIDS_MINIMUM (default 1)
- ORDER_BY (default EndDateDescending)      # will be forced if wrong

Incremental tuning:
- INCREMENTAL_OVERLAP_MINUTES (default 10)

Network tuning:
- TRADERA_CONNECT_TIMEOUT (default 10)
- TRADERA_READ_TIMEOUT (default 60)
- TRADERA_RETRIES (default 6)
- TRADERA_BACKOFF (default 0.8)

DB assumptions:
- tradera_sales has unique constraint on item_id
- columns: item_id, category_id, end_date, price, bid_count, seller_id, seller_alias,
          seller_dsr, title, description, item_url, thumbnail_url, image_urls, attributes, card_id (nullable)
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

# LOCKED to 50 rows per response (as requested)
ITEMS_PER_PAGE = 50

# Refresh should always start from page 1
START_PAGE = 1

# Budget guard
MAX_REQUESTS = int(os.getenv("MAX_REQUESTS", "10"))

SLEEP_MS = int(os.getenv("SLEEP_MS", "150"))

ITEM_STATUS = os.getenv("ITEM_STATUS", "Ended")
ITEM_TYPE = os.getenv("ITEM_TYPE", "Auction")
BIDS_MINIMUM = os.getenv("BIDS_MINIMUM", "1")
ORDER_BY = os.getenv("ORDER_BY", "EndDateDescending")

TZ_NAME = os.getenv("TZ") or os.getenv("LOCAL_TIMEZONE") or "Europe/Stockholm"
INCREMENTAL_OVERLAP_MINUTES = int(os.getenv("INCREMENTAL_OVERLAP_MINUTES", "10"))

CONNECT_TIMEOUT = float(os.getenv("TRADERA_CONNECT_TIMEOUT", "10"))
READ_TIMEOUT = float(os.getenv("TRADERA_READ_TIMEOUT", "60"))
TOTAL_RETRIES = int(os.getenv("TRADERA_RETRIES", "6"))
BACKOFF = float(os.getenv("TRADERA_BACKOFF", "0.8"))

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


def build_envelope(app_id: str, app_key: str, page_number: int) -> str:
    item_status_xml = f"<ItemStatus>{ITEM_STATUS}</ItemStatus>" if ITEM_STATUS else ""
    item_type_xml = f"<ItemType>{ITEM_TYPE}</ItemType>" if ITEM_TYPE else ""
    bids_min_xml = f"<BidsMinimum>{BIDS_MINIMUM}</BidsMinimum>" if BIDS_MINIMUM is not None else ""

    return f"""<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
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
    s.headers.update({"User-Agent": "pokestats-importer-refresh-50/1.0"})
    return s


def post_soap(session: requests.Session, xml_body: str) -> str:
    headers = {
        "Content-Type": "text/xml; charset=utf-8",
        # ASMX SOAP 1.1 often expects quoted SOAPAction
        "SOAPAction": f"\"{SOAP_ACTION}\"",
    }
    r = session.post(
        API_URL,
        data=xml_body.encode("utf-8"),
        headers=headers,
        timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
    )
    if r.status_code >= 400:
        snippet = (r.text or "")[:800].replace("\n", " ")
        raise RuntimeError(f"HTTP {r.status_code} from Tradera. Body: {snippet}")
    return r.text


def parse_response(xml_text: str) -> Tuple[int, int, List[ET.Element]]:
    root = ET.fromstring(xml_text)
    total_items_el = root.find(".//t:TotalNumberOfItems", NS)
    total_pages_el = root.find(".//t:TotalNumberOfPages", NS)

    total_items = int(total_items_el.text) if total_items_el is not None and total_items_el.text else 0
    total_pages = int(total_pages_el.text) if total_pages_el is not None and total_pages_el.text else 0

    # Your original code used ".//t:Items" which likely returns the list container(s).
    # Many Tradera responses include t:Items containing repeated t:Item nodes.
    # We'll return t:Item nodes to simplify downstream parsing.
    item_nodes = root.findall(".//t:Items/t:Item", NS)
    if not item_nodes:
        # fallback for any variant schema
        item_nodes = root.findall(".//t:Item", NS)

    return total_items, total_pages, item_nodes


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


def build_attributes_payload(item_el: ET.Element) -> Dict[str, Any]:
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
    return attributes


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
    attributes: Dict[str, Any]
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
        attributes=build_attributes_payload(item_el),
    )


def normalize_card_value(value: Optional[str]) -> str:
    if not value:
        return "unknown"
    return " ".join(value.strip().lower().split()) or "unknown"


def extract_card_payload(row: Row) -> Dict[str, Optional[str]]:
    def attr_value(*keys: str) -> Optional[str]:
        if not row.attributes:
            return None
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


def get_db_watermark_end_date(conn) -> Optional[datetime]:
    with conn.cursor() as cur:
        cur.execute("SELECT max(end_date) FROM tradera_sales;")
        val = cur.fetchone()[0]
    return val


def main() -> None:
    app_id = require_env("TRADERA_APP_ID")
    app_key = require_env("TRADERA_APP_KEY")
    db_url = require_env("DATABASE_URL")

    global ORDER_BY
    if ORDER_BY != "EndDateDescending":
        log("REFRESH requires ORDER_BY=EndDateDescending for early-stop. Overriding.")
        ORDER_BY = "EndDateDescending"

    log(
        f"REFRESH(50) category={CATEGORY_ID} items_per_page={ITEMS_PER_PAGE} "
        f"max_requests={MAX_REQUESTS} bids_min={BIDS_MINIMUM} status={ITEM_STATUS!r} type={ITEM_TYPE!r} "
        f"timeouts=({CONNECT_TIMEOUT},{READ_TIMEOUT}) retries={TOTAL_RETRIES} backoff={BACKOFF}"
    )

    session = make_session()

    with psycopg2.connect(db_url) as conn:
        watermark_end_date = get_db_watermark_end_date(conn)
        watermark_cutoff: Optional[datetime] = None

        if watermark_end_date is None:
            log("REFRESH: DB empty -> will import up to MAX_REQUESTS pages starting from newest.")
        else:
            watermark_cutoff = watermark_end_date - timedelta(minutes=INCREMENTAL_OVERLAP_MINUTES)
            log(
                f"REFRESH watermark: max(end_date)={watermark_end_date.isoformat()} UTC, "
                f"cutoff(with overlap {INCREMENTAL_OVERLAP_MINUTES}m)={watermark_cutoff.isoformat()} UTC"
            )

        page = START_PAGE
        imported_total = 0
        pages_fetched = 0
        requests_used = 0

        while requests_used < MAX_REQUESTS:
            log(f"Fetching page {page}... ({requests_used+1}/{MAX_REQUESTS})")

            envelope = build_envelope(app_id, app_key, page)
            xml_resp = post_soap(session, envelope)
            requests_used += 1

            total_items, total_pages, item_nodes = parse_response(xml_resp)

            if page == 1:
                log(f"API totals (snapshot): total_items={total_items}, total_pages={total_pages}")

            if not item_nodes:
                log("No items returned; stopping.")
                break

            rows: List[Row] = []
            oldest_on_page: Optional[datetime] = None

            for el in item_nodes:
                row = parse_item(el)
                if not row:
                    continue
                if oldest_on_page is None or row.end_date < oldest_on_page:
                    oldest_on_page = row.end_date

                # Incremental filter: keep only items newer than cutoff
                if watermark_cutoff is not None and row.end_date <= watermark_cutoff:
                    continue

                rows.append(row)

            upsert(conn, rows)
            imported_total += len(rows)
            pages_fetched += 1

            log(
                f"Page {page}/{total_pages or '?'} received={len(item_nodes)} imported={len(rows)} "
                f"total_imported={imported_total}"
                + (f" oldest_end_date_on_page={oldest_on_page.isoformat()}" if oldest_on_page else "")
            )

            # Early stop: if entire page is older than cutoff, next pages will be even older
            if watermark_cutoff is not None and oldest_on_page is not None and oldest_on_page <= watermark_cutoff:
                log("REFRESH: reached already-imported cutoff; stopping early.")
                break

            if total_pages and page >= total_pages:
                log("Reached last page.")
                break

            page += 1
            if SLEEP_MS > 0:
                time.sleep(SLEEP_MS / 1000.0)

    log(f"DONE: requests_used={requests_used}, pages_fetched={pages_fetched}, total_imported={imported_total}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"FAILED: {e}")
        sys.exit(1)
