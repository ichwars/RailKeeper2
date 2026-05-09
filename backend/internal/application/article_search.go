package application

import (
	"context"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"
)

var ErrArticleSearchValidation = errors.New("article search validation failed")

type ArticleSearchInput struct {
	Manufacturer  string            `json:"manufacturer"`
	ArticleNumber string            `json:"articleNumber"`
	Name          string            `json:"name"`
	Gauge         string            `json:"gauge"`
	Fields        map[string]string `json:"fields"`
}

type ArticleSearchField struct {
	Label      string `json:"label"`
	Value      string `json:"value"`
	Confidence int    `json:"confidence"`
}

type ArticleSearchImage struct {
	URL    string `json:"url"`
	Title  string `json:"title"`
	Source string `json:"source"`
}

type ArticleSearchResult struct {
	Source    string                        `json:"source"`
	Title     string                        `json:"title"`
	URL       string                        `json:"url"`
	Snippet   string                        `json:"snippet"`
	Score     int                           `json:"score"`
	Fields    map[string]ArticleSearchField `json:"fields"`
	Images    []ArticleSearchImage          `json:"images,omitempty"`
	Conflicts []string                      `json:"conflicts,omitempty"`
}

type ArticleSearchResponse struct {
	Query   string                `json:"query"`
	Results []ArticleSearchResult `json:"results"`
}

type ArticleSearchAdapter interface {
	Search(ctx context.Context, input ArticleSearchInput, query string) ([]ArticleSearchResult, error)
}

type ArticleSearchService struct {
	adapters []ArticleSearchAdapter
	timeout  time.Duration
}

func NewArticleSearchService() *ArticleSearchService {
	return &ArticleSearchService{
		adapters: []ArticleSearchAdapter{
			NewDuckDuckGoArticleSearchAdapter(http.DefaultClient),
		},
		timeout: 10 * time.Second,
	}
}

func (s *ArticleSearchService) Search(ctx context.Context, input ArticleSearchInput) (*ArticleSearchResponse, error) {
	input = cleanArticleSearchInput(input)
	query := articleSearchQuery(input)
	if query == "" {
		return nil, ErrArticleSearchValidation
	}

	searchCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	results := []ArticleSearchResult{}
	for _, adapter := range s.adapters {
		adapterResults, err := adapter.Search(searchCtx, input, query)
		if err != nil && len(results) == 0 {
			return nil, err
		}
		results = append(results, adapterResults...)
	}

	for index := range results {
		results[index].Conflicts = articleSearchConflicts(input, results[index].Fields)
	}
	sort.SliceStable(results, func(left, right int) bool {
		return results[left].Score > results[right].Score
	})
	results = dedupeArticleResults(results)
	if len(results) > 10 {
		results = results[:10]
	}

	return &ArticleSearchResponse{Query: query, Results: results}, nil
}

func cleanArticleSearchInput(input ArticleSearchInput) ArticleSearchInput {
	input.Manufacturer = strings.TrimSpace(input.Manufacturer)
	input.ArticleNumber = strings.TrimSpace(input.ArticleNumber)
	input.Name = strings.TrimSpace(input.Name)
	input.Gauge = strings.TrimSpace(input.Gauge)
	cleanFields := map[string]string{}
	for key, value := range input.Fields {
		value = strings.TrimSpace(value)
		if value != "" {
			cleanFields[key] = value
		}
	}
	input.Fields = cleanFields
	return input
}

func articleSearchQuery(input ArticleSearchInput) string {
	parts := []string{}
	for _, value := range []string{input.Name, input.ArticleNumber, input.Manufacturer, input.Gauge} {
		if value != "" {
			parts = append(parts, value)
		}
	}

	return strings.Join(uniqueNonEmpty(parts), " ")
}

func articleSearchConflicts(input ArticleSearchInput, fields map[string]ArticleSearchField) []string {
	current := map[string]string{
		"manufacturer":  input.Manufacturer,
		"articleNumber": input.ArticleNumber,
		"name":          input.Name,
		"gauge":         input.Gauge,
	}
	for key, value := range input.Fields {
		current[key] = value
	}

	conflicts := []string{}
	for key, field := range fields {
		existing := strings.TrimSpace(current[key])
		if existing == "" || field.Value == "" {
			continue
		}
		if !strings.EqualFold(existing, field.Value) {
			conflicts = append(conflicts, key)
		}
	}
	sort.Strings(conflicts)
	return conflicts
}

