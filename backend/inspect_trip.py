import sqlite3
import json
import math

db = sqlite3.connect('justgo.db')
db.row_factory = sqlite3.Row

trip = db.execute('SELECT * FROM trips ORDER BY id DESC LIMIT 1').fetchone()
print(f"=== Last Trip ===")
print(f"ID: {trip['id']}")
print(f"Distance: {trip['total_distance_km']:.3f} km")
print(f"Avg Speed: {trip['avg_speed_kmh']:.1f} km/h")
print(f"Max Speed: {trip['max_speed_kmh']:.1f} km/h")
print(f"Duration: {trip['duration_seconds']}s")
print()

pts = db.execute(
    'SELECT latitude, longitude, speed_kmh, recorded_at, sequence_order '
    'FROM gps_points WHERE trip_id=? ORDER BY sequence_order',
    (trip['id'],)
).fetchall()

print(f"Total GPS points: {len(pts)}")
print()

# Show all points with distance between consecutive ones
def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

for i, p in enumerate(pts):
    dist_from_prev = ""
    if i > 0:
        d = haversine(pts[i-1]['latitude'], pts[i-1]['longitude'], p['latitude'], p['longitude'])
        dist_from_prev = f"  dist_from_prev={d*1000:.1f}m"
    print(f"  #{p['sequence_order']}: ({p['latitude']:.6f}, {p['longitude']:.6f}) speed={p['speed_kmh']:.1f} km/h{dist_from_prev}")

db.close()
