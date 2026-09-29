import requests

url = 'https://vfbfnucseymoxjdwrvpz.supabase.co/rest/v1/automation_definitions'
headers = {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmYmZudWNzZXltb3hqZHdydnB6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjQxMDI1OSwiZXhwIjoyMDgxOTg2MjU5fQ.PB5C8LG1txVzBwt9TEf8cQy8GvcERToGpus7pGIMhhE',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmYmZudWNzZXltb3hqZHdydnB6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjQxMDI1OSwiZXhwIjoyMDgxOTg2MjU5fQ.PB5C8LG1txVzBwt9TEf8cQy8GvcERToGpus7pGIMhhE'
}
response = requests.get(url, headers=headers)
print(response.json())
