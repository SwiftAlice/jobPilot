import json
import os
import time
from typing import List, Optional, Set

try:
    import httpx
except Exception:  # pragma: no cover
    httpx = None  # type: ignore

try:
    from deps import get_redis_client
except Exception:
    try:
        from job_scraper.deps import get_redis_client
    except Exception:
        # Fallback if deps not available
        def get_redis_client():
            return None

_IN_MEMORY_CACHE: dict[str, tuple[float, Set[str]]] = {}
_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30  # 30 days


def _cache_key(city: str, country: Optional[str]) -> str:
    city_norm = (city or "").strip().lower()
    country_norm = (country or "").strip().lower() if country else ""
    return f"geonames:aliases:{city_norm}:{country_norm}"


def get_city_aliases(city: str, country: Optional[str] = None) -> Set[str]:
    """
    Return a set of alternate names for a city using Geonames, with Redis + in-memory caching.
    If Geonames is not configured or unavailable, returns at least the input city (normalized).
    """
    base_set: Set[str] = set()
    if not city:
        return base_set
    city_norm = city.strip().lower()
    base_set.add(city_norm)

    print(f"[Geonames] 🔍 Looking up aliases for city: '{city_norm}'" + (f", country: '{country}'" if country else ""))

    # Static common aliases that we know users care about (fast path)
    static_aliases = {
        "bengaluru": {"bangalore"},
        "bangalore": {"bengaluru"},
        "gurgaon": {"gurugram"},
        "gurugram": {"gurgaon"},
        "mumbai": {"bombay"},
        "bombay": {"mumbai"},
        "kolkata": {"calcutta"},
        "calcutta": {"kolkata"},
        "puducherry": {"pondicherry"},
        "pondicherry": {"puducherry"},
        "pune": {"poona"},
        "poona": {"pune"},
        "delhi": {"new delhi"},
        "new delhi": {"delhi"},
    }
    if city_norm in static_aliases:
        static_found = static_aliases[city_norm]
        base_set |= static_found
        print(f"[Geonames] ✅ Found static aliases: {static_found}")

    # Geonames lookup (if configured)
    username = os.getenv("GEONAMES_USERNAME")
    if not username:
        print(f"[Geonames] ⚠️  GEONAMES_USERNAME not configured, using static aliases only")
        return base_set
    if httpx is None:
        print(f"[Geonames] ⚠️  httpx not available, using static aliases only")
        return base_set
    
    print(f"[Geonames] ✅ Geonames username configured: {username[:3]}***")

    key = _cache_key(city_norm, country)
    now = time.time()

    # In-memory cache
    cached = _IN_MEMORY_CACHE.get(key)
    if cached and (now - cached[0] < _CACHE_TTL_SECONDS):
        cached_aliases = cached[1]
        print(f"[Geonames] 💾 Found in-memory cache: {len(cached_aliases)} aliases")
        return base_set | cached_aliases

    # Redis cache
    aliases: Set[str] = set()
    redis = get_redis_client()
    if redis:
        try:
            data = redis.get(key)
            if data:
                decoded = json.loads(data.decode("utf-8"))
                if isinstance(decoded, list):
                    aliases |= {str(x).strip().lower() for x in decoded if x}
                    _IN_MEMORY_CACHE[key] = (now, set(aliases))
                    print(f"[Geonames] 💾 Found Redis cache: {len(aliases)} aliases")
                    return base_set | aliases
        except Exception as e:
            print(f"[Geonames] ⚠️  Redis cache read error: {e}")
    else:
        print(f"[Geonames] ⚠️  Redis not available, skipping cache")

    print(f"[Geonames] 🌐 Making API call to Geonames for '{city_norm}'...")
    try:
        with httpx.Client(timeout=12.0) as client:
            # Search the city to find geonameId
            params = {"q": city_norm, "maxRows": 1, "username": username}
            if country:
                params["country"] = country
            print(f"[Geonames] 📡 GET searchJSON: q='{city_norm}'" + (f", country='{country}'" if country else ""))
            r = client.get("http://api.geonames.org/searchJSON", params=params)
            r.raise_for_status()
            data = r.json()
            geonames = (data or {}).get("geonames") or []
            if not geonames:
                print(f"[Geonames] ⚠️  No results found for '{city_norm}' in Geonames search")
                _IN_MEMORY_CACHE[key] = (now, set())
                return base_set
            geoname_id = geonames[0].get("geonameId")
            found_name = geonames[0].get("name", "")
            print(f"[Geonames] ✅ Found geonameId: {geoname_id} (name: '{found_name}')")
            if not geoname_id:
                print(f"[Geonames] ⚠️  No geonameId in search result")
                _IN_MEMORY_CACHE[key] = (now, set())
                return base_set

            # Fetch alternate names for that geonameId
            print(f"[Geonames] 📡 GET getJSON: geonameId={geoname_id}")
            r2 = client.get("http://api.geonames.org/getJSON", params={"geonameId": geoname_id, "username": username})
            r2.raise_for_status()
            data2 = r2.json()
            alt = data2.get("alternateNames") or []
            print(f"[Geonames] 📋 Received {len(alt)} alternate name entries from API")
            for item in alt:
                name = (item.get("name") or "").strip().lower()
                if not name:
                    continue
                # Keep short, meaningful names; skip transliterations with weird scripts
                if 2 <= len(name) <= 64:
                    aliases.add(name)
            print(f"[Geonames] ✅ Extracted {len(aliases)} valid alternate names: {sorted(list(aliases))[:10]}{'...' if len(aliases) > 10 else ''}")
    except Exception as e:
        print(f"[Geonames] ❌ API error: {type(e).__name__}: {e}")
        # Fail silently; just return what we have
        pass

    if aliases:
        # Save to Redis
        if redis:
            try:
                redis.setex(key, _CACHE_TTL_SECONDS, json.dumps(sorted(aliases)).encode("utf-8"))
                print(f"[Geonames] 💾 Saved {len(aliases)} aliases to Redis cache (TTL: {_CACHE_TTL_SECONDS}s)")
            except Exception as e:
                print(f"[Geonames] ⚠️  Redis cache write error: {e}")
        _IN_MEMORY_CACHE[key] = (now, set(aliases))
        print(f"[Geonames] 💾 Saved {len(aliases)} aliases to in-memory cache")
    else:
        print(f"[Geonames] ⚠️  No alternate names found from API, using static aliases only")

    final_aliases = base_set | aliases
    print(f"[Geonames] ✅ Final result: {len(final_aliases)} total aliases for '{city_norm}': {sorted(list(final_aliases))[:15]}{'...' if len(final_aliases) > 15 else ''}")
    return final_aliases


