"""
Daily importer for ended Pokémon card auctions from Tradera (SOAP SearchAdvanced).

Runs from Heroku Scheduler (UTC). Uses TZ/LOCAL_TIMEZONE (default Europe/Stockholm)
to compute "yesterday" window and imports ended auctions with >= BIDS_MINIMUM bids.

Idempotent via ON CONFLICT (item_id) DO UPDATE.

Required Heroku config vars:
- DATABASE_URL
- TRADERA_APP_ID
- TRADERA_APP_KEY

Optional:
- TRADERA_CATEGORY_ID (default 1001337)
- ITEMS_PER_PAGE (default 500)
- MAX_PAGES (default 100)
- BIDS_MINIMUM (default 1)
- TZ / LOCAL_TIMEZONE (default Europe/Stockholm)
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

WSDL_URL = "https://api.tradera.com/v3/SearchService.asmx?WSDL"

CATEGORY_ID = int(os.getenv("TRADERA_CATEGORY_ID", "1001337"))
ITEMS_PER_PAGE = int(os.getenv("ITEMS_PER_PAGE", "500"))
MAX_PAGES = int(os.getenv("MAX_PAGES", "100"))
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


class TraderaClient:
    def __init__(self, app_id: str, app_key: str, timeout: int = 45) -> None:
        self.app_id = str(app_id).strip()
        self.app_key = str(app_key).strip()

        session = requests.Session()
        session.headers.update({"User-Agent": "pokestats-importer/1.0"})
        transport = Transport(session=session, timeout=timeout)
        settings = Settings(strict=False)

        self.client = Client(WSDL_URL, transport=transport, settings=settings)

        # Force correct AuthenticationHeader wrapper + namespace
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
        search_request = {
            "CategoryId": CATEGORY_ID,
            "ItemType": "Auction",
            "ItemStatus": "Ended",
            "OrderBy": "EndDateDescending",
            "BidsMinimum": BIDS_MINIMUM,
            "PageNumber": page_number,
            "ItemsPerPage": ITEMS_PER_PAGE,

            # WSDL-required defaults you hit:
            "SearchInDescription": False,
            "CountyId": 0,
            "OnlyAuctionsWithBuyNow": False,
            "OnlyItemsWithThumbnail": False,

            # CRITICAL FIX: don't send empty-string search, send nil
            "SearchWords": None,
        }

        auth_header = self.auth_header_el(AppId=self.app_id, AppKey=self.app_key)

        response = self.client.service.SearchAdvanced(
            search_request,
            _soapheaders=[auth_header],
        )
        return helpers.serialize_object(response, target_cls=dict)


def _ensure_list(value) -> List:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def parse_attributes(raw_attributes: Optional[dict]) -> Dict[str, List[str]]:
    # Your Postman response uses AttributeValues/TermAttributeValues, not Attributes.
    # We'll support BOTH shapes.

    if not raw_attributes:
        return {}

    # shape A: {"Attribute": [ {"Name":..., "Values":{"string":[...]}} ]}
    if isinstance(raw_attributes, dict) and "Attribute" in raw_attributes:
        out: Dict[str, List[str]] = {}
        for attribute in _ensure_list(raw_attributes.get("Attribute")):
            name = attribute.get("Name")
            values = _ensure_list((attribute.get("Values") or {}).get("string"))
            if name:
                out[name] = [str(v) for v in values if v is not None]
        return out

    # shape B (Postman): AttributeValues -> TermAttributeValues -> TermAttributeValue[]
    out: Dict[str, List[str]] = {}
    term = (raw_attributes.get("TermAttributeValues") or {}).get("TermAttributeValue") if isinstance(raw_attributes, dict) else None
    for attr in _ensure_list(term):
        name = attr.get("Name")
        values = _ensure_list((attr.get("Values") or {}).get("string"))
        if name:
            out[name] = [str(v) for v in values if v is not None]
    return out


def parse_image_links(raw_images: Optional[dict]) -> List[str]:
    # Your Postman response uses ImageLinks -> ImageLink -> Url
    if not raw_images:
        return []

    # shape A: {"string":[...]}
    if isinstance(raw_images, dict) and "string" in raw_images:
        return [str(u) for u in _ensure_list(raw_images.get("string")) if u]

    # shape B: {"ImageLink":[{"Url":...}, ...]}
    links = raw_images.get("ImageLink") if isinstance(raw_images, dict) else None
    urls = []
    for link in _ensure_list(links):
        url = link.get("Url")
        if url:
            urls.append(str(url))
    return urls


def parse_tradera_item(raw_item: dict) -> TraderaItem:
    end_date = date_parser.isoparse(str(raw_item.get("EndDate"))).astimezone(pytz.UTC)

    # Support both attribute shapes
    attributes = parse_attributes(raw_item.get("Attributes") or raw_item.get("AttributeValues"))
    image_urls = parse_image_links(raw_item.get("ImageLinks"))

    seller = raw_item.get("Seller") or {}
    seller_id = seller.get("Id") if isinstance(seller, dict) else None
    seller_alias = seller.get("Alias") if isinstance(seller, dict) else None
    seller_dsr = seller.get("DSR") if isinstance(seller, dict) else None

    # Postman response also has SellerId/SellerAlias/SellerDsrAverage at top-level
    if seller_id is None:
        seller_id = raw_item.get("SellerId")
    if seller_alias is None:
        seller_alias = raw_item.get("SellerAlias")
    if seller_dsr is None:
        seller_dsr = raw_item.get("SellerDsrAverage")

    return TraderaItem(
        item_id=int(raw_item.get("Id")),
        category_id=int(raw_item.get("CategoryId")),
        end_date=end_date,
        price=int(raw_item.get("MaxBid")) if raw_item.get("MaxBid") is not None else None,
        bid_count=int(raw_item.get("BidCount")) if raw_item.get("BidCount") is not None else None,
        seller_id=int(seller_id) if seller_id is not None else None,
        seller_alias=seller_alias,
        seller_dsr=float(seller_dsr) if seller_dsr is not None else None,
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
    if not parsed_items:
        return False
    tz = pytz.timezone(tz_name)
    yesterday_start, _ = calculate_yesterday_window(tz_name)
    oldest_local = min(i.end_date.astimezone(tz) for i in parsed_items)
    return oldest_local < yesterday_start


def extract_raw_items(response: dict) -> List[dict]:
    result = (response or {}).get("SearchAdvancedResult") or {}

    # Helpful counters (matches Postman)
    total = result.get("TotalNumberOfItems")
    pages = result.get("TotalNumberOfPages")
    if total is not None and pages is not None:
        log(f"API says TotalNumberOfItems={total}, TotalNumberOfPages={pages}")

    items_blob = result.get("Items")

    # Case 1: Items is already a list of item dicts (Postman-style repeated <Items>)
    if isinstance(items_blob, list):
        return [x for x in items_blob if isinstance(x, dict)]

    # Case 2: Items is a dict wrapper (some zeep shapes)
    if isinstance(items_blob, dict):
        # Try common keys
        candidates = (
            items_blob.get("SearchItem")
            or items_blob.get("Item")
            or items_blob.get("Items")
        )
        raw = _ensure_list(candidates)
        return [x for x in raw if isinstance(x, dict)]

    # Case 3: nothing
    return []


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
    log(f"Importing auctions ended between {yesterday_start.isoformat()} and {yesterday_end.isoformat()} ({tz_name})")
    log(f"CategoryId={CATEGORY_ID}, ItemsPerPage={ITEMS_PER_PAGE}, MaxPages={MAX_PAGES}, BidsMinimum={BIDS_MINIMUM}")

    pages_fetched = 0
    items_scanned = 0
    items_imported = 0
    page_number = 1

    with psycopg2.connect(database_url) as conn:
        while page_number <= MAX_PAGES:
            response = client.search_page(page_number)
            pages_fetched += 1

            raw_items = extract_raw_items(response)

            if not raw_items:
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

    log(f"Finished. Pages fetched: {pages_fetched}, items scanned: {items_scanned}, items imported: {items_imported}")


def main() -> None:
    try:
        run_import()
        sys.exit(0)
    except Exception as exc:
        log(f"Import failed: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
