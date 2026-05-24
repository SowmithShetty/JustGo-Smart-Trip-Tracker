import requests
import time

urls = [
    "https://justgo-backend-jzjb.onrender.com/",
    "https://justgo-backend-jzjb.onrender.com/api/wake",
    "https://justgo-backend-jzjb.onrender.com/api/health",
    "https://just-go-smart-trip-tracker-2zh7.vercel.app/"
]

for url in urls:
    print(f"\nChecking {url}...")
    try:
        t0 = time.time()
        resp = requests.get(url, timeout=10)
        t1 = time.time()
        print(f"Status: {resp.status_code}")
        print(f"Time: {t1-t0:.2f}s")
        print(f"Headers: {dict(resp.headers)}")
        print(f"Body: {resp.text[:200]}")
    except Exception as e:
        print(f"Error: {e}")
