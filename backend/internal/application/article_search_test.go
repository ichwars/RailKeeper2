package application

import (
	"context"
	"strings"
	"testing"
)

type fakeArticleAdapter struct {
	results []ArticleSearchResult
}

func (f fakeArticleAdapter) Search(context.Context, ArticleSearchInput, string) ([]ArticleSearchResult, error) {
	return f.results, nil
}

func TestArticleSearchSortsAndMarksConflicts(t *testing.T) {
	service := &ArticleSearchService{
		adapters: []ArticleSearchAdapter{
			fakeArticleAdapter{results: []ArticleSearchResult{
				{
					Source: "fake",
					Title:  "Weak",
					URL:    "https://example.test/weak",
					Score:  10,
					Fields: map[string]ArticleSearchField{"name": {Label: "Bezeichnung", Value: "Andere Lok"}},
				},
				{
					Source: "fake",
					Title:  "Strong",
					URL:    "https://example.test/strong",
					Score:  30,
					Fields: map[string]ArticleSearchField{"articleNumber": {Label: "Artikel-Nr.", Value: "47284"}},
				},
			}},
		},
		timeout: 0,
	}

	result, err := service.Search(context.Background(), ArticleSearchInput{
		Manufacturer:  "Piko",
		ArticleNumber: "11111",
		Name:          "V180",
		Gauge:         "TT",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Results) != 2 || result.Results[0].Title != "Strong" {
		t.Fatalf("unexpected result order: %#v", result.Results)
	}
	if len(result.Results[0].Conflicts) != 1 || result.Results[0].Conflicts[0] != "articleNumber" {
		t.Fatalf("expected article number conflict, got %#v", result.Results[0].Conflicts)
	}
}

func TestArticleSearchQueryUsesFocusedModelPattern(t *testing.T) {
	query := articleSearchQuery(ArticleSearchInput{
		Manufacturer:  "Piko Spielwaren",
		ArticleNumber: "47284",
		Name:          "V180 4-achsig",
		Gauge:         "TT",
		Fields: map[string]string{
			"ean":         "4015615472841",
			"epoch":       "IV",
			"description": "soll nicht in die Suchanfrage",
		},
	})

	expected := "V180 4-achsig 47284 4015615472841 Piko Spielwaren TT"
	if query != expected {
		t.Fatalf("expected %q, got %q", expected, query)
	}
}

func TestArticleSearchQueryAllowsEANOnlyPattern(t *testing.T) {
	input := ArticleSearchInput{
		Fields: map[string]string{
			"ean": "4012501136399",
		},
	}
	query := articleSearchQuery(input)

	if query != "4012501136399" {
		t.Fatalf("expected EAN-only query, got %q", query)
	}
	if !isEANOnlyArticleSearch(input, query) {
		t.Fatal("expected EAN-only search to be detected")
	}
}

func TestArticleSearchQueriesPreferFocusedManufacturerAndRawSearch(t *testing.T) {
	input := ArticleSearchInput{
		Manufacturer:  "Tillig",
		ArticleNumber: "13639",
		Name:          "Y-Wagen Nirosta",
		Gauge:         "TT",
	}
	queries := articleSearchQueries(input, articleSearchQuery(input))

	expectedStart := []articleSearchQuerySpec{
		{Query: "13639 Tillig TT site:tillig.com", Source: "Herstellerseiten"},
		{Query: "Y-Wagen Nirosta 13639 Tillig TT site:tillig.com", Source: "Herstellerseiten"},
	}
	for index, expected := range expectedStart {
		if len(queries) <= index || queries[index] != expected {
			t.Fatalf("expected query %d to be %#v, got %#v", index, expected, queries)
		}
	}
	if !containsArticleSearchQuery(queries, articleSearchQuerySpec{Query: "13639 Tillig TT", Source: "DuckDuckGo"}) {
		t.Fatalf("expected focused web query, got %#v", queries)
	}
	if !containsArticleSearchQuery(queries, articleSearchQuerySpec{Query: "Y-Wagen Nirosta 13639 Tillig TT site:modellbau-wiki.de", Source: "Modellbau-Wiki"}) {
		t.Fatalf("expected wiki query, got %#v", queries)
	}
}

func containsArticleSearchQuery(queries []articleSearchQuerySpec, expected articleSearchQuerySpec) bool {
	for _, query := range queries {
		if query == expected {
			return true
		}
	}
	return false
}

func TestArticleSearchBoostsManufacturerDomains(t *testing.T) {
	input := ArticleSearchInput{Manufacturer: "Piko", ArticleNumber: "47284", Name: "V180", Gauge: "TT"}
	fields := map[string]ArticleSearchField{"articleNumber": {Label: "Artikel-Nr.", Value: "47284", Confidence: 90}}

	manufacturerScore := scoreArticleResult(input, "Piko V180", "https://www.piko.de/DE/index.php/de/piko-shop.html", "47284 TT", fields)
	marketplaceScore := scoreArticleResult(input, "Piko V180", "https://www.idealo.de/preisvergleich/piko-v180.html", "47284 TT", fields)

	if manufacturerScore <= marketplaceScore {
		t.Fatalf("manufacturer domain should rank higher, got manufacturer=%d marketplace=%d", manufacturerScore, marketplaceScore)
	}
}

func TestArticleSearchPenalizesMissingArticleNumber(t *testing.T) {
	input := ArticleSearchInput{Manufacturer: "Tillig", ArticleNumber: "13639", Name: "Y-Wagen Nirosta", Gauge: "TT"}

	exactScore := scoreArticleResult(input, "Tillig 13639 Y-Wagen Nirosta TT", "https://shop.example.test/tillig-13639.html", "TT Modellwagen", map[string]ArticleSearchField{})
	weakScore := scoreArticleResult(input, "Tillig Y-Wagen Nirosta TT", "https://shop.example.test/tillig-y-wagen.html", "TT Modellwagen", map[string]ArticleSearchField{})

	if exactScore <= weakScore {
		t.Fatalf("article-number match should rank higher, got exact=%d weak=%d", exactScore, weakScore)
	}
}

func TestArticleSearchBoostsExactEANMatches(t *testing.T) {
	input := ArticleSearchInput{Fields: map[string]string{"ean": "4012501136399"}}
	fields := map[string]ArticleSearchField{"ean": {Label: "EAN-Nr.", Value: "4012501136399", Confidence: 60}}

	exactScore := scoreArticleResult(input, "Tillig Y Wagen Nirosta", "https://example.test/13639", "EAN 4012501136399", fields)
	weakScore := scoreArticleResult(input, "Tillig Y Wagen Nirosta", "https://example.test/13639", "passender Modellbahnwagen", map[string]ArticleSearchField{})

	if exactScore <= weakScore {
		t.Fatalf("exact EAN match should rank higher, got exact=%d weak=%d", exactScore, weakScore)
	}
}

func TestBuildArticleFieldsKeepsProductDataClean(t *testing.T) {
	input := ArticleSearchInput{Manufacturer: "Piko", ArticleNumber: "47284", Name: "V 180", Gauge: "TT"}
	fields := buildArticleFields(input,
		"TT Diesellok V 180 DR III, 4-achsig - PIKO Spielwaren GmbH Webshop",
		"https://www.piko-shop.de/de/artikel/tt-diesellok-v180-47284.html",
		`TT Diesellok V 180 kaufen {"mandatory":true,"google_analytics":true}
		 Neuheit 2021: Druckvariante der B 118 als V180 der DR in Epoche III.
		 Mass [mm]: 162. Anzahl Haftreifen: 2. Digitale Schnittstelle: NEM 658 PluX16.
		 Lichtwechsel: Fahrtrichtungsabhaengiger Lichtwechsel weiss / rot.
		 Soundgenerator: Sound laut Artikeldaten.`,
	)

	if fields["name"].Value == "TT Diesellok V 180 DR III, 4-achsig - PIKO Spielwaren GmbH Webshop" {
		t.Fatal("source suffix should not be part of the model name")
	}
	if fields["description"].Value == "" || strings.Contains(fields["description"].Value, "google_analytics") {
		t.Fatalf("unexpected description %q", fields["description"].Value)
	}
	if !strings.HasPrefix(fields["description"].Value, "Neuheit 2021") {
		t.Fatalf("expected manufacturer novelty text, got %q", fields["description"].Value)
	}
	if fields["lengthMm"].Value != "162" {
		t.Fatalf("expected length 162, got %#v", fields["lengthMm"])
	}
	if fields["tractionTireCount"].Value != "2" {
		t.Fatalf("expected two traction tires, got %#v", fields["tractionTireCount"])
	}
	if _, ok := fields["digital"]; ok {
		t.Fatal("digital interface must not be interpreted as digital decoder")
	}
	if fields["adapter"].Value != "NEM 658 PluX16" {
		t.Fatalf("expected adapter information, got %#v", fields["adapter"])
	}
	if fields["headlightsDescription"].Value == "" {
		t.Fatal("expected light description")
	}
	if _, ok := fields["lightingDescription"]; ok {
		t.Fatal("directional headlight description must not be copied to general lighting")
	}
	if fields["soundGeneratorDescription"].Value == "" {
		t.Fatal("expected sound description")
	}
}

func TestBuildArticleFieldsKeepsTechnicalContextSeparate(t *testing.T) {
	input := ArticleSearchInput{Manufacturer: "Piko", ArticleNumber: "47284", Name: "V 180", Gauge: "TT"}
	fields := buildArticleFields(input,
		"TT Diesellok V 180 DR III - PIKO Webshop",
		"https://www.piko-shop.de/de/artikel/tt-diesellok-v180-47284.html",
		`Neuheit 2021: Druckvariante der B 118 als V180 der DR in Epoche III.
		 Maß [mm]: 162. Anzahl Haftreifen: 2.
		 Digitale Schnittstelle: NEM 658 PluX16.
		 Lichtwechsel: Fahrtrichtungsabhängiger Lichtwechsel weiß / rot.
		 Beleuchtung Beschreibung: Fahrtrichtungsabhängiger Lichtwechsel weiß / rot.
		 Sound: PIKO Sound-Modul nachrüstbar #46552 DE | EN Menü Sprunggröße wählen.`,
	)

	if fields["description"].Value != "Neuheit 2021: Druckvariante der B 118 als V180 der DR in Epoche III" {
		t.Fatalf("unexpected description %q", fields["description"].Value)
	}
	if fields["lengthMm"].Value != "162" {
		t.Fatalf("expected length 162, got %#v", fields["lengthMm"])
	}
	if fields["tractionTireCount"].Value != "2" {
		t.Fatalf("expected two traction tires, got %#v", fields["tractionTireCount"])
	}
	if _, ok := fields["digital"]; ok {
		t.Fatal("digital interface must not be interpreted as digital decoder")
	}
	if fields["headlightsDescription"].Value == "" {
		t.Fatal("expected directional headlight description")
	}
	if _, ok := fields["lightingDescription"]; ok {
		t.Fatal("directional headlight description must not be copied to general lighting")
	}
	if fields["soundGeneratorDescription"].Value != "PIKO Sound-Modul nachrüstbar #46552" {
		t.Fatalf("unexpected sound description %q", fields["soundGeneratorDescription"].Value)
	}
}

func TestBuildArticleFieldsRejectsImplausibleLength(t *testing.T) {
	input := ArticleSearchInput{Manufacturer: "Piko", ArticleNumber: "47284", Name: "V 180", Gauge: "TT"}
	fields := buildArticleFields(input,
		"TT Diesellok V 180 DR III",
		"https://shop.example.test/piko-47284.html",
		`Länge (mm): 2026. Maß [mm]: 162.`,
	)

	if fields["lengthMm"].Value != "162" {
		t.Fatalf("expected plausible model length 162, got %#v", fields["lengthMm"])
	}
}

func TestBuildArticleFieldsRejectsWrongContextValues(t *testing.T) {
	input := ArticleSearchInput{Manufacturer: "Piko", ArticleNumber: "47284", Name: "V 180", Gauge: "TT"}
	fields := buildArticleFields(input,
		"TT Diesellok V 180 DR III",
		"https://shop.example.test/piko-47284.html",
		`Länge (mm) 2026 Die Absicht ist, Anzeigen zu zeigen.
		 Beleuchtung Beschreibung: Fahrtrichtungsabhängiger Lichtwechsel weiß / rot.
		 Digitale Schnittstelle: NEM 658 PluX16. Ohne Sound.`,
	)

	if _, ok := fields["lengthMm"]; ok {
		t.Fatalf("year-like value must not be used as length: %#v", fields["lengthMm"])
	}
	if _, ok := fields["description"]; ok {
		t.Fatalf("advertising text must not be used as description: %#v", fields["description"])
	}
	if _, ok := fields["lightingDescription"]; ok {
		t.Fatalf("directional headlight text must not be used as general lighting: %#v", fields["lightingDescription"])
	}
	if _, ok := fields["soundGeneratorEnabled"]; ok {
		t.Fatal("without sound must not enable sound generator")
	}
}

func TestBuildArticleFieldsExtractsTechnicalSentencesWithoutColon(t *testing.T) {
	input := ArticleSearchInput{Manufacturer: "Piko", ArticleNumber: "47284", Name: "V 180", Gauge: "TT"}
	fields := buildArticleFields(input,
		"TT Diesellok V 180 DR III",
		"https://shop.example.test/piko-47284.html",
		`Digitale Schnittstelle NEM 658 PluX16.
		 Fahrtrichtungsabhängiger Lichtwechsel weiß / rot.
		 PIKO Sound-Modul nachrüstbar #46552.`,
	)

	if fields["adapter"].Value != "NEM 658 PluX16" {
		t.Fatalf("expected combined adapter, got %#v", fields["adapter"])
	}
	if fields["headlightsDescription"].Value != "Fahrtrichtungsabhängiger Lichtwechsel weiß / rot" {
		t.Fatalf("unexpected headlight description %q", fields["headlightsDescription"].Value)
	}
	if fields["soundGeneratorDescription"].Value != "PIKO Sound-Modul nachrüstbar #46552" {
		t.Fatalf("unexpected sound description %q", fields["soundGeneratorDescription"].Value)
	}
}

func TestArticleImagesIgnorePlaceholders(t *testing.T) {
	images := articleImagesFromHTML(`
		<img src="/assets/placeholder.png">
		<img src="/assets/no-image.webp">
		<img src="/media/47284-v180-product.jpg">
	`, "https://shop.example.test/product/47284", "Piko V180")

	if len(images) != 1 {
		t.Fatalf("expected one product image, got %#v", images)
	}
	if !strings.Contains(images[0].URL, "47284-v180-product.jpg") {
		t.Fatalf("unexpected image selected: %#v", images)
	}
}
