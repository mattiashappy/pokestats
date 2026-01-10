# tradera_import_refresh_only.py
#
# Tradera importer (REFRESH ONLY, SOAP) -> PostgreSQL
# - Purpose: keep DB up-to-date with newest ended auctions (incremental).
# - Locked: ItemsPerPage = 50 (small responses).
# - Budget-safe: MAX_REQUESTS caps daily usage.
# - Early-stop: stops when it hits already-imported data (watermark + overlap).
#
# Required ENV:
# - DATABASE_URL
# - TRADERA_APP_ID
# - TRADERA_APP_KEY
#
# Optional ENV:
# - TRADERA_CATEGORY_ID (default 1001337)
# - MAX_REQUESTS (default 10)                 # hard cap requests per run
# - SLEEP_MS (default 150)
# - TZ (default Europe/Stockholm)
#
# Filters (optional):
# - ITEM_STATUS (default Ended)
# - ITEM_TYPE (default Auction)
# - BIDS_MINIMUM (default 1)                  # set to "none" / "" to disable
# - ORDER_BY (default EndDateDescending)      # will be forced if wrong in INCREMENTAL
# - MODE (default INCREMENTAL)                # INCREMENTAL or FULL (FULL ignores watermark)
#
# Incremental tuning:
# - INCREMENTAL_OVERLAP_MINUTES (default 10)
#
# Network tuning:
# - TRADERA_CONNECT_TIMEOUT (default 10)
# - TRADERA_READ_TIMEOUT (default 60)
# - TRADERA_RETRIES (default 6)
# - TRADERA_BACKOFF (default 0.8)
#
# DB assumptions:
# - tradera_auctions has unique constraint on item_id
# - columns: item_id, category_id, end_date, price, bid_count, seller_id, seller_alias,
#           title, item_url, thumbnail_url, tradera_attributes, image_urls, description,
#           item_condition, pokemon_era, pokemon_language, raw, created_at, updated_at
#
# Notes:
# - This version is cleaned up to avoid broken SQL, duplicate blocks, and mismatched cache keys.
# - It will try ON CONFLICT (set_code, card_number) first. If that index/constraint doesn’t exist, it falls back.

from __future__ import annotations

import json
import os
import sys
import time
import traceback
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
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
ITEMS_PER_PAGE = 50
START_PAGE = 1

MAX_REQUESTS = int(os.getenv("MAX_REQUESTS", "10"))
SLEEP_MS = int(os.getenv("SLEEP_MS", "150"))

ITEM_STATUS = os.getenv("ITEM_STATUS", "Ended")
ITEM_TYPE = os.getenv("ITEM_TYPE", "Auction")
BIDS_MINIMUM_RAW = os.getenv("BIDS_MINIMUM", "1")

ORDER_BY = os.getenv("ORDER_BY", "EndDateDescending")
MODE = (os.getenv("MODE", "INCREMENTAL") or "INCREMENTAL").strip().upper()

TZ_NAME = os.getenv("TZ") or os.getenv("LOCAL_TIMEZONE") or "Europe/Stockholm"
INCREMENTAL_OVERLAP_MINUTES = int(os.getenv("INCREMENTAL_OVERLAP_MINUTES", "10"))

CONNECT_TIMEOUT = float(os.getenv("TRADERA_CONNECT_TIMEOUT", "10"))
READ_TIMEOUT = float(os.getenv("TRADERA_READ_TIMEOUT", "60"))
TOTAL_RETRIES = int(os.getenv("TRADERA_RETRIES", "6"))
BACKOFF = float(os.getenv("TRADERA_BACKOFF", "0.8"))

RUN_UUID = os.getenv("IMPORT_RUN_UUID") or str(uuid.uuid4())

NS = {
    "soap": "http://schemas.xmlsoap.org/soap/envelope/",
    "t": "http://api.tradera.com",
}


# -----------------------------
# Logging
# -----------------------------

def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def log(event: str, **fields: Any) -> None:
    payload: Dict[str, Any] = {
        "ts": _iso_now(),
        "level": "info",
        "event": event,
        "run_uuid": RUN_UUID,
    }
    payload.update(fields)
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def log_error(event: str, exc: BaseException, **fields: Any) -> None:
    payload: Dict[str, Any] = {
        "ts": _iso_now(),
        "level": "error",
        "event": event,
        "run_uuid": RUN_UUID,
        "error": str(exc),
        "traceback": "".join(traceback.format_exception(type(exc), exc, exc.__traceback__)),
    }
    payload.update(fields)
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def require_env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise RuntimeError(f"Missing required env var {name}")
    return v.strip()


