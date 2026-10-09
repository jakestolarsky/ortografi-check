"""Builds pl-10k.txt (~10,000 UTF-16 code units) from varied TEMPORARY paragraphs."""
import pathlib

here = pathlib.Path(__file__).parent
base = (here / "pl-1k.txt").read_text(encoding="utf-8").strip()
extra = [
    "Rano poszedłem do urzędu, żeby załatwić sprawę meldunku. Urzędniczka była miła, ale kolejka ciągnęła się w nieskończoność. Wiem że nie ja jeden czekałem tam ponad godzinę.",
    "W pracy omawialiśmy nowy projekt aplikacji do sprawdzania pisowni. Kierownik zapytał, czy zdążymy przed końcem kwartału, i nikt nie chciał odpowiedzieć pierwszy.",
    "Po południu ugotowałem zupę pomidorową według przepisu babci. Zabrakło mi tylko świeżej bazylii, więc użyłem suszonej, co okazało się całkiem dobrym pomysłem.",
    "Wieczorem czytałem książkę o historii Krakowa. Autor pisze ciekawie, chociaż czasem przesadza z ilością dat i nazwisk, które trudno zapamiętać 📚.",
    "Mój kot znowu zrzucił kubek z biurka. Nie wiem dlaczego on to robi, ale chyba sprawia mu to ogromną przyjemność. Na szczęście kubek był pusty.",
    "W weekend planujemy wycieczkę rowerową wzdłuż Wisły. Prognoza pogody jest dobra, ale wiatr może być silny, więc trzeba się przygotować na wysiłek.",
    "Sąsiad zapytał mnie wczoraj, czy mógłbym mu pomóc przy przeprowadzce. Zgodziłem się, chociaż wiedziałem że to zajmie cały dzień, i będę bardzo zmęczony.",
]
parts = []
i = 0
while sum(len(p.encode("utf-16-le")) // 2 for p in parts) < 9_600:
    parts.append(base if i % 4 == 0 else extra[i % len(extra)])
    i += 1
text = "\n\n".join(parts) + "\n"
(here / "pl-10k.txt").write_text(text, encoding="utf-8")
print("UTF-16 units:", len(text.encode("utf-16-le")) // 2)
