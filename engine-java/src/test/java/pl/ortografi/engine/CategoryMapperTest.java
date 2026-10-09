package pl.ortografi.engine;

import static org.junit.jupiter.api.Assertions.*;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
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

  // ---- Per-rule overrides (requested by corpus owner, phase 0) ----

  @Test
  void abbreviationDotRuleIsPunctuationNotSpelling() {
    assertEquals("punctuation", CategoryMapper.map("SKROTY_Z_KROPKA", "SPELLING", "misspelling", "np"));
  }

  @Test
  void numberUnitSpacingRuleIsPunctuationNotOther() {
    assertEquals("punctuation", CategoryMapper.map("JEDNOSTKA_LICZBA", "NUMBERS", "numbers", "2025r."));
    // Other NUMBERS rules are untouched.
    assertEquals("other", CategoryMapper.map("SOME_NUMBER_RULE", "NUMBERS", "numbers", "1,5"));
  }

  @Test
  void simpleReplaceInflectionEntriesAreGrammarCaseInsensitively() {
    for (String w : new String[] {"Poszłem", "poszłem", "szłem", "bratowi", "Synie", "chłopcowi", "domie"}) {
      assertEquals("grammar", CategoryMapper.map("PL_SIMPLE_REPLACE", "PRAWDOPODOBNE_LITEROWKI", "misspelling", w), w);
    }
  }

  @Test
  void simpleReplaceTyposStaySpelling() {
    // The rule is a context-free typo list; most entries are plain misspellings.
    for (String w : new String[] {"Wogle", "piatek", "Stevowi", "aleji", "sie", "lekażów", "dame"}) {
      assertEquals("spelling", CategoryMapper.map("PL_SIMPLE_REPLACE", "PRAWDOPODOBNE_LITEROWKI", "misspelling", w), w);
    }
  }

  @Test
  void ruleAwareMappingFallsBackToCategoryMapping() {
    assertEquals("style", CategoryMapper.map("COFAC_SIE_DO_TYLU", "REDUNDANCY", "style", "cofnąć się do tyłu"));
    assertEquals("other", CategoryMapper.map("X", "MISC", "uncategorized", "x"));
    assertEquals("spelling", CategoryMapper.map("MORFOLOGIK_RULE_PL_PL", "TYPOS", "misspelling", "kotaa"));
  }

  @Test
  void everyInflectionOverrideStillExistsInTheEngineReplaceList() throws Exception {
    // Drift guard: an engine upgrade that drops or renames an entry must fail here.
    var res = org.languagetool.JLanguageTool.class.getResourceAsStream("/org/languagetool/rules/pl/replace.txt");
    assertNotNull(res, "language-pl replace.txt not on classpath");
    Set<String> wrong;
    try (var r = new BufferedReader(new InputStreamReader(res, StandardCharsets.UTF_8))) {
      wrong = r.lines().filter(l -> !l.startsWith("#") && l.contains("="))
          .map(l -> l.substring(0, l.indexOf('=')).toLowerCase(Locale.ROOT)).collect(Collectors.toSet());
    }
    assertFalse(CategoryMapper.SIMPLE_REPLACE_INFLECTION.isEmpty());
    for (String w : CategoryMapper.SIMPLE_REPLACE_INFLECTION) {
      assertTrue(wrong.contains(w), () -> w + " is no longer in PL_SIMPLE_REPLACE's list");
    }
  }
}
