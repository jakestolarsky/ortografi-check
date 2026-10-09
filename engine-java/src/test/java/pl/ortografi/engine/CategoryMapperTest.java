package pl.ortografi.engine;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

/** One mapping from LanguageTool category IDs to product categories (PLAN.md sections 6, 9). */
class CategoryMapperTest {

  @Test
  void spellingFamilies() {
    for (String id : new String[] {"TYPOS", "SPELLING", "CASING", "PHONETICS", "PRAWDOPODOBNE_LITEROWKI"}) {
      assertEquals("spelling", CategoryMapper.map(id, "misspelling"), id);
    }
  }

  @Test
  void punctuationAndTypography() {
    assertEquals("punctuation", CategoryMapper.map("PUNCTUATION", "typographical"));
    assertEquals("punctuation", CategoryMapper.map("PUNCTUATION", "grammar"));
    assertEquals("punctuation", CategoryMapper.map("TYPOGRAPHY", "whitespace"));
  }

  @Test
  void grammarFamilies() {
    for (String id : new String[] {"GRAMMAR", "GENDER", "SYNTAX", "WORD_ORDER"}) {
      assertEquals("grammar", CategoryMapper.map(id, "grammar"), id);
    }
  }

  @Test
  void styleIsSeparateFromErrors() {
    for (String id : new String[] {"STYLE", "REDUNDANCY", "SEMANTICS", "CONFUSED_WORDS"}) {
      assertEquals("style", CategoryMapper.map(id, "style"), id);
    }
  }

  @Test
  void unknownCategoryFallsBackToIssueTypeThenOther() {
    assertEquals("spelling", CategoryMapper.map("NEW_CAT", "misspelling"));
    assertEquals("grammar", CategoryMapper.map("NEW_CAT", "grammar"));
    assertEquals("punctuation", CategoryMapper.map("NEW_CAT", "whitespace"));
    assertEquals("other", CategoryMapper.map("MISC", "uncategorized"));
    assertEquals("other", CategoryMapper.map("NUMBERS", "numbers"));
    assertEquals("other", CategoryMapper.map("NEW_CAT", "uncategorized"));
  }
}
