import ssl
import socket

def check_cert():
    host = "db.udbxbqsnhxxotftwhxnz.supabase.co"
    port = 443
    print(f"Connecting to {host}:{port} via SSL without verification...")
    try:
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        with socket.create_connection((host, port), timeout=5) as sock:
            with context.wrap_socket(sock, server_hostname=host) as ssock:
                cert = ssock.getpeercert(binary_form=True)
                # Let's decode binary cert or get the dict
                cert_dict = ssock.getpeercert()
                print("Certificate details:")
                for k, v in cert_dict.items():
                    print(f"  {k}: {v}")
    except Exception as e:
        print(f"Failed: {e}")

if __name__ == "__main__":
    check_cert()
