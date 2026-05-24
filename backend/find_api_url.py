import requests
import re

def find_api_url():
    base_url = "https://just-go-smart-trip-tracker-2zh7.vercel.app"
    print(f"Fetching index HTML from {base_url}...")
    try:
        resp = requests.get(base_url, timeout=10)
        html = resp.text
        # Look for JS source files, e.g. <script type="module" src="/assets/index-XXXX.js">
        js_files = re.findall(r'src="(/assets/index-[a-zA-Z0-9_-]+\.js)"', html)
        if not js_files:
            # Maybe it's not Vite compiled assets, or it is in dev mode?
            # Let's search for any js file in HTML
            js_files = re.findall(r'src="([^"]+\.js)"', html)
            
        print(f"Found JS files: {js_files}")
        
        for js_file in js_files:
            js_url = base_url + js_file if js_file.startswith('/') else js_file
            print(f"Fetching JS content from {js_url}...")
            js_resp = requests.get(js_url, timeout=10)
            js_text = js_resp.text
            # Search for onrender.com in the JS
            matches = re.findall(r'https://[a-zA-Z0-9_-]+\.onrender\.com', js_text)
            if matches:
                print(f"Found Render URLs in {js_file}: {matches}")
            else:
                print(f"No Render URLs found in {js_file}")
                
            # Print around VITE_API_URL or API_BASE
            api_matches = re.findall(r'VITE_[A-Z_]+|API_BASE', js_text)
            print(f"Token matches: {api_matches[:10]}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    find_api_url()
