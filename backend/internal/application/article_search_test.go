package application

import (
	"context"
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
