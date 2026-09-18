# checks a running stack for what unit tests cannot see. start the backend first

param([string]$Api = "http://127.0.0.1:8000")

$ErrorActionPreference = "Stop"
$failures = @()
$checks = 0

function Check($name, $ok, $detail) {
    $script:checks++
    if ($ok) {
        Write-Host ("  ok   " + $name) -ForegroundColor DarkGreen
    } else {
        Write-Host ("  FAIL " + $name + "  " + $detail) -ForegroundColor Red
        $script:failures += $name
    }
}

function Route($start, $target, $mode, $trace) {
    $body = @{
        start = $start; target = $target; mode = $mode
        algorithms = @("dijkstra","astar","bfs","bidirectional"); trace = $trace
    } | ConvertTo-Json
    return Invoke-RestMethod "$Api/api/route" -Method Post -Body $body -ContentType "application/json"
}

Write-Host "`nservice is up" -ForegroundColor Cyan
$health = Invoke-RestMethod "$Api/api/health"
Check "gateway and engine both up" ($health.ok -and $health.engine -eq "up") $health.engine

$meta = Invoke-RestMethod "$Api/api/graph/meta"
Check "graph looks like campus" ($meta.counts.nodes -gt 16000 -and $meta.counts.buildings -eq 113) `
    "$($meta.counts.nodes) nodes, $($meta.counts.buildings) buildings"

Write-Host "`ntraces arrive whole" -ForegroundColor Cyan
$traced = Route "ARC" "SES" "shortest" $true

# the engine is compiled once at startup, so an old binary can outlive the source
$hasDropped = $traced.results[0].trace.PSObject.Properties.Name -contains "droppedEdges"
Check "engine is not a stale binary" $hasDropped "no droppedEdges field, rebuild and restart the backend"

foreach ($r in $traced.results) {
    # a thinned trace loses edges roughly squared, since an edge needs both ends
    Check "$($r.algorithm) not thinned" (-not $r.trace.sampled) "sampled=$($r.trace.sampled)"
    if ($hasDropped) {
        Check "$($r.algorithm) kept every path" ($r.trace.droppedEdges -eq 0) `
            "dropped $($r.trace.droppedEdges)"
    }
    # a tree of best routes has one edge fewer than points, the explored network has more
    Check "$($r.algorithm) explored more than a tree" `
        ($r.trace.edges.Count -gt $r.trace.points.Count - 1) `
        "$($r.trace.edges.Count) edges, $($r.trace.points.Count) points"
}

Write-Host "`nreal building pairs" -ForegroundColor Cyan
$pairs = @(
    @("SEO","LCC"), @("ARC","SES"), @("LIB","BSB"), @("SEO","LIB"), @("LCA","LCF"),
    @("BSB","SES"), @("ARC","LIB"), @("SEO","BSB"), @("LCC","SES"), @("ERF","LCA")
)
$differed = 0; $unreachable = 0
foreach ($p in $pairs) {
    $short = Route $p[0] $p[1] "shortest" $false
    $exact = $short.results | Where-Object { $_.algorithm -ne "bfs" -and $_.status -eq "ok" }

    # the exact algorithms have to agree on real data, not just random test graphs
    $costs = $exact | ForEach-Object { [math]::Round($_.cost, 3) } | Select-Object -Unique
    Check "$($p[0]) to $($p[1]) exact algorithms agree" ($costs.Count -le 1) ($costs -join ", ")

    $bfs = $short.results | Where-Object { $_.algorithm -eq "bfs" }
    if ($bfs.status -eq "ok") {
        Check "$($p[0]) to $($p[1]) bfs is no shorter" `
            ($bfs.cost -ge ($exact | Select-Object -First 1).cost - 0.001) "bfs beat dijkstra"
    }

    $acc = Route $p[0] $p[1] "accessible" $false
    $accOk = $acc.results | Where-Object { $_.algorithm -eq "dijkstra" }
    if ($accOk.status -ne "ok") { $unreachable++ }
    elseif ($accOk.distanceM -gt ($short.results[0].distanceM + 0.5)) { $differed++ }
}
Write-Host ("  accessible changed the route on " + $differed + " of " + $pairs.Count + " pairs, " +
            $unreachable + " had no step free route")
Check "accessible mode matters somewhere" ($differed + $unreachable -gt 0) "no pair changed"

Write-Host "`nthings that should fail" -ForegroundColor Cyan
function Status($body) {
    try {
        Invoke-WebRequest "$Api/api/route" -Method Post -Body $body -ContentType "application/json" -UseBasicParsing | Out-Null
        return 200
    } catch { return $_.Exception.Response.StatusCode.value__ }
}
Check "unknown building is a 404" `
    ((Status '{"start":"NOPE","target":"LCC"}') -eq 404) "wrong status"
Check "bad mode is a 400" `
    ((Status '{"start":"SEO","target":"LCC","mode":"fly"}') -eq 400) "wrong status"
Check "unknown algorithm is a 400" `
    ((Status '{"start":"SEO","target":"LCC","algorithms":["magic"]}') -eq 400) "wrong status"
Check "no algorithms is a 400" `
    ((Status '{"start":"SEO","target":"LCC","algorithms":[]}') -eq 400) "wrong status"

Write-Host "`nbuilding list" -ForegroundColor Cyan
# search runs in the browser now, so the endpoint only hands over the list
function GetStatus($url) {
    try {
        Invoke-WebRequest $url -UseBasicParsing | Out-Null
        return 200
    } catch { return $_.Exception.Response.StatusCode.value__ }
}
$all = Invoke-RestMethod "$Api/api/buildings?limit=500"
Check "the list is the whole campus" ($all.count -eq 113) "$($all.count) buildings"
Check "a limit is respected" ((Invoke-RestMethod "$Api/api/buildings?limit=5").count -eq 5) "wrong count"
Check "a silly limit is refused" ((GetStatus "$Api/api/buildings?limit=5000") -eq 422) "wrong status"

Write-Host ""
if ($failures.Count -eq 0) {
    Write-Host ("all " + $checks + " checks passed") -ForegroundColor Green
    exit 0
}
Write-Host ($failures.Count.ToString() + " of " + $checks + " checks failed") -ForegroundColor Red
$failures | ForEach-Object { Write-Host ("  " + $_) }
exit 1
