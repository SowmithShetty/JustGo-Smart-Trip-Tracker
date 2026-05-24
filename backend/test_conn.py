import asyncio
import asyncpg

async def main():
    url = "postgresql://postgres.udbxbqsnhxxotftwhxnz:Sowmith%402005@aws-1-ap-south-1.pooler.supabase.com:5432/postgres"
    print("Testing connection to correct IPv4 pooler: aws-1-ap-south-1.pooler.supabase.com:5432...")
    try:
        conn = await asyncpg.connect(url, timeout=15)
        val = await conn.fetchval("SELECT 1")
        print(f"Success! SELECT 1 returned: {val}")
        await conn.close()
    except Exception as e:
        print(f"Failed: {e}")

if __name__ == "__main__":
    asyncio.run(main())
