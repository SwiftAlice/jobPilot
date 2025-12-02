# Playwright Setup for M2 Connectors

The Naukri and IIMJobs connectors use Playwright for browser automation. This guide covers installation and configuration.

## Installation

### 1. Install Playwright Python Package

```bash
pip install playwright>=1.40.0
```

### 2. Install Browser Binaries

```bash
playwright install chromium
playwright install --with-deps chromium  # On Linux, includes system dependencies
```

### 3. Verify Installation

```bash
python -c "from playwright.async_api import async_playwright; print('Playwright installed')"
```

## Render Deployment

On Render, add this to your build script:

```bash
# Install Playwright and browsers
pip install playwright
playwright install --with-deps chromium
```

Or set `PLAYWRIGHT_BROWSERS_PATH=0` in environment variables to use system-installed browsers.

## Environment Variables

No additional environment variables required. Playwright will use:
- Headless mode by default
- System-installed Chromium if available
- Auto-downloaded browsers if not found

## Troubleshooting

### "Playwright not installed"
- Run `pip install playwright`
- Run `playwright install chromium`

### "Browser not found"
- Run `playwright install chromium`
- Check `PLAYWRIGHT_BROWSERS_PATH` environment variable

### Timeout Errors
- Increase timeout in connector code (default 30s)
- Check network connectivity
- Verify target site is accessible

## Performance Notes

- Playwright connectors are slower than HTTP (2-5s per page vs <1s)
- Use rate limiting (configured in `utils/rate_limit.py`)
- Consider caching job detail pages to reduce fetches
- Run workers on separate processes to avoid blocking

