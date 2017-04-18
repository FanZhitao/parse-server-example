# This file bootstraps the products data on Parse for the Parse Store app.
# You should replace PARSE_APP_ID and PARSE_REST_KEY with the ones from your own app.

PARSE_APP_ID="APP_ID0"
PARSE_REST_KEY="MASTER_KEY0"

curl --request POST \
  --header "X-Parse-Application-Id: $PARSE_APP_ID" \
  --header "X-Parse-REST-API-Key: $PARSE_REST_KEY" \
  --header "Content-Type: application/json" \
  --data '{
        "name": "Tshirt",
        "description": "Black T-shirt",
        "hasSize": true,
        "price": 25,
        "quantityAvailable": 100
      }' \
  http://localhost:1337/parse/classes/Item

curl --request POST \
  --header "X-Parse-Application-Id: $PARSE_APP_ID" \
  --header "X-Parse-REST-API-Key: $PARSE_REST_KEY" \
  --header "Content-Type: application/json" \
  --data '{
        "name": "Hoodie",
        "description": "Black Hoodie",
        "hasSize": true,
        "price": 45,
        "quantityAvailable": 100
      }' \
  http://localhost:1337/parse/classes/Item

curl --request POST \
  --header "X-Parse-Application-Id: $PARSE_APP_ID" \
  --header "X-Parse-REST-API-Key: $PARSE_REST_KEY" \
  --header "Content-Type: application/json" \
  --data '{
        "name": "Mug",
        "description": "Signature Mug",
        "hasSize": false,
        "price": 12,
        "quantityAvailable": 100
      }' \
  http://localhost:1337/parse/classes/Item