func uniqueNonEmpty(values []string) []string {
	seen := map[string]bool{}
	result := []string{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		key := strings.ToLower(value)
		if seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, value)
	}
	return result
}

func dedupeArticleResults(results []ArticleSearchResult) []ArticleSearchResult {
	seen := map[string]bool{}
	out := []ArticleSearchResult{}
	for _, result := range results {
		key := strings.ToLower(strings.TrimSpace(result.URL))
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, result)
	}
	return out
}

type DuckDuckGoArticleSearchAdapter struct {
	client *http.Client
}

func NewDuckDuckGoArticleSearchAdapter(client *http.Client) *DuckDuckGoArticleSearchAdapter {
	if client == nil {
		client = http.DefaultClient
	}
	return &DuckDuckGoArticleSearchAdapter{client: client}
}

func (a *DuckDuckGoArticleSearchAdapter) Search(ctx context.Context, input ArticleSearchInput, query string) ([]ArticleSearchResult, error) {
	requestURL := "https://duckduckgo.com/html/?" + url.Values{"q": []string{query + " Modelleisenbahn"}}.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return nil, fmt.Errorf("build article search request: %w", err)
	}
	req.Header.Set("User-Agent", "RailKeeper2/0.1 article-search")
	req.Header.Set("Accept", "text/html,application/xhtml+xml")

	resp, err := a.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("article search request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("article search returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if err != nil {
		return nil, fmt.Errorf("read article search response: %w", err)
	}
	results := parseDuckDuckGoResults(string(body), input)
	a.enrichResultsFromPages(ctx, input, results)
	return results, nil
}

var (
	resultBlockPattern      = regexp.MustCompile(`(?s)<div class="result results_links.*?</div>\s*</div>`)
	resultLinkPattern       = regexp.MustCompile(`(?s)<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>`)
	snippetPattern          = regexp.MustCompile(`(?s)<a[^>]+class="result__snippet"[^>]*>(.*?)</a>|<div[^>]+class="result__snippet"[^>]*>(.*?)</div>`)
	tagPattern              = regexp.MustCompile(`(?s)<[^>]+>`)
	scriptStylePattern      = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>|<style[^>]*>.*?</style>|<noscript[^>]*>.*?</noscript>|<svg[^>]*>.*?</svg>`)
	pricePattern            = regexp.MustCompile(`(?i)(\d{1,4}(?:[,.]\d{2})?)\s?(?:eur|euro|\x{20AC})`)
	lengthPattern           = regexp.MustCompile(`(?i)(?:laenge|l..nge|lange|length|mass|ma..)[^\d]{0,24}(\d{2,4}(?:[,.]\d+)?)\s?(?:mm)?`)
	weightPattern           = regexp.MustCompile(`(?i)(?:gewicht|weight)[^\d]{0,18}(\d{1,5}(?:[,.]\d+)?)\s?g`)
	tractionTirePattern     = regexp.MustCompile(`(?i)(?:haftreifen|traction\s*tire)[^\d]{0,18}(\d{1,2})`)
	eanPattern              = regexp.MustCompile(`\b(\d{12,14})\b`)
	epochPattern            = regexp.MustCompile(`(?i)(?:epoche|epoch|ep\.)\s*(I{1,3}|IV|V|VI)\b`)
	railwayPattern          = regexp.MustCompile(`\b(DB AG|DB|DRG|DR|SBB|OeBB|BLS|SNCF|NS|FS)\b`)
	adapterPattern          = regexp.MustCompile(`(?i)\b(NEM\s?651|NEM\s?652|NEM\s?658|PluX\s?16|PluX\s?22|MTC\s?21|Next\s?18|8-?polig|21-?polig|DSS\s?8pol)\b`)
	powerPattern            = regexp.MustCompile(`(?i)\b(DC|AC|2-?Leiter|3-?Leiter|Gleichstrom|Wechselstrom)\b`)
	digitalPositivePattern  = regexp.MustCompile(`(?i)(?:\bdigital\s*[:=]\s*(?:ja|yes|true)\b|\bdigitaldecoder\b|\bsounddecoder\b|\bmit\s+(?:dcc\s+)?decoder\b)`)
	lightDescriptionPattern = regexp.MustCompile(`(?i)(?:lichtwechsel|fahrlicht|beleuchtung)[^\n:;]{0,35}[:]\s*([^.;\n]{3,160})`)
	soundDescriptionPattern = regexp.MustCompile(`(?i)(?:sound|soundgenerator|geraeusch|ger..usch)[^\n:;]{0,35}[:]\s*([^.;\n]{3,160})`)
	imageMetaPattern        = regexp.MustCompile(`(?is)<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image|thumbnail)["'][^>]+content=["']([^"']+)["']`)
	imageMetaAltPattern     = regexp.MustCompile(`(?is)<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image|thumbnail)["']`)
	imageTagPattern         = regexp.MustCompile(`(?is)<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["'][^>]*>`)
	metaDescriptionRegex    = regexp.MustCompile(`(?is)<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']`)
)