# -----------------------------
# Helpers (parsing)
# -----------------------------

def normalize_bids_minimum(raw: str) -> Optional[int]:
    # Enabled -> int
    # Disabled values: "none", "null", "", "off"
    if raw is None:
        return None
    s = str(raw).strip().lower()
    if s in {"", "none", "null", "off", "false"}:
        return None
    try:
        return int(float(s))
    except Exception:
        return None


BIDS_MINIMUM = normalize_bids_minimum(BIDS_MINIMUM_RAW)


def strip_ns(tag: str) -> str:
    return tag.split("}", 1)[1] if "}" in tag else tag


def first_found(*els: Optional[ET.Element]) -> Optional[ET.Element]:
    for el in els:
        if el is not None:
            return el
    return None


def find_child_text(parent: ET.Element, local_name: str) -> Optional[str]:
    for child in list(parent):
        if strip_ns(child.tag) == local_name:
            if child.text and child.text.strip():
                return child.text.strip()
            return None
    return None


def find_any_text(parent: ET.Element, local_name: str) -> Optional[str]:
    for el in parent.iter():
        if strip_ns(el.tag) == local_name:
            if el.text and el.text.strip():
                return el.text.strip()
            return None
    return None


def parse_int_text(v: Optional[str]) -> Optional[int]:
    if not v:
        return None
    try:
        return int(float(v))
    except Exception:
        return None


def parse_float_text(v: Optional[str]) -> Optional[float]:
    if not v:
        return None
    try:
        return float(v)
    except Exception:
        return None


def parse_bool_text(v: Optional[str]) -> Optional[bool]:
    if v is None:
        return None
    return v.strip().lower() in {"1", "true", "yes"}


def parse_dt_text(v: Optional[str]) -> Optional[datetime]:
    if not v:
        return None
    try:
        dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = pytz.UTC.localize(dt)
        return dt.astimezone(pytz.UTC)
    except Exception:
        return None


# -----------------------------
# SOAP
# -----------------------------

def build_envelope(app_id: str, app_key: str, page_number: int, order_by: str) -> str:
    item_status_xml = f"<ItemStatus>{ITEM_STATUS}</ItemStatus>" if ITEM_STATUS else ""
    item_type_xml = f"<ItemType>{ITEM_TYPE}</ItemType>" if ITEM_TYPE else ""
    bids_min_xml = "" if BIDS_MINIMUM is None else f"<BidsMinimum>{BIDS_MINIMUM}</BidsMinimum>"

    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n'
        '               xmlns:xsd="http://www.w3.org/2001/XMLSchema"\n'
        '               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">\n'
        '  <soap:Header>\n'
        '    <AuthenticationHeader xmlns="http://api.tradera.com">\n'
        f'      <AppId>{app_id}</AppId>\n'
        f'      <AppKey>{app_key}</AppKey>\n'
        '    </AuthenticationHeader>\n'
        '  </soap:Header>\n\n'
        '  <soap:Body>\n'
        '    <SearchAdvanced xmlns="http://api.tradera.com">\n'
        '      <request>\n'
        f'        <CategoryId>{CATEGORY_ID}</CategoryId>\n'
        f'        {item_type_xml}\n'
        f'        {item_status_xml}\n'
        f'        {bids_min_xml}\n'
        f'        <OrderBy>{order_by}</OrderBy>\n'
        f'        <ItemsPerPage>{ITEMS_PER_PAGE}</ItemsPerPage>\n'
        f'        <PageNumber>{page_number}</PageNumber>\n'
        '      </request>\n'
        '    </SearchAdvanced>\n'
        '  </soap:Body>\n'
        '</soap:Envelope>'
    )


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
        "SOAPAction": f"\"{SOAP_ACTION}\"",
    }
    r = session.post(
        API_URL,
        data=xml_body.encode("utf-8"),
        headers=headers,
        timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
    )
    if r.status_code >= 400:
        snippet = (r.text or "")[:1200].replace("\n", " ")
        raise RuntimeError(f"HTTP {r.status_code} from Tradera. Body: {snippet}")
    return r.text


