import asyncio
import asyncpg
import os

DATABASE_URL = "postgresql://postgres.udbxbqsnhxxotftwhxnz:Sowmith%402005@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"

async def test():
    print("Testing connection to Supabase...")
    try:
        conn = await asyncpg.connect(DATABASE_URL)
        val = await conn.fetchval("SELECT 1")
        print(f"Connection successful! SELECT 1 returned: {val}")
        await conn.close()
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(test())