var manufacturerDomains = map[string][]string{
	"arnold":      {"hornby.com"},
	"brawa":       {"brawa.de"},
	"esu":         {"esu.eu"},
	"fleischmann": {"fleischmann.de"},
	"lgb":         {"lgb.de", "maerklin.de"},
	"maerklin":    {"maerklin.de"},
	"piko":        {"piko.de", "piko-shop.de"},
	"roco":        {"roco.cc"},
	"tillig":      {"tillig.com"},
	"trix":        {"trix.de", "maerklin.de"},
	"viessmann":   {"viessmann-modell.com"},
}

func parseDuckDuckGoResults(body string, input ArticleSearchInput) []ArticleSearchResult {
	blocks := resultBlockPattern.FindAllString(body, 12)
	results := []ArticleSearchResult{}
	for _, block := range blocks {
		linkMatch := resultLinkPattern.FindStringSubmatch(block)
		if len(linkMatch) < 3 {
			continue
		}
		resultURL := decodeDuckDuckGoURL(linkMatch[1])
		title := cleanHTML(linkMatch[2])
		snippet := ""
		if snippetMatch := snippetPattern.FindStringSubmatch(block); len(snippetMatch) > 0 {
			snippet = cleanHTML(strings.Join(snippetMatch[1:], " "))
		}
		if title == "" || resultURL == "" {
			continue
		}
		fields := buildArticleFields(input, title, resultURL, snippet)
		results = append(results, ArticleSearchResult{
			Source:  "DuckDuckGo",
			Title:   title,
			URL:     resultURL,
			Snippet: snippet,
			Score:   scoreArticleResult(input, title, resultURL, snippet, fields),
			Fields:  fields,
		})
	}
	return results
}

