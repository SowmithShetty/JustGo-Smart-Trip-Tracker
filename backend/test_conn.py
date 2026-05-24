import asyncio
import asyncpg
import socket

async def test_dns(host):
    print(f"\nResolving {host}...")
    try:
        ip = socket.gethostbyname(host)
        print(f"Success: {ip}")
        return True
    except Exception as e:
        print(f"Failed to resolve: {e}")
        return False

async def test_conn(url, desc):
    print(f"\nTesting {desc}...")
    try:
        conn = await asyncpg.connect(url, timeout=10)
        val = await conn.fetchval("SELECT 1")
        print(f"Success! SELECT 1 returned: {val}")
        await conn.close()
        return True
    except Exception as e:
        print(f"Failed: {e}")
        return False

async def main():
    # Test DNS
    await test_dns("db.udbxbqsnhxxotftwhxnz.supabase.co")
    await test_dns("aws-0-ap-south-1.pooler.supabase.com")
    
    # Test Pooler Connection
    pooler_url = "postgresql://postgres.udbxbqsnhxxotftwhxnz:Sowmith%402005@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
    await test_conn(pooler_url, "Pooler Connection (Port 6543)")
    
    # Test Direct Connection
    direct_url = "postgresql://postgres:Sowmith%402005@db.udbxbqsnhxxotftwhxnz.supabase.co:5432/postgres"
    await test_conn(direct_url, "Direct Connection (Port 5432)")

if __name__ == "__main__":
    asyncio.run(main())
