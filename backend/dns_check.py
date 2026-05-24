import dns.resolver

def check_dns():
    host = "db.udbxbqsnhxxotftwhxnz.supabase.co"
    print(f"Checking DNS records for {host}...")
    try:
        # Check CNAME
        try:
            answers = dns.resolver.resolve(host, 'CNAME')
            for rdata in answers:
                print(f"CNAME: {rdata.target}")
        except Exception as e:
            print(f"No CNAME record or failed: {e}")
            
        # Check AAAA
        try:
            answers = dns.resolver.resolve(host, 'AAAA')
            for rdata in answers:
                print(f"AAAA: {rdata.address}")
        except Exception as e:
            print(f"No AAAA record: {e}")
            
        # Check A
        try:
            answers = dns.resolver.resolve(host, 'A')
            for rdata in answers:
                print(f"A: {rdata.address}")
        except Exception as e:
            print(f"No A record: {e}")
            
    except Exception as e:
        print(f"Failed: {e}")

if __name__ == "__main__":
    check_dns()
