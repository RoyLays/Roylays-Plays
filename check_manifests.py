import zipfile
import os

games = ["web/diamond_rush.jar", "web/assassins_creed_3.jar", "web/brickbreaker.jar"]

for game in games:
    if not os.path.exists(game):
        print(f"{game} not found")
        continue
    try:
        with zipfile.ZipFile(game, 'r') as jar:
            with jar.open('META-INF/MANIFEST.MF') as manifest:
                content = manifest.read().decode('utf-8', errors='ignore')
                print(f"--- {game} ---")
                for line in content.splitlines():
                    if "MIDlet-Icon" in line:
                        print(line)
    except Exception as e:
        print(f"Error reading {game}: {e}")