func buildArticleFields(input ArticleSearchInput, title, resultURL, snippet string) map[string]ArticleSearchField {
	cleanName := cleanArticleName(title, resultURL)
	fields := map[string]ArticleSearchField{
		"name": {
			Label:      "Bezeichnung",
			Value:      cleanName,
			Confidence: 60,
		},
		"articleSourceUrl": {
			Label:      "Quelle",
			Value:      resultURL,
			Confidence: 100,
		},
	}
	combined := title + " " + snippet + " " + resultURL
	combinedLower := strings.ToLower(combined)
	if input.Manufacturer != "" && strings.Contains(strings.ToLower(combined), strings.ToLower(input.Manufacturer)) {
		fields["manufacturer"] = ArticleSearchField{Label: "Hersteller", Value: input.Manufacturer, Confidence: 80}
	}
	if input.ArticleNumber != "" && strings.Contains(strings.ToLower(combined), strings.ToLower(input.ArticleNumber)) {
		fields["articleNumber"] = ArticleSearchField{Label: "Artikel-Nr.", Value: input.ArticleNumber, Confidence: 90}
	}
	if input.Gauge != "" && strings.Contains(strings.ToLower(combined), strings.ToLower(input.Gauge)) {
		fields["gauge"] = ArticleSearchField{Label: "Spurweite", Value: input.Gauge, Confidence: 80}
	}
	if description := bestArticleDescription(input, cleanName, snippet, resultURL); description != "" {
		fields["description"] = ArticleSearchField{Label: "Beschreibung", Value: description, Confidence: 65}
	}
	if value := firstRegexValue(eanPattern, combined); value != "" && value != input.ArticleNumber {
		fields["ean"] = ArticleSearchField{Label: "EAN-Nr.", Value: value, Confidence: 60}
	}
	if value := firstRegexValue(epochPattern, combined); value != "" {
		fields["epoch"] = ArticleSearchField{Label: "Epoche", Value: strings.ToUpper(value), Confidence: 60}
	}
	if value := firstRegexValue(railwayPattern, combined); value != "" {
		fields["railwayCompany"] = ArticleSearchField{Label: "Bahngesellschaft", Value: strings.ToUpper(value), Confidence: 55}
	}
	if value := firstRegexValue(pricePattern, combined); value != "" {
		fields["listPrice"] = ArticleSearchField{Label: "Listenpreis", Value: value, Confidence: 45}
	}
	if value := firstRegexValue(lengthPattern, combined); value != "" {
		fields["lengthMm"] = ArticleSearchField{Label: "Laenge (mm)", Value: strings.ReplaceAll(value, ",", "."), Confidence: 55}
	}
	if value := firstRegexValue(weightPattern, combined); value != "" {
		fields["weightG"] = ArticleSearchField{Label: "Gewicht (g)", Value: strings.ReplaceAll(value, ",", "."), Confidence: 55}
	}
	if value := firstRegexValue(tractionTirePattern, combined); value != "" {
		fields["tractionTireCount"] = ArticleSearchField{Label: "Anzahl Haftreifen", Value: value, Confidence: 58}
	}
	if value := firstRegexValue(adapterPattern, combined); value != "" {
		fields["adapter"] = ArticleSearchField{Label: "Schnittstelle / Adapter", Value: normalizeWhitespace(value), Confidence: 60}
	}
	if value := firstRegexValue(powerPattern, combined); value != "" {
		fields["powerPickup"] = ArticleSearchField{Label: "Stromsystem", Value: normalizeWhitespace(value), Confidence: 50}
	}
	if digitalPositivePattern.MatchString(combined) {
		fields["digital"] = ArticleSearchField{Label: "Digital", Value: "Ja", Confidence: 48}
	}
	if soundDescription := firstRegexValue(soundDescriptionPattern, combined); soundDescription != "" {
		fields["soundGeneratorEnabled"] = ArticleSearchField{Label: "Soundgenerator", Value: "Ja", Confidence: 48}
		fields["soundGeneratorDescription"] = ArticleSearchField{Label: "Soundgenerator Beschreibung", Value: normalizeWhitespace(soundDescription), Confidence: 55}
	} else if strings.Contains(combinedLower, "sound") && !strings.Contains(combinedLower, "ohne sound") {
		fields["soundGeneratorEnabled"] = ArticleSearchField{Label: "Soundgenerator", Value: "Ja", Confidence: 38}
	}
	if lightDescription := firstRegexValue(lightDescriptionPattern, combined); lightDescription != "" {
		fields["headlightsEnabled"] = ArticleSearchField{Label: "Fahrlicht", Value: "Ja", Confidence: 42}
		fields["lightingEnabled"] = ArticleSearchField{Label: "Beleuchtung", Value: "Ja", Confidence: 42}
		fields["headlightsDescription"] = ArticleSearchField{Label: "Fahrlicht Beschreibung", Value: normalizeWhitespace(lightDescription), Confidence: 55}
		fields["lightingDescription"] = ArticleSearchField{Label: "Beleuchtung Beschreibung", Value: normalizeWhitespace(lightDescription), Confidence: 50}
	} else if strings.Contains(combinedLower, "licht") || strings.Contains(combinedLower, "beleuchtung") {
		fields["headlightsEnabled"] = ArticleSearchField{Label: "Fahrlicht", Value: "Ja", Confidence: 36}
		fields["lightingEnabled"] = ArticleSearchField{Label: "Beleuchtung", Value: "Ja", Confidence: 36}
	}
	return fields
}

func scoreArticleResult(input ArticleSearchInput, title, resultURL, snippet string, fields map[string]ArticleSearchField) int {
	haystack := strings.ToLower(title + " " + resultURL + " " + snippet)
	score := len(fields) * 10
	for _, token := range uniqueNonEmpty([]string{input.Manufacturer, input.ArticleNumber, input.Name, input.Gauge}) {
		token = strings.ToLower(token)
		if token != "" && strings.Contains(haystack, token) {
			score += 25
		}
	}
	if isManufacturerPreferredURL(input.Manufacturer, resultURL) {
		score += 60
	} else if strings.Contains(haystack, manufacturerDomainToken(input.Manufacturer)) {
		score += 20
	}
	if input.ArticleNumber != "" && strings.Contains(haystack, strings.ToLower(input.ArticleNumber)) {
		score += 35
	}
	for _, value := range input.Fields {
		value = strings.ToLower(strings.TrimSpace(value))
		if value != "" && strings.Contains(haystack, value) {
			score += 8
		}
	}
	return score
}

