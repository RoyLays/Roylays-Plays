import zipfile

with zipfile.ZipFile('web/init.zip', 'r') as zip_ref:
    for file in zip_ref.namelist():
        print(file)
