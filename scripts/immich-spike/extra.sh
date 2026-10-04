#!/bin/sh
# Vérifications complémentaires (après spike.mts) : filtres d'exclusion, sync/stream, restauration.
U=${IMMICH_URL:-http://127.0.0.1:22883/api}
J='content-type: application/json'
TOK=$(curl -s -X POST $U/auth/login -H "$J" -d '{"email":"alex@atlas.test","password":"spike-password"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
key() { curl -s -X POST $U/api-keys -H "authorization: Bearer $TOK" -H "$J" -d "{\"name\":\"$1\",\"permissions\":$2}" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("secret") or d)'; }
K=$(key extra '["asset.read","asset.view","user.read","partner.read"]')
S=$(key sync '["sync.stream"]')
search() { curl -s -X POST $U/search/metadata -H "x-api-key: $K" -H "$J" -d "$1" | python3 -c 'import sys,json;d=json.load(sys.stdin);a=d.get("assets",d);print(a.get("count"), sorted(set(i["originalFileName"] for i in a.get("items",[]) if not i["originalFileName"].startswith("IMG_"))), a.get("message",""))'; }
echo "== défaut filter {}"; search '{"size":1000,"filter":{}}'
echo "== visibility=timeline"; search '{"size":1000,"filter":{"visibility":{"eq":"timeline"}}}'
echo "== trashedAt eq null"; search '{"size":1000,"filter":{"trashedAt":{"eq":null}}}'
echo "== timeline + non corbeille"; search '{"size":1000,"filter":{"visibility":{"eq":"timeline"},"trashedAt":{"eq":null}}}'
echo "== sync/stream clé sync.stream"; curl -s -X POST $U/sync/stream -H "x-api-key: $S" -H "$J" -d '{"types":["AssetsV1"]}' | head -c 300; echo
echo "== types acceptés par sync (session)"; curl -s -X POST $U/sync/stream -H "authorization: Bearer $TOK" -H "$J" -d '{"types":["AssetsV1"]}' | head -c 300; echo
NY=$(curl -s -X POST $U/search/metadata -H "x-api-key: $K" -H "$J" -d '{"size":10,"filter":{"originalFileName":{"eq":"new-york.jpg"}}}' | python3 -c 'import sys,json;d=json.load(sys.stdin)["assets"];print(d["items"][0]["id"] if d["items"] else d)')
echo "new-york=$NY"
B=$(curl -s $U/assets/$NY -H "x-api-key: $K" | python3 -c 'import sys,json;print(json.load(sys.stdin)["updatedAt"])')
curl -s -o /dev/null -w "restore %{http_code}\n" -X POST $U/trash/restore/assets -H "authorization: Bearer $TOK" -H "$J" -d "{\"ids\":[\"$NY\"]}"
sleep 3
curl -s $U/assets/$NY -H "x-api-key: $K" | python3 -c "import sys,json;d=json.load(sys.stdin);print('après restauration updatedAt', '$B', '->', d['updatedAt'], 'isTrashed', d['isTrashed'])"
echo "== originalFileName pattern ?"; search '{"size":3,"filter":{"originalFileName":{"like":"%york%"}}}'
echo "== checksum eq (base64 sha1)"; search '{"size":3,"filter":{"checksum":{"eq":"xmo5qVRcD9BqXxJaXlxeJKNYhLc="}}}'
echo "== bulk-upload-check avec clé lecture"; curl -s -X POST $U/assets/bulk-upload-check -H "x-api-key: $K" -H "$J" -d '{"assets":[{"id":"a","checksum":"xmo5qVRcD9BqXxJaXlxeJKNYhLc="}]}' | head -c 200; echo
echo "== statistics"; curl -s -X POST $U/search/statistics -H "x-api-key: $K" -H "$J" -d '{"filter":{"visibility":{"eq":"timeline"}}}' | head -c 300; echo
echo "== statistics sans filter"; curl -s -X POST $U/search/statistics -H "x-api-key: $K" -H "$J" -d '{}' | head -c 300; echo
echo "== GET /assets/statistics"; curl -s "$U/assets/statistics" -H "x-api-key: $K" | head -c 300; echo
echo "== thumbnail sans size"; curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "$U/assets/$NY/thumbnail" -H "x-api-key: $K"
echo "== x-api-key invalide"; curl -s "$U/users/me" -H "x-api-key: nimporte" | head -c 200; echo
echo "== partenaires: search updatedAt des photos partenaire"; search '{"size":1000,"filter":{"or":[{"originalFileName":{"eq":"rome.jpg"}},{"originalFileName":{"eq":"rome-archive.jpg"}}]}}'