func (a *DuckDuckGoArticleSearchAdapter) enrichResultsFromPages(ctx context.Context, input ArticleSearchInput, results []ArticleSearchResult) {
	limit := len(results)
	if limit > 6 {
		limit = 6
	}
	for index := 0; index < limit; index++ {
		pageCtx, cancel := context.WithTimeout(ctx, 1800*time.Millisecond)
		body, finalURL, err := a.fetchArticlePage(pageCtx, results[index].URL)
		cancel()
		if err != nil || body == "" {
			continue
		}
		if finalURL != "" {
			results[index].URL = finalURL
			if sourceField, ok := results[index].Fields["articleSourceUrl"]; ok {
				sourceField.Value = finalURL
				results[index].Fields["articleSourceUrl"] = sourceField
			}
		}
		pageText := visibleArticleText(body)
		if pageDescription := firstRegexValue(metaDescriptionRegex, body); pageDescription != "" {
			pageText = cleanHTML(pageDescription) + " " + pageText
		}
		for key, field := range buildArticleFields(input, results[index].Title, results[index].URL, pageText) {
			if existing, ok := results[index].Fields[key]; !ok || field.Confidence > existing.Confidence {
				results[index].Fields[key] = field
			}
		}
		results[index].Images = articleImagesFromHTML(body, results[index].URL, results[index].Title)
		results[index].Score = scoreArticleResult(input, results[index].Title, results[index].URL, results[index].Snippet+" "+pageText, results[index].Fields)
	}
}

