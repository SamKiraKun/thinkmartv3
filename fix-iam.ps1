$functions = @(
    "getShopProductsPage",
    "adminHealthCheck",
    "getAdminUsersPage",
    "getProductsForModerationPage",
    "getOrdersPage",
    "getPartnersPage",
    "getAdminTasksPage",
    "getWithdrawalsPage",
    "getKycRequestsPage",
    "getUserDetails"
)

Write-Host "Checking gcloud authentication..." -ForegroundColor Cyan

# Check if logged in.
$account = gcloud config get-value account 2> $null
if (-not $account) {
    Write-Host "Not authenticated in gcloud. Please run 'gcloud auth login' with the account holding Owner/Editor privileges for periodtracker-733c2." -ForegroundColor Red
    exit 1
}

Write-Host "Running as $account."

$project = gcloud config get-value project 2> $null
if ($project -ne "periodtracker-733c2") {
    Write-Host "Current project is '$project'. Setting to 'periodtracker-733c2'..." -ForegroundColor Yellow
    gcloud config set project periodtracker-733c2
}

Write-Host "Applying 'allUsers' to 'roles/cloudfunctions.invoker' for missing functions..." -ForegroundColor Cyan

foreach ($function in $functions) {
    Write-Host "`nUpdating IAM policy for function: $function"
    # This automatically adds the invoker role to allUsers, effectively allowing unauthenticated triggering 
    # (which the Firebase SDK proxy fallback requires).
    gcloud functions add-iam-policy-binding $function --region=us-central1 --member=allUsers --role=roles/cloudfunctions.invoker --project=periodtracker-733c2 --quiet
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Successfully updated $function." -ForegroundColor Green
    } else {
        Write-Host "Failed to update $function. Ensure the function exists and you have adequate permissions." -ForegroundColor Red
    }
}

Write-Host "`nFinished updating all functions." -ForegroundColor Cyan
