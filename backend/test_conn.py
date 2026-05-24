import asyncio
import asyncpg

async def main():
    url = "postgresql://postgres:Sowmith%402005@db.udbxbqsnhxxotftwhxnz.supabase.co:6543/postgres"
    print("Testing connection with user postgres on db.udbxbqsnhxxotftwhxnz.supabase.co:6543...")
    try:
        conn = await asyncpg.connect(url, timeout=10)
        val = await conn.fetchval("SELECT 1")
        print(f"Success! SELECT 1 returned: {val}")
        await conn.close()
    except Exception as e:
        print(f"Failed: {e}")

if __name__ == "__main__":
    asyncio.run(main())