func (a *DuckDuckGoArticleSearchAdapter) fetchArticlePage(ctx context.Context, pageURL string) (string, string, error) {
	parsed, err := url.Parse(pageURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", "", fmt.Errorf("invalid article page url")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, pageURL, nil)
	if err != nil {
		return "", "", err
	}
	req.Header.Set("User-Agent", "RailKeeper2/0.1 article-search")
	req.Header.Set("Accept", "text/html,application/xhtml+xml")
	resp, err := a.client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return "", "", fmt.Errorf("article page returned status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 768*1024))
	if err != nil {
		return "", "", err
	}
	return string(body), resp.Request.URL.String(), nil
}

func articleImagesFromHTML(body, pageURL, title string) []ArticleSearchImage {
	seen := map[string]bool{}
	images := []ArticleSearchImage{}
	for _, pattern := range []*regexp.Regexp{imageMetaPattern, imageMetaAltPattern, imageTagPattern} {
		for _, match := range pattern.FindAllStringSubmatch(body, 8) {
			if len(match) < 2 {
				continue
			}
			imageURL := resolveURL(pageURL, html.UnescapeString(match[1]))
			if imageURL == "" || seen[strings.ToLower(imageURL)] || !looksLikeArticleImage(imageURL) {
				continue
			}
			seen[strings.ToLower(imageURL)] = true
			images = append(images, ArticleSearchImage{URL: imageURL, Title: title, Source: pageURL})
			if len(images) >= 4 {
				return images
			}
		}
	}
	return images
}

func looksLikeArticleImage(imageURL string) bool {
	lower := strings.ToLower(imageURL)
	if strings.Contains(lower, "logo") || strings.Contains(lower, "sprite") || strings.Contains(lower, "icon") || strings.Contains(lower, "tracking") {
		return false
	}
	return strings.Contains(lower, ".jpg") || strings.Contains(lower, ".jpeg") || strings.Contains(lower, ".png") || strings.Contains(lower, ".webp")
}

func resolveURL(baseURL, raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || strings.HasPrefix(raw, "data:") {
		return ""
	}
	parsed, err := url.Parse(raw)
	if err == nil && parsed.Scheme != "" {
		return parsed.String()
	}
	base, err := url.Parse(baseURL)
	if err != nil {
		return ""
	}
	relative, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return base.ResolveReference(relative).String()
}

func isManufacturerPreferredURL(manufacturer, resultURL string) bool {
	manufacturer = strings.ToLower(strings.TrimSpace(manufacturer))
	resultURL = strings.ToLower(resultURL)
	for key, domains := range manufacturerDomains {
		if manufacturer == "" || !strings.Contains(manufacturer, key) {
			continue
		}
		for _, domain := range domains {
			if strings.Contains(resultURL, domain) {
				return true
			}
		}
	}
	return false
}

func manufacturerDomainToken(manufacturer string) string {
	manufacturer = strings.ToLower(strings.TrimSpace(manufacturer))
	for key := range manufacturerDomains {
		if strings.Contains(manufacturer, key) {
			return key
		}
	}
	return manufacturer
}

func normalizeWhitespace(value string) string {
	return strings.Join(strings.Fields(value), " ")
}

func visibleArticleText(value string) string {
	value = scriptStylePattern.ReplaceAllString(value, " ")
	return cleanHTML(value)
}

func cleanArticleName(title, resultURL string) string {
	value := cleanHTML(title)
	sourceParts := []string{
		" - " + sourceDisplayName(resultURL),
		" | " + sourceDisplayName(resultURL),
		" - PIKO Spielwaren GmbH Webshop",
		" - PIKO Webshop",
		" - Amazon.de",
		" - eBay",
		" - idealo",
	}
	for _, part := range sourceParts {
		if part != " - " && part != " | " && strings.HasSuffix(strings.ToLower(value), strings.ToLower(part)) {
			value = strings.TrimSpace(value[:len(value)-len(part)])
		}
	}
	return strings.Trim(value, " -|")
}

func sourceDisplayName(resultURL string) string {
	parsed, err := url.Parse(resultURL)
	if err != nil || parsed.Host == "" {
		return "Quelle"
	}
	host := strings.TrimPrefix(strings.ToLower(parsed.Host), "www.")
	parts := strings.Split(host, ".")
	if len(parts) == 0 || parts[0] == "" {
		return host
	}
	return parts[0]
}

func bestArticleDescription(input ArticleSearchInput, name, text, resultURL string) string {
	text = normalizeWhitespace(text)
	if len(text) < 20 {
		return ""
	}
	candidates := splitDescriptionCandidates(text)
	best := ""
	bestScore := -1
	for _, candidate := range candidates {
		candidate = normalizeWhitespace(candidate)
		if !looksLikeHumanDescription(candidate) {
			continue
		}
		score := 0
		lower := strings.ToLower(candidate)
		for _, token := range uniqueNonEmpty([]string{input.ArticleNumber, input.Name, input.Gauge, input.Manufacturer, "neuheit", "druckvariante", "epoche", "dr", "db"}) {
			if strings.Contains(lower, strings.ToLower(token)) {
				score += 8
			}
		}
		if strings.Contains(strings.ToLower(resultURL), "piko") || strings.Contains(strings.ToLower(resultURL), "roco") || strings.Contains(strings.ToLower(resultURL), "tillig") {
			score += 4
		}
		if len(candidate) > 60 && len(candidate) < 280 {
			score += 3
		}
		if score > bestScore {
			bestScore = score
			best = candidate
		}
	}
	if best == "" {
		return ""
	}
	if len(best) > 320 {
		best = best[:320]
	}
	return strings.TrimSpace(best)
}

func splitDescriptionCandidates(text string) []string {
	parts := regexp.MustCompile(`[.!?]\s+|\s{2,}`).Split(text, -1)
	out := []string{}
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	if len(out) == 0 && text != "" {
		out = append(out, text)
	}
	return out
}

func looksLikeHumanDescription(value string) bool {
	value = strings.TrimSpace(value)
	if len(value) < 20 || len(value) > 600 {
		return false
	}
	lower := strings.ToLower(value)
	badTokens := []string{"google_analytics", "cookie", "mandatory", "preferences", "statistics", "marketing", "function", "const ", "new map", "document.", "window.", "{", "};", "class "}
	for _, token := range badTokens {
		if strings.Contains(lower, token) {
			return false
		}
	}
	return true
}

func firstRegexValue(pattern *regexp.Regexp, value string) string {
	matches := pattern.FindStringSubmatch(value)
	if len(matches) < 2 {
		return ""
	}
	return strings.TrimSpace(matches[1])
}

func cleanHTML(value string) string {
	value = tagPattern.ReplaceAllString(value, " ")
	value = html.UnescapeString(value)
	value = strings.Join(strings.Fields(value), " ")
	return strings.TrimSpace(value)
}

func decodeDuckDuckGoURL(value string) string {
	value = html.UnescapeString(value)
	parsed, err := url.Parse(value)
	if err == nil {
		if raw := parsed.Query().Get("uddg"); raw != "" {
			if decoded, err := url.QueryUnescape(raw); err == nil {
				return decoded
			}
			return raw
		}
		if parsed.Scheme != "" {
			return parsed.String()
		}
	}
	return strings.TrimSpace(value)
}
