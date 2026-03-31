import zipfile
import os
import shutil

def extract_manifest_info(jar_path):
    with zipfile.ZipFile(jar_path, 'r') as jar:
        with jar.open('META-INF/MANIFEST.MF') as manifest:
            lines = manifest.read().decode('utf-8', errors='ignore').splitlines()
            props = {}
            last_key = None
            for line in lines:
                if line.startswith(' '):
                    if last_key:
                        props[last_key] += line.strip()
                elif ':' in line:
                    key, val = line.split(':', 1)
                    last_key = key.strip()
                    props[last_key] = val.strip()
            return props

def create_game_folder(app_id, jar_path, display_name):
    os.makedirs(f"tmp_init/{app_id}/config", exist_ok=True)
    shutil.copy(jar_path, f"tmp_init/{app_id}/app.jar")
    with open(f"tmp_init/{app_id}/name", "w") as f:
        f.write(display_name)
    
    # Default settings
    with open(f"tmp_init/{app_id}/config/settings.conf", "w") as f:
        f.write("queuedPaint:off\nrotate:off\ntextureDisableFilter:off\nphone:Nokia\ndgFormat:4444\nsound:on\nwidth:240\nfps:0\nforceFullscreen:off\nfontSize:0\nheight:320\n")
    
    # App properties from manifest
    props = extract_manifest_info(jar_path)
    with open(f"tmp_init/{app_id}/config/appproperties.conf", "w") as f:
        for k, v in props.items():
            f.write(f"{k}:{v}\n")
    
    # Extract icon
    icon_path = props.get('MIDlet-Icon')
    if icon_path:
        # Remove leading slash if present
        if icon_path.startswith('/'):
            icon_path = icon_path[1:]
        try:
            with zipfile.ZipFile(jar_path, 'r') as jar:
                with jar.open(icon_path) as icon_file:
                    icon_data = icon_file.read()
                    with open(f"tmp_init/{app_id}/icon", "wb") as f:
                        f.write(icon_data)
                    
                    # Also save to web/icons for social previews
                    os.makedirs("web/icons", exist_ok=True)
                    # Determine extension from original path
                    ext = os.path.splitext(icon_path)[1] or ".png"
                    with open(f"web/icons/{app_id}{ext}", "wb") as f:
                        f.write(icon_data)
                        
            print(f"Extracted icon for {app_id} from {icon_path}")
        except Exception as e:
            print(f"Could not extract icon for {app_id}: {e}")
    
    # Empty system properties
    with open(f"tmp_init/{app_id}/config/systemproperties.conf", "w") as f:
        pass

def main():
    if os.path.exists("tmp_init"):
        shutil.rmtree("tmp_init")
    os.makedirs("tmp_init")
    
    create_game_folder("diamond_rush", "web/diamond_rush.jar", "Diamond Rush")
    create_game_folder("assassins_creed_3", "web/assassins_creed_3.jar", "Assassin's Creed III")
    create_game_folder("brickbreaker", "web/brickbreaker.jar", "Brick Breaker Revolution")
    
    with open("tmp_init/apps.list", "w") as f:
        f.write("diamond_rush\nassassins_creed_3\nbrickbreaker\n")
        
    # Create the zip
    shutil.make_archive("new_init", "zip", "tmp_init")
    
    if os.path.exists("web/init.zip"):
        os.remove("web/init.zip")
    shutil.move("new_init.zip", "web/init.zip")
    
    shutil.rmtree("tmp_init")
    print("Successfully replaced init.zip")

if __name__ == "__main__":
    main()
