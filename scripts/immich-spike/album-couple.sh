#!/bin/sh
# Album de couple : qui peut ajouter quoi (après spike.mts).
U=${IMMICH_URL:-http://127.0.0.1:22883/api}
J='content-type: application/json'
login() { curl -s -X POST $U/auth/login -H "$J" -d "{\"email\":\"$1\",\"password\":\"spike-password\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])'; }
MT=$(login alex@atlas.test); YT=$(login sam@atlas.test)
key() { curl -s -X POST $U/api-keys -H "authorization: Bearer $1" -H "$J" -d "{\"name\":\"$2\",\"permissions\":$3}" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("secret") or d)'; }
MK=$(key $MT m-album '["asset.read","album.create","albumAsset.create","albumUser.create","album.read"]')
YK=$(key $YT y-album '["asset.read","albumAsset.create","album.read"]')
id() { curl -s -X POST $U/search/metadata -H "authorization: Bearer $1" -H "$J" -d "{\"size\":1,\"filter\":{\"originalFileName\":{\"eq\":\"$2\"}}}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["assets"]["items"][0]["id"])'; }
TOKYO=$(id $MT tokyo.jpg); ROME=$(id $YT rome.jpg)
YID=$(curl -s $U/users/me -H "authorization: Bearer $YT" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
A=$(curl -s -X POST $U/albums -H "x-api-key: $MK" -H "$J" -d "{\"albumName\":\"Couple\",\"assetIds\":[\"$TOKYO\"]}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
echo "album=$A"
echo "== Alex ajoute la photo de Sam (partage partenaire actif, inTimeline)"; curl -s -X PUT $U/albums/$A/assets -H "x-api-key: $MK" -H "$J" -d "{\"ids\":[\"$ROME\"]}"; echo
echo "== Sam (non membre) ajoute sa photo"; curl -s -X PUT $U/albums/$A/assets -H "x-api-key: $YK" -H "$J" -d "{\"ids\":[\"$ROME\"]}"; echo
echo "== Alex partage l'album avec Sam (editor)"; curl -s -o /dev/null -w "%{http_code}\n" -X PUT $U/albums/$A/users -H "x-api-key: $MK" -H "$J" -d "{\"albumUsers\":[{\"userId\":\"$YID\",\"role\":\"editor\"}]}"
echo "== Sam (editor) ajoute sa photo"; curl -s -X PUT $U/albums/$A/assets -H "x-api-key: $YK" -H "$J" -d "{\"ids\":[\"$ROME\"]}"; echo
echo "== GET album (album.read)"; curl -s "$U/albums/$A" -H "x-api-key: $MK" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["assetCount"], [u["user"]["name"]+":"+u["role"] for u in d["albumUsers"]], list(d.keys()))'
echo "== GET album inexistant"; curl -s "$U/albums/00000000-0000-4000-8000-000000000000" -H "x-api-key: $MK"; echo
