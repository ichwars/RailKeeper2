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

type ArticleSearchResult struct {
	Source    string                        `json:"source"`
	Title     string                        `json:"title"`
	URL       string                        `json:"url"`
	Snippet   string                        `json:"snippet"`
	Score     int                           `json:"score"`
	Fields    map[string]ArticleSearchField `json:"fields"`
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
	if len(results) > 8 {
		results = results[:8]
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
	for _, value := range []string{input.Manufacturer, input.ArticleNumber, input.Name, input.Gauge} {
		if value != "" {
			parts = append(parts, value)
		}
	}

	preferred := []string{"series", "vehicleNumber", "lengthMm", "color", "railwayCompany", "epoch", "category", "gattung"}
	for _, key := range preferred {
		if value := input.Fields[key]; value != "" {
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
	return parseDuckDuckGoResults(string(body), input), nil
}

var (
	resultBlockPattern = regexp.MustCompile(`(?s)<div class="result results_links.*?</div>\s*</div>`)
	resultLinkPattern  = regexp.MustCompile(`(?s)<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>`)
	snippetPattern     = regexp.MustCompile(`(?s)<a[^>]+class="result__snippet"[^>]*>(.*?)</a>|<div[^>]+class="result__snippet"[^>]*>(.*?)</div>`)
	tagPattern         = regexp.MustCompile(`(?s)<[^>]+>`)
	pricePattern       = regexp.MustCompile(`(?i)(\d{1,4}(?:[,.]\d{2})?)\s?(?:eur|euro)`)
	lengthPattern      = regexp.MustCompile(`(?i)(?:laenge|lange|length)[^\d]{0,12}(\d{2,4}(?:[,.]\d+)?)\s?mm`)
	weightPattern      = regexp.MustCompile(`(?i)(?:gewicht|weight)[^\d]{0,12}(\d{1,5}(?:[,.]\d+)?)\s?g`)
)

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
	fields := map[string]ArticleSearchField{
		"name": {
			Label:      "Bezeichnung",
			Value:      title,
			Confidence: 60,
		},
		"articleSourceUrl": {
			Label:      "Quelle",
			Value:      resultURL,
			Confidence: 100,
		},
	}
	combined := title + " " + snippet + " " + resultURL
	if input.Manufacturer != "" && strings.Contains(strings.ToLower(combined), strings.ToLower(input.Manufacturer)) {
		fields["manufacturer"] = ArticleSearchField{Label: "Hersteller", Value: input.Manufacturer, Confidence: 80}
	}
	if input.ArticleNumber != "" && strings.Contains(strings.ToLower(combined), strings.ToLower(input.ArticleNumber)) {
		fields["articleNumber"] = ArticleSearchField{Label: "Artikel-Nr.", Value: input.ArticleNumber, Confidence: 90}
	}
	if input.Gauge != "" && strings.Contains(strings.ToLower(combined), strings.ToLower(input.Gauge)) {
		fields["gauge"] = ArticleSearchField{Label: "Spurweite", Value: input.Gauge, Confidence: 80}
	}
	if snippet != "" {
		fields["description"] = ArticleSearchField{Label: "Beschreibung", Value: snippet, Confidence: 45}
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
	for _, value := range input.Fields {
		value = strings.ToLower(strings.TrimSpace(value))
		if value != "" && strings.Contains(haystack, value) {
			score += 8
		}
	}
	return score
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