def parse_response(xml_text: str) -> Tuple[int, int, List[ET.Element], str]:
    root = ET.fromstring(xml_text)

    fault = root.find(".//soap:Fault", NS)
    if fault is not None:
        fault_text = ET.tostring(fault, encoding="unicode")
        raise RuntimeError(f"SOAP Fault: {fault_text[:1200]}")

    total_items_el = first_found(root.find(".//t:TotalNumberOfItems", NS), root.find(".//TotalNumberOfItems"))
    total_pages_el = first_found(root.find(".//t:TotalNumberOfPages", NS), root.find(".//TotalNumberOfPages"))

    total_items = int(total_items_el.text) if (total_items_el is not None and total_items_el.text) else 0
    total_pages = int(total_pages_el.text) if (total_pages_el is not None and total_pages_el.text) else 0

    # Tradera returns Items nodes; sometimes namespaced, sometimes not
    item_nodes = root.findall(".//t:Items", NS)
    if not item_nodes:
        item_nodes = root.findall(".//Items")

    snippet = xml_text[:1200].replace("\n", " ")
    return total_items, total_pages, item_nodes, snippet


# -----------------------------
# Item parsing
# -----------------------------

def parse_image_links(item_el: ET.Element) -> List[str]:
    urls: List[str] = []
    for el in item_el.iter():
        if strip_ns(el.tag) == "ImageLink":
            for child in list(el):
                if strip_ns(child.tag) == "Url" and child.text:
                    urls.append(child.text.strip())
                    break
    return urls


def parse_attributes(item_el: ET.Element) -> Dict[str, List[str]]:
    out: Dict[str, List[str]] = {}
    for tav in item_el.iter():
        if strip_ns(tav.tag) != "TermAttributeValue":
            continue

        name = None
        values: List[str] = []

        for child in list(tav):
            if strip_ns(child.tag) == "Name" and child.text:
                name = child.text.strip()
            for desc in child.iter():
                if strip_ns(desc.tag) == "string" and desc.text:
                    values.append(desc.text.strip())

        if name:
            out[name] = values
    return out


def build_attributes_payload(item_el: ET.Element) -> Dict[str, Any]:
    return parse_attributes(item_el)


def build_item_meta(item_el: ET.Element) -> Dict[str, Any]:
    meta = {
        "has_bids": parse_bool_text(find_child_text(item_el, "HasBids") or find_any_text(item_el, "HasBids")),
        "is_ended": parse_bool_text(find_child_text(item_el, "IsEnded") or find_any_text(item_el, "IsEnded")),
        "item_type": find_child_text(item_el, "ItemType") or find_any_text(item_el, "ItemType"),
        "next_bid": parse_int_text(find_child_text(item_el, "NextBid") or find_any_text(item_el, "NextBid")),
        "buy_it_now_price": parse_float_text(
            find_child_text(item_el, "BuyItNowPrice") or find_any_text(item_el, "BuyItNowPrice")
        ),
    }
    return {k: v for k, v in meta.items() if v is not None}


def element_to_dict(element: ET.Element) -> Dict[str, Any]:
    children = [element_to_dict(child) for child in list(element)]
    text = element.text.strip() if element.text and element.text.strip() else None

    payload: Dict[str, Any] = {
        "tag": strip_ns(element.tag),
        "attributes": element.attrib or {},
    }

    if text is not None:
        payload["text"] = text

    if children:
        payload["children"] = children

    return payload


def extract_attribute_value(attributes: Dict[str, Any], key: str) -> Optional[str]:
    if not attributes:
        return None

    key_lower = key.strip().lower()
    for name, values in attributes.items():
        if str(name).strip().lower() != key_lower:
            continue
        if isinstance(values, list) and values:
            return str(values[0])
        if isinstance(values, str) and values.strip():
            return values.strip()
    return None


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
    item_url: Optional[str]
    thumbnail_url: Optional[str]
    tradera_attributes: Dict[str, Any]
    image_urls: List[str]
    description: Optional[str]
    item_condition: Optional[str]
    pokemon_era: Optional[str]
    pokemon_language: Optional[str]
    raw: Dict[str, Any]

    def as_params(self) -> Dict[str, object]:
        return {
            "item_id": self.item_id,
            "category_id": self.category_id,
            "end_date": self.end_date,
            "price": self.price,
            "bid_count": self.bid_count,
            "seller_id": self.seller_id,
            "seller_alias": self.seller_alias,
            "title": self.title,
            "item_url": self.item_url,
            "thumbnail_url": self.thumbnail_url,
            "tradera_attributes": Json(self.tradera_attributes),
            "image_urls": Json(self.image_urls),
            "description": self.description,
            "item_condition": self.item_condition,
            "pokemon_era": self.pokemon_era,
            "pokemon_language": self.pokemon_language,
            "raw": Json(self.raw),
        }


