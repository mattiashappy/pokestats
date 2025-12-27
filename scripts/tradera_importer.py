"""
Daily importer for ended Pokémon card auctions from Tradera (SOAP SearchAdvanced).

✅ Designed for Heroku Scheduler (UTC).
✅ Uses TZ/LOCAL_TIMEZONE (default Europe/Stockholm) to compute "yesterday" window.
✅ Fetches Ended auctions, then filters locally to yesterday and upserts into PostgreSQL.
✅ Idempotent via ON CONFLICT (item_id) DO UPDATE.
✅ Robust to Tradera SOAP response shape differences (Items/SearchItem vs other keys).
✅ Includes required WSDL request fields + correct AuthenticationHeader namespace.

Heroku config vars needed:
- DATABASE_URL
- TRADERA_APP_ID
- TRADERA_APP_KEY
Optional:
- TRADERA_CATEGORY_ID (default 1001337)
- ITEMS_PER_PAGE (default 500)
- MAX_PAGES (default 100)
- TZ or LOCAL_TIMEZONE (default Europe/Stockholm)
- BIDS_MINIMUM (default 1) -> set to 0 if you want all ended, not only sold (>=1 bid)
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, Iterable, List, Optional, Tuple

import psycopg2
import pytz
import requests
from dateutil import parser as date_parser
from psycopg2.extras import Json, execute_batch
from zeep import Client, Settings, helpers
from zeep.transports import Transport

# --- Configuration constants ---
WSDL_URL = "https://api.tradera.com/v3/SearchService.asmx?WSDL"

CATEGORY_ID = int(os.getenv("TRADERA_CATEGORY_ID", "1001337"))
ITEMS_PER_PAGE = int(os.getenv("ITEMS_PER_PAGE", "500"))
MAX_PAGES = int(os.getenv("MAX_PAGES", "100"))

# If you want to include ended auctions with zero bids, set BIDS_MINIMUM=0 on Heroku.
BIDS_MINIMUM = int(os.getenv("BIDS_MINIMUM", "1"))

DEFAULT_TIMEZONE = os.getenv("TZ") or os.getenv("LOCAL_TIMEZONE") or "Europe/Stockholm"


@dataclass
class TraderaItem:
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

    @property
    def as_db_params(self) -> Dict[str, object]:
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


class TraderaClient:
    """SOAP client wrapper around SearchService.SearchAdvanced."""

    def __init__(self, app_id: str, app_key: str, timeout: int = 45) -> None:
        self.app_id = str(app_id).strip()
        self.app_key = str(app_key).strip()

        session = requests.Session()
        session.headers.update({"User-Agent": "pokestats-importer/1.0"})
        transport = Transport(session=session, timeout=timeout)
        settings = Settings(strict=False)

        self.client = Client(WSDL_URL, transport=transport, settings=settings)

        # Force correct header element name + namespace (Tradera expects this exact wrapper)
        from zeep import xsd

        self.auth_header_el = xsd.Element(
            "{http://api.tradera.com}AuthenticationHeader",
            xsd.ComplexType(
                [
                    xsd.Element("{http://api.tradera.com}AppId", xsd.String()),
                    xsd.Element("{http://api.tradera.com}AppKey", xsd.String()),
                ]
            ),
        )

    def search_page(self, page_number: int) -> dict:
        # These are required by the WSDL schema (or safe defaults to avoid "Missing element" errors).
        search_request = {
            "CategoryId": CATEGORY_ID,
            "ItemType": "Auction",
            "ItemStatus": "Ended",
            "OrderBy": "EndDateDescending",
            "BidsMinimum": BIDS_MINIMUM,
            "PageNumber": page_number,
            "ItemsPerPage": ITEMS_PER_PAGE,
            "SearchWords": "",
            "SearchInDescription": False,
            "CountyId": 0,
            "OnlyAuctionsWithBuyNow": False,
            "OnlyItemsWithThumbnail": False,
        }

        auth_header = self.auth_header_el(AppId=self.app_id, AppKey=self.app_key)

        response = self.client.service.SearchAdvanced(
            search_request,
            _soapheaders=[auth_header],
        )
        return helpers.serialize_object(response, target_cls=dict)


def log(msg: str) -> None:
    sys.stdout.write(msg + "\n")
    sys.stdout.flush()


def load_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable {name}")
    return value


def load_tradera_credentials() -> tuple[str, str]:
    app_id = os.getenv("TRADERA_APP_ID") or os.getenv("HEROKU_TRADERA_APP_ID")
    app_key = os.getenv("TRADERA_APP_KEY") or os.getenv("HEROKU_TRADERA_APP_KEY")

    missing = []
    if not app_id:
        missing.append("TRADERA_APP_ID")
    if not app_key:
        missing.append("TRADERA_APP_KEY")
    if missing:
        raise RuntimeError("Missing required environment variable(s): " + ", ".join(missing))

    return app_id.strip(), app_key.strip()


def _ensure_list(value) -> List:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def parse_attributes(raw_attributes: Optional[dict]) -> Dict[str, List[str]]:
    if not raw_attributes:
        return {}
    attributes: Dict[str, List[str]] = {}
    raw_list = raw_attributes.get("Attribute") or []
    for attribute in _ensure_list(raw_list):
        name = attribute.get("Name")
        values = _ensure_list(attribute.get("Values", {}).get("string"))
        if name:
            attributes[name] = [str(v) for v in values if v is not None]
    return attributes


def parse_image_links(raw_images: Optional[dict]) -> List[str]:
    if not raw_images:
        return []
    urls = raw_images.get("string")
    return [str(u) for u in _ensure_list(urls) if u]


def parse_tradera_item(raw_item: dict) -> TraderaItem:
    end_date = date_parser.isoparse(str(raw_item.get("EndDate"))).astimezone(pytz.UTC)

    attributes = parse_attributes(raw_item.get("Attributes"))
    image_urls = parse_image_links(raw_item.get("ImageLinks"))

    seller = raw_item.get("Seller") or {}
    return TraderaItem(
        item_id=int(raw_item.get("Id")),
        category_id=int(raw_item.get("CategoryId")),
        end_date=end_date,
        price=int(raw_item.get("MaxBid")) if raw_item.get("MaxBid") is not None else None,
        bid_count=int(raw_item.get("BidCount")) if raw_item.get("BidCount") is not None else None,
        seller_id=int(seller.get("Id")) if seller.get("Id") is not None else None,
        seller_alias=seller.get("Alias"),
        seller_dsr=float(seller.get("DSR")) if seller.get("DSR") is not None else None,
        title=raw_item.get("ShortDescription"),
        description=raw_item.get("LongDescription"),
        item_url=raw_item.get("ItemUrl") or raw_item.get("ItemURL"),
        thumbnail_url=raw_item.get("ThumbnailLink"),
        image_urls=image_urls,
        attributes=attributes,
    )


def calculate_yesterday_window(tz_name: str = DEFAULT_TIMEZONE) -> Tuple[datetime, datetime]:
    tz = pytz.timezone(tz_name)
    now_local = datetime.now(tz)
    today_start = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)
    yesterday_end = today_start
    return yesterday_start, yesterday_end


def filter_items_for_yesterday(items: Iterable[TraderaItem], tz_name: str) -> List[TraderaItem]:
    tz = pytz.timezone(tz_name)
    start, end = calculate_yesterday_window(tz_name)

    filtered: List[TraderaItem] = []
    for item in items:
        end_local = item.end_date.astimezone(tz)
        if start <= end_local < end:
            filtered.append(item)
    return filtered


def should_stop_pagination(parsed_items: List[TraderaItem], tz_name: str) -> bool:
    """
    Stop when the OLDEST item on this page is older than yesterday_start,
    since results are EndDateDescending -> subsequent pages are even older.
    """
    if not parsed_items:
        return False  # don't stop just because parsing gave nothing; let caller decide

    tz = pytz.timezone(tz_name)
    yesterday_start, _ = calculate_yesterday_window(tz_name)
    oldest_local = min(i.end_date.astimezone(tz) for i in parsed_items)
    return oldest_local < yesterday_start


def extract_raw_items(response: dict) -> List[dict]:
    """
    Robust extraction of items from Tradera response,
    handling slightly different shapes across SOAP serializers.
    """
    result = (response or {}).get("SearchAdvancedResult") or {}

    items_container = result.get("Items") or {}
    candidates = (
        items_container.get("SearchItem")
        or items_container.get("Item")
        or items_container.get("Items")
        or items_container.get("item")
    )

    # Sometimes "Items" itself is the list
    if isinstance(items_container, list):
        candidates = items_container

    raw_items = _ensure_list(candidates)

    # Filter out non-dict noise
    return [x for x in raw_items if isinstance(x, dict)]


def upsert_items(conn, items: List[TraderaItem]) -> None:
    if not items:
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
        execute_batch(cur, sql, [item.as_db_params for item in items], page_size=200)
    conn.commit()


def run_import() -> None:
    app_id, app_key = load_tradera_credentials()
    database_url = load_env("DATABASE_URL")
    tz_name = DEFAULT_TIMEZONE

    client = TraderaClient(app_id, app_key)

    yesterday_start, yesterday_end = calculate_yesterday_window(tz_name)
    log(
        f"Importing auctions ended between {yesterday_start.isoformat()} and {yesterday_end.isoformat()} ({tz_name})"
    )
    log(
        f"CategoryId={CATEGORY_ID}, ItemsPerPage={ITEMS_PER_PAGE}, MaxPages={MAX_PAGES}, BidsMinimum={BIDS_MINIMUM}"
    )

    pages_fetched = 0
    items_scanned = 0
    items_imported = 0
    page_number = 1

    with psycopg2.connect(database_url) as conn:
        while page_number <= MAX_PAGES:
            response = client.search_page(page_number)
            pages_fetched += 1

            raw_items = extract_raw_items(response)

            # If page 1 comes back empty, log some context so it's obvious what's happening.
            if not raw_items:
                # Still a valid run; Tradera returned no items for this query/page.
                log(f"No items returned on page {page_number}; stopping pagination.")
                break

            parsed_items = [parse_tradera_item(item) for item in raw_items]
            items_scanned += len(parsed_items)

            filtered_items = filter_items_for_yesterday(parsed_items, tz_name)
            upsert_items(conn, filtered_items)
            items_imported += len(filtered_items)

            log(f"Page {page_number}: scanned {len(parsed_items)} items, imported {len(filtered_items)}")

            if should_stop_pagination(parsed_items, tz_name):
                log("Oldest item on page is older than yesterday window; stopping pagination.")
                break

            page_number += 1

    log(
        f"Finished. Pages fetched: {pages_fetched}, items scanned: {items_scanned}, items imported: {items_imported}"
    )


def main() -> None:
    try:
        run_import()
        sys.exit(0)
    except Exception as exc:
        log(f"Import failed: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
