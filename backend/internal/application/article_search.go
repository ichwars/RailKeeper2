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
	"unicode/utf8"
)

var ErrArticleSearchValidation = errors.New("article search validation failed")

type ArticleSearchInput struct {
	Manufacturer  string            `json:"manufacturer"`
	ArticleNumber string            `json:"articleNumber"`
	Name          string            `json:"name"`
	Gauge         string            `json:"gauge"`
	SearchSources []string          `json:"searchSources"`
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

type articleSearchQuerySpec struct {
	Query  string
	Source string
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
	input.SearchSources = cleanArticleSearchSources(input.SearchSources)
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

func cleanArticleSearchSources(sources []string) []string {
	allowed := map[string]bool{
		"web":          true,
		"manufacturer": true,
		"dealers":      true,
		"wiki":         true,
	}
	cleaned := []string{}
	for _, source := range sources {
		source = strings.ToLower(strings.TrimSpace(source))
		if allowed[source] {
			cleaned = append(cleaned, source)
		}
	}
	cleaned = uniqueNonEmpty(cleaned)
	if len(cleaned) == 0 {
		return []string{"web", "manufacturer", "dealers", "wiki"}
	}
	return cleaned
}

func articleSearchQuery(input ArticleSearchInput) string {
	parts := []string{}
	for _, value := range []string{input.Name, input.ArticleNumber, input.Fields["ean"], input.Manufacturer, input.Gauge} {
		if value != "" {
			parts = append(parts, value)
		}
	}

	return strings.Join(uniqueNonEmpty(parts), " ")
}

func isEANOnlyArticleSearch(input ArticleSearchInput, query string) bool {
	ean := strings.TrimSpace(input.Fields["ean"])
	if ean == "" || query != ean {
		return false
	}
	return input.Manufacturer == "" && input.ArticleNumber == "" && input.Name == "" && input.Gauge == ""
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
	if isEANOnlyArticleSearch(input, query) {
		results, err := a.searchDuckDuckGo(ctx, input, query, "DuckDuckGo")
		if err == nil && len(results) > 0 {
			results = dedupeArticleResults(results)
			a.enrichResultsFromPages(ctx, input, results)
			return results, nil
		}

		fallbackResults, fallbackErr := a.searchDuckDuckGo(ctx, input, query+" Modelleisenbahn", "DuckDuckGo")
		if fallbackErr != nil {
			if err != nil {
				return nil, err
			}
			return nil, fallbackErr
		}
		results = dedupeArticleResults(fallbackResults)
		a.enrichResultsFromPages(ctx, input, results)
		return results, nil
	}

	results := []ArticleSearchResult{}
	for _, searchQuery := range articleSearchQueries(input, query) {
		searchResults, err := a.searchDuckDuckGo(ctx, input, searchQuery.Query, searchQuery.Source)
		if err != nil {
			if len(results) == 0 {
				return nil, err
			}
			continue
		}
		results = append(results, searchResults...)
	}
	results = dedupeArticleResults(results)
	a.enrichResultsFromPages(ctx, input, results)
	return results, nil
}

func articleSearchQueries(input ArticleSearchInput, query string) []articleSearchQuerySpec {
	focused := focusedArticleSearchQuery(input)
	sources := cleanArticleSearchSources(input.SearchSources)
	queries := []articleSearchQuerySpec{}
	hasSource := func(source string) bool {
		for _, selected := range sources {
			if selected == source {
				return true
			}
		}
		return false
	}
	appendQuery := func(searchQuery, source string) {
		if strings.TrimSpace(searchQuery) == "" {
			return
		}
		queries = append(queries, articleSearchQuerySpec{Query: searchQuery, Source: source})
	}

	if hasSource("manufacturer") {
		for _, domain := range preferredManufacturerDomains(input.Manufacturer) {
			if focused != "" {
				appendQuery(focused+" site:"+domain, "Herstellerseiten")
			}
			appendQuery(query+" site:"+domain, "Herstellerseiten")
			if len(queries) >= 4 {
				break
			}
		}
	}
	if hasSource("dealers") {
		for _, domain := range dealerArticleDomains {
			appendQuery(query+" site:"+domain, "Händlerseiten")
			if len(queries) >= 7 {
				break
			}
		}
	}
	if hasSource("wiki") {
		appendQuery(query+" site:modellbau-wiki.de", "Modellbau-Wiki")
	}
	if hasSource("web") {
		appendQuery(focused, "DuckDuckGo")
		appendQuery(query, "DuckDuckGo")
		appendQuery(query+" Modelleisenbahn", "DuckDuckGo")
	}
	return uniqueArticleSearchQueries(queries, 9)
}

func uniqueArticleSearchQueries(queries []articleSearchQuerySpec, limit int) []articleSearchQuerySpec {
	seen := map[string]bool{}
	out := []articleSearchQuerySpec{}
	for _, query := range queries {
		key := strings.ToLower(strings.TrimSpace(query.Query))
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, query)
		if limit > 0 && len(out) >= limit {
			break
		}
	}
	return out
}

func focusedArticleSearchQuery(input ArticleSearchInput) string {
	parts := []string{}
	for _, value := range []string{input.ArticleNumber, input.Manufacturer, input.Gauge} {
		if value != "" {
			parts = append(parts, value)
		}
	}
	return strings.Join(uniqueNonEmpty(parts), " ")
}

func (a *DuckDuckGoArticleSearchAdapter) searchDuckDuckGo(ctx context.Context, input ArticleSearchInput, query string, source string) ([]ArticleSearchResult, error) {
	requestURL := "https://duckduckgo.com/html/?" + url.Values{"q": []string{query}}.Encode()
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
	results := parseDuckDuckGoResults(string(body), input, source)
	return results, nil
}

var (
	resultBlockPattern          = regexp.MustCompile(`(?s)<div class="result results_links.*?</div>\s*</div>`)
	resultLinkPattern           = regexp.MustCompile(`(?s)<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>`)
	snippetPattern              = regexp.MustCompile(`(?s)<a[^>]+class="result__snippet"[^>]*>(.*?)</a>|<div[^>]+class="result__snippet"[^>]*>(.*?)</div>`)
	tagPattern                  = regexp.MustCompile(`(?s)<[^>]+>`)
	scriptStylePattern          = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>|<style[^>]*>.*?</style>|<noscript[^>]*>.*?</noscript>|<svg[^>]*>.*?</svg>`)
	pricePattern                = regexp.MustCompile(`(?i)(\d{1,4}(?:[,.]\d{2})?)\s?(?:eur|euro|\x{20AC})`)
	lengthPattern               = regexp.MustCompile(`(?i)(?:l[äa]nge|laenge|length|ma[ßs]|mass|lüp|luep|luep\.)[^\d]{0,30}(\d{2,4}(?:[,.]\d+)?)\s?(?:mm)?`)
	weightPattern               = regexp.MustCompile(`(?i)(?:gewicht|weight)[^\d]{0,18}(\d{1,5}(?:[,.]\d+)?)\s?g`)
	tractionTirePattern         = regexp.MustCompile(`(?i)(?:haftreifen|traction\s*tire)[^\d]{0,18}(\d{1,2})`)
	eanPattern                  = regexp.MustCompile(`\b(\d{12,14})\b`)
	epochPattern                = regexp.MustCompile(`(?i)(?:epoche|epoch|ep\.)\s*(I{1,3}|IV|V|VI)\b`)
	railwayPattern              = regexp.MustCompile(`\b(DB AG|DB|DRG|DR|SBB|OeBB|BLS|SNCF|NS|FS)\b`)
	adapterPattern              = regexp.MustCompile(`(?i)\b(NEM\s?651|NEM\s?652|NEM\s?658|PluX\s?16|PluX\s?22|MTC\s?21|Next\s?18|8-?polig|21-?polig|DSS\s?8pol)\b`)
	powerPattern                = regexp.MustCompile(`(?i)\b(DC|AC|2-?Leiter|3-?Leiter|Gleichstrom|Wechselstrom)\b`)
	digitalPositivePattern      = regexp.MustCompile(`(?i)(?:\bdigital\s*[:=]\s*(?:ja|yes|true)\b|\bdigitaldecoder\b|\bsounddecoder\b|\bmit\s+(?:dcc\s+)?decoder\b)`)
	headlightDescriptionPattern = regexp.MustCompile(`(?i)(?:lichtwechsel|fahrlicht|spitzenlicht|schlusslicht)[^\n:;]{0,35}[:]\s*([^.;\n]{3,180})`)
	lightingDescriptionPattern  = regexp.MustCompile(`(?i)(?:innenbeleuchtung|fuehrerstandsbeleuchtung|fuehrerstand|kabinenbeleuchtung|beleuchtung)[^\n:;]{0,35}[:]\s*([^.;\n]{3,180})`)
	soundDescriptionPattern     = regexp.MustCompile(`(?i)(?:soundgenerator|sounddecoder|\bsound\b|sound\s+laut\s+artikeldaten|geräuschmodul|geraeuschmodul|ger..uschmodul)[^\n:;]{0,35}[:]\s*([^.;\n]{3,180})`)
	imageMetaPattern            = regexp.MustCompile(`(?is)<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image|thumbnail)["'][^>]+content=["']([^"']+)["']`)
	imageMetaAltPattern         = regexp.MustCompile(`(?is)<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image|thumbnail)["']`)
	imageTagPattern             = regexp.MustCompile(`(?is)<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["'][^>]*>`)
	metaDescriptionRegex        = regexp.MustCompile(`(?is)<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']`)
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

var dealerArticleDomains = []string{
	"elriwa.de",
	"modellbahnshop-lippe.com",
	"dm-toys.de",
	"haertle.de",
}

func parseDuckDuckGoResults(body string, input ArticleSearchInput, source string) []ArticleSearchResult {
	blocks := resultBlockPattern.FindAllString(body, 12)
	results := []ArticleSearchResult{}
	for rank, block := range blocks {
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
		score := scoreArticleResult(input, title, resultURL, snippet, fields)
		score += duckDuckGoRankBonus(rank)
		results = append(results, ArticleSearchResult{
			Source:  source,
			Title:   title,
			URL:     resultURL,
			Snippet: snippet,
			Score:   score,
			Fields:  fields,
		})
	}
	return results
}

func duckDuckGoRankBonus(rank int) int {
	bonus := 48 - rank*6
	if bonus < 0 {
		return 0
	}
	return bonus
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
	combined := repairMojibake(title + " " + snippet + " " + resultURL)
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
	if value := extractLengthMM(combined); value != "" {
		fields["lengthMm"] = ArticleSearchField{Label: "Länge (mm)", Value: value, Confidence: 62}
	}
	if value := firstRegexValue(weightPattern, combined); value != "" {
		fields["weightG"] = ArticleSearchField{Label: "Gewicht (g)", Value: strings.ReplaceAll(value, ",", "."), Confidence: 55}
	}
	if value := firstRegexValue(tractionTirePattern, combined); value != "" {
		fields["tractionTireCount"] = ArticleSearchField{Label: "Anzahl Haftreifen", Value: value, Confidence: 58}
	}
	if value := extractAdapterInfo(combined); value != "" {
		fields["adapter"] = ArticleSearchField{Label: "Schnittstelle / Adapter", Value: normalizeWhitespace(value), Confidence: 60}
	}
	if value := firstRegexValue(powerPattern, combined); value != "" {
		fields["powerPickup"] = ArticleSearchField{Label: "Stromsystem", Value: normalizeWhitespace(value), Confidence: 50}
	}
	if digitalPositivePattern.MatchString(combined) {
		fields["digital"] = ArticleSearchField{Label: "Digital", Value: "Ja", Confidence: 48}
	}
	if soundDescription := extractSoundDescription(combined); soundDescription != "" {
		fields["soundGeneratorEnabled"] = ArticleSearchField{Label: "Soundgenerator", Value: "Ja", Confidence: 48}
		fields["soundGeneratorDescription"] = ArticleSearchField{Label: "Soundgenerator Beschreibung", Value: normalizeWhitespace(soundDescription), Confidence: 55}
	} else if hasExplicitSoundGenerator(combinedLower) {
		fields["soundGeneratorEnabled"] = ArticleSearchField{Label: "Soundgenerator", Value: "Ja", Confidence: 38}
	}
	if lightDescription := extractHeadlightDescription(combined); lightDescription != "" {
		fields["headlightsEnabled"] = ArticleSearchField{Label: "Fahrlicht", Value: "Ja", Confidence: 42}
		fields["headlightsDescription"] = ArticleSearchField{Label: "Fahrlicht Beschreibung", Value: normalizeWhitespace(lightDescription), Confidence: 55}
	} else if hasExplicitHeadlight(combinedLower) {
		fields["headlightsEnabled"] = ArticleSearchField{Label: "Fahrlicht", Value: "Ja", Confidence: 36}
	}
	if lightingDescription := extractLightingDescription(combined); lightingDescription != "" {
		fields["lightingEnabled"] = ArticleSearchField{Label: "Beleuchtung", Value: "Ja", Confidence: 36}
		fields["lightingDescription"] = ArticleSearchField{Label: "Beleuchtung Beschreibung", Value: normalizeWhitespace(lightingDescription), Confidence: 52}
	} else if hasExplicitInteriorLighting(combinedLower) {
		fields["lightingEnabled"] = ArticleSearchField{Label: "Beleuchtung", Value: "Ja", Confidence: 34}
	}
	return fields
}

func scoreArticleResult(input ArticleSearchInput, title, resultURL, snippet string, fields map[string]ArticleSearchField) int {
	haystack := strings.ToLower(title + " " + resultURL + " " + snippet)
	score := len(fields) * 10
	manufacturer := strings.ToLower(strings.TrimSpace(input.Manufacturer))
	articleNumber := strings.ToLower(strings.TrimSpace(input.ArticleNumber))
	gauge := strings.ToLower(strings.TrimSpace(input.Gauge))
	name := strings.ToLower(strings.TrimSpace(input.Name))

	if manufacturer != "" && strings.Contains(haystack, manufacturer) {
		score += 35
	}
	if articleNumber != "" && strings.Contains(haystack, articleNumber) {
		score += 95
	} else if articleNumber != "" {
		score -= 70
	}
	if gauge != "" && containsGaugeToken(haystack, gauge) {
		score += 35
	}
	if name != "" && strings.Contains(haystack, name) {
		score += 30
	}
	score += articleNameTokenScore(name, haystack)

	if isManufacturerPreferredURL(input.Manufacturer, resultURL) {
		score += 100
	} else if strings.Contains(haystack, manufacturerDomainToken(input.Manufacturer)) {
		score += 20
	}
	if isMarketplaceURL(resultURL) {
		score -= 12
	}
	ean := strings.ToLower(strings.TrimSpace(input.Fields["ean"]))
	if ean != "" && strings.Contains(haystack, ean) {
		score += 160
		if field, ok := fields["ean"]; ok && strings.EqualFold(strings.TrimSpace(field.Value), ean) {
			score += 120
		}
	}
	for _, value := range input.Fields {
		value = strings.ToLower(strings.TrimSpace(value))
		if value != "" && strings.Contains(haystack, value) {
			score += 8
		}
	}
	return score
}

func articleNameTokenScore(name, haystack string) int {
	if name == "" {
		return 0
	}
	score := 0
	for _, token := range uniqueSearchTokens(name) {
		if strings.Contains(haystack, token) {
			score += 10
		}
	}
	if score > 40 {
		return 40
	}
	return score
}

func uniqueSearchTokens(value string) []string {
	tokens := []string{}
	for _, token := range strings.FieldsFunc(strings.ToLower(value), func(r rune) bool {
		return !(r >= 'a' && r <= 'z') && !(r >= '0' && r <= '9') && r != 'ä' && r != 'ö' && r != 'ü' && r != 'ß'
	}) {
		if len(token) >= 3 {
			tokens = append(tokens, token)
		}
	}
	return uniqueNonEmpty(tokens)
}

func containsGaugeToken(haystack, gauge string) bool {
	if gauge == "" {
		return false
	}
	return regexp.MustCompile(`(?i)(^|[^a-z0-9])` + regexp.QuoteMeta(gauge) + `([^a-z0-9]|$)`).MatchString(haystack)
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
		results[index].Score = scoreArticleResult(input, results[index].Title, results[index].URL, results[index].Snippet+" "+pageText, results[index].Fields) + duckDuckGoRankBonus(index)
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
	badTokens := []string{
		"blank", "dummy", "icon", "lazy", "loading", "logo", "no-image", "noimage",
		"placeholder", "pixel", "spacer", "sprite", "tracking", "transparent",
	}
	for _, token := range badTokens {
		if strings.Contains(lower, token) {
			return false
		}
	}
	if strings.Contains(lower, "1x1") || strings.Contains(lower, "clear.gif") {
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
	for _, domain := range preferredManufacturerDomains(manufacturer) {
		if strings.Contains(resultURL, domain) {
			return true
		}
	}
	return false
}

func isMarketplaceURL(resultURL string) bool {
	parsed, err := url.Parse(resultURL)
	if err != nil {
		return false
	}
	host := strings.TrimPrefix(strings.ToLower(parsed.Host), "www.")
	marketplaces := []string{"amazon.", "ebay.", "idealo.", "kaufland.", "kleinanzeigen."}
	for _, marketplace := range marketplaces {
		if strings.Contains(host, marketplace) {
			return true
		}
	}
	return false
}

func preferredManufacturerDomains(manufacturer string) []string {
	manufacturer = strings.ToLower(strings.TrimSpace(manufacturer))
	for key, domains := range manufacturerDomains {
		if manufacturer == "" || !strings.Contains(manufacturer, key) {
			continue
		}
		return domains
	}
	return nil
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

func extractLengthMM(value string) string {
	for _, match := range lengthPattern.FindAllStringSubmatch(value, -1) {
		if len(match) < 2 {
			continue
		}
		candidate := strings.ReplaceAll(strings.TrimSpace(match[1]), ",", ".")
		whole := strings.TrimSpace(match[0])
		if !looksLikeModelLength(candidate, whole) {
			continue
		}
		return candidate
	}
	return ""
}

func looksLikeModelLength(candidate, context string) bool {
	normalized := strings.ReplaceAll(candidate, ",", ".")
	parts := strings.Split(normalized, ".")
	number := parts[0]
	if len(number) == 4 && strings.HasPrefix(number, "20") {
		return false
	}
	var integer int
	for _, char := range number {
		if char < '0' || char > '9' {
			return false
		}
		integer = integer*10 + int(char-'0')
	}
	if integer < 20 || integer > 600 {
		return false
	}
	lower := strings.ToLower(context)
	return strings.Contains(lower, "mm") ||
		strings.Contains(lower, "laenge") ||
		strings.Contains(lower, "länge") ||
		strings.Contains(lower, "laenge") ||
		strings.Contains(lower, "length") ||
		strings.Contains(lower, "mass") ||
		strings.Contains(lower, "maß") ||
		strings.Contains(lower, "luep")
}

func extractHeadlightDescription(value string) string {
	description := firstRegexValue(headlightDescriptionPattern, value)
	if description == "" {
		description = sentenceForKeywords(value, []string{"lichtwechsel", "fahrlicht", "spitzenlicht", "schlusslicht"})
	}
	if description == "" {
		return ""
	}
	return cleanTechnicalDescription(description)
}

func extractLightingDescription(value string) string {
	description := firstRegexValue(lightingDescriptionPattern, value)
	if description == "" {
		return ""
	}
	lower := strings.ToLower(description)
	if strings.Contains(lower, "fahrtrichtung") || strings.Contains(lower, "lichtwechsel") {
		return ""
	}
	return cleanTechnicalDescription(description)
}

func extractSoundDescription(value string) string {
	lower := strings.ToLower(value)
	if strings.Contains(lower, "ohne sound") || strings.Contains(lower, "kein sound") {
		return ""
	}
	description := firstRegexValue(soundDescriptionPattern, value)
	if cleaned := cleanTechnicalDescription(description); cleaned != "" {
		return cleaned
	}
	if description == "" || cleanTechnicalDescription(description) == "" {
		description = sentenceForKeywords(value, []string{"sound-modul", "soundmodul", "sounddecoder", "soundgenerator", "geräuschmodul", "geraeuschmodul"})
	}
	if description == "" {
		return ""
	}
	return cleanTechnicalDescription(description)
}

func extractAdapterInfo(value string) string {
	matches := adapterPattern.FindAllString(value, -1)
	if len(matches) == 0 {
		return ""
	}
	parts := []string{}
	for _, match := range matches {
		part := normalizeWhitespace(match)
		if part != "" {
			parts = append(parts, part)
		}
	}
	return strings.Join(uniqueNonEmpty(parts), " ")
}

func sentenceForKeywords(value string, keywords []string) string {
	for _, candidate := range regexp.MustCompile(`[.;\n\r]+`).Split(value, -1) {
		candidate = normalizeWhitespace(candidate)
		if candidate == "" {
			continue
		}
		lower := strings.ToLower(candidate)
		for _, keyword := range keywords {
			if strings.Contains(lower, keyword) {
				return candidate
			}
		}
	}
	return ""
}

func cleanTechnicalDescription(value string) string {
	value = normalizeWhitespace(repairMojibake(value))
	value = trimTechnicalNoise(value)
	value = strings.Trim(value, " -:;,.")
	if !looksLikeTechnicalDescription(value) {
		return ""
	}
	return value
}

func trimTechnicalNoise(value string) string {
	lower := strings.ToLower(value)
	end := len(value)
	for _, marker := range []string{
		" downloads", " bedienungsanleitung", " altersempfehlung", " de | en",
		" menü", " menue", " menu", " sprunggröße", " sprunggroesse",
		" wählen sie", " waehlen sie",
	} {
		if index := strings.Index(lower, marker); index > 0 && index < end {
			end = index
		}
	}
	return strings.TrimSpace(value[:end])
}

func looksLikeTechnicalDescription(value string) bool {
	value = strings.TrimSpace(value)
	if len(value) < 3 || len(value) > 220 {
		return false
	}
	lower := strings.ToLower(value)
	badTokens := []string{"google_analytics", "cookie", "mandatory", "preferences", "statistics", "marketing", "function", "const ", "new map", "document.", "window.", "{", "};", "class ", "anzeigen zu zeigen", "personalisierte anzeigen", "absicht ist", "menü", "menue", "menu", "sprunggröße", "sprunggroesse", "wählen sie", "waehlen sie", "downloads", "bedienungsanleitung", "altersempfehlung"}
	if strings.HasPrefix(lower, "//") || strings.Contains(lower, "://") {
		return false
	}
	for _, token := range badTokens {
		if strings.Contains(lower, token) {
			return false
		}
	}
	return true
}

func hasExplicitHeadlight(value string) bool {
	return strings.Contains(value, "lichtwechsel") ||
		strings.Contains(value, "spitzenlicht") ||
		strings.Contains(value, "schlusslicht") ||
		strings.Contains(value, "fahrlicht")
}

func hasExplicitInteriorLighting(value string) bool {
	return strings.Contains(value, "innenbeleuchtung") ||
		strings.Contains(value, "fuehrerstandsbeleuchtung") ||
		strings.Contains(value, "führerstandsbeleuchtung") ||
		strings.Contains(value, "kabinenbeleuchtung")
}

func hasExplicitSoundGenerator(value string) bool {
	if strings.Contains(value, "ohne sound") || strings.Contains(value, "kein sound") {
		return false
	}
	return strings.Contains(value, "soundgenerator") ||
		strings.Contains(value, "sounddecoder") ||
		strings.Contains(value, "sound-modul") ||
		strings.Contains(value, "soundmodul") ||
		strings.Contains(value, "sound laut artikeldaten") ||
		strings.Contains(value, "geraeuschmodul") ||
		strings.Contains(value, "geräuschmodul")
}

func visibleArticleText(value string) string {
	value = regexp.MustCompile(`(?is)</(?:tr|li|p|div|h[1-6]|dd|dt)>`).ReplaceAllString(value, ". ")
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
	if preferred := preferredArticleDescription(text); preferred != "" {
		return preferred
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

func preferredArticleDescription(text string) string {
	text = normalizeWhitespace(repairMojibake(text))
	lower := strings.ToLower(text)
	start := -1
	for _, marker := range []string{"neuheit ", "druckvariante "} {
		if index := strings.Index(lower, marker); index >= 0 && (start < 0 || index < start) {
			start = index
		}
	}
	if start < 0 {
		return ""
	}
	candidate := text[start:]
	candidateLower := strings.ToLower(candidate)
	end := len(candidate)
	for _, marker := range []string{
		" maß ", " mass ", " länge ", " laenge ", " digitale schnittstelle",
		" lichtwechsel", " fahrlicht", " soundgenerator", " sounddecoder",
		" downloads", " bedienungsanleitung", " altersempfehlung", " ean ",
	} {
		if index := strings.Index(candidateLower, marker); index > 30 && index < end {
			end = index
		}
	}
	if period := strings.Index(candidate, "."); period > 40 && period+1 < end {
		end = period + 1
	}
	candidate = strings.TrimSpace(candidate[:end])
	candidate = strings.Trim(candidate, " -:;,.")
	if !looksLikeHumanDescription(candidate) {
		return ""
	}
	return candidate
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
	badTokens := []string{"google_analytics", "cookie", "mandatory", "preferences", "statistics", "marketing", "function", "const ", "new map", "document.", "window.", "{", "};", "class ", "anzeigen zu zeigen", "personalisierte anzeigen", "absicht ist", "menü", "menue", "menu", "sprunggröße", "sprunggroesse", "wählen sie", "waehlen sie", "downloads", "bedienungsanleitung", "altersempfehlung"}
	for _, token := range badTokens {
		if strings.Contains(lower, token) {
			return false
		}
	}
	technicalStarts := []string{"digitale schnittstelle", "schnittstelle", "laenge", "mass", "gewicht", "haftreifen", "ean", "artikelnummer", "artikel-nr", "beleuchtung", "fahrlicht", "lichtwechsel", "soundgenerator", "sound", "altersempfehlung", "downloads", "bedienungsanleitung"}
	for _, token := range technicalStarts {
		if strings.HasPrefix(lower, token) {
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
	value = repairMojibake(value)
	value = strings.Join(strings.Fields(value), " ")
	return strings.TrimSpace(value)
}

func repairMojibake(value string) string {
	if !strings.ContainsAny(value, "ÃÂâ") {
		return value
	}
	bytes := make([]byte, 0, len(value))
	for _, char := range value {
		if char > 255 {
			return value
		}
		bytes = append(bytes, byte(char))
	}
	if !utf8.Valid(bytes) {
		return value
	}
	return string(bytes)
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