def parse_item(item_el: ET.Element) -> Optional[Row]:
    item_id = parse_int_text(find_child_text(item_el, "Id") or find_any_text(item_el, "Id"))
    if item_id is None:
        return None

    end_date = parse_dt_text(find_child_text(item_el, "EndDate") or find_any_text(item_el, "EndDate"))
    if end_date is None:
        return None

    category_id = (
        parse_int_text(find_child_text(item_el, "CategoryId") or find_any_text(item_el, "CategoryId")) or CATEGORY_ID
    )
    price = parse_int_text(find_child_text(item_el, "MaxBid") or find_any_text(item_el, "MaxBid"))
    bid_count = parse_int_text(find_child_text(item_el, "BidCount") or find_any_text(item_el, "BidCount"))
    seller_id = parse_int_text(find_child_text(item_el, "SellerId") or find_any_text(item_el, "SellerId"))
    seller_alias = find_child_text(item_el, "SellerAlias") or find_any_text(item_el, "SellerAlias")
    title = find_child_text(item_el, "ShortDescription") or find_any_text(item_el, "ShortDescription")
    description = find_child_text(item_el, "LongDescription") or find_any_text(item_el, "LongDescription")
    item_url = find_child_text(item_el, "ItemUrl") or find_any_text(item_el, "ItemUrl")
    thumbnail_url = find_child_text(item_el, "ThumbnailLink") or find_any_text(item_el, "ThumbnailLink")
    tradera_attributes = build_attributes_payload(item_el)
    image_urls = parse_image_links(item_el)
    item_condition = extract_attribute_value(tradera_attributes, "condition")
    pokemon_era = extract_attribute_value(tradera_attributes, "pokemon_era")
    pokemon_language = extract_attribute_value(tradera_attributes, "pokemon_language")

    raw_payload = {
        "attributes": tradera_attributes,
        "image_urls": image_urls,
        "description": description,
        "item_condition": item_condition,
        "pokemon_era": pokemon_era,
        "pokemon_language": pokemon_language,
        "item": element_to_dict(item_el),
    }
    item_meta = build_item_meta(item_el)
    if item_meta:
        raw_payload["meta"] = item_meta

    return Row(
        item_id=item_id,
        category_id=category_id,
        end_date=end_date,
        price=price,
        bid_count=bid_count,
        seller_id=seller_id,
        seller_alias=seller_alias,
        title=title,
        item_url=item_url,
        thumbnail_url=thumbnail_url,
        tradera_attributes=tradera_attributes,
        image_urls=image_urls,
        description=description,
        item_condition=item_condition,
        pokemon_era=pokemon_era,
        pokemon_language=pokemon_language,
        raw=raw_payload,
    )


# -----------------------------
# DB upsert for auctions + run tracking
# -----------------------------

def upsert_sales(conn, rows: List[Row]) -> None:
    if not rows:
        return

    sql = (
        "INSERT INTO tradera_auctions (\n"
        "    item_id, category_id, end_date, price, bid_count, seller_id, seller_alias,\n"
        "    title, item_url, thumbnail_url,\n"
        "    tradera_attributes, image_urls, description, item_condition, pokemon_era, pokemon_language,\n"
        "    raw, created_at, updated_at\n"
        ") VALUES (\n"
        "    %(item_id)s, %(category_id)s, %(end_date)s, %(price)s, %(bid_count)s,\n"
        "    %(seller_id)s, %(seller_alias)s, %(title)s,\n"
        "    %(item_url)s, %(thumbnail_url)s,\n"
        "    %(tradera_attributes)s, %(image_urls)s, %(description)s, %(item_condition)s, %(pokemon_era)s, %(pokemon_language)s,\n"
        "    %(raw)s, NOW(), NOW()\n"
        ")\n"
        "ON CONFLICT (item_id) DO UPDATE SET\n"
        "    category_id = EXCLUDED.category_id,\n"
        "    end_date = EXCLUDED.end_date,\n"
        "    price = EXCLUDED.price,\n"
        "    bid_count = EXCLUDED.bid_count,\n"
        "    seller_id = EXCLUDED.seller_id,\n"
        "    seller_alias = EXCLUDED.seller_alias,\n"
        "    title = EXCLUDED.title,\n"
        "    item_url = EXCLUDED.item_url,\n"
        "    thumbnail_url = EXCLUDED.thumbnail_url,\n"
        "    tradera_attributes = EXCLUDED.tradera_attributes,\n"
        "    image_urls = EXCLUDED.image_urls,\n"
        "    description = EXCLUDED.description,\n"
        "    item_condition = EXCLUDED.item_condition,\n"
        "    pokemon_era = EXCLUDED.pokemon_era,\n"
        "    pokemon_language = EXCLUDED.pokemon_language,\n"
        "    raw = EXCLUDED.raw,\n"
        "    updated_at = NOW();"
    )
    with conn.cursor() as cur:
        execute_batch(cur, sql, [r.as_params() for r in rows], page_size=200)
    conn.commit()


