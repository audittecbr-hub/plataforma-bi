import requests
import json

url = 'https://vfbfnucseymoxjdwrvpz.supabase.co/rest/v1/automation_definitions'
headers = {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmYmZudWNzZXltb3hqZHdydnB6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjQxMDI1OSwiZXhwIjoyMDgxOTg2MjU5fQ.PB5C8LG1txVzBwt9TEf8cQy8GvcERToGpus7pGIMhhE',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmYmZudWNzZXltb3hqZHdydnB6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjQxMDI1OSwiZXhwIjoyMDgxOTg2MjU5fQ.PB5C8LG1txVzBwt9TEf8cQy8GvcERToGpus7pGIMhhE',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}
payload = {
    'name': 'Relatório de Notas Emitidas',
    'key': 'notas_emitidas',
    'description': 'Envia o relatório de Notas Emitidas para a diretoria.'
}
response = requests.post(url, headers=headers, data=json.dumps(payload))
print(response.status_code)
print(response.json())
