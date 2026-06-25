$simpelUrl = "https://mauyygrbdopmpdpnwzra.supabase.co"
$simpelAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hdXl5Z3JiZG9wbXBkcG53enJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MzEzODQsImV4cCI6MjA5MDUwNzM4NH0.rO9oPY2jbax8GNVjW_rkaE8T4FqrV6OoJa7ME96p4bQ"

Write-Host "Adding VITE_SIMPEL_URL..."
$simpelUrl | npx vercel env add VITE_SIMPEL_URL production --force

Write-Host "Adding VITE_SIMPEL_ANON_KEY..."
$simpelAnonKey | npx vercel env add VITE_SIMPEL_ANON_KEY production --force

Write-Host "Done. Triggering redeploy..."
npx vercel --prod --yes