def ensure_import_runs_table(conn) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS import_runs (
                id SERIAL PRIMARY KEY,
                source TEXT NOT NULL DEFAULT 'tradera',
                started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                finished_at TIMESTAMPTZ,
                new_rows INTEGER NOT NULL DEFAULT 0,
                pages_fetched INTEGER NOT NULL DEFAULT 0,
                requests_used INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'running',
                message TEXT,
                run_uuid TEXT,
                error_stack TEXT
            );
            """
        )
        cur.execute("ALTER TABLE import_runs ADD COLUMN IF NOT EXISTS run_uuid TEXT;")
        cur.execute("ALTER TABLE import_runs ADD COLUMN IF NOT EXISTS error_stack TEXT;")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_import_runs_started_at ON import_runs (started_at DESC);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_import_runs_run_uuid ON import_runs (run_uuid);")
    conn.commit()


def start_import_run(conn) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO import_runs (source, status, started_at, run_uuid)
            VALUES ('tradera', 'running', NOW(), %(run_uuid)s)
            RETURNING id;
            """,
            {"run_uuid": RUN_UUID},
        )
        row = cur.fetchone()
    conn.commit()
    return int(row[0])


def finalize_import_run(
    conn,
    run_id: int,
    *,
    status: str,
    new_rows: int,
    pages_fetched: int,
    requests_used: int,
    message: Optional[str] = None,
    error_stack: Optional[str] = None,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE import_runs
            SET finished_at = NOW(),
                status = %(status)s,
                message = %(message)s,
                new_rows = %(new_rows)s,
                pages_fetched = %(pages_fetched)s,
                requests_used = %(requests_used)s,
                error_stack = %(error_stack)s
            WHERE id = %(run_id)s;
            """,
            {
                "status": status,
                "message": message,
                "new_rows": new_rows,
                "pages_fetched": pages_fetched,
                "requests_used": requests_used,
                "run_id": run_id,
                "error_stack": error_stack,
            },
        )
    conn.commit()


def get_db_watermark_end_date(conn) -> Optional[datetime]:
    with conn.cursor() as cur:
        cur.execute("SELECT max(end_date) FROM tradera_auctions;")
        val = cur.fetchone()[0]
    return val


# -----------------------------
# Main
# -----------------------------

def main() -> None:
    db_url = require_env("DATABASE_URL")

    order_by = ORDER_BY
    if MODE == "INCREMENTAL" and order_by != "EndDateDescending":
        log(
            "import_mode_adjusted",
            message="MODE=INCREMENTAL requires ORDER_BY=EndDateDescending for early-stop. Overriding.",
            requested_order_by=order_by,
        )
        order_by = "EndDateDescending"

    log(
        "import_start",
        message="Starting importer run",
        category_id=CATEGORY_ID,
        items_per_page=ITEMS_PER_PAGE,
        max_requests=MAX_REQUESTS,
        bids_min=BIDS_MINIMUM,
        item_status=ITEM_STATUS,
        item_type=ITEM_TYPE,
        connect_timeout=CONNECT_TIMEOUT,
        read_timeout=READ_TIMEOUT,
        total_retries=TOTAL_RETRIES,
        backoff=BACKOFF,
        mode=MODE,
        order_by=order_by,
        tz=TZ_NAME,
    )
    log("import_bids_min", message="SOAP bids minimum toggle", bids_min_enabled=BIDS_MINIMUM is not None)

    session = make_session()

    with psycopg2.connect(db_url) as conn:
        ensure_import_runs_table(conn)
        run_id = start_import_run(conn)
        log("import_run_started", run_id=run_id)

        imported_total = 0
        pages_fetched = 0
        requests_used = 0

        try:
            app_id = require_env("TRADERA_APP_ID")
            app_key = require_env("TRADERA_APP_KEY")

            watermark_cutoff: Optional[datetime] = None
            if MODE == "INCREMENTAL":
                watermark_end_date = get_db_watermark_end_date(conn)
                if watermark_end_date is None:
                    log("watermark_missing", message="DB empty -> will import up to MAX_REQUESTS pages from newest.")
                else:
                    watermark_cutoff = watermark_end_date - timedelta(minutes=INCREMENTAL_OVERLAP_MINUTES)
                    log(
                        "watermark_found",
                        max_end_date=watermark_end_date.isoformat(),
                        cutoff=watermark_cutoff.isoformat(),
                        overlap_minutes=INCREMENTAL_OVERLAP_MINUTES,
                    )
            else:
                log("mode_full", message="MODE=FULL -> ignoring watermark; will fetch MAX_REQUESTS pages.")

            page = START_PAGE

            while requests_used < MAX_REQUESTS:
                log("fetch_page", page=page, attempt=requests_used + 1, max_requests=MAX_REQUESTS)

                envelope = build_envelope(app_id, app_key, page, order_by)
                try:
                    xml_resp = post_soap(session, envelope)
                    requests_used += 1
                    total_items, total_pages, item_nodes, resp_snippet = parse_response(xml_resp)
                except Exception as exc:
                    log_error("soap_or_parse_failed", exc, page=page, requests_used=requests_used, max_requests=MAX_REQUESTS)
                    raise

                if page == 1:
                    log("api_totals", total_items=total_items, total_pages=total_pages)

                if not item_nodes:
                    log("no_items_returned", message="No items returned; stopping.", response_snippet=resp_snippet)
                    break

                rows: List[Row] = []
                oldest_on_page: Optional[datetime] = None

                for el in item_nodes:
                    row = parse_item(el)
                    if not row:
                        continue

                    if oldest_on_page is None or row.end_date < oldest_on_page:
                        oldest_on_page = row.end_date

                    # In incremental mode, skip anything at or older than the cutoff
                    if watermark_cutoff is not None and row.end_date <= watermark_cutoff:
                        continue

                    rows.append(row)

                upsert_sales(conn, rows)
                imported_total += len(rows)
                pages_fetched += 1

                log(
                    "page_complete",
                    page=page,
                    total_pages=total_pages,
                    received=len(item_nodes),
                    imported=len(rows),
                    total_imported=imported_total,
                    oldest_end_date_on_page=oldest_on_page.isoformat() if oldest_on_page else None,
                )

                # Early stop: if the oldest on page is <= cutoff, we’ve crossed into already-imported territory
                if watermark_cutoff is not None and oldest_on_page is not None and oldest_on_page <= watermark_cutoff:
                    log("watermark_stop", message="Reached already-imported cutoff; stopping early.")
                    break

                if total_pages and page >= total_pages:
                    log("last_page_reached")
                    break

                page += 1
                if SLEEP_MS > 0:
                    time.sleep(SLEEP_MS / 1000.0)

            finalize_import_run(
                conn,
                run_id,
                status="ok",
                new_rows=imported_total,
                pages_fetched=pages_fetched,
                requests_used=requests_used,
                message=f"requests_used={requests_used}, pages_fetched={pages_fetched}, total_imported={imported_total}",
            )

        except Exception as exc:
            tb = traceback.format_exc()

            try:
                conn.rollback()
            except Exception:
                pass

            log_error(
                "import_failed",
                exc,
                pages_fetched=pages_fetched,
                requests_used=requests_used,
                imported_total=imported_total,
            )
            finalize_import_run(
                conn,
                run_id,
                status="failed",
                new_rows=imported_total,
                pages_fetched=pages_fetched,
                requests_used=requests_used,
                message=str(exc),
                error_stack=tb[:20000],
            )
            raise

    log("import_done", requests_used=requests_used, pages_fetched=pages_fetched, total_imported=imported_total)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log_error("import_crash", e)
        sys.exit(1)
