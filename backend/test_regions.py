import asyncio
import asyncpg
import socket

regions = [
    "ap-south-1",      # Mumbai
    "ap-southeast-1",  # Singapore
    "ap-southeast-2",  # Sydney
    "ap-northeast-1",  # Tokyo
    "ap-northeast-2",  # Seoul
    "us-east-1",       # N. Virginia
    "us-east-2",       # Ohio
    "us-west-1",       # N. California
    "us-west-2",       # Oregon
    "eu-west-1",       # Ireland
    "eu-west-2",       # London
    "eu-west-3",       # Paris
    "eu-central-1",    # Frankfurt
    "ca-central-1",    # Canada
    "sa-east-1"        # São Paulo
]

async def test_region(region):
    host = f"aws-0-{region}.pooler.supabase.com"
    try:
        ip = socket.gethostbyname(host)
    except Exception:
        print(f"{region}: Could not resolve host {host}")
        return None
    
    url = f"postgresql://postgres.udbxbqsnhxxotftwhxnz:Sowmith%402005@{host}:6543/postgres"
    try:
        conn = await asyncpg.connect(url, timeout=6)
        await conn.close()
        print(f"--> {region} CONNECTED SUCCESSFULLY! <--")
        return host
    except Exception as e:
        print(f"{region}: {e}")
        return None

async def main():
    print("Scanning regions...")
    tasks = [test_region(r) for r in regions]
    await asyncio.gather(*tasks)

if __name__ == "__main__":
    asyncio.run(main())
