param(
    [string]$BaseUrl = "http://localhost:3000"
)

$checks = @(
    @{ Name = "Database health"; Path = "/test-db"; Expected = 200 },
    @{ Name = "List files"; Path = "/api/v1/files"; Expected = 200 },
    @{ Name = "File versions"; Path = "/api/v1/files/1/versions"; Expected = 200 },
    @{ Name = "Version chunks"; Path = "/api/v1/versions/1/chunks"; Expected = 200 },
    @{ Name = "Storage report"; Path = "/api/v1/reports/storage"; Expected = 200 },
    @{ Name = "Existing backup"; Path = "/api/v1/backups/1"; Expected = 200 },
    @{ Name = "Missing backup"; Path = "/api/v1/backups/999999"; Expected = 404 }
)

$results = foreach ($check in $checks) {
    $actual = 0

    try {
        $response = Invoke-WebRequest `
            -Uri "$BaseUrl$($check.Path)" `
            -Method Get `
            -UseBasicParsing `
            -ErrorAction Stop

        $actual = [int]$response.StatusCode
    }
    catch {
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
            $actual = [int]$_.Exception.Response.StatusCode
        }
    }

    [PSCustomObject]@{
        Test = $check.Name
        Expected = $check.Expected
        Actual = $actual
        Result = if ($actual -eq $check.Expected) { "PASS" } else { "FAIL" }
    }
}

$results | Format-Table -AutoSize

if (@($results | Where-Object { $_.Result -ne "PASS" }).Count -gt 0) {
    exit 1
}