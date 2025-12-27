"""
Tradera importer (RAW SOAP) -> PostgreSQL

Uses the same working SOAP envelope as Postman (requests.post + SOAPAction),
then parses <Items> blocks and upserts into tradera_sales.

Modes:
- FULL (default): import ALL pages (or until MAX_PAGES)
- YESTERDAY: import only auctions ended "yesterday" in Europe/Stockholm (optional)

Config vars (Heroku):
Required:
- DATABASE_URL
- TRADERA_APP_ID
- TRADERA_APP_KEY

Optional:
- TRADERA_CATEGORY_ID (default 1001337)
- ITEMS_PER_PAGE (default 500)
- MAX_PAGES (default 10000 safety cap)
- SLEEP_MS (default 150)
- ITEM_STATUS (default Ended)   # set "" to omit element
- ITEM_TYPE (default Auction)   # set "" to omit element
- BIDS_MINIMUM (default 1)      # set 0 for no sold-filter
- ORDER_BY (default EndDateDescending)
- MODE (default FULL)           # FULL or YESTERDAY
- TZ (default Europe/Stockholm)

Table expected:
tradera_sales(item_id primary key, category_id, end_date, price, bid_count, seller_id,
             seller_alias, seller_dsr, title, description, item_url, thumbnail_url,
             image_urls jsonb, attributes jsonb)
"""

from __future__ import annotations

import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

import psycopg2
import pytz
import requests
import xml.etree.ElementTree as ET
from psycopg2.extras import Json, execute_batch


API_URL = "https://api.tradera.com/v3/SearchService.asmx"
SOAP_ACTION = "http://api.tradera.com/SearchAdvanced"

CATEGORY_ID = int(os.getenv("TRADERA_CATEGORY_ID", "1001337"))
ITEMS_PER_PAGE = int(os.getenv("ITEMS_PER_PAGE", "500"))
MAX_PAGES = int(os.getenv("MAX_PAGES", "10000"))  # safety ceiling
SLEEP_MS = int(os.getenv("SLEEP_MS", "150"))

ITEM_STATUS = os.getenv("ITEM_STATUS", "Ended")  # "" to omit
ITEM_TYPE = os.getenv("ITEM_TYPE", "Auction")    # "" to omit
BIDS_MINIMUM = os.getenv("BIDS_MINIMUM", "1")    # "0" to not filter sold-only
ORDER_BY = os.getenv("ORDER_BY", "EndDateDescending")

MODE = (os.getenv("MODE", "FULL") or "FULL").upper()  # FULL | YESTERDAY
TZ_NAME = os.getenv("TZ") or os.getenv("LOCAL_TIMEZONE") or "Europe/Stockholm"

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

    # Always include BidsMinimum element (Postman does); set "0" to disable filtering.
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


def post_soap(xml_body: str) -> str:
    headers = {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": SOAP_ACTION,
        "User-Agent": "pokestats-importer-raw/1.0",
    }
    r = requests.post(API_URL, data=xml_body.encode("utf-8"), headers=headers, timeout=60)
    r.raise_for_status()
    return r.text


def parse_response(xml_text: str) -> Tuple[int, int, List[ET.Element]]:
    root = ET.fromstring(xml_text)

    total_items_el = root.find(".//t:TotalNumberOfItems", NS)
    total_pages_el = root.find(".//t:TotalNumberOfPages", NS)

    total_items = int(total_items_el.text) if total_items_el is not None and total_items_el.text else 0
    total_pages = int(total_pages_el.text) if total_pages_el is not None and total_pages_el.text else 0

    # <Items> repeats
    items = root.findall(".//t:Items", NS)
    return total_items, total_pages, items


def get_text(el: Optional[ET.Element]) -> Optional[str]:
    if el is None:
        return None
    return el.text


def parse_int(el: Optional[ET.Element]) -> Optional[int]:
    t = get_text(el)
    if t is None or t == "":
        return None
    try:
        return int(float(t))
    except Exception:
        return None


def parse_float(el: Optional[ET.Element]) -> Optional[float]:
    t = get_text(el)
    if t is None or t == "":
        return None
    try:
        return float(t)
    except Exception:
        return None


def parse_dt(el: Optional[ET.Element]) -> Optional[datetime]:
    t = get_text(el)
    if not t:
        return None
    # Tradera returns ISO with offset +01:00 etc.
    dt = datetime.fromisoformat(t.replace("Z", "+00:00"))
    # store in UTC
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
    attributes: Dict[str, List[str]]

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
        }


def parse_item(item_el: ET.Element) -> Optional[Row]:
    item_id = parse_int(item_el.find("t:Id", NS))
    if item_id is None:
        return None

    category_id = parse_int(item_el.find("t:CategoryId", NS)) or CATEGORY_ID
    end_date = parse_dt(item_el.find("t:EndDate", NS))
    if end_date is None:
        return None

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
        attributes=parse_attributes(item_el),
    )


def upsert(conn, rows: List[Row]) -> None:
    if not rows:
        return

    sql = """
    INSERT INTO tradera_sales (
        item_id, category_id, end_date, price, bid_count, seller_id, seller_alias,
        seller_dsr, title, description, item_url, thumbnail_url, image_urls, attributes
    ) VALUES (
        %(item_id)s, %(category_id)s, %(end_date)s, %(price)s, %(bid_count)s,
        %(seller_id)s, %(seller_alias)s, %(seller_dsr)s, %(title)s, %(description)s,
        %(item_url)s, %(thumbnail_url)s, %(image_urls)s, %(attributes)s
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
        attributes = EXCLUDED.attributes;
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
        f"bids_min={BIDS_MINIMUM}, item_type={ITEM_TYPE!r}, item_status={ITEM_STATUS!r}, tz={TZ_NAME}"
    )

    if MODE == "YESTERDAY":
        y_start, y_end = calc_yesterday_window(TZ_NAME)
        log(f"Yesterday window: {y_start.isoformat()} -> {y_end.isoformat()} ({TZ_NAME})")

    pages_fetched = 0
    total_pages = None
    total_items = None
    imported_total = 0

    with psycopg2.connect(db_url) as conn:
        page = 1
        while page <= MAX_PAGES:
            envelope = build_envelope(app_id, app_key, page)
            xml_resp = post_soap(envelope)

            t_items, t_pages, item_elements = parse_response(xml_resp)

            if total_pages is None and t_pages:
                total_pages = t_pages
                total_items = t_items
                log(f"API totals: total_items={total_items}, total_pages={total_pages}")

            rows: List[Row] = []
            for el in item_elements:
                row = parse_item(el)
                if not row:
                    continue

                if MODE == "YESTERDAY":
                    tz = pytz.timezone(TZ_NAME)
                    end_local = row.end_date.astimezone(tz)
                    if not (y_start <= end_local < y_end):
                        continue

                rows.append(row)

            upsert(conn, rows)
            imported_total += len(rows)
            pages_fetched += 1

            log(f"Page {page}/{total_pages or '?'}: items_received={len(item_elements)}, imported={len(rows)}, total_imported={imported_total}")

            # stop conditions
            if total_pages and page >= total_pages:
                log("Reached last page.")
                break
            if not item_elements:
                log("No items returned; stopping.")
                break

            page += 1
            if SLEEP_MS > 0:
                time.sleep(SLEEP_MS / 1000.0)

    log(f"Done. pages_fetched={pages_fetched}, total_imported={imported_total}")
    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"FAILED: {e}")
        sys.exit(1)
