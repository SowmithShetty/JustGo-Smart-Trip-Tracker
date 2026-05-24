import asyncio
import asyncpg
import socket

# List of all possible Supabase AWS pooler regions
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
    # Resolve IPv4
    try:
        ip = socket.gethostbyname(host)
    except Exception:
        return None
    
    url = f"postgresql://postgres.udbxbqsnhxxotftwhxnz:Sowmith%402005@{host}:6543/postgres"
    try:
        conn = await asyncpg.connect(url, timeout=5)
        await conn.close()
        return host
    except Exception as e:
        # If the error is 'tenant not found', it's wrong region. 
        # If it succeeds or has another error (like auth failed), we inspect.
        err_str = str(e)
        if "tenant/user" not in err_str:
            print(f"Region {region} ({host}) returned unexpected error: {err_str}")
        return None

async def main():
    print("Scanning regions for correct Supabase pooler...")
    tasks = [test_region(r) for r in regions]
    results = await asyncio.gather(*tasks)
    
    successful = [r for r in results if r is not None]
    if successful:
        print(f"\nSUCCESS! Found working pooler host(s): {successful}")
    else:
        print("\nFailed to find any working regional pooler host.")

if __name__ == "__main__":
    asyncio.run(main())
