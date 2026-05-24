import socket

def resolve_all():
    host = "db.udbxbqsnhxxotftwhxnz.supabase.co"
    print(f"Resolving {host}...")
    try:
        results = socket.getaddrinfo(host, 5432, socket.AF_UNSPEC)
        for res in results:
            print(res)
    except Exception as e:
        print(f"Failed: {e}")

if __name__ == "__main__":
    resolve_all()
